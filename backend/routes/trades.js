const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authMiddleware } = require('../middleware/auth');
const { tradingLimiter } = require('../middleware/rateLimit');
const User = require('../models/User');
const Trade = require('../models/Trade');
const Pattern = require('../models/Pattern');
const derivService = require('../services/derivService');
const { broadcastTradeResult, broadcastBalance } = require('../utils/websocket');
const { getCurrentSession } = require('../utils/helpers');

const TradeModel = mongoose.model('Trade');

router.post('/execute', authMiddleware, tradingLimiter, async (req, res) => {
    try {
        const { symbol, action, stake, entry_price, confidence, pattern, rsi, macd, is_auto } = req.body;

        if (!symbol || !action || !stake) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const user = await User.findById(req.userId);
        if (!user || user.trades_remaining <= 0) {
            return res.status(400).json({ error: 'No trades remaining' });
        }

        const hitLimit = await User.checkDailyLossLimit(req.userId);
        if (hitLimit) {
            return res.status(400).json({ error: 'Daily loss limit reached' });
        }

        const token = user.is_demo ? user.demo_token : user.real_token;
        if (!token) {
            return res.status(400).json({ error: `Add ${user.is_demo ? 'DEMO' : 'REAL'} API token in Settings` });
        }

        if (!derivService.isConnected || !derivService.authorized) {
            await derivService.connect(token);
        } else if (derivService.currentToken !== token) {
            derivService.disconnect();
            await derivService.connect(token);
        }

        const tradeResult = await derivService.placeTrade(symbol, action, parseFloat(stake), 5, 'm');

        const session = getCurrentSession();
        const tradeId = await Trade.create({
            user_id: req.userId,
            contract_id: tradeResult.buy.contract_id,
            symbol,
            action,
            entry_price: parseFloat(entry_price),
            stake: parseFloat(stake),
            confidence: confidence || 0,
            pattern: pattern || 'Unknown',
            rsi: rsi || 50,
            macd: macd || 'neutral',
            session,
            is_auto: is_auto || 0
        });

        await User.deductTrade(req.userId);

        broadcastTradeResult({
            id: tradeId,
            contract_id: tradeResult.buy.contract_id,
            symbol,
            action,
            entry_price: parseFloat(entry_price),
            exit_price: null,
            profit: null,
            stake: parseFloat(stake),
            status: 'PENDING'
        });

        setTimeout(async () => {
            try {
                const contractId = tradeResult.buy.contract_id;
                let contractResult = null;
                let retries = 10;

                while (retries > 0 && !contractResult) {
                    try {
                        contractResult = await derivService.getClosedContract(contractId);
                        if (contractResult) break;
                    } catch (e) {}
                    await new Promise(r => setTimeout(r, 30000));
                    retries--;
                }

                if (contractResult) {
                    let profit = 0;
                    let exitPrice = parseFloat(entry_price);

                    if (contractResult.profit !== undefined && contractResult.profit !== null) {
                        profit = contractResult.profit;
                    } else if (contractResult.sell_price && contractResult.buy_price) {
                        profit = contractResult.sell_price - contractResult.buy_price;
                    }

                    if (contractResult.exit_tick?.quote) {
                        exitPrice = contractResult.exit_tick.quote;
                    } else if (contractResult.sell_price) {
                        exitPrice = contractResult.sell_price;
                    }

                    const status = profit > 0 ? 'WIN' : 'LOSS';
                    const finalProfit = profit !== 0 ? profit : (status === 'WIN' ? parseFloat(stake) * 0.85 : -parseFloat(stake));

                    await Trade.updateResult(tradeId, exitPrice, finalProfit, status);
                    await User.updateStats(req.userId, status, finalProfit, parseFloat(stake));
                    await Pattern.recordTradeResult(pattern, symbol, action, session, status === 'WIN');

                    broadcastTradeResult({
                        id: tradeId,
                        contract_id: contractId,
                        symbol,
                        action,
                        entry_price: parseFloat(entry_price),
                        exit_price: exitPrice,
                        profit: finalProfit,
                        stake: parseFloat(stake),
                        status
                    });

                    try {
                        const newBalance = await derivService.getBalance();
                        broadcastBalance(req.userId, newBalance.balance);
                    } catch (e) {}
                }
            } catch (error) {
                console.error('❌ [Trade] Result check error:', error);
                await Trade.updateResult(tradeId, parseFloat(entry_price), -parseFloat(stake), 'LOSS');
            }
        }, 330000);

        res.json({
            success: true,
            message: 'Trade executed',
            contract_id: tradeResult.buy.contract_id,
            trade_id: tradeId
        });

    } catch (error) {
        console.error('Execute trade error:', error);
        res.status(500).json({ error: error.message || 'Trade failed' });
    }
});

router.get('/history', authMiddleware, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const trades = await Trade.getUserTrades(req.userId, parseInt(limit), parseInt(offset));
        res.json(trades);
    } catch (error) {
        console.error('Get trades error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const stats = await Trade.getUserStats(req.userId, parseInt(days));
        const symbolStats = await Trade.getSymbolStats(req.userId);
        const sessionStats = await Trade.getSessionStats(req.userId);
        const todayStats = await Trade.getTodayStats(req.userId);

        res.json({
            overall: stats,
            today: todayStats,
            by_symbol: symbolStats,
            by_session: sessionStats
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/locked-balance', authMiddleware, async (req, res) => {
    try {
        const trades = await TradeModel.find({ user_id: req.userId, status: 'PENDING' });
        const locked = trades.reduce((sum, t) => sum + (t.stake || 0), 0);
        res.json({ locked, count: trades.length });
    } catch (error) {
        console.error('Locked balance error:', error);
        res.json({ locked: 0, count: 0 });
    }
});

module.exports = router;
