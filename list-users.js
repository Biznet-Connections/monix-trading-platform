const mongoose = require('mongoose');
require('dotenv').config();

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

async function listUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');
        
        const users = await User.find({}, { email: 1, username: 1, demo_token: 1 });
        
        console.log('📋 USERS IN DATABASE:\n');
        users.forEach((user, i) => {
            console.log(`${i + 1}. Email: ${user.email}`);
            console.log(`   Username: ${user.username}`);
            console.log(`   Demo token: ${user.demo_token ? user.demo_token.substring(0, 20) + '...' : 'NOT SET'}\n`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

listUsers();
