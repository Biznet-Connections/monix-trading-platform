const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    is_admin: { type: Boolean, default: false },
    is_demo: { type: Boolean, default: true },
    is_active: { type: Boolean, default: true },
    is_blocked: { type: Boolean, default: false },

    demo_token: { type: String, default: '' },
    real_token: { type: String, default: '' },

    voucher_code: { type: String, default: '' },
    voucher_expiry: { type: Date, default: null },
    trades_remaining: { type: Number, default: 0 },

    default_symbol: { type: String, default: 'R_75' },
    base_stake: { type: Number, default: 0.50 },
    push_signals: { type: Boolean, default: false },
    auto_mode: { type: Boolean, default: false },
    jackpot_mode: { type: Boolean, default: false },

    total_trades: { type: Number, default: 0 },
    total_wins: { type: Number, default: 0 },
    total_losses: { type: Number, default: 0 },
    net_profit: { type: Number, default: 0 },
    best_streak: { type: Number, default: 0 },
    current_streak: { type: Number, default: 0 },

    last_login: { type: Date, default: null },
    reset_token: { type: String, default: null },
    reset_expiry: { type: Date, default: null },

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Instance method: Compare password
userSchema.methods.comparePassword = async function(password) {
    return bcrypt.compare(password, this.password);
};

// Instance method: Generate JWT token
userSchema.methods.generateToken = function() {
    return jwt.sign(
        { id: this._id, email: this.email, is_admin: this.is_admin },
        process.env.JWT_SECRET || 'monix_super_secret_key_change_in_production_2025',
        { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );
};

// Static method: Verify JWT token
userSchema.statics.verifyToken = function(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET || 'monix_super_secret_key_change_in_production_2025');
    } catch (error) {
        return null;
    }
};

// Static method: Get all users
userSchema.statics.getAll = async function() {
    return this.find({}).sort({ created_at: -1 });
};

// Static method: Find by ID
userSchema.statics.findById = async function(id) {
    return this.findOne({ _id: id });
};

// Static method: Find by email
userSchema.statics.findByEmail = async function(email) {
    return this.findOne({ email });
};

// Static method: Find by username
userSchema.statics.findByUsername = async function(username) {
    return this.findOne({ username });
};

// Static method: Get leaderboard
userSchema.statics.getLeaderboard = async function(limit = 50) {
    return this.find({ is_blocked: false, total_trades: { $gt: 0 } })
        .sort({ net_profit: -1 })
        .limit(limit)
        .select('username total_trades total_wins total_losses net_profit best_streak current_streak');
};

// Static method: Update user stats after trade
userSchema.statics.updateStats = async function(userId, status, profit, stake) {
    const user = await this.findById(userId);
    if (!user) return null;

    user.total_trades++;
    if (status === 'WIN') {
        user.total_wins++;
        user.net_profit += profit;
        user.current_streak = user.current_streak > 0 ? user.current_streak + 1 : 1;
        if (user.current_streak > user.best_streak) user.best_streak = user.current_streak;
    } else {
        user.total_losses++;
        user.net_profit -= stake;
        user.current_streak = user.current_streak < 0 ? user.current_streak - 1 : -1;
    }

    user.updated_at = Date.now();
    await user.save();
    return user;
};

// Static method: Deduct one trade from user's remaining trades
userSchema.statics.deductTrade = async function(userId) {
    const user = await this.findById(userId);
    if (user && user.trades_remaining > 0) {
        user.trades_remaining--;
        await user.save();
    }
    return user;
};

// Static method: Update user (generic update)
userSchema.statics.update = async function(userId, updates) {
    return this.findByIdAndUpdate(userId, updates, { new: true });
};

// Static method: Create new user
userSchema.statics.create = async function(userData) {
    const user = new this(userData);
    await user.save();
    return user._id;
};

// Static method: Check daily loss limit
userSchema.statics.checkDailyLossLimit = async function(userId, dailyLimitPercent = 0.05) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const trades = await mongoose.model('Trade').find({
        user_id: userId,
        executed_at: { $gte: today },
        status: { $ne: 'PENDING' }
    });
    
    const todaysLoss = trades.reduce((sum, t) => {
        if (t.profit < 0) return sum + Math.abs(t.profit);
        return sum;
    }, 0);
    
    const user = await this.findById(userId);
    const balance = user.net_profit + 10000; // Approximate balance
    
    return todaysLoss >= (balance * dailyLimitPercent);
};

module.exports = mongoose.model('User', userSchema);
