const db = require('../config/database').getDb();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

class User {
    static async create(userData) {
        const { email, username, password, voucher_code, trades_limit, expiry_date } = userData;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const users = db.users.getAll();
        const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        
        const newUser = {
            id: newId,
            email,
            username,
            password: hashedPassword,
            voucher_code,
            trades_remaining: trades_limit,
            voucher_expiry: expiry_date,
            demo_token: null,
            real_token: null,
            default_symbol: process.env.DEFAULT_SYMBOL || 'R_75',
            base_stake: parseFloat(process.env.DEFAULT_STAKE) || 0.10,
            current_stake: parseFloat(process.env.DEFAULT_STAKE) || 0.10,
            auto_mode: 0,
            push_signals: 0,
            jackpot_mode: 0,
            is_demo: 1,
            is_admin: 0,
            is_active: 1,
            total_trades: 0,
            total_wins: 0,
            total_losses: 0,
            net_profit: 0,
            best_streak: 0,
            current_streak: 0,
            daily_profit: 0,
            last_trade_date: null,
            last_login: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        users.push(newUser);
        const success = db.users.update(newId, newUser);
        return success ? newId : null;
    }
    
    static async findByEmail(email) {
        const users = db.users.getAll();
        return users.find(u => u.email === email);
    }
    
    static async findById(id) {
        const users = db.users.getAll();
        return users.find(u => u.id === parseInt(id));
    }
    
    static async findByUsername(username) {
        const users = db.users.getAll();
        return users.find(u => u.username === username);
    }
    
    static async update(id, updates) {
        return db.users.update(parseInt(id), updates);
    }
    
    static async getAll(page = 1, limit = 50, filters = {}) {
        return db.users.getAllPaginated(page, limit, filters);
    }
    
    static async getLeaderboard(limit = 10) {
        return db.users.getLeaderboard(limit);
    }
    
    static async updateStats(userId, tradeResult, profit, stake) {
        return db.users.updateStats(userId, tradeResult, profit, stake);
    }
    
    static async verifyPassword(user, password) {
        return bcrypt.compare(password, user.password);
    }
    
    static generateToken(user) {
        return jwt.sign(
            { id: user.id, email: user.email, is_admin: user.is_admin },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '7d' }
        );
    }
    
    static verifyToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return null;
        }
    }
    
    static async deductTrade(userId) {
        return db.users.deductTrade(parseInt(userId));
    }
    
    static async checkDailyLossLimit(userId) {
        return db.users.checkDailyLossLimit(parseInt(userId));
    }
}

module.exports = User;
