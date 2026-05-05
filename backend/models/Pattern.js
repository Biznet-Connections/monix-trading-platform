const db = require('../config/database').getDb();

class Pattern {
    static async createOrUpdate(patternData) {
        const { pattern_name, symbol, action, session, win_rate, confidence_boost } = patternData;
        
        return db.patterns.createOrUpdate({
            pattern_name,
            symbol,
            action,
            session,
            win_rate,
            confidence_boost: confidence_boost || 0,
            wins: 0,
            losses: 0
        });
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
            return true;
        }
        return false;
    }
    
    static async getSimilarPatterns(symbol, session, action) {
        return db.patterns.getSimilar(symbol, session, action);
    }
}

module.exports = Pattern;
