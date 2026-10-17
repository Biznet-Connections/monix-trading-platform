/**
 * MULTIPLIER TRADING - SCALED BY ACCOUNT SIZE
 * 
 * $100 account → SL $1.25, TP $5
 * $1,000 account → SL $12.50, TP $50
 * $10,000 account → SL $125, TP $500
 * 
 * Same percentages, different dollar amounts.
 */

module.exports = {
    // Stake: 5% of account
    BASE_STAKE: 500,           // For $10k account → $500 per trade
    
    MULTIPLIER: 100,
    
    // SL/TP: percentages
    STOP_LOSS_PCT: 0.25,       // -25% = -$125 on $500
    TAKE_PROFIT_PCT: 1.00,     // +100% = +$500 on $500
    
    // Trailing: DISABLED (let TP fire)
    TRAILING_TRIGGER_PCT: 999,  // Effectively disabled
    TRAILING_LOCK_PCT: 999,
    
    // Daily targets
    DAILY_PROFIT_TARGET: 0.10,  // +$1,000 for $10k account
    DAILY_LOSS_LIMIT: 0.05,     // -$500 for $10k account
    
    // Math:
    // Every loss: -$125 (1.25% of account)
    // Every win: +$500 (5% of account)
    // RR: 1:4
    // Break-even WR: 20%
    // Expected at 46% WR: +$125/trade
    // At 10 trades/day: +$1,250/day
};