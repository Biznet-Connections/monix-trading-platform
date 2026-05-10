const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const aiTrader = require('../services/aiTrader');
const marketData = require('../services/marketData');

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

router.post('/stop', authMiddleware, async (req, res) => {
    try {
        aiTrader.stop();
        res.json({ success: true, message: 'AI Trader stopped' });
    } catch (error) {
        console.error('Stop AI trader error:', error);
        res.status(500).json({ error: 'Failed to stop AI trader' });
    }
});

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

router.post('/symbol', authMiddleware, async (req, res) => {
    try {
        const { symbol } = req.body;
        aiTrader.setSymbol(symbol);
        res.json({ success: true, message: `Symbol set to ${symbol}` });
    } catch (error) {
        console.error('Set symbol error:', error);
        res.status(500).json({ error: 'Failed to set symbol' });
    }
});

module.exports = router;
