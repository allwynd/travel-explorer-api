const express = require('express');
const router = express.Router();
const dbType = (process.env.DB_TYPE || 'memory').toLowerCase();

const getStore = () => {
  if (dbType === 'mongodb') return require('../models/mongoModels');
  return require('../models/inMemoryStore');
};

// ─── Auth / identity middleware ───────────────────────────────────────────────
// In production:
//   1. Validates the APIM gateway secret to ensure requests came through the
//      API Management layer and were not sent directly to the backend.
//   2. Enforces the presence of X-User-Id / X-User-Email / X-User-Name headers
//      injected by the auth layer upstream.
// In development these checks are skipped so the app runs without a gateway,
// but X-User-Id is still read (if present) to allow per-user testing locally.
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod') {

    if (req.header('x-apim-gateway-secret') !== process.env.APIM_GATEWAY_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorised: invalid or missing gateway secret.' });
    }

    const userId    = req.header('X-User-Id');
    const userEmail = req.header('X-User-Email');
    const userName  = req.header('X-User-Name');

    if (!userId || !userEmail || !userName) {
      return res.status(401).json({ success: false, message: 'Missing user identity. Direct Access is not permitted.' });
    }
  }
  next();
});

// ─── Helper: resolve the acting user_id ──────────────────────────────────────
// Production: always taken from the trusted header set by the auth gateway.
// Development: falls back to req.body.user_id or req.query.user_id so routes
//              can be exercised without a gateway in local testing.
const resolveUserId = (req) =>
  req.header('X-User-Id') ||
  req.body?.user_id        ||
  req.query?.user_id       ||
  null;

// ── GET /expenses?tripId=xxx ──────────────────────────────────────────────────
// Returns all expenses for a trip, scoped to the authenticated user.
router.get('/', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  const { tripId } = req.query;
  if (!tripId) return res.status(400).json({ success: false, message: 'tripId is required.' });

  try {
    const store = getStore();
    let expenses;
    if (dbType === 'mongodb') {
      // Filter by both tripId and user_id — prevents reading another user's
      // expenses even when the tripId is known.
      expenses = await store.Expense.find({ tripId, user_id }).sort({ date: -1 });
    } else {
      expenses = store.getExpenses(tripId, user_id);
    }
    res.json({ success: true, data: expenses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /expenses/summary/:tripId ─────────────────────────────────────────────
// Returns aggregated spend data for a trip, scoped to the authenticated user.
router.get('/summary/:tripId', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  const { tripId } = req.params;

  try {
    const store = getStore();
    let expenses, trip;

    if (dbType === 'mongodb') {
      // Both trip and expenses are fetched with user_id in the filter to
      // prevent cross-user data leakage.
      [trip, expenses] = await Promise.all([
        store.Trip.findOne({ _id: tripId, user_id }),
        store.Expense.find({ tripId, user_id }),
      ]);
    } else {
      trip     = store.getTripById(tripId, user_id);
      expenses = store.getExpenses(tripId, user_id);
    }

    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });

    const total     = expenses.reduce((sum, e) => sum + e.amount, 0);
    const budget    = trip.budget || 0;
    const remaining = budget - total;

    // Category breakdown
    const categoryBreakdown = {};
    expenses.forEach(e => {
      if (!categoryBreakdown[e.category]) {
        categoryBreakdown[e.category] = { total: 0, count: 0, percentage: 0 };
      }
      categoryBreakdown[e.category].total += e.amount;
      categoryBreakdown[e.category].count += 1;
    });
    Object.keys(categoryBreakdown).forEach(cat => {
      categoryBreakdown[cat].percentage = total > 0
        ? Math.round((categoryBreakdown[cat].total / total) * 100 * 10) / 10
        : 0;
    });

    // Daily breakdown
    const dailyBreakdown = {};
    expenses.forEach(e => {
      const day = (e.date || '').toString().split('T')[0];
      if (!dailyBreakdown[day]) dailyBreakdown[day] = 0;
      dailyBreakdown[day] += e.amount;
    });

    // Highest expense
    const highestExpense = expenses.length > 0
      ? expenses.reduce((max, e) => e.amount > max.amount ? e : max, expenses[0])
      : null;

    res.json({
      success: true,
      data: {
        trip,
        totalSpent:    Math.round(total * 100) / 100,
        budget,
        remaining:     Math.round(remaining * 100) / 100,
        percentUsed:   budget > 0 ? Math.round((total / budget) * 100 * 10) / 10 : 0,
        expenseCount:  expenses.length,
        categoryBreakdown,
        dailyBreakdown,
        highestExpense,
        currency:      trip.currency || 'USD',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /expenses ────────────────────────────────────────────────────────────
// Creates a new expense for a trip. The expense inherits user_id from the
// authenticated user and the trip ownership is verified before creation.
router.post('/', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  const { tripId, category, description, amount, date, paymentMethod, notes } = req.body;

  if (!tripId || !category || amount === undefined) {
    return res.status(400).json({ success: false, message: 'tripId, category, and amount are required.' });
  }
  if (isNaN(parseFloat(amount)) || parseFloat(amount) < 0) {
    return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
  }

  try {
    const store = getStore();

    if (dbType === 'mongodb') {
      // Verify that the referenced trip exists and belongs to this user before
      // creating the expense. Prevents attaching expenses to another user's trip.
      const trip = await store.Trip.findOne({ _id: tripId, user_id });
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });

      const expense = await store.Expense.create({
        user_id,
        tripId,
        category,
        description,
        amount: parseFloat(amount),
        date,
        paymentMethod,
        notes,
      });
      return res.status(201).json({ success: true, data: expense, message: 'Expense added successfully.' });
    } else {
      const expense = store.createExpense({ user_id, tripId, category, description, amount, date, paymentMethod, notes });
      return res.status(201).json({ success: true, data: expense, message: 'Expense added successfully.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /expenses/:id ─────────────────────────────────────────────────────────
// Updates an expense, scoped to the authenticated user.
// user_id and tripId are excluded from the update payload — neither is
// reassignable after creation.
router.put('/:id', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  // Strip immutable fields from the update payload.
  const { user_id: _u, tripId: _t, ...updates } = req.body;

  try {
    const store = getStore();
    let expense;
    if (dbType === 'mongodb') {
      expense = await store.Expense.findOneAndUpdate(
        { _id: req.params.id, user_id },   // ownership check in the filter
        updates,
        { new: true, runValidators: true }
      );
    } else {
      expense = store.updateExpense(req.params.id, updates, user_id);
    }
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.json({ success: true, data: expense, message: 'Expense updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /expenses/:id ──────────────────────────────────────────────────────
// Deletes an expense, scoped to the authenticated user.
router.delete('/:id', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  try {
    const store = getStore();
    if (dbType === 'mongodb') {
      const expense = await store.Expense.findOneAndDelete({ _id: req.params.id, user_id });
      if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    } else {
      const deleted = store.deleteExpense(req.params.id, user_id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Expense not found.' });
    }
    res.json({ success: true, message: 'Expense deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;