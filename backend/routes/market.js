const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const derivService = require('../services/derivService');

// Get real candlestick data
router.get('/candles', authMiddleware, async (req, res) => {
    try {
        const { symbol, granularity = 60, count = 100 } = req.query;
        
        const result = await derivService.getCandles(symbol, parseInt(granularity), parseInt(count));
        
        if (result && result.history && result.history.times && result.history.times.length > 0) {
            const candles = result.history.times.map((time, index) => ({
                x: time * 1000,
                y: [
                    result.history.open[index],
                    result.history.high[index],
                    result.history.low[index],
                    result.history.close[index]
                ]
            }));
            res.json({ success: true, candles });
        } else {
            res.json({ success: false, candles: [] });
        }
    } catch (error) {
        console.error('Get candles error:', error);
        res.json({ success: false, candles: [] });
    }
});

// Get current price
router.get('/price', authMiddleware, async (req, res) => {
    try {
        const { symbol } = req.query;
        const tickHistory = await derivService.getTickHistory(symbol, 'latest', 1);
        
        if (tickHistory && tickHistory.history && tickHistory.history.prices && tickHistory.history.prices.length > 0) {
            res.json({ success: true, price: tickHistory.history.prices[0] });
        } else {
            res.json({ success: false, price: null });
        }
    } catch (error) {
        console.error('Get price error:', error);
        res.json({ success: false, price: null });
    }
});

// Get available symbols
router.get('/symbols', authMiddleware, async (req, res) => {
    const symbols = {
        volatility_1s: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
        volatility_2s: ['R_10_2S', 'R_25_2S', 'R_50_2S', 'R_75_2S', 'R_100_2S'],
        boom_crash: ['Boom 300', 'Boom 500', 'Boom 1000', 'Crash 300', 'Crash 500', 'Crash 1000'],
        step_indices: ['Step 200', 'Step 300', 'Step 400', 'Step 500'],
        derived_indices: ['1HZ10', '1HZ25', '1HZ50', '1HZ75', '1HZ100'],
        forex_major: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'USD/CHF'],
        forex_minor: ['EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'CAD/JPY', 'CHF/JPY', 'EUR/AUD', 'GBP/AUD'],
        commodities: ['XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD', 'WTI', 'Brent'],
        crypto: ['BTC/USD', 'ETH/USD', 'LTC/USD', 'XRP/USD', 'ADA/USD', 'DOT/USD', 'SOL/USD', 'DOGE/USD', 'MATIC/USD', 'AVAX/USD'],
        indices: ['US500', 'USTEC', 'US30', 'GER40', 'UK100', 'FRA40', 'ESP35', 'NETH25', 'HK50', 'JP225', 'AUS200']
    };
    res.json({ success: true, symbols });
});

module.exports = router;
