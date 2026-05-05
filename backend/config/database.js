const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '../data');
const DB_FILES = {
    users: path.join(DATA_DIR, 'users.json'),
    trades: path.join(DATA_DIR, 'trades.json'),
    vouchers: path.join(DATA_DIR, 'vouchers.json'),
    patterns: path.join(DATA_DIR, 'patterns.json'),
    signals: path.join(DATA_DIR, 'signals.json'),
    notifications: path.join(DATA_DIR, 'notifications.json'),
    dailyStats: path.join(DATA_DIR, 'daily_stats.json')
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize JSON files if they don't exist
function initJsonFile(filePath, defaultData) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

// Initialize all data files
initJsonFile(DB_FILES.users, []);
initJsonFile(DB_FILES.trades, []);
initJsonFile(DB_FILES.vouchers, []);
initJsonFile(DB_FILES.patterns, []);
initJsonFile(DB_FILES.signals, []);
initJsonFile(DB_FILES.notifications, []);
initJsonFile(DB_FILES.dailyStats, []);

// Helper functions
function readJson(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return [];
    }
}

function writeJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error);
        return false;
    }
}

function getNextId(items) {
    return items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
}

// Database interface
const db = {
    // Users
    users: {
        getAll: () => readJson(DB_FILES.users),
        getById: (id) => readJson(DB_FILES.users).find(u => u.id === id),
        getByEmail: (email) => readJson(DB_FILES.users).find(u => u.email === email),
        getByUsername: (username) => readJson(DB_FILES.users).find(u => u.username === username),
        create: (userData) => {
            const users = readJson(DB_FILES.users);
            const newId = getNextId(users);
            const newUser = { id: newId, ...userData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            users.push(newUser);
            writeJson(DB_FILES.users, users);
            return newId;
        },
        update: (id, updates) => {
            const users = readJson(DB_FILES.users);
            const index = users.findIndex(u => u.id === id);
            if (index !== -1) {
                users[index] = { ...users[index], ...updates, updated_at: new Date().toISOString() };
                writeJson(DB_FILES.users, users);
                return true;
            }
            return false;
        },
        getAllPaginated: (page = 1, limit = 50, filters = {}) => {
            let users = readJson(DB_FILES.users);
            if (filters.is_admin !== undefined) {
                users = users.filter(u => u.is_admin === filters.is_admin);
            }
            const start = (page - 1) * limit;
            return users.slice(start, start + limit);
        },
        getLeaderboard: (limit = 10) => {
            const users = readJson(DB_FILES.users);
            return users
                .filter(u => u.is_active && (u.total_trades || 0) > 0)
                .sort((a, b) => (b.net_profit || 0) - (a.net_profit || 0))
                .slice(0, limit)
                .map(u => ({
                    username: u.username,
                    total_trades: u.total_trades || 0,
                    total_wins: u.total_wins || 0,
                    total_losses: u.total_losses || 0,
                    net_profit: u.net_profit || 0,
                    best_streak: u.best_streak || 0,
                    win_rate: u.total_trades > 0 ? ((u.total_wins / u.total_trades) * 100).toFixed(1) : 0
                }));
        },
        updateStats: (userId, tradeResult, profit, stake) => {
            const users = readJson(DB_FILES.users);
            const index = users.findIndex(u => u.id === userId);
            if (index !== -1) {
                const user = users[index];
                const winInc = tradeResult === 'WIN' ? 1 : 0;
                const lossInc = tradeResult === 'LOSS' ? 1 : 0;
                const newStreak = tradeResult === 'WIN' ? (user.current_streak || 0) + 1 : 0;
                
                users[index] = {
                    ...user,
                    total_trades: (user.total_trades || 0) + 1,
                    total_wins: (user.total_wins || 0) + winInc,
                    total_losses: (user.total_losses || 0) + lossInc,
                    net_profit: (user.net_profit || 0) + profit,
                    current_streak: newStreak,
                    best_streak: Math.max(user.best_streak || 0, newStreak),
                    daily_profit: (user.daily_profit || 0) + profit,
                    last_trade_date: new Date().toISOString().split('T')[0],
                    updated_at: new Date().toISOString()
                };
                writeJson(DB_FILES.users, users);
                return true;
            }
            return false;
        },
        deductTrade: (userId) => {
            const users = readJson(DB_FILES.users);
            const index = users.findIndex(u => u.id === userId);
            if (index !== -1 && (users[index].trades_remaining || 0) > 0) {
                users[index].trades_remaining--;
                writeJson(DB_FILES.users, users);
                return true;
            }
            return false;
        },
        checkDailyLossLimit: (userId) => {
            const users = readJson(DB_FILES.users);
            const user = users.find(u => u.id === userId);
            const today = new Date().toISOString().split('T')[0];
            const dailyLoss = user?.last_trade_date === today ? (user.daily_profit || 0) : 0;
            const limit = parseFloat(process.env.DAILY_LOSS_LIMIT || 25);
            return dailyLoss <= -limit;
        }
    },
    
    // Trades
    trades: {
        getAll: () => readJson(DB_FILES.trades),
        getById: (id) => readJson(DB_FILES.trades).find(t => t.id === id),
        getByContractId: (contractId) => readJson(DB_FILES.trades).find(t => t.contract_id === contractId),
        getUserTrades: (userId, limit = 50, offset = 0) => {
            const trades = readJson(DB_FILES.trades);
            const userTrades = trades.filter(t => t.user_id === userId).sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
            return userTrades.slice(offset, offset + limit);
        },
        create: (tradeData) => {
            const trades = readJson(DB_FILES.trades);
            const newId = getNextId(trades);
            const newTrade = { id: newId, ...tradeData, executed_at: new Date().toISOString() };
            trades.push(newTrade);
            writeJson(DB_FILES.trades, trades);
            return newId;
        },
        updateResult: (tradeId, exit_price, profit, status, closed_at = null) => {
            const trades = readJson(DB_FILES.trades);
            const index = trades.findIndex(t => t.id === tradeId);
            if (index !== -1) {
                trades[index] = {
                    ...trades[index],
                    exit_price,
                    profit,
                    status,
                    closed_at: closed_at || new Date().toISOString()
                };
                writeJson(DB_FILES.trades, trades);
                return true;
            }
            return false;
        },
        getUserStats: (userId, days = 30) => {
            const trades = readJson(DB_FILES.trades);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const userTrades = trades.filter(t => t.user_id === userId && new Date(t.executed_at) > cutoff);
            
            const total = userTrades.length;
            const wins = userTrades.filter(t => t.status === 'WIN').length;
            const losses = userTrades.filter(t => t.status === 'LOSS').length;
            const totalProfit = userTrades.filter(t => t.status === 'WIN').reduce((sum, t) => sum + (t.profit || 0), 0);
            const totalLoss = userTrades.filter(t => t.status === 'LOSS').reduce((sum, t) => sum + (t.profit || 0), 0);
            
            return {
                total_trades: total,
                wins: wins,
                losses: losses,
                total_profit: totalProfit,
                total_loss: totalLoss,
                net_profit: totalProfit + totalLoss,
                win_rate: total > 0 ? ((wins / total) * 100).toFixed(1) : 0,
                avg_win_confidence: userTrades.filter(t => t.status === 'WIN').reduce((sum, t) => sum + (t.confidence || 0), 0) / (wins || 1),
                max_win: Math.max(...userTrades.map(t => t.profit || 0), 0),
                max_loss: Math.min(...userTrades.map(t => t.profit || 0), 0)
            };
        },
        getSymbolStats: (userId) => {
            const trades = readJson(DB_FILES.trades);
            const userTrades = trades.filter(t => t.user_id === userId);
            const symbols = {};
            userTrades.forEach(t => {
                if (!symbols[t.symbol]) {
                    symbols[t.symbol] = { total: 0, wins: 0, total_profit: 0 };
                }
                symbols[t.symbol].total++;
                if (t.status === 'WIN') symbols[t.symbol].wins++;
                symbols[t.symbol].total_profit += t.profit || 0;
            });
            return Object.entries(symbols).map(([symbol, data]) => ({
                symbol,
                total: data.total,
                wins: data.wins,
                total_profit: data.total_profit,
                win_rate: ((data.wins / data.total) * 100).toFixed(1)
            }));
        },
        getSessionStats: (userId) => {
            const trades = readJson(DB_FILES.trades);
            const userTrades = trades.filter(t => t.user_id === userId && t.session);
            const sessions = {};
            userTrades.forEach(t => {
                if (!sessions[t.session]) {
                    sessions[t.session] = { total: 0, wins: 0, total_profit: 0 };
                }
                sessions[t.session].total++;
                if (t.status === 'WIN') sessions[t.session].wins++;
                sessions[t.session].total_profit += t.profit || 0;
            });
            return Object.entries(sessions).map(([session, data]) => ({
                session,
                total: data.total,
                wins: data.wins,
                total_profit: data.total_profit,
                win_rate: ((data.wins / data.total) * 100).toFixed(1)
            }));
        },
        getTodayStats: (userId) => {
            const trades = readJson(DB_FILES.trades);
            const today = new Date().toISOString().split('T')[0];
            const todayTrades = trades.filter(t => t.user_id === userId && t.executed_at?.startsWith(today));
            return {
                trades_count: todayTrades.length,
                wins: todayTrades.filter(t => t.status === 'WIN').length,
                losses: todayTrades.filter(t => t.status === 'LOSS').length,
                profit: todayTrades.reduce((sum, t) => sum + (t.profit || 0), 0)
            };
        },
        getAllTrades: (limit = 1000) => {
            const trades = readJson(DB_FILES.trades);
            const users = readJson(DB_FILES.users);
            return trades.slice(0, limit).map(t => ({
                ...t,
                username: users.find(u => u.id === t.user_id)?.username,
                email: users.find(u => u.id === t.user_id)?.email
            }));
        }
    },
    
    // Vouchers
    vouchers: {
        getAll: () => readJson(DB_FILES.vouchers),
        getByCode: (code) => readJson(DB_FILES.vouchers).find(v => v.code === code),
        create: (voucherData) => {
            const vouchers = readJson(DB_FILES.vouchers);
            const newId = getNextId(vouchers);
            const newVoucher = { id: newId, ...voucherData, created_at: new Date().toISOString() };
            vouchers.push(newVoucher);
            writeJson(DB_FILES.vouchers, vouchers);
            return newVoucher;
        },
        markUsed: (code, userId) => {
            const vouchers = readJson(DB_FILES.vouchers);
            const index = vouchers.findIndex(v => v.code === code);
            if (index !== -1 && !vouchers[index].used_by) {
                vouchers[index] = { ...vouchers[index], used_by: userId, used_at: new Date().toISOString() };
                writeJson(DB_FILES.vouchers, vouchers);
                return true;
            }
            return false;
        },
        revoke: (code) => {
            const vouchers = readJson(DB_FILES.vouchers);
            const filtered = vouchers.filter(v => v.code !== code);
            writeJson(DB_FILES.vouchers, filtered);
            return true;
        },
        getStats: () => {
            const vouchers = readJson(DB_FILES.vouchers);
            return {
                total: vouchers.length,
                unused: vouchers.filter(v => !v.used_by).length,
                used: vouchers.filter(v => v.used_by).length
            };
        }
    },
    
    // Patterns (Learning)
    patterns: {
        getAll: () => readJson(DB_FILES.patterns),
        getByKey: (patternName, symbol, action, session) => {
            return readJson(DB_FILES.patterns).find(p => 
                p.pattern_name === patternName && p.symbol === symbol && p.action === action && p.session === session
            );
        },
        createOrUpdate: (patternData) => {
            const patterns = readJson(DB_FILES.patterns);
            const existing = patterns.find(p => 
                p.pattern_name === patternData.pattern_name && 
                p.symbol === patternData.symbol && 
                p.action === patternData.action && 
                p.session === patternData.session
            );
            
            if (existing) {
                const index = patterns.indexOf(existing);
                patterns[index] = { 
                    ...existing, 
                    ...patternData, 
                    times_used: (existing.times_used || 0) + 1,
                    last_used: new Date().toISOString() 
                };
                writeJson(DB_FILES.patterns, patterns);
                return patterns[index];
            } else {
                const newId = getNextId(patterns);
                const newPattern = { id: newId, ...patternData, times_used: 1, last_used: new Date().toISOString() };
                patterns.push(newPattern);
                writeJson(DB_FILES.patterns, patterns);
                return newPattern;
            }
        },
        recordTradeResult: (patternName, symbol, action, session, isWin) => {
            const patterns = readJson(DB_FILES.patterns);
            const index = patterns.findIndex(p => 
                p.pattern_name === patternName && p.symbol === symbol && p.action === action && p.session === session
            );
            
            if (index !== -1) {
                const p = patterns[index];
                const newWins = p.wins + (isWin ? 1 : 0);
                const newLosses = p.losses + (isWin ? 0 : 1);
                const newTotal = (p.times_used || 0) + 1;
                
                patterns[index] = {
                    ...p,
                    wins: newWins,
                    losses: newLosses,
                    times_used: newTotal,
                    win_rate: (newWins / newTotal) * 100,
                    last_used: new Date().toISOString()
                };
                writeJson(DB_FILES.patterns, patterns);
            }
            return true;
        },
        getTopPatterns: (limit = 10) => {
            const patterns = readJson(DB_FILES.patterns);
            return patterns
                .filter(p => (p.times_used || 0) >= 3)
                .sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))
                .slice(0, limit);
        },
        getWorstPatterns: (limit = 5) => {
            const patterns = readJson(DB_FILES.patterns);
            return patterns
                .filter(p => (p.times_used || 0) >= 3)
                .sort((a, b) => (a.win_rate || 0) - (b.win_rate || 0))
                .slice(0, limit);
        },
        getSimilar: (symbol, session, action) => {
            const patterns = readJson(DB_FILES.patterns);
            return patterns.filter(p => p.symbol === symbol && p.session === session && p.action === action);
        }
    },
    
    // Signals
    signals: {
        getAll: () => readJson(DB_FILES.signals),
        getUserSignals: (userId, limit = 50) => {
            const signals = readJson(DB_FILES.signals);
            return signals.filter(s => s.user_id === userId).slice(0, limit);
        },
        create: (signalData) => {
            const signals = readJson(DB_FILES.signals);
            const newId = getNextId(signals);
            const newSignal = { id: newId, ...signalData, created_at: new Date().toISOString() };
            signals.push(newSignal);
            writeJson(DB_FILES.signals, signals);
            return newId;
        }
    },
    
    // Notifications
    notifications: {
        getUserNotifications: (userId, limit = 50) => {
            const notifications = readJson(DB_FILES.notifications);
            return notifications.filter(n => n.user_id === userId).slice(0, limit);
        },
        create: (notificationData) => {
            const notifications = readJson(DB_FILES.notifications);
            const newId = getNextId(notifications);
            const newNotification = { id: newId, ...notificationData, created_at: new Date().toISOString(), is_read: 0 };
            notifications.push(newNotification);
            writeJson(DB_FILES.notifications, notifications);
            return newId;
        },
        markRead: (id, userId) => {
            const notifications = readJson(DB_FILES.notifications);
            const index = notifications.findIndex(n => n.id === id && n.user_id === userId);
            if (index !== -1) {
                notifications[index].is_read = 1;
                writeJson(DB_FILES.notifications, notifications);
                return true;
            }
            return false;
        }
    },
    
    // Daily Stats
    dailyStats: {
        update: (userId, date, tradesCount, wins, losses, profit) => {
            const stats = readJson(DB_FILES.dailyStats);
            const existing = stats.find(s => s.user_id === userId && s.date === date);
            
            if (existing) {
                const index = stats.indexOf(existing);
                stats[index] = {
                    ...existing,
                    trades_count: (existing.trades_count || 0) + tradesCount,
                    wins: (existing.wins || 0) + wins,
                    losses: (existing.losses || 0) + losses,
                    profit: (existing.profit || 0) + profit
                };
                writeJson(DB_FILES.dailyStats, stats);
            } else {
                stats.push({ user_id: userId, date, trades_count: tradesCount, wins, losses, profit });
                writeJson(DB_FILES.dailyStats, stats);
            }
        }
    }
};

// Initialize default admin user and voucher
function initDefaultData() {
    const users = readJson(DB_FILES.users);
    const adminExists = users.some(u => u.email === process.env.ADMIN_EMAIL);
    
    if (!adminExists) {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        const adminUser = {
            id: 1,
            email: process.env.ADMIN_EMAIL,
            username: 'admin',
            password: hashedPassword,
            is_admin: 1,
            is_active: 1,
            is_demo: 1,
            trades_remaining: 999999,
            voucher_code: 'ADMIN-DEFAULT',
            voucher_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        users.push(adminUser);
        writeJson(DB_FILES.users, users);
        console.log('✅ Default admin user created');
    }
    
    const vouchers = readJson(DB_FILES.vouchers);
    const defaultVoucherExists = vouchers.some(v => v.code === 'MONIX-ADMIN-DEFAULT');
    
    if (!defaultVoucherExists) {
        vouchers.push({
            id: getNextId(vouchers),
            code: 'MONIX-ADMIN-DEFAULT',
            days_valid: 365,
            trades_limit: 999999,
            created_by: 'system',
            created_at: new Date().toISOString()
        });
        writeJson(DB_FILES.vouchers, vouchers);
        console.log('✅ Default voucher created');
    }
}

// Initialize database (compatible with old SQLite interface)
async function init() {
    initDefaultData();
    console.log('✅ JSON Database initialized');
    return true;
}

function getDb() {
    return db;
}

function close() {
    console.log('Database closed (JSON files saved)');
}

module.exports = { init, getDb, close };
