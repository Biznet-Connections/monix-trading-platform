const mongoose = require('mongoose');
require('dotenv').config();
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  const coll = mongoose.connection.collection('trades');

  const before = await coll.countDocuments({ status: 'PENDING' });
  console.log('PENDING before:', before);

  const r = await coll.updateMany(
    { status: 'PENDING' },
    { $set: {
        status: 'VOID',
        profit: 0,
        exit_price: 0,
        voided_at: new Date(),
        void_reason: 'stuck_pending_cleanup_v15.0.29'
    }}
  );
  console.log('Cleared:', r.modifiedCount);

  const after = await coll.countDocuments({ status: 'PENDING' });
  console.log('PENDING after:', after);

  await mongoose.disconnect();
  console.log('DONE');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
