const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  country: { type: String, default: 'Zimbabwe' },
  amountInterested: { type: String, default: '20-100' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referredBy: { type: String, default: null },
  notified: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Waitlist', waitlistSchema);
