const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/monix';

let isConnected = false;

async function init() {
    if (isConnected) {
        console.log('✅ MongoDB already connected');
        return true;
    }

    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log('✅ MongoDB connected successfully');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        // Retry after 5 seconds
        console.log('🔄 Retrying MongoDB connection in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        return init();
    }
}

function getDb() {
    return mongoose;
}

async function close() {
    if (isConnected) {
        await mongoose.disconnect();
        isConnected = false;
        console.log('MongoDB disconnected');
    }
}

mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err.message);
    isConnected = false;
});

module.exports = { init, getDb, close };
