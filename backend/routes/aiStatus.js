const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const aiTrader = require('../services/aiTrader');
const marketData = require('../services/marketData');

// Get current AI analysis
router.get('/analysis', authMiddleware, async (req, res) => {
    try {
        const analysis = aiTrader.getCurrentAnalysis();
        res.json({
            success: true,
            analysis: analysis.watch_state,
            in_trade: analysis.in_trade,
            active_trade: analysis.active_trade
        });
    } catch (error) {
        console.error('Get AI analysis error:', error);
        res.status(500).json({ error: 'Failed to get analysis' });
    }
});

// Get market data
router.get('/market', authMiddleware, async (req, res) => {
    try {
        const marketState = marketData.getMarketState();
        const candles = marketData.getCandles(30);
        res.json({
            success: true,
            market: marketState,
            candles: candles
        });
    } catch (error) {
        console.error('Get market data error:', error);
        res.status(500).json({ error: 'Failed to get market data' });
    }
});

// Start AI trader
router.post('/start', authMiddleware, async (req, res) => {
    try {
        const { symbol = 'R_75', mode = 'AUTO' } = req.body;
        await aiTrader.start(req.userId, symbol, mode);
        res.json({ success: true, message: 'AI Trader started' });
    } catch (error) {
        console.error('Start AI trader error:', error);
        res.status(500).json({ error: 'Failed to start AI trader' });
    }
});

// Stop AI trader
router.post('/stop', authMiddleware, async (req, res) => {
    try {
        aiTrader.stop();
        res.json({ success: true, message: 'AI Trader stopped' });
    } catch (error) {
        console.error('Stop AI trader error:', error);
        res.status(500).json({ error: 'Failed to stop AI trader' });
    }
});

// Set mode (AUTO/MANUAL)
router.post('/mode', authMiddleware, async (req, res) => {
    try {
        const { mode } = req.body;
        aiTrader.setMode(mode);
        res.json({ success: true, message: `Mode set to ${mode}` });
    } catch (error) {
        console.error('Set mode error:', error);
        res.status(500).json({ error: 'Failed to set mode' });
    }
});

// NEW: Set symbol - This is the fix!
router.post('/symbol', authMiddleware, async (req, res) => {
    try {
        const { symbol } = req.body;
        console.log(`🔄 [API] Changing symbol to: ${symbol}`);
        aiTrader.setSymbol(symbol);
        res.json({ 
            success: true, 
            message: `Symbol changed to ${symbol}`,
            symbol: symbol
        });
    } catch (error) {
        console.error('Set symbol error:', error);
        res.status(500).json({ error: 'Failed to set symbol' });
    }
});

// Get current symbol
router.get('/symbol', authMiddleware, async (req, res) => {
    try {
        res.json({ 
            success: true, 
            symbol: aiTrader.symbol 
        });
    } catch (error) {
        console.error('Get symbol error:', error);
        res.status(500).json({ error: 'Failed to get symbol' });
    }
});

// Set confidence threshold
router.post('/threshold', authMiddleware, async (req, res) => {
    try {
        const { threshold } = req.body;
        aiTrader.setConfidenceThreshold(threshold);
        res.json({ success: true, message: `Confidence threshold set to ${threshold}%` });
    } catch (error) {
        console.error('Set threshold error:', error);
        res.status(500).json({ error: 'Failed to set threshold' });
    }
});

module.exports = router;
