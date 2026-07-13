const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const aiTrader = require('../services/aiTrader');
const Pattern = require('../models/Pattern');
const Trade = require('../models/Trade');

// Get current signal from the learning engine (NO AI)
router.post('/generate', authMiddleware, async (req, res) => {
    try {
        const analysis = aiTrader.getCurrentAnalysis();
        if (!analysis || !analysis.watch_state) {
            return res.json({ success: false, message: 'Initializing...', signal: null });
        }

        const watchState = analysis.watch_state;
        const currentSymbol = watchState.symbol || 'R_75';

        const signal = {
            symbol: currentSymbol,
            action: watchState.action === 'BUY' ? 'BUY' : (watchState.action === 'SELL' ? 'SELL' : 'WAIT'),
            confidence: watchState.confidence,
            pattern: watchState.pattern || 'Analyzing...',
            entry_price: watchState.entry_price || null,
            take_profit: watchState.take_profit || null,
            stop_loss: watchState.stop_loss || null,
            reasoning: watchState.reason || 'Learning engine analyzing market...',
            simple_reason: watchState.reason || 'Waiting for setup...',
            rsi: watchState.rsi,
            support: watchState.support,
            resistance: watchState.resistance,
            entry_time: 'Now',
            exit_time: '5 min',
            is_waiting: watchState.action === 'WAIT',
            confidence_threshold: 55
        };

        console.log(`📡 [API] Returning signal for symbol: ${currentSymbol}, action: ${signal.action}`);

        res.json({ success: true, signal });
    } catch (error) {
        console.error('Get signal error:', error);
        res.status(500).json({ error: 'Failed to get signal' });
    }
});

// Get AI status (NO AI)
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

// Get AI insights (NO AI - uses learning engine data)
router.get('/insights', authMiddleware, async (req, res) => {
    try {
        const { symbol } = req.query;
        let topPatterns = [];
        let worstPatterns = [];

        if (symbol && symbol !== '') {
            topPatterns = await Pattern.getTopPatternsBySymbol(symbol, 10);
            worstPatterns = await Pattern.getWorstPatternsBySymbol(symbol, 5);
        } else {
            topPatterns = await Pattern.getTopPatterns(10);
            worstPatterns = await Pattern.getWorstPatterns(5);
        }

        const userStats = await Trade.getUserStats(req.userId, 30);

        // Generate advice based on learning data (NO AI)
        let advice = { adjustments: ["AI is watching the market. Let it find the best entry."] };
        if (userStats.total_trades >= 10) {
            if (userStats.win_rate < 40) {
                advice = { adjustments: ["Your win rate is below 40%. Focus on higher quality setups.", "Reduce stake size until win rate improves.", "Avoid trading during London session (8-17 UTC)."] };
            } else if (userStats.win_rate < 50) {
                advice = { adjustments: ["Win rate is improving. Keep focusing on quality over quantity.", "Stick to RSI 35-45 zone for best results."] };
            } else if (userStats.win_rate >= 50) {
                advice = { adjustments: ["Win rate is above 50%. You can slightly increase stake on high confidence setups.", "Continue to avoid London session and RSI 45-55 zone."] };
            }
        }

        res.json({
            top_patterns: topPatterns || [],
            worst_patterns: worstPatterns || [],
            advice: advice,
            user_stats: userStats,
            has_enough_data: userStats.total_trades >= 3,
            current_symbol: symbol || 'all',
            message: userStats.total_trades === 0
                ? "No trades yet. The learning engine is waiting for market conditions."
                : userStats.total_trades < 3
                ? `Learning engine has analyzed ${userStats.total_trades} trade(s). Need ${3 - userStats.total_trades} more for pattern analysis.`
                : "Learning engine insights are ready based on your trading history."
        });
    } catch (error) {
        console.error('Get insights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get pending setup
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
