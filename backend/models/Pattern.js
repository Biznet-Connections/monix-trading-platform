const db = require('../config/database').getDb();

class Pattern {
    static async createOrUpdate(patternData) {
        return db.patterns.createOrUpdate(patternData);
    }

    static async recordTradeResult(patternName, symbol, action, session, isWin) {
        return db.patterns.recordTradeResult(patternName, symbol, action, session, isWin);
    }

    static async findByPattern(patternName, symbol, action, session) {
        return db.patterns.getByKey(patternName, symbol, action, session);
    }

    static async getTopPatterns(limit = 10) {
        return db.patterns.getTopPatterns(limit);
    }

    static async getWorstPatterns(limit = 5) {
        return db.patterns.getWorstPatterns(limit);
    }

    static async markToAvoid(patternId) {
        const patterns = db.patterns.getAll();
        const index = patterns.findIndex(p => p.id === patternId);
        if (index !== -1) {
            patterns[index].avoid = 1;
            const fs = require('fs');
            const path = require('path');
            const DB_FILES = { patterns: path.join(__dirname, '../data/patterns.json') };
            fs.writeFileSync(DB_FILES.patterns, JSON.stringify(patterns, null, 2));
            return true;
        }
        return false;
    }

    static async getSimilarPatterns(symbol, session, action) {
        return db.patterns.getSimilar(symbol, session, action);
    }

    /**
     * LEARNING LOOP: Get comprehensive pattern performance by symbol
     */
    static async getPatternPerformanceBySymbol(symbol, minTrades = 3) {
        const patterns = db.patterns.getAll();
        return patterns
            .filter(p => p.symbol === symbol && (p.times_used || 0) >= minTrades)
            .sort((a, b) => (b.win_rate || 0) - (a.win_rate || 0))
            .map(p => ({
                pattern_name: p.pattern_name,
                symbol: p.symbol,
                session: p.session,
                action: p.action,
                wins: p.wins || 0,
                losses: p.losses || 0,
                times_used: p.times_used || 0,
                win_rate: p.win_rate || 0,
                last_used: p.last_used
            }));
    }

    /**
     * LEARNING LOOP: Get best session for a symbol
     */
    static async getBestSessionForSymbol(symbol) {
        const patterns = db.patterns.getAll();
        const symbolPatterns = patterns.filter(p => p.symbol === symbol && p.session);
        
        const sessionStats = {};
        symbolPatterns.forEach(p => {
            if (!sessionStats[p.session]) {
                sessionStats[p.session] = { wins: 0, losses: 0, trades: 0 };
            }
            sessionStats[p.session].wins += (p.wins || 0);
            sessionStats[p.session].losses += (p.losses || 0);
            sessionStats[p.session].trades += (p.times_used || 0);
        });

        return Object.entries(sessionStats)
            .map(([session, data]) => ({
                session,
                wins: data.wins,
                losses: data.losses,
                total: data.trades,
                winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0
            }))
            .sort((a, b) => b.winRate - a.winRate);
    }
}

module.exports = Pattern;
