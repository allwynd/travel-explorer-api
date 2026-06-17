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

    let travelAgentAPI = process.env.TRAVEL_AGENT_API || 'mock';
    let planResponse;

    if (travelAgentAPI === 'real') {  
      // Invoke the real travel agent API (this is a placeholder - implement actual API call)
      planResponse = await callRealTravelAgentAPI({ origin, destination, travellers, duration, budgetLevel });
      // For now, we'll just return a mock response to simulate the real API call
      travelAgentAPI = 'mock'; // Fallback to mock for demonstration
    } else {
        planResponse = await callMockTravelAgentAPI({ origin, destination, travellers, duration, budgetLevel });
      }

    res.json(planResponse);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Mock Travel Agent API Call ───────────────────────────────────────────────
const callMockTravelAgentAPI = async ({ origin, destination, travellers, duration, budgetLevel }) => {
    
  // delay response by 3-6 seconds to simulate processing time
  await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
  
  let planResponse;
  // Return a mock response returning the plan_response.json content
  if (destination.toLowerCase() === 'gold coast') {
    planResponse = require('../mock_responses/plan_nz_gc_response.json');
  } else if (destination.toLowerCase() === 'japan') {
    planResponse = require('../mock_responses/plan_nz_jp_response.json');
  } else if (destination.toLowerCase() === 'india') {
    planResponse = require('../mock_responses/plan_nz_ind_response.json');
  } else {
    planResponse = require('../mock_responses/plan_response.json');
  }
  return planResponse;
};

const callRealTravelAgentAPI = async ({ origin, destination, travellers, duration, budgetLevel }) => {
  // Invoke remote rest api here using fetch or axios, passing the parameters and returning the response
}


module.exports = router;
