const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { signalLimiter } = require('../middleware/rateLimit');
const User = require('../models/User');
const Trade = require('../models/Trade');
const Pattern = require('../models/Pattern');
const deepseekService = require('../services/deepseekService');
const derivService = require('../services/derivService');
const { broadcastSignal, broadcastNotification } = require('../utils/websocket');
const { getCurrentSession } = require('../utils/helpers');
const db = require('../config/database').getDb();

router.post('/generate', authMiddleware, signalLimiter, async (req, res) => {
    try {
        const { symbol } = req.body;
        const user = await User.findById(req.userId);
        const targetSymbol = symbol || user.default_symbol || process.env.DEFAULT_SYMBOL || 'R_75';

        console.log(`🎯 [AI] Generating signal for user ${req.userId}, symbol: ${targetSymbol}`);

        // CHECK 1: Does user have trades remaining?
        if (user.trades_remaining <= 0) {
            console.log(`❌ [AI] Signal rejected: No trades remaining (${user.trades_remaining})`);
            return res.status(200).json({
                success: false,
                message: `No trades remaining. Your voucher has ${user.trades_remaining} trades left.`,
                reason: 'NO_TRADES_LEFT',
                signal: null
            });
        }

        // CHECK 2: Daily loss limit?
        const hitLimit = await User.checkDailyLossLimit(req.userId);
        if (hitLimit) {
            console.log(`❌ [AI] Signal rejected: Daily loss limit reached`);
            return res.status(200).json({
                success: false,
                message: `Daily loss limit reached. Trading paused until tomorrow.`,
                reason: 'DAILY_LOSS_LIMIT',
                signal: null
            });
        }

        // CHECK 3: Does user have API token?
        const token = user.is_demo ? user.demo_token : user.real_token;
        if (!token || token.trim().length === 0) {
            console.log(`❌ [AI] Signal rejected: No ${user.is_demo ? 'DEMO' : 'REAL'} API token configured`);
            return res.status(200).json({
                success: false,
                message: `Add your ${user.is_demo ? 'DEMO' : 'REAL'} API token in Settings → API Keys`,
                reason: 'NO_API_TOKEN',
                signal: null
            });
        }

        // CHECK 4: Is Deriv connected/authorized?
        if (!derivService.authorized) {
            console.log(`⚠️ [AI] Deriv not authorized, attempting reconnect...`);
            try {
                const reconnectResult = await derivService.reconnectWithToken(token);
                if (!reconnectResult.success) {
                    console.log(`❌ [AI] Signal rejected: Cannot connect to Deriv - ${reconnectResult.error}`);
                    return res.status(200).json({
                        success: false,
                        message: `Cannot connect to Deriv. Check your API token.`,
                        reason: 'DERIV_CONNECTION_FAILED',
                        signal: null
                    });
                }
                console.log(`✅ [AI] Deriv reconnected successfully`);
            } catch (e) {
                console.log(`❌ [AI] Signal rejected: Deriv connection error - ${e.message}`);
                return res.status(200).json({
                    success: false,
                    message: `Deriv connection error: ${e.message}`,
                    reason: 'DERIV_CONNECTION_ERROR',
                    signal: null
                });
            }
        }

        // Get current price from Deriv
        let currentPrice = 32500;
        let rsiValue = 50;
        let macdValue = 'neutral';
        let detectedPattern = 'None';
        let supportLevel = 0;
        let resistanceLevel = 0;

        try {
            const tickHistory = await derivService.getTickHistory(targetSymbol, 'latest', 100);
            if (tickHistory && tickHistory.history && tickHistory.history.prices && tickHistory.history.prices.length > 0) {
                currentPrice = tickHistory.history.prices[0];
                console.log(`💰 [AI] Current price for ${targetSymbol}: $${currentPrice}`);

                const prices = tickHistory.history.prices;
                if (prices.length >= 14) {
                    let gains = 0, losses = 0;
                    for (let i = prices.length - 14; i < prices.length; i++) {
                        const change = prices[i] - prices[i-1];
                        if (change >= 0) gains += change;
                        else losses -= change;
                    }
                    const avgGain = gains / 14;
                    const avgLoss = losses / 14;
                    if (avgLoss !== 0) {
                        const rs = avgGain / avgLoss;
                        rsiValue = 100 - (100 / (1 + rs));
                        rsiValue = Math.round(rsiValue);
                    }
                    console.log(`📊 [AI] Calculated RSI: ${rsiValue}`);
                }

                const sortedPrices = [...prices].sort((a, b) => a - b);
                supportLevel = sortedPrices[Math.floor(sortedPrices.length * 0.2)];
                resistanceLevel = sortedPrices[Math.floor(sortedPrices.length * 0.8)];
            }
        } catch (error) {
            console.error('Failed to get price from Deriv:', error.message);
            console.log(`❌ [AI] Signal rejected: Cannot fetch price from Deriv`);
            return res.status(200).json({
                success: false,
                message: `Cannot fetch price from Deriv. Check your connection.`,
                reason: 'DERIV_PRICE_ERROR',
                signal: null
            });
        }

        // Get user's recent trades for AI context
        const recentTrades = await Trade.getUserTrades(req.userId, 10);
        const tradeContext = recentTrades.map(t => ({
            symbol: t.symbol,
            action: t.action,
            result: t.status,
            profit: t.profit
        }));

        // Get similar patterns from database
        const session = getCurrentSession();
        const similarPatterns = await Pattern.getSimilarPatterns(targetSymbol, session, null);

        // Call DeepSeek AI for analysis
        console.log(`🤖 [AI] Calling DeepSeek API for market analysis...`);
        const analysis = await deepseekService.analyzeMarket(
            targetSymbol,
            currentPrice,
            rsiValue,
            macdValue,
            session,
            tradeContext
        );

        // Convert CALL/PUT to BUY/SELL for UI
        const uiAction = analysis.action === 'CALL' ? 'BUY' : 'SELL';
        console.log(`✅ [AI] DeepSeek analysis complete: ${uiAction} with ${analysis.confidence}% confidence`);

        detectedPattern = analysis.pattern || 'Technical pattern detected';

        // Calculate target and stop based on confidence
        const movePercent = analysis.confidence > 75 ? 0.005 : (analysis.confidence > 60 ? 0.004 : 0.003);
        let takeProfit, stopLoss;
        if (uiAction === 'BUY') {
            takeProfit = currentPrice * (1 + movePercent);
            stopLoss = currentPrice * (1 - movePercent / 1.5);
        } else {
            takeProfit = currentPrice * (1 - movePercent);
            stopLoss = currentPrice * (1 + movePercent / 1.5);
        }

        // CHECK 5: Jackpot mode filter
        if (user.jackpot_mode && analysis.confidence < 85) {
            console.log(`🎰 [AI] Signal rejected: Jackpot mode ON, confidence ${analysis.confidence}% < 85% threshold`);
            return res.status(200).json({
                success: false,
                message: `Jackpot mode enabled. Signal confidence (${analysis.confidence}%) below 85% threshold.`,
                reason: 'JACKPOT_FILTER',
                confidence: analysis.confidence,
                threshold: 85,
                signal: null
            });
        }

        console.log(`✅ [AI] Signal passed all checks! Confidence: ${analysis.confidence}%`);

        // Apply pattern boost from learning system
        let confidenceBoost = 0;
        if (similarPatterns && similarPatterns.length > 0) {
            const bestMatch = similarPatterns[0];
            confidenceBoost = bestMatch.confidence_boost || 0;
            analysis.confidence = Math.min(100, analysis.confidence + confidenceBoost);
            console.log(`📈 [AI] Pattern boost: +${confidenceBoost}% from pattern "${bestMatch.pattern_name}"`);
        }

        // Store signal in database
        const expiresAt = new Date(Date.now() + 60000);
        const signals = db.signals ? db.signals.getAll() : [];
        const newId = signals.length > 0 ? Math.max(...signals.map(s => s.id)) + 1 : 1;

        const newSignal = {
            id: newId,
            user_id: req.userId,
            symbol: targetSymbol,
            action: uiAction,
            confidence: analysis.confidence,
            pattern: detectedPattern,
            entry_price: currentPrice,
            take_profit: takeProfit,
            stop_loss: stopLoss,
            reasoning: analysis.reasoning,
            rsi: rsiValue,
            macd: macdValue,
            support: supportLevel,
            resistance: resistanceLevel,
            is_expired: 0,
            created_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString()
        };

        if (db.signals) {
            signals.push(newSignal);
            console.log(`💾 [AI] Signal saved with ID: ${newId}`);
        }

        // Auto-push signal if enabled
        if (user.push_signals) {
            broadcastSignal({
                user_id: req.userId,
                symbol: targetSymbol,
                action: uiAction,
                confidence: analysis.confidence,
                pattern: detectedPattern,
                entry_price: currentPrice,
                take_profit: takeProfit,
                stop_loss: stopLoss,
                reasoning: analysis.reasoning,
                rsi: rsiValue,
                macd: macdValue,
                support: supportLevel,
                resistance: resistanceLevel,
                timestamp: Date.now()
            });
            console.log(`📡 [AI] Signal pushed to WebSocket clients`);

            broadcastNotification(
                'New AI Signal',
                `${uiAction} ${targetSymbol} with ${analysis.confidence}% confidence`,
                'info'
            );
        }

        res.json({
            success: true,
            signal: {
                action: uiAction,
                confidence: analysis.confidence,
                pattern: detectedPattern,
                entry_price: currentPrice,
                take_profit: takeProfit,
                stop_loss: stopLoss,
                reasoning: analysis.reasoning,
                rsi: rsiValue,
                macd: macdValue,
                support: supportLevel,
                resistance: resistanceLevel,
                pattern_boost: confidenceBoost > 0 ? confidenceBoost : null
            }
        });

    } catch (error) {
        console.error('❌ [AI] Generate signal error:', error);
        res.status(500).json({ error: 'Failed to generate signal' });
    }
});

router.get('/history', authMiddleware, async (req, res) => {
    try {
        const signals = db.signals ? db.signals.getAll() : [];
        const userSignals = signals.filter(s => s.user_id === req.userId).slice(0, 50);
        console.log(`📋 [AI] Returning ${userSignals.length} signals for user ${req.userId}`);
        res.json(userSignals || []);
    } catch (error) {
        console.error('Get signal history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/insights', authMiddleware, async (req, res) => {
    try {
        console.log(`🧠 [AI] Fetching insights for user ${req.userId}`);

        const topPatterns = await Pattern.getTopPatterns(10);
        const worstPatterns = await Pattern.getWorstPatterns(5);
        const userStats = await Trade.getUserStats(req.userId, 30);

        console.log(`📊 [AI] Top patterns found: ${topPatterns.length}`);
        console.log(`📊 [AI] Worst patterns found: ${worstPatterns.length}`);
        console.log(`📊 [AI] User stats: ${userStats.total_trades || 0} trades, ${userStats.win_rate || 0}% win rate`);

        let advice = { adjustments: ["Complete more trades for AI advice"] };

        if (userStats.total_trades >= 3) {
            console.log(`🤖 [AI] Calling DeepSeek for daily advice...`);
            try {
                advice = await deepseekService.getDailyAdvice(userStats, topPatterns, worstPatterns);
                console.log(`✅ [AI] DeepSeek advice received`);
            } catch (e) {
                console.error('❌ [AI] Failed to get AI advice:', e.message);
            }
        }

        const response = {
            top_patterns: topPatterns || [],
            worst_patterns: worstPatterns || [],
            advice: advice,
            user_stats: userStats,
            has_enough_data: userStats.total_trades >= 3,
            message: userStats.total_trades === 0
                ? "No trades yet. Execute a trade to generate AI insights!"
                : userStats.total_trades < 3
                ? `AI needs more data. Complete ${3 - userStats.total_trades} more trade(s) for pattern analysis.`
                : "AI insights are ready based on your trading history."
        };

        console.log(`📤 [AI] Returning insights response`);
        res.json(response);

    } catch (error) {
        console.error('❌ [AI] Get insights error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
