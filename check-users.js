const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  const users = await User.find({}, { email: 1, username: 1 });
  console.log('📋 Users in database:');
  users.forEach((u, i) => {
    console.log((i + 1) + '. Email: "' + u.email + '" | Username: "' + u.username + '"');
  });
  process.exit();
}).catch(err => { console.error(err); process.exit(1); });
