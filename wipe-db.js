const mongoose = require('mongoose');
require('dotenv').config();
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const trades = mongoose.connection.collection('trades');
  const patterns = mongoose.connection.collection('patterns');

  // Show before
  const tBefore = await trades.countDocuments({});
  const pBefore = await patterns.countDocuments({});
  console.log('\n=== BEFORE ===');
  console.log('Trades:', tBefore);
  console.log('Patterns:', pBefore);

  // Confirm we're hitting the right DB
  const dbName = mongoose.connection.name;
  console.log('DB:', dbName);

  // Wipe trades
  const r1 = await trades.deleteMany({});
  console.log('\nDeleted trades:', r1.deletedCount);

  // Wipe patterns (bot will re-learn from fresh trades)
  const r2 = await patterns.deleteMany({});
  console.log('Deleted patterns:', r2.deletedCount);

  // Reset user stats
  const users = mongoose.connection.collection('users');
  const r3 = await users.updateMany({}, {
    $set: {
      total_trades: 0,
      total_wins: 0,
      total_losses: 0,
      total_profit: 0,
      total_loss: 0,
      win_rate: 0,
      net_profit: 0,
      last_trade_at: null
    }
  });
  console.log('Users reset:', r3.modifiedCount);

  // Verify
  const tAfter = await trades.countDocuments({});
  const pAfter = await patterns.countDocuments({});
  console.log('\n=== AFTER ===');
  console.log('Trades:', tAfter);
  console.log('Patterns:', pAfter);

  await mongoose.disconnect();
  console.log('\nDONE - clean slate');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
