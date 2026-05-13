const mongoose = require('mongoose');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = User.verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // MongoDB uses _id as ObjectId. Handle both old integer IDs and new ObjectIds.
    const userId = decoded.id || decoded._id;
    
    let user;
    // If it looks like an ObjectId (24 char hex string), query directly
    if (typeof userId === 'string' && userId.length === 24) {
        user = await User.findById(userId);
    } else {
        // Try by email as fallback (JWT stores email)
        user = await User.findByEmail(decoded.email);
    }

    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_active) {
        return res.status(401).json({ error: 'Account blocked. Contact admin.' });
    }

    req.user = user;
    req.userId = user._id;
    next();
};

const adminMiddleware = async (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

const optionalAuthMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
        const decoded = User.verifyToken(token);
        if (decoded) {
            const userId = decoded.id || decoded._id;
            let user;
            if (typeof userId === 'string' && userId.length === 24) {
                user = await User.findById(userId);
            } else {
                user = await User.findByEmail(decoded.email);
            }
            if (user && user.is_active) {
                req.user = user;
                req.userId = user._id;
            }
        }
    }
    next();
};

module.exports = { authMiddleware, adminMiddleware, optionalAuthMiddleware };
