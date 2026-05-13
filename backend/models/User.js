const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    voucher_code: { type: String, default: null },
    trades_remaining: { type: Number, default: 0 },
    voucher_expiry: { type: Date, default: null },
    demo_token: { type: String, default: null },
    real_token: { type: String, default: null },
    default_symbol: { type: String, default: 'R_75' },
    base_stake: { type: Number, default: 0.35 },
    current_stake: { type: Number, default: 0.35 },
    auto_mode: { type: Number, default: 0 },
    push_signals: { type: Number, default: 0 },
    jackpot_mode: { type: Number, default: 0 },
    is_demo: { type: Number, default: 1 },
    is_admin: { type: Number, default: 0 },
    is_active: { type: Number, default: 1 },
    total_trades: { type: Number, default: 0 },
    total_wins: { type: Number, default: 0 },
    total_losses: { type: Number, default: 0 },
    net_profit: { type: Number, default: 0 },
    best_streak: { type: Number, default: 0 },
    current_streak: { type: Number, default: 0 },
    daily_profit: { type: Number, default: 0 },
    last_trade_date: { type: String, default: null },
    last_login: { type: Date, default: null },
}, { timestamps: true });

// REMOVED: userSchema.index({ email: 1 }) — unique: true already creates index
// REMOVED: userSchema.index({ username: 1 }) — not needed for current queries

const UserModel = mongoose.model('User', userSchema);

class User {
    static async create(userData) {
        const { email, username, password, voucher_code, trades_limit, expiry_date } = userData;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await UserModel.create({
            email, username, password: hashedPassword,
            voucher_code: voucher_code || null,
            trades_remaining: trades_limit || 0,
            voucher_expiry: expiry_date ? new Date(expiry_date) : null,
            default_symbol: process.env.DEFAULT_SYMBOL || 'R_75',
            base_stake: parseFloat(process.env.DEFAULT_STAKE) || 0.35,
            current_stake: parseFloat(process.env.DEFAULT_STAKE) || 0.35,
        });
        return user._id;
    }

    static async findByEmail(email) { return UserModel.findOne({ email }); }
    static async findById(id) { return UserModel.findById(id); }
    static async findByUsername(username) { return UserModel.findOne({ username }); }
    static async update(id, updates) { return UserModel.findByIdAndUpdate(id, updates, { new: true }); }

    static async getAll(page = 1, limit = 50, filters = {}) {
        const query = {};
        if (filters.is_admin !== undefined) query.is_admin = filters.is_admin;
        if (filters.is_active !== undefined) query.is_active = filters.is_active;
        return UserModel.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    }

    static async getLeaderboard(limit = 10) {
        const users = await UserModel.find({ is_active: 1, total_trades: { $gt: 0 } }).sort({ net_profit: -1 }).limit(limit).lean();
        return users.map(u => ({
            username: u.username, total_trades: u.total_trades || 0, total_wins: u.total_wins || 0,
            total_losses: u.total_losses || 0, net_profit: u.net_profit || 0, best_streak: u.best_streak || 0,
            win_rate: u.total_trades > 0 ? ((u.total_wins / u.total_trades) * 100).toFixed(1) : 0
        }));
    }

    static async updateStats(userId, tradeResult, profit, stake) {
        const user = await UserModel.findById(userId);
        if (!user) return false;
        const winInc = tradeResult === 'WIN' ? 1 : 0;
        const lossInc = tradeResult === 'LOSS' ? 1 : 0;
        const newStreak = tradeResult === 'WIN' ? (user.current_streak || 0) + 1 : 0;
        const today = new Date().toISOString().split('T')[0];
        const dailyProfit = user.last_trade_date === today ? (user.daily_profit || 0) + profit : profit;
        await UserModel.findByIdAndUpdate(userId, {
            $inc: { total_trades: 1, total_wins: winInc, total_losses: lossInc, net_profit: profit },
            $set: { current_streak: newStreak, best_streak: Math.max(user.best_streak || 0, newStreak), daily_profit: dailyProfit, last_trade_date: today }
        });
        return true;
    }

    static async verifyPassword(user, password) { return bcrypt.compare(password, user.password); }

    static generateToken(user) {
        return jwt.sign(
            { id: user._id || user.id, email: user.email, is_admin: user.is_admin },
            process.env.JWT_SECRET || 'monix-secret-key',
            { expiresIn: process.env.JWT_EXPIRY || '7d' }
        );
    }

    static verifyToken(token) {
        try { return jwt.verify(token, process.env.JWT_SECRET || 'monix-secret-key'); }
        catch (error) { return null; }
    }

    static async deductTrade(userId) {
        const user = await UserModel.findById(userId);
        if (user && user.trades_remaining > 0) { await UserModel.findByIdAndUpdate(userId, { $inc: { trades_remaining: -1 } }); return true; }
        return false;
    }

    static async checkDailyLossLimit(userId) {
        const user = await UserModel.findById(userId);
        const today = new Date().toISOString().split('T')[0];
        const dailyLoss = user?.last_trade_date === today ? (user.daily_profit || 0) : 0;
        const limit = parseFloat(process.env.DAILY_LOSS_LIMIT || 25);
        return dailyLoss <= -limit;
    }
}

module.exports = User;
