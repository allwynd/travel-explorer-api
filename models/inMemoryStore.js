// ─── In-Memory Store ────────────────────────────────────────────────────────
// Used as fallback when DB_TYPE is not set.
// Data is lost on server restart — for development/demo only.

const { v4: uuidv4 } = require('uuid');

const store = {
  trips: [],
  expenses: [],
};

// ── Trip Operations ──────────────────────────────────────────────────────────

const getTrips = () => store.trips;

const getTripById = (id) => store.trips.find(t => t._id === id);

const createTrip = (data) => {
  const trip = {
    _id: uuidv4(),
    name: data.name,
    destination: data.destination,
    startDate: data.startDate,
    endDate: data.endDate,
    currency: data.currency || 'USD',
    budget: parseFloat(data.budget) || 0,
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.trips.push(trip);
  return trip;
};

const updateTrip = (id, data) => {
  const idx = store.trips.findIndex(t => t._id === id);
  if (idx === -1) return null;
  store.trips[idx] = { ...store.trips[idx], ...data, updatedAt: new Date().toISOString() };
  return store.trips[idx];
};

const deleteTrip = (id) => {
  const idx = store.trips.findIndex(t => t._id === id);
  if (idx === -1) return false;
  store.trips.splice(idx, 1);
  store.expenses = store.expenses.filter(e => e.tripId !== id);
  return true;
};

// ── Expense Operations ───────────────────────────────────────────────────────

const getExpenses = (tripId) => store.expenses.filter(e => e.tripId === tripId);

const getExpenseById = (id) => store.expenses.find(e => e._id === id);

const createExpense = (data) => {
  const expense = {
    _id: uuidv4(),
    tripId: data.tripId,
    category: data.category,
    description: data.description || '',
    amount: parseFloat(data.amount),
    date: data.date || new Date().toISOString().split('T')[0],
    paymentMethod: data.paymentMethod || 'cash',
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.expenses.push(expense);
  return expense;
};

const updateExpense = (id, data) => {
  const idx = store.expenses.findIndex(e => e._id === id);
  if (idx === -1) return null;
  store.expenses[idx] = { ...store.expenses[idx], ...data, updatedAt: new Date().toISOString() };
  return store.expenses[idx];
};

const deleteExpense = (id) => {
  const idx = store.expenses.findIndex(e => e._id === id);
  if (idx === -1) return false;
  store.expenses.splice(idx, 1);
  return true;
};

module.exports = {
  getTrips, getTripById, createTrip, updateTrip, deleteTrip,
  getExpenses, getExpenseById, createExpense, updateExpense, deleteExpense,
};
