const express = require('express');
const router = express.Router();
const multiplierService = require('../services/multiplierService');
const config = require('../services/multiplierConfig');

router.get('/', async (req, res) => {
    try {
        console.log('🧪 [TEST v3] SMALL LOSSES, BIG WINS');
        console.log('   Config: SL -' + (config.STOP_LOSS_PCT*100) + '%, TP +' + (config.TAKE_PROFIT_PCT*100) + '%');
        
        const stake = 10; // Small test
        
        const result = await multiplierService.placeMultiplier(
            'R_75',
            'BUY',
            stake,
            {
                multiplier: config.MULTIPLIER,
                stopLossPct: config.STOP_LOSS_PCT,
                takeProfitPct: config.TAKE_PROFIT_PCT,
                trailingTriggerPct: config.TRAILING_TRIGGER_PCT,
                trailingLockPct: config.TRAILING_LOCK_PCT
            }
        );
        
        res.json({
            success: true,
            message: '✅ Multiplier v3 placed!',
            contract_id: result.contract_id,
            entry_spot: result.entry_spot,
            stake: stake,
            stop_loss: result.stop_loss,
            take_profit: result.take_profit,
            ratio: '1:' + (config.TAKE_PROFIT_PCT / config.STOP_LOSS_PCT).toFixed(1),
            trailing: {
                trigger: '+$' + (stake * config.TRAILING_TRIGGER_PCT).toFixed(2),
                lock: '+$' + (stake * config.TRAILING_LOCK_PCT).toFixed(2)
            },
            expected: {
                every_loss: '-$' + result.stop_loss,
                every_win: '+$' + result.take_profit,
                break_even_wr: ((config.STOP_LOSS_PCT / (config.TAKE_PROFIT_PCT + config.STOP_LOSS_PCT)) * 100).toFixed(1) + '%'
            }
        });
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;