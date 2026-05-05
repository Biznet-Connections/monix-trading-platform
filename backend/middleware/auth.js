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
    
    const user = await User.findById(decoded.id);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    
    if (!user.is_active) {
        return res.status(401).json({ error: 'Account blocked. Contact admin.' });
    }
    
    req.user = user;
    req.userId = user.id;
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
            const user = await User.findById(decoded.id);
            if (user && user.is_active) {
                req.user = user;
                req.userId = user.id;
            }
        }
    }
    next();
};

module.exports = { authMiddleware, adminMiddleware, optionalAuthMiddleware };
