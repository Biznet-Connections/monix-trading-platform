const User = require('../models/User');

const adminAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    
    const decoded = User.verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const user = await User.findById(decoded.id);
    if (!user || !user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.user = user;
    req.userId = user.id;
    next();
};

module.exports = { adminAuth };
