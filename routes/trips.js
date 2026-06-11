const express = require('express');
const router = express.Router();
const dbType = (process.env.DB_TYPE || 'memory').toLowerCase();

const getStore = () => {
  if (dbType === 'mongodb') return require('../models/mongoModels');
  return require('../models/inMemoryStore');
};

// ── GET /trips ───  ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const store = getStore();
    let trips;
    if (dbType === 'mongodb') {
      trips = await store.Trip.find().sort({ createdAt: -1 });
    } else {
      trips = store.getTrips();
    }
    res.json({ success: true, data: trips });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /trips/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const store = getStore();
    let trip;
    if (dbType === 'mongodb') {
      trip = await store.Trip.findById(req.params.id);
    } else {
      trip = store.getTripById(req.params.id);
    }
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    res.json({ success: true, data: trip });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /trips ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, destination, startDate, endDate, currency, budget, notes } = req.body;
    if (!name || !destination) {
      return res.status(400).json({ success: false, message: 'Name and destination are required' });
    }
    const store = getStore();
    let trip;
    if (dbType === 'mongodb') {
      trip = await store.Trip.create({ name, destination, startDate, endDate, currency, budget, notes });
    } else {
      trip = store.createTrip({ name, destination, startDate, endDate, currency, budget, notes });
    }
    res.status(201).json({ success: true, data: trip, message: 'Trip created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /trips/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const store = getStore();
    let trip;
    if (dbType === 'mongodb') {
      trip = await store.Trip.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    } else {
      trip = store.updateTrip(req.params.id, req.body);
    }
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    res.json({ success: true, data: trip, message: 'Trip updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /trips/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const store = getStore();
    if (dbType === 'mongodb') {
      const trip = await store.Trip.findByIdAndDelete(req.params.id);
      if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
      await store.Expense.deleteMany({ tripId: req.params.id });
    } else {
      const deleted = store.deleteTrip(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Trip not found' });
    }
    res.json({ success: true, message: 'Trip and all its expenses deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
