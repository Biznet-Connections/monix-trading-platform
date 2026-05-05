const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { tradingLimiter } = require('../middleware/rateLimit');
const User = require('../models/User');
const Trade = require('../models/Trade');
const Pattern = require('../models/Pattern');
const derivService = require('../services/derivService');
const emailService = require('../services/emailService');
const deepseekService = require('../services/deepseekService');
const { broadcastNotification, broadcastTradeResult, broadcastBalance } = require('../utils/websocket');
const { getCurrentSession } = require('../utils/helpers');

router.post('/execute', authMiddleware, tradingLimiter, async (req, res) => {
    try {
        const { symbol, action, stake, entry_price, take_profit, stop_loss, confidence, pattern, reasoning, rsi, macd } = req.body;

        if (!symbol || !action || !stake) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const user = await User.findById(req.userId);
        if (user.trades_remaining <= 0) {
            return res.status(400).json({ error: 'No trades remaining' });
        }

        const hitLimit = await User.checkDailyLossLimit(req.userId);
        if (hitLimit) {
            return res.status(400).json({ error: `Daily loss limit reached` });
        }

        const token = user.is_demo ? user.demo_token : user.real_token;
        if (!token) {
            return res.status(400).json({ error: `Add ${user.is_demo ? 'DEMO' : 'REAL'} API token` });
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
            is_auto: req.body.is_auto || 0
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
                let retries = 12;

                console.log(`🔍 [Trade] Starting result check for contract ${contractId}`);

                while (retries > 0 && !contractResult) {
                    try {
                        contractResult = await derivService.getClosedContract(contractId);
                        if (contractResult) {
                            console.log(`✅ [Trade] Found closed contract ${contractId}`);
                            break;
                        }
                        console.log(`⏳ [Trade] Contract ${contractId} still pending, retries left: ${retries}`);
                        await new Promise(r => setTimeout(r, 15000));
                        retries--;
                    } catch (e) {
                        console.log(`⚠️ [Trade] Contract check error: ${e.message}, retries left: ${retries}`);
                        await new Promise(r => setTimeout(r, 15000));
                        retries--;
                    }
                }

                if (contractResult) {
                    let profit = 0;
                    let exitPrice = parseFloat(entry_price);
                    
                    if (contractResult.profit !== undefined) {
                        profit = contractResult.profit;
                    } else if (contractResult.sell_price && contractResult.buy_price) {
                        profit = contractResult.sell_price - contractResult.buy_price;
                    } else if (contractResult.amount) {
                        profit = contractResult.amount;
                    }
                    
                    if (contractResult.exit_tick && contractResult.exit_tick.quote) {
                        exitPrice = contractResult.exit_tick.quote;
                    } else if (contractResult.sell_price) {
                        exitPrice = contractResult.sell_price;
                    }
                    
                    const status = profit > 0 ? 'WIN' : 'LOSS';
                    
                    await Trade.updateResult(tradeId, exitPrice, profit, status);
                    await User.updateStats(req.userId, status, profit, parseFloat(stake));
                    await Pattern.recordTradeResult(pattern, symbol, action, session, status === 'WIN');
                    
                    broadcastTradeResult({
                        id: tradeId,
                        contract_id: contractId,
                        symbol,
                        action,
                        entry_price: parseFloat(entry_price),
                        exit_price: exitPrice,
                        profit: profit,
                        stake: parseFloat(stake),
                        status: status
                    });
                    
                    const newBalance = await derivService.getBalance();
                    broadcastBalance(req.userId, newBalance.balance);
                    
                    console.log(`✅ [Trade] ${contractId} result: ${status} $${profit.toFixed(2)}`);
                    return;
                }

                console.log(`⚠️ [Trade] No result found for ${contractId} after all retries, assuming LOSS`);
                const estimatedLoss = -parseFloat(stake);
                await Trade.updateResult(tradeId, parseFloat(entry_price), estimatedLoss, 'LOSS');
                await User.updateStats(req.userId, 'LOSS', estimatedLoss, parseFloat(stake));
                
                broadcastTradeResult({
                    id: tradeId,
                    contract_id: contractId,
                    symbol,
                    action,
                    entry_price: parseFloat(entry_price),
                    exit_price: parseFloat(entry_price),
                    profit: estimatedLoss,
                    stake: parseFloat(stake),
                    status: 'LOSS'
                });

            } catch (error) {
                console.error('❌ [Trade] Result check error:', error);
                await Trade.updateResult(tradeId, parseFloat(entry_price), -parseFloat(stake), 'LOSS');
            }
        }, 30000);

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
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/locked-balance', authMiddleware, async (req, res) => {
    try {
        const db = require('../config/database').getDb();
        const activeTrades = await new Promise((resolve, reject) => {
            db.all('SELECT stake FROM trades WHERE user_id = ? AND status = "PENDING"', [req.userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        const locked = activeTrades.reduce((sum, t) => sum + (t.stake || 0), 0);
        res.json({ locked, count: activeTrades.length });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
