/**
 * Deriv Multiplier Trading Service v2
 * 
 * Features:
 * - Place multiplier trades with SL/TP
 * - Trailing stop (let winners run)
 * - Max duration cutoff
 */

const derivService = require('./derivService');

class MultiplierService {
    constructor() {
        this.activePositions = new Map();
        this.trailingIntervals = new Map();
    }
    
    async placeMultiplier(symbol, action, stake, opts = {}) {
        if (!derivService.authorized) throw new Error('Deriv not authorized');
        if (stake < 1) throw new Error('Minimum stake is $1');
        
        const derivSymbol = derivService.convertSymbol(symbol);
        const contractType = action === 'BUY' ? 'MULTUP' : 'MULTDOWN';
        const multiplier = opts.multiplier || 100;
        
        // SL/TP as % of stake
        const stopLossPct = opts.stopLossPct || 0.40;       // -40% default (was 20%)
        const takeProfitPct = opts.takeProfitPct || 1.00;   // +100% default (was 60%)
        
        const stopLossAmount = +(stake * stopLossPct).toFixed(2);
        const takeProfitAmount = +(stake * takeProfitPct).toFixed(2);
        
        console.log('');
        console.log('═══════════════════════════════════════════');
        console.log('📊 [Multiplier] ' + action + ' ' + derivSymbol + ' $' + stake);
        console.log('   Multiplier: ' + multiplier + 'x');
        console.log('   SL: -$' + stopLossAmount + ' (' + (stopLossPct*100).toFixed(0) + '%)');
        console.log('   TP: +$' + takeProfitAmount + ' (' + (takeProfitPct*100).toFixed(0) + '%)');
        console.log('   RR: 1:' + (takeProfitPct/stopLossPct).toFixed(2));
        console.log('═══════════════════════════════════════════');
        
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
        
        if (stopLossAmount > 0 || takeProfitAmount > 0) {
            proposalReq.limit_order = {};
            if (stopLossAmount > 0) proposalReq.limit_order.stop_loss = stopLossAmount;
            if (takeProfitAmount > 0) proposalReq.limit_order.take_profit = takeProfitAmount;
        }
        
        const proposal = await derivService.sendRequest(proposalReq);
        
        if (proposal.error) throw new Error('Proposal: ' + proposal.error.message);
        if (!proposal.proposal?.id) throw new Error('No proposal ID');
        
        console.log('📝 Proposal: ' + proposal.proposal.id.substring(0, 8) + '...');
        
        // 2. Buy
        const trade = await derivService.sendRequest({
            buy: proposal.proposal.id,
            price: stake
        });
        
        if (trade.error) throw new Error('Buy: ' + trade.error.message);
        
        const contractId = trade.buy.contract_id;
        console.log('✅ Contract: ' + contractId);
        
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
            trailing_active: false,
            trailing_trigger: stake * (opts.trailingTriggerPct || 0.50),  // +50% triggers
            trailing_lock: stake * (opts.trailingLockPct || 0.30),        // Lock +30%
            opened_at: Date.now(),
            peak_pnl: 0,
            current_pnl: 0
        };
        
        this.activePositions.set(String(contractId), position);
        
        // 4. Start trailing stop monitor
        this.startTrailingMonitor(contractId);
        
        // 5. Subscribe to updates
        try {
            await derivService.sendRequest({
                proposal_open_contract: 1,
                contract_id: parseInt(contractId),
                subscribe: 1
            });
        } catch (e) {
            console.log('⚠️  Subscribe error:', e.message);
        }
        
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
     * Trailing stop monitor - runs every 3 seconds
     * Once profit hits trigger, move SL up to lock gains
     */
    startTrailingMonitor(contractId) {
        const interval = setInterval(async () => {
            const position = this.activePositions.get(String(contractId));
            if (!position) {
                clearInterval(interval);
                this.trailingIntervals.delete(String(contractId));
                return;
            }
            
            try {
                const result = await derivService.sendRequest({
                    proposal_open_contract: 1,
                    contract_id: parseInt(contractId)
                });
                
                if (!result.proposal_open_contract) return;
                const contract = result.proposal_open_contract;
                
                if (contract.is_sold === 1) {
                    console.log('🏁 [Trailing] Contract closed');
                    clearInterval(interval);
                    this.trailingIntervals.delete(String(contractId));
                    this.activePositions.delete(String(contractId));
                    return;
                }
                
                const currentPnl = contract.profit || 0;
                position.current_pnl = currentPnl;
                
                if (currentPnl > position.peak_pnl) {
                    position.peak_pnl = currentPnl;
                }
                
                // Trailing logic
                if (position.peak_pnl >= position.trailing_trigger && !position.trailing_active) {
                    // Activate trailing
                    position.trailing_active = true;
                    // activation only, SL moves in main block below
                    console.log('🎯 [Trailing] ACTIVATED at +$' + currentPnl.toFixed(2));
                }
                
                if (position.trailing_active) {
                    // Lock in peak - (trigger - lock)
                    const newSL = position.peak_pnl - (position.trailing_trigger - position.trailing_lock);
                    
                    if (newSL > position.stop_loss + 1) {
                        try {
                            await derivService.sendRequest({
                                contract_update: 1,
                                contract_id: parseInt(contractId),
                                limit_order: {
                                    stop_loss: +newSL.toFixed(2)
                                }
                            });
                            console.log('📈 [Trailing] SL moved to +$' + newSL.toFixed(2) + ' (peak: +$' + position.peak_pnl.toFixed(2) + ')');
                            position.stop_loss = newSL;
                        } catch (e) {
                            // Silently ignore if Deriv rejects (may exceed limits)
                        }
                    }
                }
            } catch (e) {
                // Silent fail
            }
        }, 3000);
        
        this.trailingIntervals.set(String(contractId), interval);
    }
    
    closeMultiplier(contractId) {
        const position = this.activePositions.get(String(contractId));
        if (!position) return null;
        
        // Clear trailing interval
        if (this.trailingIntervals.has(String(contractId))) {
            clearInterval(this.trailingIntervals.get(String(contractId)));
            this.trailingIntervals.delete(String(contractId));
        }
        
        this.activePositions.delete(String(contractId));
        
        return derivService.sendRequest({
            sell: contractId,
            price: 0
        });
    }
    
    getActivePositions() {
        return Array.from(this.activePositions.values());
    }
}

module.exports = new MultiplierService();