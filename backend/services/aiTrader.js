/**
 * AI Trader Service - AGGRESSIVE MODE
 * FOR TESTING ONLY - Trades every 5 seconds
 * v7.6.0 - AGGRESSIVE: Ignores confidence, trades on every signal
 */

const marketData = require('./marketData');
const deepseekService = require('./deepseekService');
const derivService = require('./derivService');
const Trade = require('../models/Trade');
const User = require('../models/User');
const Pattern = require('../models/Pattern');
const knowledgeBase = require('./knowledgeBase');
const { broadcastAIUpdate, broadcastTradeResult, broadcastNotification, broadcastNewSetup } = require('../utils/websocket');

class AITrader {
    constructor() {
        this.isRunning = false;
        this.analysisInterval = null;
        this.tickHealthInterval = null;
        this.balanceSyncInterval = null;
        this.currentAnalysis = null;
        this.currentWatchState = {
            status: 'INITIALIZING',
            action: 'WAIT',
            symbol: 'R_75',
            entry_price: null,
            entry_condition: null,
            estimated_entry_time: null,
            take_profit: null,
            stop_loss: null,
            confidence: 0,
            reason: 'Starting up...',
            pattern: null,
            lastUpdate: Date.now()
        };
        this.activeTrade = null;
        this.isExecuting = false;
        this.pendingManualSetup = null;
        this.pendingLimitOrders = [];
        this._lastPendingLog = {};
        this.userId = 1;
        this.symbol = 'R_25';
        this.mode = 'AUTO';
        this.lastSetupNotified = false;
        this.currentSetupId = null;
        this.confidenceThreshold = 30; // LOWERED for aggressive trading
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.lastTradeTime = 0;
        this.tradeCooldown = 5000; // 5 SECONDS cooldown
        this.pausedUntil = 0;
        this.tickCount = 0;
        this.lastTickTime = 0;
        this.forceReconnecting = false;
        this.lastReconnectAttempt = 0;
        this.RECONNECT_COOLDOWN = 120000;
        this.dataReady = false;
        this.totalTrades = 0;
        this.totalWins = 0;
        this.totalLosses = 0;

        this.sessionProfit = 0;
        this.sessionLoss = 0;
        this.currentBalance = 1000;

        // AGGRESSIVE STAKE - Small stakes for testing
        this.MIN_STAKE = 1.00;
        this.BASE_STAKE = 2.00;
        this.CONFIDENT_STAKE = 5.00;
        this.MAX_STAKE = 10.00;

        this.DAILY_PROFIT_TARGET_PCT = 0.20; // 20% target
        this.DAILY_LOSS_LIMIT_PCT = 0.10; // 10% loss limit

        this.BLOCKED_HOURS_START = 8;
        this.BLOCKED_HOURS_END = 17;

        this.RSI_BUY_MAX = 80; // Less restrictive
        this.RSI_SELL_MIN = 20; // Less restrictive

        this._trendHistory = [];
        this.TREND_CONFIRM_COUNT = 1; // Faster trend confirmation

        this.GOLDEN_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

        this.sniperTradeActive = false;
        this.lastStakeWasMax = false;
        this.tradesSinceBigLoss = 0;

        this.CONF_WEIGHTS = {
            patternHistoricalWR: 25,
            sessionHistoricalWR: 15,
            rsiZoneWR: 20,
            hourHistoricalWR: 15,
            trendAlignment: 15,
            nearSR: 10
        };

        this.trendStartTime = 0;
        this.trendDirection = null;
        this.MIN_TREND_DURATION = 0; // No minimum trend duration

        this._lastLondonLog = 0;
        this._lastRSILog = 0;
        this._lastSkipLog = 0;
        this._lastAnalysisLog = 0;
        this._lastBalanceLog = 0;
        this._lastDailyLog = 0;
        this._lastExhaustionLog = 0;
        this._lastTickCount = 0;
        this.tickHeartbeat = null;
        this.forceTradeCount = 0;
    }

    roundStake(amount) {
        return Math.max(1.00, Math.round(amount * 2) / 2);
    }

    isProven() { return true; } // Force proven for aggressive mode

    getAccountTier() { return 'MEDIUM'; }

    recalculateStakes() {
        // Fixed stakes for aggressive mode
        this.MIN_STAKE = 1.00;
        this.BASE_STAKE = 2.00;
        this.CONFIDENT_STAKE = 5.00;
        this.MAX_STAKE = 10.00;
        this.HIGH_STAKE = 10.00;
        
        console.log(`💰 [AGGRESSIVE] Stakes: MIN=$${this.MIN_STAKE} | BASE=$${this.BASE_STAKE} | MAX=$${this.MAX_STAKE}`);
    }

    async shouldBlockLondon() { return false; } // Don't block any sessions

    async syncBalanceFromDeriv() {
        if (!derivService.authorized) return;
        try {
            const balanceResult = await derivService.getBalance();
            if (balanceResult && balanceResult.balance > 0) {
                this.currentBalance = balanceResult.balance;
                this.recalculateStakes();
                console.log(`💰 [Balance] $${this.currentBalance.toFixed(2)}`);
            }
        } catch (error) {
            console.error('❌ Balance sync failed:', error.message);
        }
    }

    async seedCandlesFromHistory() {
        try {
            const result = await derivService.getCandles(this.symbol, 60, 20);
            if (result?.candles && result.candles.length > 0) {
                let seeded = 0;
                result.candles.forEach(c => {
                    if (c.close) {
                        marketData.addTick({ epoch: c.epoch, quote: c.close });
                        seeded++;
                    }
                });
                if (seeded > 0) {
                    console.log(`📊 Seeded ${seeded} candles`);
                    this.dataReady = true;
                }
            }
        } catch (e) {}
    }

    getConfirmedTrend(rawTrend) { return rawTrend; } // No confirmation needed

    calculateSetupQuality(pattern, session, rsi, trend, hour, nearSR) {
        // Always return decent quality for aggressive mode
        let score = 50;
        if (rsi < 30 || rsi > 70) score += 20;
        if (pattern && pattern !== 'none') score += 10;
        return Math.min(100, score);
    }

    calculateStatisticalConfidence(pattern, session, rsi, trend, nearSR, hourUTC) {
        // Return high confidence for aggressive mode
        if (rsi < 30) return 75; // Oversold - BUY signal
        if (rsi > 70) return 75; // Overbought - SELL signal
        return 65; // Default high confidence
    }

    getRSIZone(rsi) {
        if (!rsi || rsi <= 0) return 'Unknown';
        if (rsi < 25) return 'Deeply Oversold';
        if (rsi < 35) return 'Oversold';
        if (rsi < 45) return 'Approaching Oversold';
        if (rsi < 55) return 'Neutral';
        if (rsi < 65) return 'Approaching Overbought';
        if (rsi < 75) return 'Overbought';
        return 'Deeply Overbought';
    }

    async start(userId, symbol = 'R_25', mode = 'AUTO') {
        if (this.isRunning) return;

        this.userId = userId;
        this.symbol = symbol || 'R_25';
        this.mode = mode;
        
        try {
            const user = await User.findById(userId);
            if (user && user.default_symbol) {
                this.symbol = user.default_symbol;
            }
            
            const token = user?.is_demo ? user.demo_token : user?.real_token;
            if (!token) {
                console.error('❌ No token found');
                return;
            }
            
            await derivService.connect(token, false, user?.is_demo || true);
            console.log(`✅ Connected to Deriv!`);
            
        } catch (err) {
            console.error(`❌ Connection failed:`, err.message);
            return;
        }
        
        this.isRunning = true;
        this.isExecuting = false;
        this.pendingManualSetup = null;
        this.pendingLimitOrders = [];
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

        console.log(`🤖 [AGGRESSIVE MODE] Trading every 5 seconds!`);
        console.log(`📚 Symbol: ${this.symbol}`);
        console.log(`💰 Balance: $${this.currentBalance.toFixed(2)}`);
        console.log(`🎯 Cooldown: ${this.tradeCooldown/1000}s | Threshold: ${this.confidenceThreshold}%`);

        marketData.reset();

        derivService.on('tick', (tick) => {
            marketData.addTick(tick);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount % 20 === 0) console.log(`📈 Tick #${this.tickCount} - $${tick.quote?.toFixed(2)}`);
            this.onMarketUpdate();
        });

        setTimeout(() => this.seedCandlesFromHistory(), 2000);

        // AGGRESSIVE: Analyze every 5 seconds instead of 10
        this.analysisInterval = setInterval(() => this.analyzeMarket(), 5000);

        this.balanceSyncInterval = setInterval(() => this.syncBalanceFromDeriv(), 30000);

        setTimeout(() => {
            this.syncBalanceFromDeriv();
            this.analyzeMarket();
        }, 5000);
        
        console.log(`✅ AGGRESSIVE TRADING ACTIVE!`);
    }

    onMarketUpdate() {
        if (this.activeTrade) { this.updateActiveTrade(); }
        this.checkPendingLimitOrders();
        broadcastAIUpdate(this.getCurrentAnalysis());
    }

    checkPendingLimitOrders() { /* Skip for aggressive mode */ }

    checkOrderConfirmations(order, marketState) { return true; }

    createPendingOrder(params) { return null; }

    async analyzeMarket() {
        try {
            if (this.isExecuting) return;
            if (this.pausedUntil > Date.now()) return;
            if (this.activeTrade) return;
            
            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) {
                if (Math.floor(timeSinceLastTrade / 1000) % 5 === 0) {
                    console.log(`⏳ Cooldown: ${Math.ceil((this.tradeCooldown - timeSinceLastTrade)/1000)}s remaining`);
                }
                return;
            }

            const marketState = marketData.getMarketState();
            const currentPrice = marketState.price;
            
            if (this.tickCount === 0) {
                console.log(`⏳ Waiting for ticks... (${this.tickCount} ticks)`);
                return;
            }

            if (!this.dataReady && this.tickCount > 0) {
                this.dataReady = true;
                console.log(`✅ Data ready! ${this.tickCount} ticks received.`);
            }

            this.recalculateStakes();

            const rawTrend = marketState.trend;
            const confirmedTrend = this.getConfirmedTrend(rawTrend);

            // AGGRESSIVE: Force trade based on RSI
            let action = 'WAIT';
            let analysis = { action: 'WAIT', confidence: 50, pattern: 'none', simple_reason: 'Analyzing...' };
            
            // Simple RSI-based trading for aggressive mode
            if (marketState.rsi <= 35) {
                action = 'BUY';
                analysis = { action: 'CALL', confidence: 75, pattern: 'oversold_bounce', simple_reason: `RSI ${marketState.rsi} - Oversold bounce` };
            } else if (marketState.rsi >= 65) {
                action = 'SELL';
                analysis = { action: 'PUT', confidence: 75, pattern: 'overbought_correction', simple_reason: `RSI ${marketState.rsi} - Overbought correction` };
            } else {
                // Try AI for neutral RSI
                const recentTrades = await Trade.getUserTrades(this.userId, 5);
                const topPatterns = await Pattern.getTopPatterns(5);
                const marketContext = { trend: confirmedTrend, rsiShort: marketState.rsiShort || marketState.rsi, lastPattern: marketState.lastPattern };
                
                const aiAnalysis = await deepseekService.analyzeMarket(this.symbol, currentPrice, marketState.rsi, 'neutral', null, recentTrades, topPatterns, marketContext);
                if (aiAnalysis.action === 'CALL') action = 'BUY';
                else if (aiAnalysis.action === 'PUT') action = 'SELL';
                analysis = aiAnalysis;
            }

            if (action === 'BUY' || action === 'SELL') {
                const stake = this.calculateStake(70, 0, confirmedTrend, 50);
                
                console.log(`🔫 [AGGRESSIVE] TRADE #${++this.forceTradeCount}: ${action} ${this.symbol} at $${currentPrice.toFixed(2)} | RSI: ${marketState.rsi} | Stake: $${stake}`);
                console.log(`   Reason: ${analysis.simple_reason} | Pattern: ${analysis.pattern}`);
                
                await this.executeEntry(action, currentPrice, stake, {
                    action: action === 'BUY' ? 'CALL' : 'PUT',
                    confidence: 75,
                    pattern: analysis.pattern || 'aggressive_trade',
                    simple_reason: `AGGRESSIVE: ${analysis.simple_reason}`
                });
                return;
            }

            this.currentWatchState = {
                status: 'WATCHING', action: 'WAIT', symbol: this.symbol,
                confidence: 50,
                reason: `RSI ${marketState.rsi} - Waiting for signal`,
                pattern: marketState.lastPattern,
                market_price: currentPrice,
                market_rsi: marketState.rsi,
                trend: confirmedTrend,
                lastUpdate: Date.now(),
                is_auto_mode: true,
                confidence_threshold: this.confidenceThreshold,
                total_trades: this.totalTrades,
                total_wins: this.totalWins,
                total_losses: this.totalLosses,
                session_profit: this.sessionProfit,
                session_loss: this.sessionLoss
            };
        } catch (error) {
            console.error('❌ Analysis error:', error.message);
        }
    }

    calculateStake(confidence, patternWinRate, trend, setupQuality = 50) {
        this.recalculateStakes();
        // Small stakes for aggressive testing
        if (this.consecutiveLosses >= 3) return this.MIN_STAKE;
        if (this.consecutiveLosses >= 2) return this.BASE_STAKE;
        return this.BASE_STAKE;
    }

    async executeEntry(action, entryPrice, stake, analysis) {
        if (this.isExecuting || this.activeTrade) return;
        this.isExecuting = true;
        
        try {
            const user = await User.findById(this.userId);
            if (!user) return;
            
            console.log(`💸 [AGGRESSIVE] ${action} ${this.symbol} | $${entryPrice.toFixed(2)} | $${stake}`);
            
            const tradeResult = await derivService.placeTrade(this.symbol, action, stake, 2, 'm');
            
            const tradeId = await Trade.create({
                user_id: this.userId,
                contract_id: tradeResult.buy.contract_id,
                symbol: this.symbol,
                action,
                entry_price: entryPrice,
                stake,
                confidence: analysis.confidence,
                pattern: analysis.pattern || 'Aggressive',
                rsi: this.currentWatchState?.market_rsi || 50,
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
                pattern: analysis.pattern,
                isSniper: false
            };
            
            console.log(`✅ TRADE #${tradeId} OPEN | ${action} | $${stake}`);
            
            setTimeout(() => this.checkTradeResult(tradeId, tradeResult.buy.contract_id, entryPrice, stake), 125000);
            
        } catch (error) {
            console.error('❌ Execute error:', error.message);
        } finally {
            this.isExecuting = false;
        }
    }

    async updateActiveTrade() {
        if (!this.activeTrade) return;
        const now = Date.now();
        const timeLeft = this.activeTrade.exit_time - now;
        if (timeLeft <= 0) return;
        broadcastAIUpdate({ type: 'active_trade_update', trade: { ...this.activeTrade, current_price: marketData.getCurrentPrice(), time_remaining: Math.floor(timeLeft / 1000) } });
    }

    async checkTradeResult(tradeId, contractId, entryPrice, stake) {
        try {
            let contractResult = null, retries = 10;
            while (retries > 0 && !contractResult) {
                try {
                    contractResult = await derivService.getClosedContract(contractId);
                    if (contractResult) break;
                } catch (e) {}
                await new Promise(r => setTimeout(r, 10000));
                retries--;
            }
            
            let profit = 0, exitPrice = entryPrice, status = 'LOSS';
            
            if (contractResult) {
                if (contractResult.profit !== undefined && contractResult.profit !== null) profit = contractResult.profit;
                else if (contractResult.sell_price && contractResult.buy_price) profit = contractResult.sell_price - contractResult.buy_price;
                if (contractResult.exit_tick?.quote) exitPrice = contractResult.exit_tick.quote;
                else if (contractResult.sell_price) exitPrice = contractResult.sell_price;
                
                if (profit > 0) status = 'WIN';
                else { status = 'LOSS'; profit = -stake; }
            } else {
                profit = -stake;
            }

            await Trade.updateResult(tradeId, exitPrice, profit, status);
            await User.updateStats(this.userId, status, profit, stake);
            
            this.recentResults.push(status);
            if (this.recentResults.length > 30) this.recentResults.shift();

            if (status === 'WIN') {
                this.totalWins++;
                this.consecutiveLosses = 0;
                this.sessionProfit += profit;
                console.log(`🎉 WIN! +$${Math.abs(profit).toFixed(2)} | Total: ${this.totalWins}W/${this.totalLosses}L`);
            } else {
                this.totalLosses++;
                this.consecutiveLosses++;
                this.sessionLoss += Math.abs(profit);
                console.log(`❌ LOSS #${this.consecutiveLosses} | Total: ${this.totalWins}W/${this.totalLosses}L`);
                
                if (this.consecutiveLosses >= 5) {
                    this.pausedUntil = Date.now() + 300000;
                    console.log('🛑 PAUSE 5min - 5 consecutive losses');
                } else if (this.consecutiveLosses >= 3) {
                    this.pausedUntil = Date.now() + 60000;
                    console.log('🛑 PAUSE 1min - 3 consecutive losses');
                }
            }

            try {
                const bal = await derivService.getBalance();
                if (bal?.balance) this.currentBalance = bal.balance;
            } catch (e) {}

            broadcastTradeResult({ id: tradeId, contract_id: contractId, symbol: this.symbol, action: this.activeTrade?.action, entry_price: entryPrice, exit_price: exitPrice, profit, stake, status });
            
            const winRate = this.recentResults.length > 0 ? Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100) : 0;
            console.log(`📊 Trade #${tradeId}: ${status} $${profit.toFixed(2)} | Recent WR: ${winRate}%`);
            
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
            mode: 'AGGRESSIVE',
            tick_count: this.tickCount,
            total_trades: this.totalTrades,
            total_wins: this.totalWins,
            total_losses: this.totalLosses,
            session_profit: this.sessionProfit,
            session_loss: this.sessionLoss,
            timestamp: Date.now()
        };
    }

    stop() {
        this.isRunning = false;
        if (this.analysisInterval) { clearInterval(this.analysisInterval); this.analysisInterval = null; }
        if (this.balanceSyncInterval) { clearInterval(this.balanceSyncInterval); this.balanceSyncInterval = null; }
        console.log('🤖 AGGRESSIVE MODE STOPPED');
    }

    setMode(mode) { this.mode = mode; }

    setSymbol(symbol) {
        this.symbol = symbol;
        this.dataReady = false;
        this.tickCount = 0;
        marketData.reset();
        derivService.subscribeToTicks(symbol).catch(console.error);
        setTimeout(() => this.seedCandlesFromHistory(), 1500);
    }

    setUserId(userId) { this.userId = userId; }
    setConfidenceThreshold(threshold) { this.confidenceThreshold = threshold; }
    executeManualTrade(action, stake) {}
    declineManualSetup() {}
    getPendingSetup() { return null; }
    getCurrentSetup() { return this.currentWatchState; }
    isBullishPattern(p) { return false; }
    isBearishPattern(p) { return false; }
    isTradeableTrend(t) { return true; }
    hasTrendException(trend, rsi) { return { allowed: true, reason: null }; }
    validateSetup(action, pattern, trend, rsi) { return { valid: true, reason: 'AGGRESSIVE MODE' }; }
}

module.exports = new AITrader();
