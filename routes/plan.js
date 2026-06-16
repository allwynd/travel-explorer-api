const express = require('express');
const router = express.Router();
const dbType = (process.env.DB_TYPE || 'memory').toLowerCase();

const getStore = () => {
  if (dbType === 'mongodb') return require('../models/mongoModels');
  return require('../models/inMemoryStore');
};


// ── POST /plan ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { origin, destination, travellers, duration, budgetLevel } = req.body;
    if (!origin || !destination || !travellers || !duration || !budgetLevel) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // delay response by 4-6 seconds to simulate processing time
    await new Promise(resolve => setTimeout(resolve, 4000 + Math.random() * 2000));
    
    // Return a mock response returning the plan_response.json content
    let planResponse;
    if (destination.toLowerCase() === 'gold coast') {
      planResponse = require('../mock_responses/plan_nz_gc_response.json');
    } else if (destination.toLowerCase() === 'japan') {
        planResponse = require('../mock_responses/plan_nz_jp_response.json');
    } else if (destination.toLowerCase() === 'india') {
        planResponse = require('../mock_responses/plan_nz_ind_response.json');
    } else {
        planResponse = require('../mock_responses/plan_response.json');
    }
    res.json(planResponse);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


module.exports = router;
