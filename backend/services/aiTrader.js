/**
 * AI Trader Service - TESTING MODE with forced tick subscription
 * v8.1.0 - Forces tick resubscription if no ticks received
 */

const marketData = require('./marketData');
const derivService = require('./derivService');
const Trade = require('../models/Trade');
const User = require('../models/User');
const { broadcastAIUpdate, broadcastTradeResult } = require('../utils/websocket');

class AITrader {
    constructor() {
        this.isRunning = false;
        this.analysisInterval = null;
        this.balanceSyncInterval = null;
        this.tickCheckInterval = null;
        this.currentWatchState = { status: 'INITIALIZING', action: 'WAIT' };
        this.activeTrade = null;
        this.isExecuting = false;
        this.userId = 1;
        this.symbol = 'R_25';
        this.mode = 'AUTO';
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.lastTradeTime = 0;
        this.tradeCooldown = 30000;
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
        
        this.MIN_STAKE = 1.00;
        this.BASE_STAKE = 2.00;
        this.MAX_STAKE = 5.00;
        
        this.forceTradeCount = 0;
        this.alternateAction = true;
    }

    async start(userId, symbol = 'R_25', mode = 'AUTO') {
        if (this.isRunning) return;

        this.userId = userId;
        this.symbol = symbol || 'R_25';
        
        try {
            const user = await User.findById(userId);
            if (!user) { console.error('❌ User not found'); return; }
            
            const token = user.is_demo ? user.demo_token : user.real_token;
            if (!token) { console.error('❌ No token found'); return; }
            
            console.log(`🔑 Connecting to Deriv...`);
            await derivService.connect(token, false, user.is_demo);
            console.log(`✅ Connected!`);
            
        } catch (err) {
            console.error(`❌ Connection failed:`, err.message);
            return;
        }
        
        this.isRunning = true;
        this.tickCount = 0;
        this.activeTrade = null;
        
        // Force initial tick subscription
        await derivService.subscribeToTicks(this.symbol);
        console.log(`📡 Subscribed to ${this.symbol} ticks`);
        
        derivService.on('tick', (tick) => {
            marketData.addTick(tick);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount === 1) {
                console.log(`🎉 FIRST TICK! Price: $${tick.quote?.toFixed(2)}`);
                this.dataReady = true;
            }
            if (this.tickCount % 10 === 0) {
                console.log(`📈 Tick #${this.tickCount} - $${tick.quote?.toFixed(2)}`);
            }
        });

        console.log(`\n🤖 [TEST MODE] Trading every 30 seconds with $${this.BASE_STAKE}`);
        console.log(`💰 Starting Balance: $${this.currentBalance}\n`);
        
        // Force trade every 30 seconds
        this.analysisInterval = setInterval(() => this.forceTrade(), 30000);
        this.balanceSyncInterval = setInterval(() => this.syncBalance(), 30000);
        
        // Check tick health every 10 seconds
        this.tickCheckInterval = setInterval(() => this.checkTickHealth(), 10000);
        
        setTimeout(() => this.syncBalance(), 5000);
    }

    async checkTickHealth() {
        if (this.tickCount === 0 && this.isRunning) {
            console.log(`⚠️ No ticks for ${Math.floor((Date.now() - this.lastTickTime)/1000)}s, re-subscribing...`);
            await derivService.subscribeToTicks(this.symbol);
        }
    }

    async syncBalance() {
        try {
            const bal = await derivService.getBalance();
            if (bal?.balance) {
                this.currentBalance = bal.balance;
                console.log(`💰 Balance: $${this.currentBalance.toFixed(2)}`);
            }
        } catch (e) {}
    }

    async forceTrade() {
        try {
            if (this.isExecuting || this.activeTrade || this.pausedUntil > Date.now()) return;
            
            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) return;

            // Wait for ticks
            if (this.tickCount === 0) {
                console.log('⏳ Waiting for first tick...');
                return;
            }

            const currentPrice = marketData.getCurrentPrice();
            if (!currentPrice || currentPrice === 0) {
                console.log('⏳ Waiting for price...');
                return;
            }

            // Alternate BUY/SELL
            this.alternateAction = !this.alternateAction;
            const action = this.alternateAction ? 'BUY' : 'SELL';
            const contractAction = action === 'BUY' ? 'CALL' : 'PUT';
            
            this.forceTradeCount++;
            
            console.log(`\n🔫 TRADE #${this.forceTradeCount}: ${action} @ $${currentPrice.toFixed(2)} | $${this.BASE_STAKE}`);
            
            await this.executeEntry(action, currentPrice, this.BASE_STAKE, {
                action: contractAction,
                confidence: 80,
                pattern: 'FORCE_TRADE',
                simple_reason: `Test trade #${this.forceTradeCount}`
            });
            
        } catch (error) {
            console.error('❌ Force trade error:', error.message);
        }
    }

    async executeEntry(action, entryPrice, stake, analysis) {
        if (this.isExecuting || this.activeTrade) return;
        this.isExecuting = true;
        
        try {
            console.log(`💸 Executing ${action}...`);
            const tradeResult = await derivService.placeTrade(this.symbol, action, stake, 2, 'm');
            
            if (!tradeResult?.buy) throw new Error('Trade failed');
            
            const tradeId = await Trade.create({
                user_id: this.userId,
                contract_id: tradeResult.buy.contract_id,
                symbol: this.symbol,
                action,
                entry_price: entryPrice,
                stake,
                confidence: analysis.confidence,
                pattern: analysis.pattern || 'TEST',
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
                exit_time: Date.now() + 120000
            };
            
            console.log(`✅ TRADE OPEN | ID: ${tradeId} | Contract: ${tradeResult.buy.contract_id}`);
            
            setTimeout(() => this.checkTradeResult(tradeId, tradeResult.buy.contract_id, entryPrice, stake), 125000);
            
        } catch (error) {
            console.error('❌ Execute error:', error.message);
        } finally {
            this.isExecuting = false;
        }
    }

    async checkTradeResult(tradeId, contractId, entryPrice, stake) {
        try {
            let contractResult = null;
            for (let i = 0; i < 10; i++) {
                try {
                    contractResult = await derivService.getClosedContract(contractId);
                    if (contractResult) break;
                } catch (e) {}
                await new Promise(r => setTimeout(r, 5000));
            }
            
            let profit = -stake;
            let status = 'LOSS';
            
            if (contractResult) {
                if (contractResult.profit !== undefined) profit = contractResult.profit;
                else if (contractResult.sell_price) profit = contractResult.sell_price - contractResult.buy_price;
                if (profit > 0) status = 'WIN';
                else profit = -stake;
            }
            
            await Trade.updateResult(tradeId, entryPrice, profit, status);
            await User.updateStats(this.userId, status, profit, stake);
            
            this.recentResults.push(status);
            if (this.recentResults.length > 20) this.recentResults.shift();
            
            if (status === 'WIN') {
                this.totalWins++;
                this.consecutiveLosses = 0;
                this.sessionProfit += profit;
                console.log(`\n🎉 WIN! +$${profit.toFixed(2)} | Total: ${this.totalWins}W/${this.totalLosses}L`);
            } else {
                this.totalLosses++;
                this.consecutiveLosses++;
                this.sessionLoss += Math.abs(profit);
                console.log(`\n❌ LOSS! -$${Math.abs(profit).toFixed(2)} | Total: ${this.totalWins}W/${this.totalLosses}L`);
                if (this.consecutiveLosses >= 3) this.pausedUntil = Date.now() + 60000;
            }
            
            await this.syncBalance();
            this.activeTrade = null;
            
        } catch (error) {
            console.error('❌ Result error:', error.message);
            this.activeTrade = null;
        }
    }

    getCurrentSession() {
        const hour = new Date().getUTCHours();
        if (hour >= 0 && hour < 9) return 'ASIAN';
        if (hour >= 8 && hour < 17) return 'LONDON';
        return 'NEWYORK';
    }

    stop() {
        this.isRunning = false;
        if (this.analysisInterval) clearInterval(this.analysisInterval);
        if (this.balanceSyncInterval) clearInterval(this.balanceSyncInterval);
        if (this.tickCheckInterval) clearInterval(this.tickCheckInterval);
    }

    setMode(mode) { this.mode = mode; }
    setSymbol(symbol) { this.symbol = symbol; }
    setUserId(userId) { this.userId = userId; }
    getCurrentAnalysis() { return { mode: 'TEST_MODE', tick_count: this.tickCount }; }
}

module.exports = new AITrader();
