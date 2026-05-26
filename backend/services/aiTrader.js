/**
 * AI Trader Service - TESTING MODE
 * Trades every 30 seconds with small stakes to verify functionality
 * v8.0.0 - FORCED TRADING MODE for testing
 */

const marketData = require('./marketData');
const deepseekService = require('./deepseekService');
const derivService = require('./derivService');
const Trade = require('../models/Trade');
const User = require('../models/User');
const Pattern = require('../models/Pattern');
const knowledgeBase = require('./knowledgeBase');
const { broadcastAIUpdate, broadcastTradeResult } = require('../utils/websocket');

class AITrader {
    constructor() {
        this.isRunning = false;
        this.analysisInterval = null;
        this.balanceSyncInterval = null;
        this.currentWatchState = {
            status: 'INITIALIZING',
            action: 'WAIT',
            symbol: 'R_75',
            confidence: 0,
            reason: 'Starting up...',
            lastUpdate: Date.now()
        };
        this.activeTrade = null;
        this.isExecuting = false;
        this.userId = 1;
        this.symbol = 'R_25';
        this.mode = 'AUTO';
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.lastTradeTime = 0;
        this.tradeCooldown = 30000; // 30 seconds between trades
        this.pausedUntil = 0;
        this.tickCount = 0;
        this.lastTickTime = 0;
        this.dataReady = false;
        this.totalTrades = 0;
        this.totalWins = 0;
        this.totalLosses = 0;
        this.sessionProfit = 0;
        this.sessionLoss = 0;
        this.currentBalance = 1000;
        
        // TESTING STAKES - Small amounts
        this.MIN_STAKE = 1.00;
        this.BASE_STAKE = 2.00;
        this.MAX_STAKE = 5.00;
        
        this.DAILY_PROFIT_TARGET_PCT = 0.20;
        this.DAILY_LOSS_LIMIT_PCT = 0.10;
        
        this._lastAnalysisLog = 0;
        this._lastBalanceLog = 0;
        this.forceTradeCount = 0;
        this.lastAction = null;
        this.alternateAction = true;
    }

    roundStake(amount) {
        return Math.max(1.00, Math.round(amount * 2) / 2);
    }

    recalculateStakes() {
        this.MIN_STAKE = 1.00;
        this.BASE_STAKE = 2.00;
        this.MAX_STAKE = 5.00;
        console.log(`💰 [TEST MODE] Stakes: MIN=$${this.MIN_STAKE} | BASE=$${this.BASE_STAKE} | MAX=$${this.MAX_STAKE}`);
    }

    async syncBalanceFromDeriv() {
        if (!derivService.authorized) return;
        try {
            const balanceResult = await derivService.getBalance();
            if (balanceResult && balanceResult.balance > 0) {
                this.currentBalance = balanceResult.balance;
                console.log(`💰 Balance: $${this.currentBalance.toFixed(2)}`);
            }
        } catch (error) {
            console.error('❌ Balance sync failed:', error.message);
        }
    }

    async start(userId, symbol = 'R_25', mode = 'AUTO') {
        if (this.isRunning) return;

        this.userId = userId;
        this.symbol = symbol || 'R_25';
        this.mode = mode;
        
        try {
            const user = await User.findById(userId);
            if (!user) {
                console.error('❌ User not found');
                return;
            }
            
            const token = user.is_demo ? user.demo_token : user.real_token;
            if (!token) {
                console.error('❌ No token found');
                return;
            }
            
            console.log(`🔑 Connecting to Deriv with ${user.is_demo ? 'DEMO' : 'REAL'} account...`);
            await derivService.connect(token, false, user.is_demo);
            console.log(`✅ Connected to Deriv successfully!`);
            
        } catch (err) {
            console.error(`❌ Connection failed:`, err.message);
            return;
        }
        
        this.isRunning = true;
        this.isExecuting = false;
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.tickCount = 0;
        this.dataReady = false;
        this.activeTrade = null;
        this.sessionProfit = 0;
        this.sessionLoss = 0;
        this.forceTradeCount = 0;

        setTimeout(async () => {
            try {
                const bal = await derivService.getBalance();
                if (bal?.balance && bal.balance > 10) {
                    this.currentBalance = bal.balance;
                    this.recalculateStakes();
                }
            } catch (e) {}
        }, 5000);

        this.recalculateStakes();

        console.log(`\n═══════════════════════════════════════`);
        console.log(`🤖 [TEST MODE ACTIVATED]`);
        console.log(`📊 Trading every 30 seconds with $${this.BASE_STAKE}`);
        console.log(`🎯 Symbol: ${this.symbol}`);
        console.log(`💰 Starting Balance: $${this.currentBalance.toFixed(2)}`);
        console.log(`═══════════════════════════════════════\n`);

        marketData.reset();

        // Setup tick handler
        derivService.on('tick', (tick) => {
            marketData.addTick(tick);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount === 1) {
                console.log(`🎉 FIRST TICK RECEIVED! Price: $${tick.quote?.toFixed(2)}`);
                this.dataReady = true;
            }
            if (this.tickCount % 20 === 0) {
                console.log(`📈 Tick #${this.tickCount} - $${tick.quote?.toFixed(2)}`);
            }
            this.onMarketUpdate();
        });

        // Seed candles
        setTimeout(() => this.seedCandlesFromHistory(), 2000);

        // FORCED TRADING: Analyze every 10 seconds but trade on timer
        this.analysisInterval = setInterval(() => this.forceTrade(), 30000); // Every 30 seconds
        
        this.balanceSyncInterval = setInterval(() => this.syncBalanceFromDeriv(), 30000);

        setTimeout(() => {
            this.syncBalanceFromDeriv();
        }, 5000);
        
        console.log(`✅ TEST MODE ACTIVE - First trade in 30 seconds!\n`);
    }

    async seedCandlesFromHistory() {
        try {
            const result = await derivService.getCandles(this.symbol, 60, 10);
            if (result?.candles && result.candles.length > 0) {
                result.candles.forEach(c => {
                    if (c.close) marketData.addTick({ epoch: c.epoch, quote: c.close });
                });
                console.log(`📊 Seeded ${result.candles.length} candles`);
            }
        } catch (e) {}
    }

    onMarketUpdate() {
        if (this.activeTrade) this.updateActiveTrade();
        broadcastAIUpdate(this.getCurrentAnalysis());
    }

    async updateActiveTrade() {
        if (!this.activeTrade) return;
        broadcastAIUpdate({ 
            type: 'active_trade_update', 
            trade: { 
                ...this.activeTrade, 
                current_price: marketData.getCurrentPrice(),
                time_remaining: Math.floor((this.activeTrade.exit_time - Date.now()) / 1000)
            } 
        });
    }

    // FORCED TRADE - No AI, just trade!
    async forceTrade() {
        try {
            // Check if we can trade
            if (this.isExecuting) {
                console.log('⏳ Already executing, skipping...');
                return;
            }
            if (this.activeTrade) {
                console.log('⏳ Active trade exists, skipping...');
                return;
            }
            if (this.pausedUntil > Date.now()) {
                console.log(`⏸️ Paused for ${Math.ceil((this.pausedUntil - Date.now())/1000)}s`);
                return;
            }
            
            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) {
                const remaining = Math.ceil((this.tradeCooldown - timeSinceLastTrade)/1000);
                if (remaining % 10 === 0) {
                    console.log(`⏳ Next trade in ${remaining}s...`);
                }
                return;
            }

            // Wait for first tick
            if (this.tickCount === 0) {
                console.log('⏳ Waiting for first tick...');
                return;
            }

            const currentPrice = marketData.getCurrentPrice();
            if (!currentPrice || currentPrice === 0) {
                console.log('⏳ Waiting for price...');
                return;
            }

            // ALTERNATE between BUY and SELL for testing
            this.alternateAction = !this.alternateAction;
            const action = this.alternateAction ? 'BUY' : 'SELL';
            const contractAction = action === 'BUY' ? 'CALL' : 'PUT';
            const stake = this.BASE_STAKE;
            
            this.forceTradeCount++;
            
            console.log(`\n═══════════════════════════════════════`);
            console.log(`🔫 FORCED TRADE #${this.forceTradeCount}`);
            console.log(`   Action: ${action} (${contractAction})`);
            console.log(`   Symbol: ${this.symbol}`);
            console.log(`   Price: $${currentPrice.toFixed(2)}`);
            console.log(`   Stake: $${stake}`);
            console.log(`═══════════════════════════════════════\n`);
            
            await this.executeEntry(action, currentPrice, stake, {
                action: contractAction,
                confidence: 80,
                pattern: this.alternateAction ? 'ALTERNATE_BUY' : 'ALTERNATE_SELL',
                simple_reason: `TEST TRADE #${this.forceTradeCount} - ${action}`
            });
            
        } catch (error) {
            console.error('❌ Force trade error:', error.message);
        }
    }

    async executeEntry(action, entryPrice, stake, analysis) {
        if (this.isExecuting || this.activeTrade) return;
        this.isExecuting = true;
        
        try {
            const user = await User.findById(this.userId);
            if (!user || user.trades_remaining <= 0) {
                console.log('❌ No trades remaining');
                this.isExecuting = false;
                return;
            }
            
            console.log(`💸 EXECUTING: ${action} ${this.symbol} @ $${entryPrice.toFixed(2)} | $${stake}`);
            
            const tradeResult = await derivService.placeTrade(this.symbol, action, stake, 2, 'm');
            
            if (!tradeResult || !tradeResult.buy) {
                throw new Error('Trade failed - no response');
            }
            
            const tradeId = await Trade.create({
                user_id: this.userId,
                contract_id: tradeResult.buy.contract_id,
                symbol: this.symbol,
                action,
                entry_price: entryPrice,
                stake,
                confidence: analysis.confidence,
                pattern: analysis.pattern || 'TEST_TRADE',
                rsi: 50,
                session: this.getCurrentSession(),
                is_auto: 1
            });
            
            await User.deductTrade(this.userId);
            this.totalTrades++;
            this.lastTradeTime = Date.now();
            
            this.activeTrade = {
                id: tradeId,
                contract_id: tradeResult.buy.contract_id,
                action,
                entry_price: entryPrice,
                stake,
                entry_time: Date.now(),
                exit_time: Date.now() + 120000,
                confidence: analysis.confidence,
                pattern: analysis.pattern
            };
            
            console.log(`✅ TRADE #${tradeId} OPEN | ${action} | $${stake} | Contract: ${tradeResult.buy.contract_id}`);
            
            // Check result after 2 minutes 10 seconds
            setTimeout(() => this.checkTradeResult(tradeId, tradeResult.buy.contract_id, entryPrice, stake), 130000);
            
        } catch (error) {
            console.error('❌ Execute error:', error.message);
        } finally {
            this.isExecuting = false;
        }
    }

    async checkTradeResult(tradeId, contractId, entryPrice, stake) {
        try {
            console.log(`\n🔍 Checking result for trade #${tradeId}...`);
            
            let contractResult = null;
            let retries = 15;
            
            while (retries > 0 && !contractResult) {
                try {
                    contractResult = await derivService.getClosedContract(contractId);
                    if (contractResult && (contractResult.is_sold || contractResult.profit !== undefined)) {
                        break;
                    }
                } catch (e) {}
                await new Promise(r => setTimeout(r, 5000));
                retries--;
            }
            
            let profit = 0;
            let exitPrice = entryPrice;
            let status = 'LOSS';
            
            if (contractResult) {
                if (contractResult.profit !== undefined && contractResult.profit !== null) {
                    profit = contractResult.profit;
                } else if (contractResult.sell_price && contractResult.buy_price) {
                    profit = contractResult.sell_price - contractResult.buy_price;
                }
                
                if (contractResult.exit_tick?.quote) exitPrice = contractResult.exit_tick.quote;
                else if (contractResult.sell_price) exitPrice = contractResult.sell_price;
                
                if (profit > 0) status = 'WIN';
                else if (profit < 0) { status = 'LOSS'; profit = -stake; }
                else profit = -stake;
            } else {
                profit = -stake;
            }

            await Trade.updateResult(tradeId, exitPrice, profit, status);
            await User.updateStats(this.userId, status, profit, stake);
            
            this.recentResults.push(status);
            if (this.recentResults.length > 20) this.recentResults.shift();

            if (status === 'WIN') {
                this.totalWins++;
                this.consecutiveLosses = 0;
                this.sessionProfit += profit;
                console.log(`\n🎉🎉🎉 WIN! +$${Math.abs(profit).toFixed(2)} 🎉🎉🎉`);
                console.log(`   Total: ${this.totalWins}W / ${this.totalLosses}L | Session: +$${this.sessionProfit.toFixed(2)}`);
            } else {
                this.totalLosses++;
                this.consecutiveLosses++;
                this.sessionLoss += Math.abs(profit);
                console.log(`\n❌❌❌ LOSS! -$${Math.abs(profit).toFixed(2)} ❌❌❌`);
                console.log(`   Total: ${this.totalWins}W / ${this.totalLosses}L | Session: -$${this.sessionLoss.toFixed(2)}`);
                
                if (this.consecutiveLosses >= 5) {
                    this.pausedUntil = Date.now() + 300000;
                    console.log('🛑 PAUSED 5 minutes - 5 consecutive losses');
                } else if (this.consecutiveLosses >= 3) {
                    this.pausedUntil = Date.now() + 60000;
                    console.log('🛑 PAUSED 1 minute - 3 consecutive losses');
                }
            }

            try {
                const bal = await derivService.getBalance();
                if (bal?.balance) {
                    this.currentBalance = bal.balance;
                    console.log(`💰 New Balance: $${this.currentBalance.toFixed(2)}`);
                }
            } catch (e) {}

            broadcastTradeResult({ 
                id: tradeId, 
                contract_id: contractId, 
                symbol: this.symbol, 
                action: this.activeTrade?.action, 
                entry_price: entryPrice, 
                exit_price: exitPrice, 
                profit, 
                stake, 
                status 
            });
            
            const winRate = this.recentResults.length > 0 ? 
                Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100) : 0;
            console.log(`📊 Win Rate (last ${this.recentResults.length}): ${winRate}%\n`);
            
            this.activeTrade = null;
            
        } catch (error) {
            console.error('❌ Result check error:', error.message);
            try { await Trade.updateResult(tradeId, entryPrice, -stake, 'LOSS'); } catch (e) {}
            this.activeTrade = null;
        }
    }

    getCurrentSession() {
        const hour = new Date().getUTCHours();
        if (hour >= 0 && hour < 9) return 'ASIAN';
        if (hour >= 8 && hour < 17) return 'LONDON';
        return 'NEWYORK';
    }

    getCurrentAnalysis() {
        return {
            type: 'ai_update',
            watch_state: this.currentWatchState,
            in_trade: !!this.activeTrade,
            active_trade: this.activeTrade,
            data_ready: this.dataReady,
            mode: 'TEST_MODE',
            tick_count: this.tickCount,
            total_trades: this.totalTrades,
            total_wins: this.totalWins,
            total_losses: this.totalLosses,
            session_profit: this.sessionProfit,
            session_loss: this.sessionLoss,
            next_trade_in: this.lastTradeTime ? Math.max(0, 30 - Math.floor((Date.now() - this.lastTradeTime)/1000)) : 30,
            timestamp: Date.now()
        };
    }

    stop() {
        this.isRunning = false;
        if (this.analysisInterval) clearInterval(this.analysisInterval);
        if (this.balanceSyncInterval) clearInterval(this.balanceSyncInterval);
        console.log('🤖 TEST MODE STOPPED');
    }

    setMode(mode) { this.mode = mode; }
    setSymbol(symbol) { 
        this.symbol = symbol;
        this.tickCount = 0;
        marketData.reset();
        derivService.subscribeToTicks(symbol).catch(console.error);
    }
    setUserId(userId) { this.userId = userId; }
    setConfidenceThreshold(threshold) {}
    executeManualTrade(action, stake) {}
    declineManualSetup() {}
    getPendingSetup() { return null; }
    getCurrentSetup() { return this.currentWatchState; }
}

module.exports = new AITrader();
