const db = require('../config/database').getDb();

class Trade {
    static async create(tradeData) {
        const { user_id, contract_id, symbol, action, entry_price, stake, confidence, pattern, rsi, macd, session, is_auto } = tradeData;
        
        const trades = db.trades.getAll();
        const newId = trades.length > 0 ? Math.max(...trades.map(t => t.id)) + 1 : 1;
        
        const newTrade = {
            id: newId,
            user_id,
            contract_id,
            symbol,
            action,
            entry_price,
            stake,
            confidence: confidence || 0,
            pattern: pattern || 'Unknown',
            rsi: rsi || 50,
            macd: macd || 'neutral',
            session: session || 'LONDON',
            is_auto: is_auto || 0,
            status: 'PENDING',
            executed_at: new Date().toISOString(),
            exit_price: null,
            profit: null,
            closed_at: null
        };
        
        trades.push(newTrade);
        return newId;
    }
    
    static async updateResult(tradeId, exit_price, profit, status, closed_at = null) {
        return db.trades.updateResult(tradeId, exit_price, profit, status, closed_at);
    }
    
    static async findByContractId(contractId) {
        const trades = db.trades.getAll();
        return trades.find(t => t.contract_id === contractId);
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
}

module.exports = Trade;
