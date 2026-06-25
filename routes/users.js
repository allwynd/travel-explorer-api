const express = require('express');
const router = express.Router();
const { UserProfile, MEMBER_LEVELS } = require('../models/mongoModels');

// ─── Helper ───────────────────────────────────────────────────────────────────
const isMongoActive = () => {
  const mongoose = require('mongoose');
  return (process.env.DB_TYPE || '').toLowerCase().trim() === 'mongodb'
    && mongoose.connection.readyState === 1;
};

// ─── PUT /users/:user_id ──────────────────────────────────────────────────────
// Upsert a user profile by user_id.
//   • If no document with this user_id exists → creates it (insert).
//   • If a document already exists            → updates only the supplied fields.
// On insert, email and name are required. On update, all fields are optional.
// user_id is immutable — it comes from the URL param only and is never overwritten.
// Body: { email, name, verified?, memberLevel? }
// Response includes `created: true` on insert, `created: false` on update.

// ─── GET /users ───────────────────────────────────────────────────────────────
// List all user profiles (lightweight — returns id, email, name, memberLevel).
router.get('/', async (req, res) => {
  if (!isMongoActive()) {
    return res.status(503).json({ success: false, message: 'MongoDB is not connected.' });
  }

  try {
    const profiles = await UserProfile.find({}, 'user_id email name verified memberLevel createdAt').lean();
    return res.json({ success: true, count: profiles.length, data: profiles });
  } catch (err) {
    console.error('GET /users error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ─── GET /users/:user_id ──────────────────────────────────────────────────────
// Fetch a single user profile by user_id.
router.get('/:user_id', async (req, res) => {
  if (!isMongoActive()) {
    return res.status(503).json({ success: false, message: 'MongoDB is not connected.' });
  }

  try {
    const profile = await UserProfile.findOne({ user_id: req.params.user_id }).lean();
    if (!profile) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }
    return res.json({ success: true, data: profile });
  } catch (err) {
    console.error('GET /users/:user_id error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

router.put('/:user_id', async (req, res) => {
  if (!isMongoActive()) {
    return res.status(503).json({ success: false, message: 'MongoDB is not connected.' });
  }

  const { user_id } = req.params;
  const { email, name, verified, memberLevel } = req.body;

  // ── Validate memberLevel if supplied ────────────────────────────────────────
  if (memberLevel !== undefined && !MEMBER_LEVELS.includes(memberLevel)) {
    return res.status(400).json({
      success: false,
      message: `memberLevel must be one of: ${MEMBER_LEVELS.join(', ')}.`,
    });
  }

  // ── Check whether the document already exists ────────────────────────────────
  // We need to know this upfront so we can:
  //   1. Enforce that email + name are present on insert.
  //   2. Return the right HTTP status code (201 vs 200).
  const exists = await UserProfile.exists({ user_id });

  if (!exists) {
    // ── INSERT path: email and name are required for a new profile ─────────────
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'email and name are required when creating a new user profile.',
      });
    }
  } else {
    // ── UPDATE path: at least one field must be supplied ──────────────────────
    if (email === undefined && name === undefined && verified === undefined && memberLevel === undefined) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update. Updatable fields: email, name, verified, memberLevel.',
      });
    }
  }

  // ── Build the $set payload — only include fields that were supplied ──────────
  const updates = {};
  if (email       !== undefined) updates.email       = email;
  if (name        !== undefined) updates.name        = name;
  if (verified    !== undefined) updates.verified    = verified;
  if (memberLevel !== undefined) updates.memberLevel = memberLevel;

  try {
    const profile = await UserProfile.findOneAndUpdate(
      { user_id },
      {
        $set: updates,
        // $setOnInsert runs only when a new document is created.
        // It sets user_id on the new doc without touching it during updates.
        $setOnInsert: { user_id },
      },
      {
        new: true,          // return the document after the operation
        upsert: true,       // create if not found
        runValidators: true, // enforce schema rules (regex, enum, min/max)
        // setDefaultsOnInsert ensures schema defaults (verified=false,
        // memberLevel='basic') are applied when creating a new document.
        setDefaultsOnInsert: true,
      }
    );

    const statusCode = exists ? 200 : 201;
    return res.status(statusCode).json({ success: true, created: !exists, data: profile });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        message: `A user profile with that ${field} already exists.`,
      });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages.join(' ') });
    }
    console.error('PUT /users/:user_id error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ─── DELETE /users/:user_id ───────────────────────────────────────────────────
// Permanently remove a user profile.
router.delete('/:user_id', async (req, res) => {
  if (!isMongoActive()) {
    return res.status(503).json({ success: false, message: 'MongoDB is not connected.' });
  }

  try {
    const profile = await UserProfile.findOneAndDelete({ user_id: req.params.user_id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }
    return res.json({ success: true, message: `User profile "${req.params.user_id}" deleted.` });
  } catch (err) {
    console.error('DELETE /users/:user_id error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

module.exports = router;