const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const aiTrader = require('../services/aiTrader');
const Pattern = require('../models/Pattern');
const Trade = require('../models/Trade');

router.post('/generate', authMiddleware, async (req, res) => {
    try {
        const analysis = aiTrader.getCurrentAnalysis();
        
        if (!analysis || !analysis.watch_state) {
            return res.json({
                success: false,
                message: 'AI Trader is initializing. Please wait...',
                signal: null
            });
        }
        
        const watchState = analysis.watch_state;
        
        const signal = {
            action: watchState.action === 'BUY' ? 'BUY' : (watchState.action === 'SELL' ? 'SELL' : 'WAIT'),
            confidence: watchState.confidence,
            pattern: watchState.pattern || 'Analyzing...',
            entry_price: watchState.entry_price || watchState.market_price,
            take_profit: watchState.take_profit,
            stop_loss: watchState.stop_loss,
            reasoning: watchState.reason,
            simple_reason: watchState.reason,
            rsi: watchState.market_rsi,
            symbol: 'R_75',
            support: watchState.market_support,
            resistance: watchState.market_resistance,
            market_feeling: watchState.market_feeling,
            entry_time: watchState.estimated_entry_time === 'Now' ? new Date().toLocaleTimeString() : watchState.estimated_entry_time,
            exit_time: watchState.estimated_entry_time === 'Now' ? new Date(Date.now() + 5*60000).toLocaleTimeString() : '5 min after entry',
            confidence_bar: '█'.repeat(Math.floor(watchState.confidence / 10)) + '░'.repeat(10 - Math.floor(watchState.confidence / 10)),
            is_waiting: watchState.action === 'WAIT' || watchState.action === 'WAIT_BUY' || watchState.action === 'WAIT_SELL',
            entry_condition: watchState.entry_condition
        };
        
        res.json({
            success: true,
            signal: signal
        });
        
    } catch (error) {
        console.error('Get signal error:', error);
        res.status(500).json({ error: 'Failed to get signal' });
    }
});

router.get('/status', authMiddleware, async (req, res) => {
    try {
        const analysis = aiTrader.getCurrentAnalysis();
        res.json({
            success: true,
            ...analysis
        });
    } catch (error) {
        console.error('Get AI status error:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

router.get('/history', authMiddleware, async (req, res) => {
    const db = require('../config/database').getDb();
    try {
        const signals = db.signals ? db.signals.getAll() : [];
        const userSignals = signals.filter(s => s.user_id === req.userId).slice(0, 50);
        res.json(userSignals || []);
    } catch (error) {
        console.error('Get signal history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/insights', authMiddleware, async (req, res) => {
    try {
        const topPatterns = await Pattern.getTopPatterns(10);
        const worstPatterns = await Pattern.getWorstPatterns(5);
        const userStats = await Trade.getUserStats(req.userId, 30);

        const response = {
            top_patterns: topPatterns || [],
            worst_patterns: worstPatterns || [],
            advice: { adjustments: ["AI is watching the market. Let it find the best entry."] },
            user_stats: userStats,
            has_enough_data: userStats.total_trades >= 3,
            message: userStats.total_trades === 0
                ? "No trades yet. AI is watching the market and will trade when conditions are right."
                : userStats.total_trades < 3
                ? `AI has executed ${userStats.total_trades} trade(s). Need ${3 - userStats.total_trades} more for pattern analysis.`
                : "AI insights are ready based on your trading history."
        };

        res.json(response);
    } catch (error) {
        console.error('Get insights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
