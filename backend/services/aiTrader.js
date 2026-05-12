/**
 * AI Trader Service - The Brain
 * Runs continuously, watches market, learns from every trade
 * v4.0 - Smart filters + Scaled stakes + Proven rules
 */

const marketData = require('./marketData');
const deepseekService = require('./deepseekService');
const derivService = require('./derivService');
const Trade = require('../models/Trade');
const User = require('../models/User');
const Pattern = require('../models/Pattern');
const { broadcastAIUpdate, broadcastTradeResult, broadcastNotification, broadcastNewSetup } = require('../utils/websocket');

class AITrader {
    constructor() {
        this.isRunning = false;
        this.analysisInterval = null;
        this.tickHealthInterval = null;
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
        this.userId = 1;
        this.symbol = 'R_75';
        this.mode = 'AUTO';
        this.lastSetupNotified = false;
        this.currentSetupId = null;
        this.confidenceThreshold = 60; // Raised from 55
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.lastTradeTime = 0;
        this.tradeCooldown = 30000;
        this.pausedUntil = 0;
        this.tickCount = 0;
        this.lastTickTime = 0;
        this.forceReconnecting = false;
        this.lastReconnectAttempt = 0;
        this.RECONNECT_COOLDOWN = 120000;
        this.MIN_CANDLES_FOR_TRADE = 10;
        this.dataReady = false;
        this.totalTrades = 0;
        this.totalWins = 0;
        this.totalLosses = 0;
        
        // === PROFIT RULES ===
        this.MIN_STAKE = 0.50;      // Minimum stake
        this.BASE_STAKE = 2.00;     // Normal stake for 60-65% confidence
        this.CONFIDENT_STAKE = 5.00; // For 65-75% confidence
        this.HIGH_STAKE = 10.00;     // For 75-85% confidence
        this.MAX_STAKE = 20.00;      // For 85%+ confidence + proven pattern
    }
    
    async start(userId, symbol = 'R_75', mode = 'AUTO') {
        if (this.isRunning) {
            console.log('🤖 [AI Trader] Already running');
            return;
        }
        
        this.userId = userId;
        this.symbol = symbol;
        this.mode = mode;
        this.isRunning = true;
        this.isExecuting = false;
        this.lastSetupNotified = false;
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.tickCount = 0;
        this.forceReconnecting = false;
        this.lastReconnectAttempt = 0;
        this.dataReady = false;
        this.activeTrade = null;
        
        console.log(`🤖 [AI Trader] Starting v4.0 with ${mode} mode for user ${userId}, symbol ${symbol}`);
        console.log(`📊 [AI Trader] Minimum ${this.MIN_CANDLES_FOR_TRADE} candles required before trading`);
        console.log(`🧠 [AI Trader] Learning from trade history enabled`);
        console.log(`💰 [AI Trader] Stake scaling: Base=$${this.BASE_STAKE} | Confident=$${this.CONFIDENT_STAKE} | High=$${this.HIGH_STAKE} | Max=$${this.MAX_STAKE}`);
        console.log(`🛡️ [AI Trader] Rules: No sideways | Pattern-direction match | RSI boundaries | Min confidence ${this.confidenceThreshold}%`);
        
        marketData.reset();
        
        const derivSymbol = derivService.symbolMap?.[symbol] || symbol;
        if (!derivService.subscriptions?.has(derivSymbol)) {
            try {
                await derivService.subscribeToTicks(symbol);
                console.log(`📡 [AI Trader] Subscribed to ${symbol} ticks`);
            } catch (err) {
                console.log(`⚠️ [AI Trader] Subscription may already exist: ${err.message}`);
            }
        } else {
            console.log(`📡 [AI Trader] Server already subscribed to ${symbol}, using existing tick stream`);
        }
        
        derivService.on('tick', (tick) => {
            marketData.addTick(tick);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount % 50 === 0) {
                console.log(`📈 [AI Trader] Tick #${this.tickCount} received - Price: $${tick.quote?.toFixed(2)}`);
            }
            this.onMarketUpdate();
        });
        
        this.analysisInterval = setInterval(() => {
            this.analyzeMarket();
        }, 10000);
        
        this.tickHealthInterval = setInterval(async () => {
            const timeSinceLastTick = Date.now() - this.lastTickTime;
            const timeSinceLastReconnect = Date.now() - this.lastReconnectAttempt;
            
            if (this.tickCount > 0 && timeSinceLastTick > 90000 && !this.forceReconnecting && timeSinceLastReconnect > this.RECONNECT_COOLDOWN) {
                console.log(`⚠️ [AI Trader] No ticks for ${Math.floor(timeSinceLastTick/1000)}s! Forcing full reconnect...`);
                this.forceReconnecting = true;
                this.lastReconnectAttempt = Date.now();
                try {
                    await derivService.forceReconnectForTicks(this.symbol);
                    this.lastTickTime = Date.now();
                    console.log(`✅ [AI Trader] Force reconnect complete.`);
                } catch (err) {
                    console.error(`❌ [AI Trader] Force reconnect failed:`, err.message);
                }
                this.forceReconnecting = false;
            }
        }, 60000);
        
        setTimeout(() => this.analyzeMarket(), 1000);
    }
    
    onMarketUpdate() {
        if (this.activeTrade) {
            this.updateActiveTrade();
        }
        broadcastAIUpdate(this.getCurrentAnalysis());
    }
    
    /**
     * Check if a pattern is bullish (indicates price going UP)
     */
    isBullishPattern(pattern) {
        if (!pattern) return false;
        const p = pattern.toLowerCase();
        return p.includes('hammer') || p.includes('bullish') || 
               p.includes('three_white') || p.includes('soldiers') ||
               p.includes('bounce') || p.includes('support');
    }
    
    /**
     * Check if a pattern is bearish (indicates price going DOWN)
     */
    isBearishPattern(pattern) {
        if (!pattern) return false;
        const p = pattern.toLowerCase();
        return p.includes('shooting') || p.includes('bearish') || 
               p.includes('three_black') || p.includes('crows') ||
               p.includes('downtrend') || p.includes('resistance') ||
               p.includes('overbought');
    }
    
    /**
     * Check if trend is strong enough to trade
     */
    isTradeableTrend(trend) {
        if (!trend) return false;
        return trend.includes('downtrend') || trend.includes('uptrend');
    }
    
    /**
     * Validate the trade setup against our proven rules
     */
    validateSetup(action, pattern, trend, rsi) {
        const reasons = [];
        
        // Rule 1: No sideways trading
        if (!this.isTradeableTrend(trend)) {
            reasons.push(`SIDEWAYS MARKET: Trend is "${trend}". Only trade trending markets.`);
            return { valid: false, reason: reasons.join(' ') };
        }
        
        // Rule 2: Pattern must match direction
        if (action === 'BUY' && this.isBearishPattern(pattern) && !this.isBullishPattern(pattern)) {
            reasons.push(`PATTERN MISMATCH: Cannot BUY on bearish pattern "${pattern}".`);
            return { valid: false, reason: reasons.join(' ') };
        }
        if (action === 'SELL' && this.isBullishPattern(pattern) && !this.isBearishPattern(pattern)) {
            reasons.push(`PATTERN MISMATCH: Cannot SELL on bullish pattern "${pattern}".`);
            return { valid: false, reason: reasons.join(' ') };
        }
        
        // Rule 3: RSI boundaries
        if (action === 'SELL' && rsi < 25) {
            reasons.push(`RSI BOUNDARY: Cannot SELL when RSI ${rsi} < 25 (deeply oversold, bounce imminent).`);
            return { valid: false, reason: reasons.join(' ') };
        }
        if (action === 'BUY' && rsi > 75) {
            reasons.push(`RSI BOUNDARY: Cannot BUY when RSI ${rsi} > 75 (deeply overbought, drop imminent).`);
            return { valid: false, reason: reasons.join(' ') };
        }
        
        // Rule 4: Trend-direction alignment
        if (action === 'BUY' && trend.includes('downtrend') && rsi > 35) {
            reasons.push(`TREND CONTRADICTION: Buying in downtrend with RSI ${rsi} > 35. Wait for deeper oversold or trend reversal.`);
            return { valid: false, reason: reasons.join(' ') };
        }
        if (action === 'SELL' && trend.includes('uptrend') && rsi < 65) {
            reasons.push(`TREND CONTRADICTION: Selling in uptrend with RSI ${rsi} < 65. Wait for deeper overbought or trend reversal.`);
            return { valid: false, reason: reasons.join(' ') };
        }
        
        return { valid: true, reason: 'Setup validated' };
    }
    
    /**
     * Calculate stake based on confidence, pattern history, and trend strength
     */
    calculateStake(confidence, patternWinRate, trend) {
        const isStrongTrend = trend?.includes('strong_');
        const isProvenPattern = patternWinRate >= 60;
        const isExcellentPattern = patternWinRate >= 70;
        
        if (confidence >= 85 && isStrongTrend && isExcellentPattern) {
            return this.MAX_STAKE;
        } else if (confidence >= 75 && isStrongTrend && isProvenPattern) {
            return this.HIGH_STAKE;
        } else if (confidence >= 75) {
            return this.HIGH_STAKE;
        } else if (confidence >= 65 && isProvenPattern) {
            return this.CONFIDENT_STAKE;
        } else if (confidence >= 65) {
            return this.CONFIDENT_STAKE;
        } else if (confidence >= this.confidenceThreshold) {
            return this.BASE_STAKE;
        }
        return this.MIN_STAKE;
    }
    
    async analyzeMarket() {
        try {
            if (this.isExecuting) return;
            
            if (this.pausedUntil > Date.now()) {
                const remaining = Math.floor((this.pausedUntil - Date.now()) / 1000);
                if (remaining % 30 === 0 || remaining < 10) {
                    console.log(`⏸️ [AI Trader] Paused for ${remaining}s due to loss streak`);
                }
                return;
            }
            
            if (this.activeTrade) return;
            
            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) return;
            
            const marketState = marketData.getMarketState();
            const currentPrice = marketState.price;
            
            const tickAge = Date.now() - this.lastTickTime;
            if (this.tickCount > 10 && tickAge > 60000) {
                console.log(`⚠️ [AI Trader] Ticks frozen. Skipping.`);
                return;
            }
            
            const candleCount = marketState.candleCount;
            if (candleCount < this.MIN_CANDLES_FOR_TRADE) {
                if (candleCount % 3 === 0) {
                    console.log(`🔍 [AI Trader] Building data: ${candleCount}/${this.MIN_CANDLES_FOR_TRADE} candles`);
                }
                if (candleCount >= this.MIN_CANDLES_FOR_TRADE && !this.dataReady) {
                    this.dataReady = true;
                    console.log(`✅ [AI Trader] DATA READY!`);
                }
                return;
            }
            
            if (!this.dataReady) this.dataReady = true;
            
            const shouldLog = !this._lastAnalysisLog || Date.now() - this._lastAnalysisLog > 30000;
            if (shouldLog) {
                console.log(`🔍 [AI Trader] ${this.symbol} | $${currentPrice.toFixed(2)} | RSI: ${marketState.rsi} | Trend: ${marketState.trend} | Pattern: ${marketState.lastPattern}`);
                this._lastAnalysisLog = Date.now();
            }
            
            // Dynamic threshold
            let dynamicThreshold = this.confidenceThreshold;
            if (this.recentResults.length >= 5) {
                const recentWinRate = this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length;
                if (recentWinRate >= 0.7) dynamicThreshold = Math.max(50, this.confidenceThreshold - 10);
                else if (recentWinRate <= 0.3) dynamicThreshold = Math.min(80, this.confidenceThreshold + 20);
            }
            if (this.consecutiveLosses >= 2) dynamicThreshold = Math.max(dynamicThreshold, 70);
            
            // Fetch learning data
            const patternPerformance = await Trade.getPatternPerformance(this.userId, this.symbol);
            const sessionPerformance = await Trade.getSessionPerformance(this.userId, this.symbol);
            
            const marketContext = {
                trend: marketState.trend || 'sideways',
                volatility: marketState.volatility || 0,
                rsiShort: marketState.rsiShort || marketState.rsi,
                lastPattern: marketState.lastPattern || 'none',
                consecutiveLosses: this.consecutiveLosses,
                recentWinRate: this.recentResults.length >= 5 
                    ? Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100)
                    : null,
                patternPerformance: patternPerformance,
                sessionPerformance: sessionPerformance,
                minCandles: this.MIN_CANDLES_FOR_TRADE
            };
            
            const recentTrades = await Trade.getUserTrades(this.userId, 5);
            const topPatterns = await Pattern.getTopPatterns(5);
            
            const analysis = await deepseekService.analyzeMarket(
                this.symbol, currentPrice, marketState.rsi, 'neutral', null, recentTrades, topPatterns, marketContext
            );
            
            const action = analysis.action === 'CALL' ? 'BUY' : (analysis.action === 'PUT' ? 'SELL' : 'WAIT');
            
            if (shouldLog || action !== 'WAIT') {
                console.log(`📊 [AI Trader] DeepSeek - Action: ${analysis.action}, Confidence: ${analysis.confidence}%, Pattern: ${analysis.pattern}`);
            }
            
            // === APPLY PROFIT RULES ===
            if (action !== 'WAIT' && analysis.confidence >= dynamicThreshold) {
                const validation = this.validateSetup(action, analysis.pattern, marketState.trend, marketState.rsi);
                
                if (!validation.valid) {
                    if (shouldLog) {
                        console.log(`🛡️ [AI Trader] SETUP REJECTED: ${validation.reason}`);
                    }
                    this.currentWatchState = {
                        status: 'FILTERED',
                        action: 'WAIT',
                        symbol: this.symbol,
                        reason: validation.reason,
                        confidence: analysis.confidence,
                        pattern: analysis.pattern,
                        market_price: currentPrice,
                        market_rsi: marketState.rsi,
                        trend: marketState.trend,
                        lastUpdate: Date.now(),
                        is_auto_mode: true,
                        confidence_threshold: dynamicThreshold
                    };
                    return;
                }
                
                // Setup validated! Calculate stake and execute
                const currentPattern = patternPerformance?.find(p => 
                    p.pattern.toLowerCase() === (analysis.pattern || '').toLowerCase()
                );
                const patternWinRate = currentPattern?.winRate || 0;
                const stake = this.calculateStake(analysis.confidence, patternWinRate, marketState.trend);
                
                console.log(`✅ [AI Trader] SETUP VALIDATED: ${action} ${this.symbol} | Confidence: ${analysis.confidence}% | Stake: $${stake} | Pattern WR: ${patternWinRate}% | Trend: ${marketState.trend}`);
                
                await this.executeEntry(action, currentPrice, stake, analysis);
                return;
            }
            
            if (action === 'WAIT' || analysis.confidence < dynamicThreshold) {
                if (shouldLog && action === 'WAIT') {
                    console.log(`   Reason: ${analysis.simple_reason}`);
                }
                if (action !== 'WAIT' && analysis.confidence < dynamicThreshold) {
                    console.log(`🛡️ [AI Trader] Confidence ${analysis.confidence}% < threshold ${dynamicThreshold}%. Waiting.`);
                }
            }
            
            this.currentWatchState = {
                status: 'WATCHING',
                action: 'WAIT',
                symbol: this.symbol,
                confidence: analysis.confidence,
                reason: analysis.simple_reason || 'Waiting for setup',
                pattern: analysis.pattern,
                market_price: currentPrice,
                market_rsi: marketState.rsi,
                trend: marketState.trend,
                lastUpdate: Date.now(),
                is_auto_mode: true,
                confidence_threshold: dynamicThreshold,
                total_trades: this.totalTrades,
                total_wins: this.totalWins,
                total_losses: this.totalLosses
            };
            
        } catch (error) {
            console.error('❌ [AI Trader] Analysis error:', error.message);
        }
    }
    
    async executeEntry(action, entryPrice, stake, analysis) {
        if (this.isExecuting || this.activeTrade) return;
        
        this.isExecuting = true;
        
        try {
            const user = await User.findById(this.userId);
            if (user.trades_remaining <= 0) {
                console.log('⚠️ [AI Trader] No trades remaining');
                return;
            }
            
            if (stake < this.MIN_STAKE) {
                console.log(`⚠️ [AI Trader] Stake $${stake} below minimum $${this.MIN_STAKE}`);
                return;
            }
            
            const token = user.is_demo ? user.demo_token : user.real_token;
            if (!derivService.authorized || derivService.currentToken !== token) {
                console.log(`🔄 [AI Trader] Token reconnect...`);
                await derivService.reconnectWithToken(token);
                try {
                    await derivService.subscribeToTicks(this.symbol);
                    this.lastTickTime = Date.now();
                } catch (err) {
                    await derivService.forceReconnectForTicks(this.symbol);
                    this.lastTickTime = Date.now();
                }
            }
            
            console.log(`💸 [AI Trader] ${action} ${this.symbol} | Entry: $${entryPrice.toFixed(2)} | Stake: $${stake.toFixed(2)} | Confidence: ${analysis.confidence}% | Pattern: ${analysis.pattern}`);
            
            const tradeResult = await derivService.placeTrade(this.symbol, action, stake, 5, 'm');
            
            const tradeId = await Trade.create({
                user_id: this.userId,
                contract_id: tradeResult.buy.contract_id,
                symbol: this.symbol,
                action: action,
                entry_price: entryPrice,
                stake: stake,
                confidence: analysis.confidence,
                pattern: analysis.pattern || 'AI Detected',
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
                action: action,
                entry_price: entryPrice,
                stake: stake,
                entry_time: Date.now(),
                exit_time: Date.now() + (5 * 60 * 1000),
                confidence: analysis.confidence,
                pattern: analysis.pattern
            };
            
            broadcastTradeResult({
                id: tradeId,
                contract_id: tradeResult.buy.contract_id,
                symbol: this.symbol,
                action: action,
                entry_price: entryPrice,
                exit_price: null,
                profit: null,
                stake: stake,
                status: 'PENDING'
            });
            
            console.log(`✅ [AI Trader] Trade #${tradeId} OPEN | ${action} ${this.symbol} | Stake: $${stake.toFixed(2)} | Contract: ${String(tradeResult.buy.contract_id).substring(0, 8)}...`);
            
            setTimeout(() => this.checkTradeResult(tradeId, tradeResult.buy.contract_id, entryPrice, stake), 330000);
            
        } catch (error) {
            console.error('❌ [AI Trader] Execute error:', error.message);
        } finally {
            this.isExecuting = false;
        }
    }
    
    async updateActiveTrade() {
        if (!this.activeTrade) return;
        const now = Date.now();
        const timeLeft = this.activeTrade.exit_time - now;
        if (timeLeft <= 0) return;
        
        const currentPrice = marketData.getCurrentPrice();
        const pnl = this.activeTrade.action === 'BUY' 
            ? currentPrice - this.activeTrade.entry_price 
            : this.activeTrade.entry_price - currentPrice;
        
        broadcastAIUpdate({
            type: 'active_trade_update',
            trade: { ...this.activeTrade, current_price: currentPrice, pnl: pnl * this.activeTrade.stake, time_remaining: Math.floor(timeLeft / 1000) }
        });
    }
    
    async checkTradeResult(tradeId, contractId, entryPrice, stake) {
        try {
            let contractResult = null;
            let retries = 10;
            
            while (retries > 0 && !contractResult) {
                try {
                    contractResult = await derivService.getClosedContract(contractId);
                    if (contractResult) break;
                } catch (e) {}
                await new Promise(r => setTimeout(r, 30000));
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
                else if (profit <= 0) { status = 'LOSS'; profit = -stake; }
            } else {
                profit = -stake;
                status = 'LOSS';
            }
            
            await Trade.updateResult(tradeId, exitPrice, profit, status);
            await User.updateStats(this.userId, status, profit, stake);
            await Pattern.recordTradeResult(this.activeTrade?.pattern || 'Unknown', this.symbol, this.activeTrade?.action || 'BUY', this.getCurrentSession(), status === 'WIN');
            
            this.recentResults.push(status);
            if (this.recentResults.length > 10) this.recentResults.shift();
            
            if (status === 'WIN') {
                this.totalWins++;
                this.consecutiveLosses = 0;
                console.log(`🎉 [AI Trader] WIN! +$${Math.abs(profit).toFixed(2)} | Total: ${this.totalWins}W/${this.totalLosses}L`);
            } else {
                this.totalLosses++;
                this.consecutiveLosses++;
                console.log(`❌ [AI Trader] LOSS #${this.consecutiveLosses} | -$${Math.abs(profit).toFixed(2)} | Total: ${this.totalWins}W/${this.totalLosses}L`);
                
                if (this.consecutiveLosses >= 3) {
                    this.pausedUntil = Date.now() + (5 * 60 * 1000);
                    console.log(`🛑 [AI Trader] 3 losses! Pausing 5 min.`);
                    broadcastNotification('Trading Paused', '3 consecutive losses. Cooling off 5 min.', 'warning');
                }
            }
            
            broadcastTradeResult({
                id: tradeId, contract_id: contractId, symbol: this.symbol,
                action: this.activeTrade?.action, entry_price: entryPrice,
                exit_price: exitPrice, profit: profit, stake: stake, status: status
            });
            
            const winRate = this.recentResults.length > 0 
                ? Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100) : 0;
            
            console.log(`📊 [AI Trader] Trade #${tradeId}: ${status} $${profit.toFixed(2)} | Recent(${this.recentResults.length}): ${winRate}% WR | Total: ${this.totalWins}W/${this.totalLosses}L`);
            
            this.activeTrade = null;
            
            if (derivService.subscriptions?.size === 0) {
                try { await derivService.subscribeToTicks(this.symbol); this.lastTickTime = Date.now(); } catch (err) {}
            }
            
        } catch (error) {
            console.error('❌ [AI Trader] Result check error:', error.message);
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
            tick_count: this.tickCount,
            total_trades: this.totalTrades,
            total_wins: this.totalWins,
            total_losses: this.totalLosses,
            timestamp: Date.now()
        };
    }
    
    stop() {
        this.isRunning = false;
        if (this.analysisInterval) { clearInterval(this.analysisInterval); this.analysisInterval = null; }
        if (this.tickHealthInterval) { clearInterval(this.tickHealthInterval); this.tickHealthInterval = null; }
        console.log('🤖 [AI Trader] Stopped');
    }
    
    setMode(mode) { this.mode = mode; console.log(`🤖 [AI Trader] Mode: ${mode}`); }
    
    setSymbol(symbol) {
        this.symbol = symbol;
        this.dataReady = false;
        console.log(`🔄 [AI Trader] Symbol: ${symbol}. Need ${this.MIN_CANDLES_FOR_TRADE} candles.`);
        marketData.reset();
        derivService.subscribeToTicks(symbol).catch(() => {});
        this.tickCount = 0;
        this.currentWatchState.status = 'BUILDING_DATA';
        broadcastAIUpdate(this.getCurrentAnalysis());
    }
    
    setUserId(userId) { this.userId = userId; }
    setConfidenceThreshold(threshold) { this.confidenceThreshold = threshold; }
}

module.exports = new AITrader();
