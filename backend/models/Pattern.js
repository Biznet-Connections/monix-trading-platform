const mongoose = require('mongoose');

const patternSchema = new mongoose.Schema({
    pattern_name: { type: String, required: true },
    symbol: { type: String, required: true },
    action: { type: String, default: null },
    session: { type: String, default: null },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    times_used: { type: Number, default: 0 },
    win_rate: { type: Number, default: 0 },
    confidence_boost: { type: Number, default: 0 },
    avoid: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'last_used' } });

patternSchema.index({ pattern_name: 1, symbol: 1, action: 1, session: 1 }, { unique: true });
patternSchema.index({ symbol: 1, win_rate: -1 });

const PatternModel = mongoose.model('Pattern', patternSchema);

class Pattern {
    static async createOrUpdate(patternData) {
        const filter = {
            pattern_name: patternData.pattern_name,
            symbol: patternData.symbol,
            action: patternData.action,
            session: patternData.session
        };

        const update = {
            ...patternData,
            $inc: { times_used: 1 }
        };

        return PatternModel.findOneAndUpdate(filter, update, { upsert: true, new: true });
    }

    static async recordTradeResult(patternName, symbol, action, session, isWin) {
        const filter = {
            pattern_name: patternName,
            symbol: symbol,
            action: action,
            session: session
        };

        const update = {
            $inc: {
                wins: isWin ? 1 : 0,
                losses: isWin ? 0 : 1,
                times_used: 1
            }
        };

        const pattern = await PatternModel.findOneAndUpdate(filter, update, { upsert: true, new: true });

        // Update win rate
        if (pattern) {
            const newWinRate = pattern.times_used > 0
                ? (pattern.wins / pattern.times_used) * 100
                : 0;
            await PatternModel.findByIdAndUpdate(pattern._id, { win_rate: newWinRate });
        }

        return true;
    }

    static async findByPattern(patternName, symbol, action, session) {
        return PatternModel.findOne({ pattern_name: patternName, symbol, action, session });
    }

    static async getTopPatterns(limit = 10) {
        return PatternModel.find({ times_used: { $gte: 3 } })
            .sort({ win_rate: -1 })
            .limit(limit)
            .lean();
    }

    static async getWorstPatterns(limit = 5) {
        return PatternModel.find({ times_used: { $gte: 3 } })
            .sort({ win_rate: 1 })
            .limit(limit)
            .lean();
    }

    // ✅ NEW: Get top patterns by specific symbol
    static async getTopPatternsBySymbol(symbol, limit = 10) {
        return PatternModel.find({ symbol: symbol, times_used: { $gte: 3 } })
            .sort({ win_rate: -1 })
            .limit(limit)
            .lean();
    }

    // ✅ NEW: Get worst patterns by specific symbol
    static async getWorstPatternsBySymbol(symbol, limit = 5) {
        return PatternModel.find({ symbol: symbol, times_used: { $gte: 3 } })
            .sort({ win_rate: 1 })
            .limit(limit)
            .lean();
    }

    static async markToAvoid(patternId) {
        return PatternModel.findByIdAndUpdate(patternId, { avoid: 1 });
    }

    static async getSimilarPatterns(symbol, session, action) {
        return PatternModel.find({ symbol, session, action }).lean();
    }

    static async getPatternPerformanceBySymbol(symbol, minTrades = 3) {
        return PatternModel.find({ symbol, times_used: { $gte: minTrades } })
            .sort({ win_rate: -1 })
            .lean()
            .then(patterns => patterns.map(p => ({
                pattern_name: p.pattern_name,
                symbol: p.symbol,
                session: p.session,
                action: p.action,
                wins: p.wins || 0,
                losses: p.losses || 0,
                times_used: p.times_used || 0,
                win_rate: p.win_rate || 0,
                last_used: p.last_used
            })));
    }

    static async getBestSessionForSymbol(symbol) {
        const patterns = await PatternModel.find({ symbol, session: { $ne: null } }).lean();
        const sessionStats = {};
        patterns.forEach(p => {
            if (!sessionStats[p.session]) sessionStats[p.session] = { wins: 0, losses: 0, trades: 0 };
            sessionStats[p.session].wins += (p.wins || 0);
            sessionStats[p.session].losses += (p.losses || 0);
            sessionStats[p.session].trades += (p.times_used || 0);
        });
        return Object.entries(sessionStats)
            .map(([session, data]) => ({
                session, wins: data.wins, losses: data.losses, total: data.trades,
                winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0
            }))
            .sort((a, b) => b.winRate - a.winRate);
    }
}

module.exports = Pattern;
