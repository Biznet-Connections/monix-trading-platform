/**
 * Deriv Multiplier Trading Service
 * 
 * Provides:
 * - placeMultiplier: Open a multiplier position with SL/TP
 * - closeMultiplier: Manually close a position
 * - getMultiplierState: Get current P&L
 * - Trailing stop support
 */

const derivService = require('./derivService');

class MultiplierService {
    constructor() {
        this.activePositions = new Map(); // contract_id -> position data
    }
    
    /**
     * Place a multiplier trade
     * @param {string} symbol - R_75, etc
     * @param {string} action - BUY or SELL
     * @param {number} stake - Amount to risk
     * @param {object} opts - { stopLossPct, takeProfitPct, multiplier }
     */
    async placeMultiplier(symbol, action, stake, opts = {}) {
        if (!derivService.authorized) {
            throw new Error('Deriv not authorized');
        }
        if (stake < 1) {
            throw new Error('Minimum stake is $1');
        }
        
        const derivSymbol = derivService.convertSymbol(symbol);
        const contractType = action === 'BUY' ? 'MULTUP' : 'MULTDOWN';
        const multiplier = opts.multiplier || 100;
        
        // SL/TP as % of stake
        const stopLossPct = opts.stopLossPct || 0.20;   // -20% default
        const takeProfitPct = opts.takeProfitPct || 0.60; // +60% default
        
        const stopLossAmount = +(stake * stopLossPct).toFixed(2);
        const takeProfitAmount = +(stake * takeProfitPct).toFixed(2);
        
        console.log('📊 [Multiplier] ' + action + ' ' + derivSymbol + ' $' + stake);
        console.log('   Multiplier: ' + multiplier + 'x');
        console.log('   SL: -$' + stopLossAmount + ' (' + (stopLossPct*100).toFixed(0) + '%)');
        console.log('   TP: +$' + takeProfitAmount + ' (' + (takeProfitPct*100).toFixed(0) + '%)');
        
        // 1. Get proposal
        const proposalReq = {
            proposal: 1,
            amount: stake,
            basis: 'stake',
            contract_type: contractType,
            currency: derivService.currentCurrency || 'USD',
            underlying_symbol: derivSymbol,
            multiplier: multiplier
        };
        
        // Add SL/TP if within limits
        if (stopLossAmount > 0 || takeProfitAmount > 0) {
            proposalReq.limit_order = {};
            if (stopLossAmount > 0) proposalReq.limit_order.stop_loss = stopLossAmount;
            if (takeProfitAmount > 0) proposalReq.limit_order.take_profit = takeProfitAmount;
        }
        
        const proposal = await derivService.sendRequest(proposalReq);
        
        if (proposal.error) {
            throw new Error('Proposal error: ' + proposal.error.message);
        }
        if (!proposal.proposal?.id) {
            throw new Error('No proposal ID received');
        }
        
        console.log('📝 [Multiplier] Proposal: ' + proposal.proposal.id.substring(0, 8) + '...');
        
        // 2. Buy
        const trade = await derivService.sendRequest({
            buy: proposal.proposal.id,
            price: stake
        });
        
        if (trade.error) {
            throw new Error('Buy error: ' + trade.error.message);
        }
        
        const contractId = trade.buy.contract_id;
        console.log('✅ [Multiplier] Contract: ' + contractId);
        
        // 3. Track position
        const position = {
            contract_id: contractId,
            symbol: symbol,
            deriv_symbol: derivSymbol,
            action: action,
            stake: stake,
            multiplier: multiplier,
            entry_spot: proposal.proposal.spot,
            stop_loss: stopLossAmount,
            take_profit: takeProfitAmount,
            opened_at: Date.now(),
            last_update: null,
            current_pnl: 0,
            peak_pnl: 0
        };
        
        this.activePositions.set(contractId, position);
        
        // 4. Subscribe to updates
        this.subscribeToPosition(contractId);
        
        return {
            success: true,
            contract_id: contractId,
            entry_spot: proposal.proposal.spot,
            stop_loss: stopLossAmount,
            take_profit: takeProfitAmount,
            position: position
        };
    }
    
    /**
     * Subscribe to contract updates
     */
    async subscribeToPosition(contractId) {
        try {
            await derivService.sendRequest({
                proposal_open_contract: 1,
                contract_id: parseInt(contractId),
                subscribe: 1
            });
        } catch (e) {
            console.log('⚠️  Subscribe error:', e.message);
        }
    }
    
    /**
     * Close a position manually
     */
    async closeMultiplier(contractId) {
        const position = this.activePositions.get(contractId);
        if (!position) {
            console.log('⚠️  No position found for ' + contractId);
            return null;
        }
        
        console.log('🔴 [Multiplier] Closing ' + contractId + '...');
        
        try {
            const result = await derivService.sendRequest({
                sell: contractId,
                price: 0
            });
            
            if (result.error) {
                throw new Error(result.error.message);
            }
            
            this.activePositions.delete(contractId);
            console.log('✅ [Multiplier] Closed at $' + (result.sell?.sold_for || 0));
            
            return result;
        } catch (e) {
            console.log('❌ Close error:', e.message);
            throw e;
        }
    }
    
    /**
     * Update position P&L from Deriv contract update
     */
    updatePosition(contract) {
        const position = this.activePositions.get(String(contract.contract_id));
        if (!position) return null;
        
        position.current_pnl = contract.profit || 0;
        position.last_update = Date.now();
        
        // Track peak
        if (position.current_pnl > position.peak_pnl) {
            position.peak_pnl = position.current_pnl;
        }
        
        return position;
    }
    
    /**
     * Apply trailing stop logic
     * Once profit > triggerPct, move SL up to lock profit
     */
    async applyTrailingStop(contractId, opts = {}) {
        const position = this.activePositions.get(String(contractId));
        if (!position) return;
        
        const triggerPct = opts.triggerPct || 0.30;   // Start trailing at +30%
        const trailPct = opts.trailPct || 0.20;       // Trail by 20%
        
        const triggerAmount = position.stake * triggerPct;
        const trailAmount = position.stake * trailPct;
        
        if (position.peak_pnl >= triggerAmount) {
            // Move SL to (peak - trail)
            const newStopLoss = position.peak_pnl - trailAmount;
            
            // Only update if better than current SL
            if (newStopLoss > position.stop_loss) {
                try {
                    await derivService.sendRequest({
                        contract_update: 1,
                        contract_id: parseInt(contractId),
                        limit_order: {
                            stop_loss: +newStopLoss.toFixed(2)
                        }
                    });
                    
                    position.stop_loss = newStopLoss;
                    console.log('📈 [Trailing] SL moved to $' + newStopLoss.toFixed(2) + ' (locked: $' + (newStopLoss).toFixed(2) + ')');
                } catch (e) {
                    console.log('⚠️  Trailing update error:', e.message);
                }
            }
        }
    }
    
    /**
     * Check if position is closed
     */
    isPositionClosed(contractId) {
        return !this.activePositions.has(String(contractId));
    }
    
    /**
     * Remove position after close
     */
    removePosition(contractId) {
        this.activePositions.delete(String(contractId));
    }
    
    /**
     * Get all active positions
     */
    getActivePositions() {
        return Array.from(this.activePositions.values());
    }
}

module.exports = new MultiplierService();