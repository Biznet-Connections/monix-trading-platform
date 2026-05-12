const db = require('../config/database').getDb();

class Trade {
    static async create(tradeData) {
        // Delegate to database method which properly saves to JSON
        return db.trades.create({
            user_id: tradeData.user_id,
            contract_id: tradeData.contract_id,
            symbol: tradeData.symbol,
            action: tradeData.action,
            entry_price: tradeData.entry_price,
            stake: tradeData.stake,
            confidence: tradeData.confidence || 0,
            pattern: tradeData.pattern || 'Unknown',
            rsi: tradeData.rsi || 50,
            macd: tradeData.macd || 'neutral',
            session: tradeData.session || 'LONDON',
            is_auto: tradeData.is_auto || 0,
            status: 'PENDING',
            exit_price: null,
            profit: null,
            closed_at: null
        });
    }

    static async updateResult(tradeId, exit_price, profit, status, closed_at = null) {
        return db.trades.updateResult(tradeId, exit_price, profit, status, closed_at);
    }

    static async findByContractId(contractId) {
        return db.trades.getByContractId(contractId);
    }

    static async getUserTrades(userId, limit = 50, offset = 0) {
        return db.trades.getUserTrades(parseInt(userId), limit, offset);
    }

    static async getUserStats(userId, days = 30) {
        return db.trades.getUserStats(parseInt(userId), days);
    }

    static async getSymbolStats(userId) {
        return db.trades.getSymbolStats(parseInt(userId));
    }

    static async getSessionStats(userId) {
        return db.trades.getSessionStats(parseInt(userId));
    }

    static async getTodayStats(userId) {
        return db.trades.getTodayStats(parseInt(userId));
    }

    static async getAllTrades(limit = 1000) {
        return db.trades.getAllTrades(limit);
    }

    /**
     * LEARNING LOOP: Get pattern performance for a specific symbol
     * Returns win rates per pattern to feed into DeepSeek
     */
    static async getPatternPerformance(userId, symbol, session = null) {
        const trades = db.trades.getAll();
        const userTrades = trades.filter(t => 
            t.user_id === parseInt(userId) && 
            t.symbol === symbol &&
            t.status && t.status !== 'PENDING'
        );

        if (session) {
            return userTrades.filter(t => t.session === session);
        }

        // Group by pattern and calculate win rates
        const patternStats = {};
        userTrades.forEach(t => {
            const key = t.pattern || 'Unknown';
            if (!patternStats[key]) {
                patternStats[key] = { wins: 0, losses: 0, total: 0, totalProfit: 0 };
            }
            patternStats[key].total++;
            if (t.status === 'WIN') {
                patternStats[key].wins++;
            } else {
                patternStats[key].losses++;
            }
            patternStats[key].totalProfit += (t.profit || 0);
        });

        return Object.entries(patternStats)
            .map(([pattern, data]) => ({
                pattern,
                wins: data.wins,
                losses: data.losses,
                total: data.total,
                winRate: data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0,
                avgProfit: data.total > 0 ? (data.totalProfit / data.total).toFixed(2) : '0.00',
                isReliable: data.total >= 3
            }))
            .filter(p => p.total >= 2) // Only return patterns with at least 2 trades
            .sort((a, b) => b.winRate - a.winRate);
    }

    /**
     * LEARNING LOOP: Get RSI-based performance for a symbol
     */
    static async getRSIPerformance(userId, symbol) {
        const trades = db.trades.getAll();
        const userTrades = trades.filter(t => 
            t.user_id === parseInt(userId) && 
            t.symbol === symbol &&
            t.rsi && t.rsi > 0 &&
            t.status && t.status !== 'PENDING'
        );

        // Group by RSI ranges
        const ranges = [
            { label: 'RSI 0-25 (deeply oversold)', min: 0, max: 25, wins: 0, losses: 0 },
            { label: 'RSI 25-35 (oversold)', min: 25, max: 35, wins: 0, losses: 0 },
            { label: 'RSI 35-45 (approaching oversold)', min: 35, max: 45, wins: 0, losses: 0 },
            { label: 'RSI 45-55 (neutral)', min: 45, max: 55, wins: 0, losses: 0 },
            { label: 'RSI 55-65 (approaching overbought)', min: 55, max: 65, wins: 0, losses: 0 },
            { label: 'RSI 65-75 (overbought)', min: 65, max: 75, wins: 0, losses: 0 },
            { label: 'RSI 75-100 (deeply overbought)', min: 75, max: 100, wins: 0, losses: 0 }
        ];

        userTrades.forEach(t => {
            const rsi = t.rsi;
            ranges.forEach(range => {
                if (rsi >= range.min && rsi < range.max) {
                    if (t.status === 'WIN') range.wins++;
                    else range.losses++;
                }
            });
        });

        return ranges
            .filter(r => (r.wins + r.losses) >= 2)
            .map(r => ({
                label: r.label,
                wins: r.wins,
                losses: r.losses,
                total: r.wins + r.losses,
                winRate: (r.wins + r.losses) > 0 ? Math.round((r.wins / (r.wins + r.losses)) * 100) : 0
            }))
            .sort((a, b) => b.winRate - a.winRate);
    }

    /**
     * LEARNING LOOP: Get trend-based performance for a symbol
     */
    static async getTrendPerformance(userId, symbol) {
        const trades = db.trades.getAll();
        const userTrades = trades.filter(t => 
            t.user_id === parseInt(userId) && 
            t.symbol === symbol &&
            t.status && t.status !== 'PENDING'
        );

        // We derive trend from the trade context (stored in pattern or can be inferred)
        const trendStats = {};
        
        userTrades.forEach(t => {
            // Try to extract trend from pattern or use 'unknown'
            let trend = 'unknown';
            const pattern = (t.pattern || '').toLowerCase();
            if (pattern.includes('downtrend')) trend = 'downtrend';
            else if (pattern.includes('uptrend')) trend = 'uptrend';
            else if (pattern.includes('sideways') || pattern.includes('neutral') || pattern.includes('range')) trend = 'sideways';
            
            if (!trendStats[trend]) {
                trendStats[trend] = { wins: 0, losses: 0 };
            }
            if (t.status === 'WIN') trendStats[trend].wins++;
            else trendStats[trend].losses++;
        });

        return Object.entries(trendStats)
            .map(([trend, data]) => ({
                trend,
                wins: data.wins,
                losses: data.losses,
                total: data.wins + data.losses,
                winRate: (data.wins + data.losses) > 0 ? Math.round((data.wins / (data.wins + data.losses)) * 100) : 0
            }))
            .filter(t => t.total >= 2)
            .sort((a, b) => b.winRate - a.winRate);
    }

    /**
     * LEARNING LOOP: Get session-based performance
     */
    static async getSessionPerformance(userId, symbol) {
        const trades = db.trades.getAll();
        const userTrades = trades.filter(t => 
            t.user_id === parseInt(userId) && 
            t.symbol === symbol &&
            t.session &&
            t.status && t.status !== 'PENDING'
        );

        const sessionStats = {};
        userTrades.forEach(t => {
            if (!sessionStats[t.session]) {
                sessionStats[t.session] = { wins: 0, losses: 0, totalProfit: 0 };
            }
            sessionStats[t.session].totalProfit += (t.profit || 0);
            if (t.status === 'WIN') sessionStats[t.session].wins++;
            else sessionStats[t.session].losses++;
        });

        return Object.entries(sessionStats)
            .map(([session, data]) => ({
                session,
                wins: data.wins,
                losses: data.losses,
                total: data.wins + data.losses,
                winRate: (data.wins + data.losses) > 0 ? Math.round((data.wins / (data.wins + data.losses)) * 100) : 0,
                avgProfit: (data.wins + data.losses) > 0 ? (data.totalProfit / (data.wins + data.losses)).toFixed(2) : '0.00'
            }))
            .filter(s => s.total >= 2)
            .sort((a, b) => b.winRate - a.winRate);
    }
}

module.exports = Trade;
