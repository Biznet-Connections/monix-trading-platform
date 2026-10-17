/**
 * Multiplier Trading Configuration
 * $10,000 account → $1,000/day target
 */

module.exports = {
    // Stake sizing - $100 per trade (1% of $10k account)
    BASE_STAKE: 100,
    MAX_STAKE: 150,
    
    MULTIPLIER: 100,
    
    // SL/TP - small losses, big wins
    STOP_LOSS_PCT: 0.25,             // -$25 max loss (0.25% of account)
    TAKE_PROFIT_PCT: 1.00,           // +$100 target (1% of account)
    
    // Trailing stop
    TRAILING_TRIGGER_PCT: 0.50,      // Activate at +$50
    TRAILING_LOCK_PCT: 0.50,         // Lock 50% of peak
    
    // Daily targets
    DAILY_PROFIT_TARGET: 0.10,       // +$1,000/day (stop trading)
    DAILY_LOSS_LIMIT: 0.05,          // -$500/day (stop trading)
    
    // Expected per trade (at 46% WR):
    // 46 wins × $75 avg = +$3,450
    // 54 losses × $25 = -$1,350
    // NET: +$2,100 per 100 trades
};