/**
 * Test: place a single multiplier trade
 * Access: /api/test-multiplier-trade
 */

const express = require('express');
const router = express.Router();
const multiplierService = require('../services/multiplierService');

router.get('/', async (req, res) => {
    try {
        console.log('🧪 [TEST] Placing multiplier trade...');
        
        // Small test: $10 stake, -20% SL, +60% TP
        const result = await multiplierService.placeMultiplier(
            'R_75',
            'BUY',
            10,  // $10 stake
            {
                multiplier: 100,
                stopLossPct: 0.20,   // -$2
                takeProfitPct: 0.60  // +$6
            }
        );
        
        res.json({
            success: true,
            message: '✅ Multiplier placed!',
            contract_id: result.contract_id,
            entry_spot: result.entry_spot,
            stop_loss: result.stop_loss,
            take_profit: result.take_profit,
            note: 'Watch Render logs for SL/TP firing'
        });
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;