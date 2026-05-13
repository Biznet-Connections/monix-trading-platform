const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const aiTrader = require('../services/aiTrader');
const Pattern = require('../models/Pattern');
const Trade = require('../models/Trade');

// Get current AI opinion
router.post('/generate', authMiddleware, async (req, res) => {
    try {
        const analysis = aiTrader.getCurrentAnalysis();
        if (!analysis || !analysis.watch_state) {
            return res.json({ success: false, message: 'AI Trader is initializing. Please wait...', signal: null });
        }
        
        const watchState = analysis.watch_state;
        const currentSymbol = watchState.symbol || 'R_75';

        const signal = {
            symbol: currentSymbol,
            action: watchState.action === 'BUY' ? 'BUY' : (watchState.action === 'SELL' ? 'SELL' : 'WAIT'),
            confidence: watchState.confidence,
            pattern: watchState.pattern || 'Analyzing...',
            entry_price: watchState.entry_price || watchState.market_price,
            take_profit: watchState.take_profit,
            stop_loss: watchState.stop_loss,
            reasoning: watchState.reason,
            simple_reason: watchState.reason,
            rsi: watchState.market_rsi,
            support: watchState.market_support,
            resistance: watchState.market_resistance,
            market_feeling: watchState.market_feeling,
            entry_time: watchState.estimated_entry_time === 'Now' ? new Date().toLocaleTimeString() : watchState.estimated_entry_time,
            exit_time: '5 min after entry',
            confidence_bar: '█'.repeat(Math.floor(watchState.confidence / 10)) + '░'.repeat(10 - Math.floor(watchState.confidence / 10)),
            is_waiting: watchState.action === 'WAIT',
            is_manual_setup: watchState.is_manual_setup || false,
            suggested_stake: watchState.suggested_stake || null,
            entry_condition: watchState.entry_condition,
            confidence_threshold: watchState.confidence_threshold || 55
        };

        console.log(`📡 [API] Returning signal for symbol: ${currentSymbol}, action: ${signal.action}`);

        res.json({ success: true, signal });
    } catch (error) {
        console.error('Get signal error:', error);
        res.status(500).json({ error: 'Failed to get signal' });
    }
});

// Get AI status
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const analysis = aiTrader.getCurrentAnalysis();
        res.json({ success: true, ...analysis });
    } catch (error) {
        console.error('Get AI status error:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// Get signal history
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const signals = [];
        res.json(signals);
    } catch (error) {
        console.error('Get signal history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get AI insights
router.get('/insights', authMiddleware, async (req, res) => {
    try {
        const topPatterns = await Pattern.getTopPatterns(10);
        const worstPatterns = await Pattern.getWorstPatterns(5);
        const userStats = await Trade.getUserStats(req.userId, 30);

        res.json({
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
        });
    } catch (error) {
        console.error('Get insights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// MANUAL TRADE: Confirm a pending setup
router.post('/confirm-manual', authMiddleware, async (req, res) => {
    try {
        const { action, stake } = req.body;
        
        if (!action || !stake) {
            return res.status(400).json({ success: false, error: 'Action and stake are required' });
        }
        
        const result = await aiTrader.executeManualTrade(action, parseFloat(stake));
        res.json(result);
    } catch (error) {
        console.error('Confirm manual trade error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// MANUAL TRADE: Decline a pending setup
router.post('/decline-manual', authMiddleware, async (req, res) => {
    try {
        const result = aiTrader.declineManualSetup();
        res.json(result);
    } catch (error) {
        console.error('Decline manual trade error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get pending manual setup
router.get('/pending-setup', authMiddleware, async (req, res) => {
    try {
        const setup = aiTrader.getPendingSetup();
        res.json({ success: true, setup });
    } catch (error) {
        console.error('Get pending setup error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
