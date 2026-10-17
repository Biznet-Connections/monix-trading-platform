/**
 * Multiplier Trading Configuration
 * "Small losses, big wins" — asymmetric betting
 */

module.exports = {
    // Stake sizing
    BASE_STAKE: 50,                  // $50 per trade (small, safe)
    MAX_STAKE: 100,                  // Never more than $100
    
    // Contract settings
    MULTIPLIER: 100,
    
    // SL/TP — the asymmetric edge
    STOP_LOSS_PCT: 0.25,             // -25% = -$12.50 on $50
    TAKE_PROFIT_PCT: 1.00,           // +100% = +$50 on $50
    
    // Trailing stop (let winners run)
    TRAILING_TRIGGER_PCT: 0.50,      // Activate at +50% (+$25)
    TRAILING_LOCK_PCT: 0.30,         // Lock +30% minimum (+$15)
    
    // Math: RR = 1:4
    // Break-even WR = 20%
    // Target WR = 30%+
    // Expected profit = 30% WR × $50 - 70% × $12.50 = +$6.25/trade
};