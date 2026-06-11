const mongoose = require('mongoose');

// ─── Trip Schema ──────────────────────────────────────────────────────────────
// autoIndex is controlled globally in database.js (off in production).
// The || mongoose.models.X guard prevents OverwriteModelError on hot-reloads
// (e.g. nodemon) — it reuses the already-registered model instead of
// redefining it, which would otherwise clear in-memory model state.

const tripSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  destination: { type: String, required: true, trim: true },
  startDate:   { type: Date },
  endDate:     { type: Date },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD','EUR','GBP','AUD','NZD','JPY','CAD','SGD','THB','IDR','MYR','PHP','VND','INR','CNY','HKD','KRW'],
  },
  budget: { type: Number, default: 0, min: 0 },
  notes:  { type: String, default: '' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  // Disable autoIndex at schema level — inherits the global setting from
  // database.js but this makes it explicit and prevents accidental index
  // creation if the schema is used outside the normal boot path.
  autoIndex: process.env.NODE_ENV !== 'production',
});

// ─── Expense Schema ───────────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  'accommodation', 'flights', 'food', 'transport', 'shopping',
  'activities', 'health', 'communication', 'visa', 'insurance', 'other',
];

const expenseSchema = new mongoose.Schema({
  tripId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  category:      { type: String, required: true, enum: EXPENSE_CATEGORIES },
  description:   { type: String, default: '', trim: true },
  amount:        { type: Number, required: true, min: 0 },
  date:          { type: Date, default: Date.now },
  paymentMethod: { type: String, default: 'cash', enum: ['cash', 'card', 'digital', 'other'] },
  notes:         { type: String, default: '' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  autoIndex: process.env.NODE_ENV !== 'production',
});

// ─── Safe model registration ──────────────────────────────────────────────────
// mongoose.models.X is populated after the first mongoose.model() call.
// On hot-reload (nodemon), the module is re-evaluated but mongoose retains its
// model registry — so we reuse the existing registered model rather than
// calling mongoose.model() again, which would throw OverwriteModelError.
const Trip    = mongoose.models.Trip    || mongoose.model('Trip',    tripSchema);
const Expense = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);

module.exports = { Trip, Expense, EXPENSE_CATEGORIES };