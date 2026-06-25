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
// Returns null if no user_id can be determined (caller handles the 400).
const resolveUserId = (req) =>
  req.header('X-User-Id') ||
  req.body?.user_id        ||
  req.query?.user_id       ||
  null;

// ── GET /trips ────────────────────────────────────────────────────────────────
// Returns all trips belonging to the authenticated user.
router.get('/', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  try {
    const store = getStore();
    let trips;
    if (dbType === 'mongodb') {
      trips = await store.Trip.find({ user_id }).sort({ createdAt: -1 });
    } else {
      trips = store.getTrips(user_id);
    }
    res.json({ success: true, data: trips });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /trips/:id ────────────────────────────────────────────────────────────
// Fetches a single trip, enforcing that it belongs to the requesting user.
router.get('/:id', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  try {
    const store = getStore();
    let trip;
    if (dbType === 'mongodb') {
      // Filter by both _id and user_id — prevents a user from reading another
      // user's trip even if they know its ObjectId.
      trip = await store.Trip.findOne({ _id: req.params.id, user_id });
    } else {
      trip = store.getTripById(req.params.id, user_id);
    }
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    res.json({ success: true, data: trip });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /trips ───────────────────────────────────────────────────────────────
// Creates a new trip owned by the authenticated user.
router.post('/', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  const { name, destination, startDate, endDate, currency, budget, notes } = req.body;
  if (!name || !destination) {
    return res.status(400).json({ success: false, message: 'Name and destination are required.' });
  }

  try {
    const store = getStore();
    let trip;
    if (dbType === 'mongodb') {
      trip = await store.Trip.create({ user_id, name, destination, startDate, endDate, currency, budget, notes });
    } else {
      trip = store.createTrip({ user_id, name, destination, startDate, endDate, currency, budget, notes });
    }
    res.status(201).json({ success: true, data: trip, message: 'Trip created successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /trips/:id ────────────────────────────────────────────────────────────
// Updates a trip, scoped to the authenticated user so users cannot overwrite
// each other's data. user_id is excluded from the update payload — it is
// set at creation and is immutable.
router.put('/:id', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  // Strip user_id from the update body — it must not be reassignable.
  const { user_id: _stripped, ...updates } = req.body;

  try {
    const store = getStore();
    let trip;
    if (dbType === 'mongodb') {
      trip = await store.Trip.findOneAndUpdate(
        { _id: req.params.id, user_id },   // ownership check in the filter
        updates,
        { new: true, runValidators: true }
      );
    } else {
      trip = store.updateTrip(req.params.id, updates, user_id);
    }
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    res.json({ success: true, data: trip, message: 'Trip updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /trips/:id ─────────────────────────────────────────────────────────
// Deletes a trip and all its expenses, scoped to the authenticated user.
router.delete('/:id', async (req, res) => {
  const user_id = resolveUserId(req);
  if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required.' });

  try {
    const store = getStore();
    if (dbType === 'mongodb') {
      const trip = await store.Trip.findOneAndDelete({ _id: req.params.id, user_id });
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
      // Cascade-delete all expenses that belong to this trip.
      // user_id is included in the filter as a safety net — in case any
      // expense documents have a mismatched user_id due to a data migration.
      await store.Expense.deleteMany({ tripId: req.params.id, user_id });
    } else {
      const deleted = store.deleteTrip(req.params.id, user_id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Trip not found.' });
    }
    res.json({ success: true, message: 'Trip and all its expenses deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;