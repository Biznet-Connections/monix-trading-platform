const rateLimit = require('express-rate-limit');

const tradingLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 trades per minute
    message: { error: 'Too many trades. Please wait.' },
    keyGenerator: (req) => req.userId || req.ip
});

const signalLimiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds
    max: 2, // 2 signals per 30 seconds
    message: { error: 'Please wait before generating another signal.' },
    keyGenerator: (req) => req.userId || req.ip
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests. Try again later.' }
});

module.exports = { tradingLimiter, signalLimiter, apiLimiter };
