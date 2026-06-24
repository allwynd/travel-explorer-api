const express = require('express');
const router = express.Router();
const dbType = (process.env.DB_TYPE || 'memory').toLowerCase();

const getStore = () => {
  if (dbType === 'mongodb') return require('../models/mongoModels');
  return require('../models/inMemoryStore');
};

// validate request headers: X-User-Id, X-User-Email, X-User-Name for all routes in this router when process.env.NODE_ENV === 'production'. 
// If these headers are missing, return 401 Unauthorized with a message "Missing user identity. Direct Access is not permitted."
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod') {

    // Check incoming request header: x-apim-gateway-secret matches the environment variable APIM_GATEWAY_SECRET
    if (req.header('x-apim-gateway-secret') !== process.env.APIM_GATEWAY_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorised: invalid or missing gateway secret.' });
    }

    const userId = req.header('X-User-Id');
    const userEmail = req.header('X-User-Email');
    const userName = req.header('X-User-Name');

    if (!userId || !userEmail || !userName) {
      return res.status(401).json({ success: false, message: 'Missing user identity. Direct Access is not permitted.' });
    }
  }
  next();
});

// ── GET /expenses?tripId=xxx ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { tripId } = req.query;
    if (!tripId) return res.status(400).json({ success: false, message: 'tripId is required' });
    const store = getStore();
    let expenses;
    if (dbType === 'mongodb') {
      expenses = await store.Expense.find({ tripId }).sort({ date: -1 });
    } else {
      expenses = store.getExpenses(tripId);
    }
    res.json({ success: true, data: expenses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /expenses/summary/:tripId ─────────────────────────────────────────
router.get('/summary/:tripId', async (req, res) => {
  try {
    const store = getStore();
    let expenses;
    let trip;
    const { tripId } = req.params;

    if (dbType === 'mongodb') {
      expenses = await store.Expense.find({ tripId });
      trip = await store.Trip.findById(tripId);
    } else {
      expenses = store.getExpenses(tripId);
      trip = store.getTripById(tripId);
    }

    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const budget = trip.budget || 0;
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

    // Calculate percentages
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
        totalSpent: Math.round(total * 100) / 100,
        budget,
        remaining: Math.round(remaining * 100) / 100,
        percentUsed: budget > 0 ? Math.round((total / budget) * 100 * 10) / 10 : 0,
        expenseCount: expenses.length,
        categoryBreakdown,
        dailyBreakdown,
        highestExpense,
        currency: trip.currency || 'USD',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /expenses ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { tripId, category, description, amount, date, paymentMethod, notes } = req.body;
    if (!tripId || !category || amount === undefined) {
      return res.status(400).json({ success: false, message: 'tripId, category, and amount are required' });
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) < 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }
    const store = getStore();
    let expense;
    if (dbType === 'mongodb') {
      expense = await store.Expense.create({ tripId, category, description, amount: parseFloat(amount), date, paymentMethod, notes });
    } else {
      expense = store.createExpense({ tripId, category, description, amount, date, paymentMethod, notes });
    }
    res.status(201).json({ success: true, data: expense, message: 'Expense added successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /expenses/:id ─────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const store = getStore();
    let expense;
    if (dbType === 'mongodb') {
      expense = await store.Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
    } else {
      expense = store.updateExpense(req.params.id, req.body);
    }
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, data: expense, message: 'Expense updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /expenses/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const store = getStore();
    if (dbType === 'mongodb') {
      const expense = await store.Expense.findByIdAndDelete(req.params.id);
      if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    } else {
      const deleted = store.deleteExpense(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
