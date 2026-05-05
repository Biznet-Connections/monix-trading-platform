const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/admin');
const User = require('../models/User');
const Voucher = require('../models/Voucher');
const Trade = require('../models/Trade');
const emailService = require('../services/emailService');
const { broadcastNotification } = require('../utils/websocket');

// All routes require admin authentication
router.use(adminAuth);

// ============ VOUCHER MANAGEMENT ============
router.post('/vouchers/generate', async (req, res) => {
    try {
        const { days, trades } = req.body;
        
        if (!days || !trades || days < 1 || trades < 1) {
            return res.status(400).json({ error: 'Days and trades required (minimum 1 each)' });
        }
        
        const voucher = await Voucher.create({
            days_valid: parseInt(days),
            trades_limit: parseInt(trades),
            created_by: req.user.email
        });
        
        res.json({
            success: true,
            voucher: {
                code: voucher.code,
                days: days,
                trades: trades
            }
        });
        
    } catch (error) {
        console.error('Generate voucher error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/vouchers', async (req, res) => {
    try {
        const vouchers = await Voucher.getAll();
        const stats = await Voucher.getStats();
        res.json({ vouchers, stats });
    } catch (error) {
        console.error('Get vouchers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/vouchers/:code', async (req, res) => {
    try {
        const { code } = req.params;
        await Voucher.revoke(code);
        res.json({ success: true, message: 'Voucher revoked' });
    } catch (error) {
        console.error('Revoke voucher error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ USER MANAGEMENT ============
router.get('/users', async (req, res) => {
    try {
        const users = await User.getAll(1, 100);
        const usersWithStats = await Promise.all(users.map(async (user) => {
            const stats = await Trade.getUserStats(user.id);
            return { ...user, stats };
        }));
        res.json(usersWithStats);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const trades = await Trade.getUserTrades(user.id, 50);
        const stats = await Trade.getUserStats(user.id);
        const symbolStats = await Trade.getSymbolStats(user.id);
        
        res.json({ user, trades, stats, symbolStats });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/users/:id/block', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await User.update(user.id, { is_active: 0 });
        
        await emailService.sendAccountBlocked(user.email, user.username);
        
        res.json({ success: true, message: 'User blocked' });
    } catch (error) {
        console.error('Block user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/users/:id/unblock', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await User.update(user.id, { is_active: 1 });
        res.json({ success: true, message: 'User unblocked' });
    } catch (error) {
        console.error('Unblock user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/users/:id/reset-trades', async (req, res) => {
    try {
        const { trades } = req.body;
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await User.update(user.id, { trades_remaining: trades });
        res.json({ success: true, message: `Trades reset to ${trades}` });
    } catch (error) {
        console.error('Reset trades error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/users/:id/add-admin', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        await User.update(user.id, { is_admin: 1 });
        await emailService.sendAdminGranted(user.email, user.username);
        
        res.json({ success: true, message: 'Admin privileges granted' });
    } catch (error) {
        console.error('Add admin error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ BROADCAST ============
router.post('/broadcast', async (req, res) => {
    try {
        const { message, subject } = req.body;
        const users = await User.getAll(1, 1000);
        
        let sent = 0;
        for (const user of users) {
            if (user.email) {
                await emailService.sendBroadcast(user.email, user.username, message, subject || 'MONIX Announcement');
                sent++;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        broadcastNotification(subject || 'Announcement', message, 'info');
        
        res.json({ success: true, message: `Broadcast sent to ${sent} users` });
    } catch (error) {
        console.error('Broadcast error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ SYSTEM STATS ============
router.get('/stats', async (req, res) => {
    try {
        const users = await User.getAll(1, 1000);
        const allTrades = await Trade.getAllTrades(10000);
        
        const totalTrades = allTrades.length;
        const totalWins = allTrades.filter(t => t.status === 'WIN').length;
        const totalProfit = allTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        
        const today = new Date().toISOString().split('T')[0];
        const todayTrades = allTrades.filter(t => t.executed_at?.startsWith(today));
        const todayProfit = todayTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        
        const activeUsers = users.filter(u => {
            if (!u.last_login) return false;
            const lastLogin = new Date(u.last_login);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return lastLogin > weekAgo;
        }).length;
        
        const voucherStats = await Voucher.getStats();
        
        res.json({
            total_users: users.length,
            active_users: activeUsers,
            total_trades: totalTrades,
            total_wins: totalWins,
            total_losses: totalTrades - totalWins,
            win_rate: totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : 0,
            total_profit: totalProfit.toFixed(2),
            today_trades: todayTrades.length,
            today_profit: todayProfit.toFixed(2),
            vouchers: voucherStats,
            system_status: 'online',
            version: '3.0.0'
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============ SYSTEM SETTINGS ============
router.get('/settings', async (req, res) => {
    res.json({
        default_stake: process.env.DEFAULT_STAKE || 0.10,
        default_symbol: process.env.DEFAULT_SYMBOL || 'R_75',
        max_trades_per_day: process.env.MAX_TRADES_PER_DAY || 50,
        confidence_threshold: process.env.CONFIDENCE_THRESHOLD || 65,
        daily_loss_limit: process.env.DAILY_LOSS_LIMIT || 25,
        jackpot_threshold: process.env.JACKPOT_THRESHOLD || 85
    });
});

module.exports = router;
