const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contract_id: { type: Number, required: true },
    symbol: { type: String, required: true },
    action: { type: String, enum: ['BUY', 'SELL'], required: true },
    entry_price: { type: Number, required: true },
    stake: { type: Number, required: true },
    confidence: { type: Number, default: 0 },
    pattern: { type: String, default: 'Unknown' },
    rsi: { type: Number, default: 50 },
    macd: { type: String, default: 'neutral' },
    session: { type: String, default: 'LONDON' },
    is_auto: { type: Number, default: 0 },
    status: { type: String, enum: ['PENDING', 'WIN', 'LOSS', 'DRAW'], default: 'PENDING' },
    exit_price: { type: Number, default: null },
    profit: { type: Number, default: null },
    closed_at: { type: Date, default: null },
    hidden: { type: Boolean, default: false },
    loss_reason: { type: String, default: null }
}, { timestamps: { createdAt: 'executed_at', updatedAt: 'updated_at' } });

tradeSchema.index({ user_id: 1, symbol: 1 });
tradeSchema.index({ user_id: 1, status: 1 });
tradeSchema.index({ user_id: 1, pattern: 1 });
tradeSchema.index({ contract_id: 1 });
tradeSchema.index({ user_id: 1, symbol: 1, session: 1 });
tradeSchema.index({ user_id: 1, hidden: 1 });
tradeSchema.index({ user_id: 1, loss_reason: 1 });

const TradeModel = mongoose.model('Trade', tradeSchema);

class Trade {
    static async create(tradeData) {
        const trade = await TradeModel.create({
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
        });
        return trade._id;
    }

    static async updateResult(tradeId, exit_price, profit, status, closed_at = null) {
        // Check for suspicious exit price (for R_75 which trades at 30,000+)
        if (exit_price && exit_price < 1000 && status === 'WIN') {
            console.log(`⚠️ [Trade] Suspicious exit price: $${exit_price}. This might be a data error. Keeping original.`);
            return TradeModel.findByIdAndUpdate(tradeId, {
                profit,
                status,
                closed_at: closed_at || new Date()
            });
        }
        
        if (exit_price && exit_price > 1000000) {
            console.log(`⚠️ [Trade] Suspicious exit price: $${exit_price} (too high). This might be a data error.`);
            return TradeModel.findByIdAndUpdate(tradeId, {
                profit,
                status,
                closed_at: closed_at || new Date()
            });
        }
        
        return TradeModel.findByIdAndUpdate(tradeId, {
            exit_price,
            profit,
            status,
            closed_at: closed_at || new Date()
        });
    }

    static async updateLossReason(tradeId, reason) {
        return TradeModel.findByIdAndUpdate(tradeId, { loss_reason: reason });
    }

    static async findByContractId(contractId) {
        return TradeModel.findOne({ contract_id: contractId });
    }

    static async getUserTrades(userId, limit = 50, offset = 0) {
        return TradeModel.find({ user_id: userId, hidden: false })
            .sort({ executed_at: -1 })
            .skip(offset)
            .limit(limit)
            .lean();
    }

    static async getUserStats(userId, days = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const trades = await TradeModel.find({
            user_id: userId,
            hidden: false,
            executed_at: { $gt: cutoff },
            status: { $ne: 'PENDING' }
        }).lean();

        const total = trades.length;
        const wins = trades.filter(t => t.status === 'WIN').length;
        const losses = trades.filter(t => t.status === 'LOSS').length;
        const totalProfit = trades.filter(t => t.status === 'WIN').reduce((sum, t) => sum + (t.profit || 0), 0);
        const totalLoss = trades.filter(t => t.status === 'LOSS').reduce((sum, t) => sum + (t.profit || 0), 0);

        const lossReasons = {};
        trades.filter(t => t.status === 'LOSS' && t.loss_reason).forEach(t => {
            lossReasons[t.loss_reason] = (lossReasons[t.loss_reason] || 0) + 1;
        });

        return {
            total_trades: total,
            wins,
            losses,
            total_profit: totalProfit,
            total_loss: totalLoss,
            net_profit: totalProfit + totalLoss,
            win_rate: total > 0 ? ((wins / total) * 100).toFixed(1) : 0,
            avg_win_confidence: wins > 0
                ? Math.round(trades.filter(t => t.status === 'WIN').reduce((sum, t) => sum + (t.confidence || 0), 0) / wins)
                : 0,
            max_win: Math.max(...trades.map(t => t.profit || 0), 0),
            max_loss: Math.min(...trades.map(t => t.profit || 0), 0),
            loss_reasons: lossReasons
        };
    }

    static async getSymbolStats(userId) {
        const trades = await TradeModel.find({ user_id: userId, hidden: false, status: { $ne: 'PENDING' } }).lean();
        const symbols = {};
        trades.forEach(t => {
            if (!symbols[t.symbol]) symbols[t.symbol] = { total: 0, wins: 0, total_profit: 0 };
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
    }

    static async getSessionStats(userId) {
        const trades = await TradeModel.find({ user_id: userId, hidden: false, session: { $ne: null }, status: { $ne: 'PENDING' } }).lean();
        const sessions = {};
        trades.forEach(t => {
            if (!sessions[t.session]) sessions[t.session] = { total: 0, wins: 0, total_profit: 0 };
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
    }

    static async getSymbolSessionStats(userId, symbol) {
        const trades = await TradeModel.find({
            user_id: userId,
            symbol: symbol,
            hidden: false,
            session: { $ne: null },
            status: { $ne: 'PENDING' }
        }).lean();

        const sessionStats = {};
        trades.forEach(t => {
            if (!sessionStats[t.session]) sessionStats[t.session] = { wins: 0, losses: 0, total: 0, total_profit: 0 };
            sessionStats[t.session].total++;
            if (t.status === 'WIN') sessionStats[t.session].wins++;
            else sessionStats[t.session].losses++;
            sessionStats[t.session].total_profit += t.profit || 0;
        });

        return Object.entries(sessionStats).map(([session, data]) => ({
            session,
            wins: data.wins,
            losses: data.losses,
            total: data.total,
            win_rate: data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0,
            total_profit: data.total_profit
        }));
    }

    // ✅ FIXED: Today's profit uses local timezone
    static async getTodayStats(userId) {
        // Use local timezone
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const todayTrades = await TradeModel.find({
            user_id: userId,
            hidden: false,
            executed_at: { $gte: todayStart, $lt: todayEnd },
            status: { $ne: 'PENDING' }
        }).lean();

        return {
            trades_count: todayTrades.length,
            wins: todayTrades.filter(t => t.status === 'WIN').length,
            losses: todayTrades.filter(t => t.status === 'LOSS').length,
            profit: todayTrades.reduce((sum, t) => sum + (t.profit || 0), 0)
        };
    }

    static async getAllTradesForAI(userId, limit = 1000) {
        return TradeModel.find({ user_id: userId })
            .sort({ executed_at: -1 })
            .limit(limit)
            .lean();
    }

    static async getAllTrades(limit = 1000) {
        return TradeModel.find({ hidden: false }).sort({ executed_at: -1 }).limit(limit).populate('user_id', 'username email').lean();
    }

    static async getPatternPerformance(userId, symbol) {
        const trades = await TradeModel.find({
            user_id: userId,
            symbol,
            hidden: false,
            status: { $ne: 'PENDING' }
        }).lean();

        const patternStats = {};
        trades.forEach(t => {
            const key = t.pattern || 'Unknown';
            if (!patternStats[key]) patternStats[key] = { wins: 0, losses: 0, total: 0, totalProfit: 0 };
            patternStats[key].total++;
            if (t.status === 'WIN') patternStats[key].wins++;
            else patternStats[key].losses++;
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
            .filter(p => p.total >= 2)
            .sort((a, b) => b.winRate - a.winRate);
    }

    static async getRSIPerformance(userId, symbol) {
        const trades = await TradeModel.find({
            user_id: userId,
            symbol,
            hidden: false,
            rsi: { $gt: 0 },
            status: { $ne: 'PENDING' }
        }).lean();

        const ranges = [
            { label: 'RSI 0-25 (Deeply Oversold)', min: 0, max: 25, wins: 0, losses: 0 },
            { label: 'RSI 25-35 (Oversold)', min: 25, max: 35, wins: 0, losses: 0 },
            { label: 'RSI 35-45 (Approaching Oversold)', min: 35, max: 45, wins: 0, losses: 0 },
            { label: 'RSI 45-55 (Neutral)', min: 45, max: 55, wins: 0, losses: 0 },
            { label: 'RSI 55-65 (Approaching Overbought)', min: 55, max: 65, wins: 0, losses: 0 },
            { label: 'RSI 65-75 (Overbought)', min: 65, max: 75, wins: 0, losses: 0 },
            { label: 'RSI 75-100 (Deeply Overbought)', min: 75, max: 100, wins: 0, losses: 0 }
        ];

        trades.forEach(t => {
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

    static async getTrendPerformance(userId, symbol) {
        const trades = await TradeModel.find({
            user_id: userId,
            symbol,
            hidden: false,
            status: { $ne: 'PENDING' }
        }).lean();

        const trendStats = {};
        trades.forEach(t => {
            let trend = 'unknown';
            const pattern = (t.pattern || '').toLowerCase();
            if (pattern.includes('downtrend')) trend = 'downtrend';
            else if (pattern.includes('uptrend')) trend = 'uptrend';
            else if (pattern.includes('sideways') || pattern.includes('neutral') || pattern.includes('range')) trend = 'sideways';

            if (!trendStats[trend]) trendStats[trend] = { wins: 0, losses: 0 };
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

    static async getSessionPerformance(userId, symbol) {
        const trades = await TradeModel.find({
            user_id: userId,
            symbol,
            hidden: false,
            session: { $ne: null },
            status: { $ne: 'PENDING' }
        }).lean();

        const sessionStats = {};
        trades.forEach(t => {
            if (!sessionStats[t.session]) sessionStats[t.session] = { wins: 0, losses: 0, totalProfit: 0 };
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

    static async hideAllUserTrades(userId) {
        return TradeModel.updateMany({ user_id: userId }, { hidden: true });
    }
}

module.exports = Trade;
