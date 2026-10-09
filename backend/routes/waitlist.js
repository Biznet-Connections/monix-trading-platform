const express = require('express');
const router = express.Router();
const Waitlist = require('../models/Waitlist');

// POST /api/waitlist/join
router.post('/join', async (req, res) => {
  try {
    const { email, country, amountInterested, userId } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

    const normalizedEmail = email.toLowerCase().trim();
    let entry = await Waitlist.findOne({ email: normalizedEmail });

    if (entry) {
      return res.json({ success: true, alreadyJoined: true, position: (await Waitlist.countDocuments()) });
    }

    entry = await Waitlist.create({
      email: normalizedEmail,
      country: country || 'Zimbabwe',
      amountInterested: amountInterested || '20-100',
      userId: userId || null,
    });

    const position = await Waitlist.countDocuments();
    console.log('[WAITLIST] New entry:', normalizedEmail, '·', country, '· position', position);

    res.json({ success: true, position });
  } catch (e) {
    console.error('[WAITLIST] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/waitlist/count
router.get('/count', async (req, res) => {
  try {
    const base = 1247;
    const real = await Waitlist.countDocuments();
    res.json({ count: base + real });
  } catch (e) {
    res.json({ count: 1247 });
  }
});

module.exports = router;
