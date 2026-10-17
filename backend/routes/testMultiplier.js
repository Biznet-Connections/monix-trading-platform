/**
 * Deriv Multiplier Support Test
 * Temporary route to verify if Multipliers work on this account
 * Access: GET /api/test-multiplier
 */

const express = require('express');
const router = express.Router();
const derivService = require('../services/derivService');

router.get('/', async (req, res) => {
    try {
        console.log('🧪 [TEST] Testing Multiplier support...');
        
        // Check WebSocket is alive
        if (!derivService.ws || derivService.ws.readyState !== 1) {
            return res.json({
                success: false,
                error: 'WebSocket not connected',
                readyState: derivService.ws ? derivService.ws.readyState : 'no-ws'
            });
        }
        
        if (!derivService.authorized) {
            return res.json({
                success: false,
                error: 'Not authorized',
                authorized: derivService.authorized
            });
        }
        
        console.log('🧪 [TEST] WS is alive, authorized = ' + derivService.authorized);
        
        // Test 1: Try a MULTUP proposal (multiplier BUY)
        let multiplierResult = null;
        try {
            const proposal = await derivService.sendRequest({
                proposal: 1,
                amount: 10,
                basis: 'stake',
                contract_type: 'MULTUP',
                currency: derivService.currentCurrency || 'USD',
                underlying_symbol: 'R_75',
                multiplier: 100,
                limit_order: {
                    stop_loss: 2,
                    take_profit: 4
                }
            });
            
            if (proposal.error) {
                multiplierResult = {
                    supported: false,
                    error: proposal.error.message,
                    code: proposal.error.code
                };
            } else {
                multiplierResult = {
                    supported: true,
                    proposal_id: proposal.proposal?.id,
                    payout: proposal.proposal?.payout,
                    spot: proposal.proposal?.spot,
                    ask_price: proposal.proposal?.ask_price,
                    validation_params: proposal.proposal?.validation_params
                };
            }
        } catch (e) {
            multiplierResult = {
                supported: false,
                error: 'Exception: ' + e.message
            };
        }
        
        // Test 2: Try a regular CALL proposal (baseline, should work)
        let callResult = null;
        try {
            const proposal = await derivService.sendRequest({
                proposal: 1,
                amount: 10,
                basis: 'stake',
                contract_type: 'CALL',
                currency: derivService.currentCurrency || 'USD',
                underlying_symbol: 'R_75',
                duration: 2,
                duration_unit: 'm'
            });
            
            callResult = proposal.error ? 
                { supported: false, error: proposal.error.message } :
                { supported: true, payout: proposal.proposal?.payout };
        } catch (e) {
            callResult = { supported: false, error: e.message };
        }
        
        // Return results
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            websocket: {
                connected: true,
                authorized: derivService.authorized,
                account: derivService.activeAccountId
            },
            call_put: callResult,
            multiplier: multiplierResult,
            verdict: multiplierResult?.supported 
                ? '✅ MULTIPLIERS SUPPORTED - we can build SL/TP system!'
                : '❌ MULTIPLIERS NOT SUPPORTED - ' + (multiplierResult?.error || 'unknown')
        });
        
    } catch (error) {
        console.error('❌ [TEST] Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;