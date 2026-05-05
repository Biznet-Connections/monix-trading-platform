const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');
const Trade = require('../models/Trade');
const derivService = require('../services/derivService');
const { broadcastBalance } = require('../utils/websocket');

router.get('/profile', authMiddleware, async (req, res) => {
    try {
        console.log(`📋 [API] Getting profile for user ${req.userId}`);
        const user = await User.findById(req.userId);
        const stats = await Trade.getUserStats(req.userId);
        const todayStats = await Trade.getTodayStats(req.userId);
        const symbolStats = await Trade.getSymbolStats(req.userId);

        let derivBalance = null;
        const token = user.is_demo ? user.demo_token : user.real_token;
        
        if (token && token.trim().length > 0) {
            try {
                const needsReconnect = !derivService.authorized || derivService.currentToken !== token;
                if (needsReconnect) {
                    await derivService.reconnectWithToken(token);
                } else {
                    const balance = await derivService.getBalance();
                    derivBalance = { balance: balance.balance, currency: balance.currency || 'USD', authorized: true };
                    console.log(`💰 [API] Deriv balance: ${balance.balance} ${balance.currency}`);
                }
            } catch (e) {
                console.error('Failed to get Deriv balance:', e.message);
                derivBalance = { authorized: false, balance: 0, currency: 'USD', error: e.message };
            }
        } else {
            console.log('⚠️ [API] No token available for current mode');
            derivBalance = { authorized: false, balance: 0, currency: 'USD', error: 'No API token configured' };
        }

        res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                trades_remaining: user.trades_remaining,
                voucher_code: user.voucher_code,
                voucher_expiry: user.voucher_expiry,
                default_symbol: user.default_symbol,
                base_stake: user.base_stake,
                auto_mode: user.auto_mode,
                push_signals: user.push_signals,
                jackpot_mode: user.jackpot_mode,
                is_demo: user.is_demo,
                is_admin: user.is_admin,
                demo_token: user.demo_token ? '***' + user.demo_token.slice(-4) : null,
                real_token: user.real_token ? '***' + user.real_token.slice(-4) : null
            },
            stats: {
                ...stats,
                today_trades: todayStats.trades_count,
                today_wins: todayStats.wins,
                today_losses: todayStats.losses,
                today_profit: todayStats.profit
            },
            symbolStats,
            derivBalance
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/settings', authMiddleware, async (req, res) => {
    try {
        const { default_symbol, base_stake, auto_mode, push_signals, jackpot_mode } = req.body;

        const updates = {};
        if (default_symbol !== undefined) updates.default_symbol = default_symbol;
        if (base_stake !== undefined) updates.base_stake = base_stake;
        if (auto_mode !== undefined) updates.auto_mode = auto_mode ? 1 : 0;
        if (push_signals !== undefined) updates.push_signals = push_signals ? 1 : 0;
        if (jackpot_mode !== undefined) updates.jackpot_mode = jackpot_mode ? 1 : 0;

        await User.update(req.userId, updates);

        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/api-keys', authMiddleware, async (req, res) => {
    try {
        const { demo_token, real_token } = req.body;

        console.log(`🔑 [API] Updating API keys for user ${req.userId}`);
        console.log(`   Demo token: ${demo_token ? '***' + demo_token.slice(-4) : 'empty'}`);
        console.log(`   Real token: ${real_token ? '***' + real_token.slice(-4) : 'empty'}`);

        const updates = {};
        if (demo_token !== undefined) updates.demo_token = demo_token;
        if (real_token !== undefined) updates.real_token = real_token;

        await User.update(req.userId, updates);
        console.log(`✅ [API] API keys saved to database`);

        const user = await User.findById(req.userId);
        const tokenToUse = user.is_demo ? user.demo_token : user.real_token;

        console.log(`🔄 [API] Current mode: ${user.is_demo ? 'DEMO' : 'REAL'}`);
        console.log(`🔑 [API] Token to use: ${tokenToUse ? '***' + tokenToUse.slice(-4) : 'none'}`);

        let reconnectResult = { success: false };
        let balanceValue = 0;
        let currencyValue = 'USD';

        if (tokenToUse && tokenToUse.trim().length > 0) {
            console.log(`🔄 [API] Attempting to reconnect Deriv...`);
            reconnectResult = await derivService.reconnectWithToken(tokenToUse);
            console.log(`📊 [API] Reconnect result: ${reconnectResult.success ? 'SUCCESS' : 'FAILED'}`);
            if (reconnectResult.success) {
                balanceValue = reconnectResult.balance;
                currencyValue = reconnectResult.currency || 'USD';
                console.log(`💰 [API] Balance: ${balanceValue} ${currencyValue}`);
            } else {
                console.log(`❌ [API] Error: ${reconnectResult.error}`);
            }
        } else {
            console.log('⚠️ [API] No token available for current mode - staying in read-only mode');
        }

        res.json({
            success: true,
            message: 'API keys saved',
            reconnect: reconnectResult,
            balance: balanceValue,
            currency: currencyValue,
            mode: user.is_demo ? 'DEMO' : 'REAL'
        });
    } catch (error) {
        console.error('❌ [API] Save API keys error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/reconnect', authMiddleware, async (req, res) => {
    try {
        console.log(`🔄 [API] Manual reconnect requested for user ${req.userId}`);
        const user = await User.findById(req.userId);
        const tokenToUse = user.is_demo ? user.demo_token : user.real_token;

        console.log(`🔑 [API] Current mode: ${user.is_demo ? 'DEMO' : 'REAL'}`);
        console.log(`🔑 [API] Token: ${tokenToUse ? '***' + tokenToUse.slice(-4) : 'none'}`);

        if (!tokenToUse || tokenToUse.trim().length === 0) {
            console.log('❌ [API] No API token found for current mode');
            return res.status(400).json({ error: 'No API token found for current mode' });
        }

        const result = await derivService.reconnectWithToken(tokenToUse);
        console.log(`📊 [API] Reconnect result: ${result.success ? 'SUCCESS' : 'FAILED'}`);

        if (result.success) {
            broadcastBalance(req.userId, result.balance);
        }

        res.json({
            success: result.success,
            balance: result.balance,
            currency: result.currency,
            mode: user.is_demo ? 'DEMO' : 'REAL',
            error: result.error
        });
    } catch (error) {
        console.error('❌ [API] Manual reconnect error:', error);
        res.status(500).json({ error: 'Failed to reconnect' });
    }
});

router.post('/switch-mode', authMiddleware, async (req, res) => {
    try {
        const { mode } = req.body;
        const isDemo = mode === 'demo' ? 1 : 0;
        const modeName = mode.toUpperCase();

        console.log(`🔄 [API] User ${req.userId} switching to ${modeName} mode`);
        await User.update(req.userId, { is_demo: isDemo });

        const user = await User.findById(req.userId);
        const tokenToUse = user.is_demo ? user.demo_token : user.real_token;

        let reconnectResult = { success: false };
        let balanceValue = 0;
        let currencyValue = 'USD';

        if (tokenToUse && tokenToUse.trim().length > 0) {
            console.log(`🔄 [API] Reconnecting with ${modeName} mode token...`);
            reconnectResult = await derivService.reconnectWithToken(tokenToUse);
            console.log(`📊 [API] Reconnect result: ${reconnectResult.success ? 'SUCCESS' : 'FAILED'}`);
            if (reconnectResult.success) {
                balanceValue = reconnectResult.balance;
                currencyValue = reconnectResult.currency || 'USD';
                console.log(`💰 [API] New balance: ${balanceValue} ${currencyValue}`);
                broadcastBalance(req.userId, balanceValue);
            }
        } else {
            console.log(`⚠️ [API] No ${modeName} token available - staying in read-only mode`);
        }

        res.json({
            success: true,
            message: `Switched to ${modeName} mode`,
            mode: modeName,
            reconnect: reconnectResult,
            balance: balanceValue,
            currency: currencyValue,
            hasToken: !!(tokenToUse && tokenToUse.trim().length > 0)
        });
    } catch (error) {
        console.error('❌ [API] Switch mode error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/leaderboard', async (req, res) => {
    try {
        const leaderboard = await User.getLeaderboard(20);
        res.json(leaderboard);
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
