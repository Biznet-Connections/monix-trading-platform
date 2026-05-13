/**
 * AI Trader Service - The Professional
 * Pre-loaded trading DNA + AI enhancement + Perfect memory
 * v6.1 - Fixed log spam, Asian session tuned, PUT/CALL aligned
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
        this._lastPendingLog = {}; // For log throttling
        this.userId = 1;
        this.symbol = 'R_75';
        this.mode = 'AUTO';
        this.lastSetupNotified = false;
        this.currentSetupId = null;
        this.confidenceThreshold = 55;
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
        
        this.MIN_STAKE = 0.50;
        this.BASE_STAKE = 2.00;
        this.CONFIDENT_STAKE = 5.00;
        this.HIGH_STAKE = 10.00;
        this.MAX_STAKE = 20.00;
        
        this.trendStartTime = 0;
        this.trendDirection = null;
        this.MIN_TREND_DURATION = 5 * 60 * 1000;
    }
    
    async start(userId, symbol = 'R_75', mode = 'AUTO') {
        if (this.isRunning) return;
        
        this.userId = userId;
        this.symbol = symbol;
        this.mode = mode;
        this.isRunning = true;
        this.isExecuting = false;
        this.pendingManualSetup = null;
        this.pendingLimitOrders = [];
        this._lastPendingLog = {};
        this.lastSetupNotified = false;
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.tickCount = 0;
        this.forceReconnecting = false;
        this.lastReconnectAttempt = 0;
        this.dataReady = false;
        this.activeTrade = null;
        this.trendStartTime = 0;
        this.trendDirection = null;
        
        const session = knowledgeBase.getSessionRules();
        console.log(`🤖 [AI Trader] Starting v6.1 PROFESSIONAL TRADER EDITION`);
        console.log(`📚 [AI Trader] Trading DNA loaded: ${session.name} session optimized`);
        console.log(`💰 [AI Trader] Stakes: Base=$${this.BASE_STAKE} | Confident=$${this.CONFIDENT_STAKE} | High=$${this.HIGH_STAKE} | Max=$${this.MAX_STAKE}`);
        console.log(`🛡️ [AI Trader] Knowledge base + Rule engine + AI enhancement ACTIVE`);
        
        marketData.reset();
        
        const derivSymbol = derivService.symbolMap?.[symbol] || symbol;
        if (!derivService.subscriptions?.has(derivSymbol)) {
            try { await derivService.subscribeToTicks(symbol); } catch (err) {}
        }
        
        derivService.on('tick', (tick) => {
            marketData.addTick(tick);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount % 50 === 0) console.log(`📈 [AI Trader] Tick #${this.tickCount} - $${tick.quote?.toFixed(2)}`);
            this.onMarketUpdate();
        });
        
        this.analysisInterval = setInterval(() => this.analyzeMarket(), 10000);
        
        this.tickHealthInterval = setInterval(async () => {
            const timeSinceLastTick = Date.now() - this.lastTickTime;
            const timeSinceLastReconnect = Date.now() - this.lastReconnectAttempt;
            if (this.tickCount > 0 && timeSinceLastTick > 90000 && !this.forceReconnecting && timeSinceLastReconnect > this.RECONNECT_COOLDOWN) {
                this.forceReconnecting = true;
                this.lastReconnectAttempt = Date.now();
                try { await derivService.forceReconnectForTicks(this.symbol); this.lastTickTime = Date.now(); } catch (err) {}
                this.forceReconnecting = false;
            }
        }, 60000);
        
        setTimeout(() => this.analyzeMarket(), 1000);
    }
    
    onMarketUpdate() {
        if (this.activeTrade) { this.updateActiveTrade(); }
        this.checkPendingLimitOrders();
        broadcastAIUpdate(this.getCurrentAnalysis());
    }
    
    checkPendingLimitOrders() {
        if (this.pendingLimitOrders.length === 0) return;
        
        const currentPrice = marketData.getCurrentPrice();
        if (!currentPrice) return;
        
        const marketState = marketData.getMarketState();
        const now = Date.now();
        
        for (let i = this.pendingLimitOrders.length - 1; i >= 0; i--) {
            const order = this.pendingLimitOrders[i];
            
            if (now > order.expiresAt) {
                console.log(`⏰ [AI Trader] Pending order expired: ${order.action} @ $${order.entryPrice.toFixed(2)}`);
                this.pendingLimitOrders.splice(i, 1);
                continue;
            }
            
            const distancePercent = Math.abs(currentPrice - order.entryPrice) / order.entryPrice * 100;
            
            if (distancePercent <= order.proximityThreshold) {
                const confirmationsMet = this.checkOrderConfirmations(order, marketState);
                
                if (confirmationsMet) {
                    console.log(`🎯 [AI Trader] PENDING ORDER TRIGGERED: ${order.action} @ $${currentPrice.toFixed(2)} (target was $${order.entryPrice.toFixed(2)})`);
                    this.pendingLimitOrders.splice(i, 1);
                    this.executeEntry(order.action, currentPrice, order.stake, {
                        action: order.action === 'BUY' ? 'CALL' : 'PUT',
                        confidence: order.confidence,
                        pattern: order.pattern,
                        simple_reason: `Limit order triggered. ${order.reason}`
                    });
                } else {
                    // THROTTLED LOGGING - only log every 30s per order
                    const logKey = `${order.id}_${distancePercent.toFixed(2)}`;
                    if (!this._lastPendingLog[logKey] || Date.now() - this._lastPendingLog[logKey] > 30000) {
                        this._lastPendingLog[logKey] = Date.now();
                        const timeLeft = Math.max(0, Math.floor((order.expiresAt - now) / 60000));
                        console.log(`👀 [AI Trader] Pending ${order.action} @ $${order.entryPrice.toFixed(2)} | ${distancePercent.toFixed(2)}% away | ${timeLeft}min left | Waiting for confirmation`);
                    }
                }
            }
        }
    }
    
    checkOrderConfirmations(order, marketState) {
        if (!order.conditions || order.conditions.length === 0) return true;
        
        let met = 0;
        for (const condition of order.conditions) {
            switch (condition) {
                case 'RSI_OVERSOLD': if (marketState.rsi < 35) met++; break;
                case 'RSI_OVERBOUGHT': if (marketState.rsi > 65) met++; break;
                case 'CANDLE_BULLISH': if (marketState.lastPattern?.includes('bullish') || marketState.lastPattern === 'hammer' || marketState.lastPattern === 'three_white_soldiers') met++; break;
                case 'CANDLE_BEARISH': if (marketState.lastPattern?.includes('bearish') || marketState.lastPattern === 'shooting_star' || marketState.lastPattern === 'three_black_crows') met++; break;
                case 'NO_STRONG_DOWNTREND': if (!marketState.trend?.includes('strong_downtrend')) met++; break;
                case 'NO_STRONG_UPTREND': if (!marketState.trend?.includes('strong_uptrend')) met++; break;
                default: met++;
            }
        }
        return met >= order.minConfirmations;
    }
    
    createPendingOrder(params) {
        const { action, entryPrice, stake, confidence, pattern, reason } = params;
        
        const exists = this.pendingLimitOrders.find(o => 
            o.action === action && Math.abs(o.entryPrice - entryPrice) / entryPrice < 0.001
        );
        if (exists) {
            // Throttled log
            const logKey = `duplicate_${entryPrice.toFixed(0)}`;
            if (!this._lastPendingLog[logKey] || Date.now() - this._lastPendingLog[logKey] > 30000) {
                this._lastPendingLog[logKey] = Date.now();
                console.log(`⚠️ [AI Trader] Pending order already exists near $${entryPrice.toFixed(2)}`);
            }
            return null;
        }
        
        if (this.pendingLimitOrders.length >= 3) {
            this.pendingLimitOrders.shift();
        }
        
        const order = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            action, entryPrice, stake, confidence, pattern, reason,
            proximityThreshold: 0.15,
            conditions: [],
            minConfirmations: 2,
            createdAt: Date.now(),
            expiresAt: Date.now() + (45 * 60 * 1000)
        };
        
        if (action === 'BUY') {
            order.conditions = ['RSI_OVERSOLD', 'CANDLE_BULLISH', 'NO_STRONG_DOWNTREND'];
        } else {
            order.conditions = ['RSI_OVERBOUGHT', 'CANDLE_BEARISH', 'NO_STRONG_UPTREND'];
        }
        
        this.pendingLimitOrders.push(order);
        console.log(`📝 [AI Trader] PENDING ORDER CREATED: ${action} @ $${entryPrice.toFixed(2)} | Stake: $${stake} | Expires in 45min`);
        return order;
    }
    
    async analyzeMarket() {
        try {
            if (this.isExecuting) return;
            if (this.pausedUntil > Date.now()) return;
            if (this.activeTrade) return;
            
            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) return;
            
            const marketState = marketData.getMarketState();
            const currentPrice = marketState.price;
            
            if (this.tickCount > 10 && Date.now() - this.lastTickTime > 60000) return;
            
            const candleCount = marketState.candleCount;
            if (candleCount < this.MIN_CANDLES_FOR_TRADE) {
                if (candleCount % 3 === 0) console.log(`🔍 [AI Trader] Building: ${candleCount}/${this.MIN_CANDLES_FOR_TRADE} candles`);
                if (candleCount >= this.MIN_CANDLES_FOR_TRADE && !this.dataReady) {
                    this.dataReady = true;
                    console.log(`✅ [AI Trader] DATA READY! Professional trader online.`);
                }
                return;
            }
            
            if (!this.dataReady) this.dataReady = true;
            
            const shouldLog = !this._lastAnalysisLog || Date.now() - this._lastAnalysisLog > 30000;
            if (shouldLog) {
                const session = knowledgeBase.getSessionRules();
                console.log(`🔍 [AI Trader] ${this.symbol} | $${currentPrice.toFixed(2)} | RSI: ${marketState.rsi} | Trend: ${marketState.trend} | Pattern: ${marketState.lastPattern} | Session: ${session.name}`);
                this._lastAnalysisLog = Date.now();
            }
            
            let dynamicThreshold = this.confidenceThreshold;
            if (this.recentResults.length >= 5) {
                const recentWinRate = this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length;
                if (recentWinRate >= 0.7) dynamicThreshold = Math.max(45, this.confidenceThreshold - 10);
                else if (recentWinRate <= 0.3) dynamicThreshold = Math.min(80, this.confidenceThreshold + 25);
            }
            if (this.consecutiveLosses >= 2) dynamicThreshold = Math.max(dynamicThreshold, 70);
            
            // Apply session modifier
            const sessionRules = knowledgeBase.getSessionRules();
            dynamicThreshold += sessionRules.confidenceModifier;
            dynamicThreshold = Math.max(50, Math.min(80, dynamicThreshold));
            
            const patternPerformance = await Trade.getPatternPerformance(this.userId, this.symbol);
            const recentTrades = await Trade.getUserTrades(this.userId, 5);
            const topPatterns = await Pattern.getTopPatterns(5);
            
            const marketContext = {
                trend: marketState.trend || 'sideways',
                volatility: marketState.volatility || 0,
                rsiShort: marketState.rsiShort || marketState.rsi,
                lastPattern: marketState.lastPattern || 'none',
                consecutiveLosses: this.consecutiveLosses,
                recentWinRate: this.recentResults.length >= 5 
                    ? Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100) : null,
                patternPerformance,
                nearSupport: marketState.nearSupport,
                nearResistance: marketState.nearResistance,
                support: marketState.support,
                resistance: marketState.resistance
            };
            
            const analysis = await deepseekService.analyzeMarket(
                this.symbol, currentPrice, marketState.rsi, 'neutral', null, recentTrades, topPatterns, marketContext
            );
            
            const action = analysis.action === 'CALL' ? 'BUY' : (analysis.action === 'PUT' ? 'SELL' : 'WAIT');
            
            if (shouldLog || action !== 'WAIT') {
                console.log(`📊 [AI Trader] DeepSeek: ${analysis.action} | ${analysis.confidence}% | ${analysis.pattern}`);
            }
            
            if (action !== 'WAIT' && analysis.confidence >= dynamicThreshold) {
                const kbValidation = knowledgeBase.validateSetup({
                    pattern: analysis.pattern,
                    currentTrend: marketState.trend,
                    rsi: marketState.rsi,
                    nearSupport: marketState.nearSupport,
                    nearResistance: marketState.nearResistance,
                    action: action
                });
                
                if (!kbValidation.valid) {
                    if (shouldLog) {
                        console.log(`🧬 [AI Trader] KNOWLEDGE BASE REJECTED: ${kbValidation.reason}`);
                    }
                    
                    // Create pending order ALIGNED with DeepSeek's recommendation
                    if (marketState.nearSupport || marketState.nearResistance) {
                        const pendingStake = this.calculateStake(analysis.confidence, 0, marketState.trend);
                        let entryLevel, pendingAction;
                        
                        // ALIGN with DeepSeek's recommendation
                        if (analysis.action === 'CALL' && (marketState.nearSupport || marketState.support > 0)) {
                            pendingAction = 'BUY';
                            entryLevel = marketState.nearSupport ? marketState.support : (marketState.support || currentPrice * 0.998);
                        } else if (analysis.action === 'PUT' && (marketState.nearResistance || marketState.resistance > 0)) {
                            pendingAction = 'SELL';
                            entryLevel = marketState.nearResistance ? marketState.resistance : (marketState.resistance || currentPrice * 1.002);
                        } else if (marketState.nearSupport) {
                            pendingAction = 'BUY';
                            entryLevel = marketState.support;
                        } else {
                            pendingAction = 'SELL';
                            entryLevel = marketState.resistance;
                        }
                        
                        if (entryLevel && entryLevel > 0) {
                            this.createPendingOrder({
                                action: pendingAction,
                                entryPrice: entryLevel,
                                stake: pendingStake,
                                confidence: analysis.confidence,
                                pattern: analysis.pattern,
                                reason: kbValidation.reason
                            });
                        }
                    }
                    
                    this.currentWatchState = {
                        status: 'DNA_FILTERED',
                        action: 'WAIT',
                        symbol: this.symbol,
                        reason: kbValidation.reason,
                        confidence: analysis.confidence,
                        pattern: analysis.pattern,
                        market_price: currentPrice,
                        market_rsi: marketState.rsi,
                        trend: marketState.trend,
                        lastUpdate: Date.now(),
                        is_auto_mode: this.mode === 'AUTO',
                        confidence_threshold: dynamicThreshold,
                        pending_orders: this.pendingLimitOrders.length
                    };
                    return;
                }
                
                const finalConfidence = Math.max(analysis.confidence, kbValidation.confidence);
                const currentPattern = patternPerformance?.find(p => p.pattern.toLowerCase() === (analysis.pattern || '').toLowerCase());
                const patternWinRate = currentPattern?.winRate || 0;
                const stake = this.calculateStake(finalConfidence, patternWinRate, marketState.trend);
                
                console.log(`✅ [AI Trader] DNA VALIDATED: ${action} ${this.symbol} | KB: ${kbValidation.confidence}% | AI: ${analysis.confidence}% | Stake: $${stake}`);
                
                if (this.mode === 'AUTO') {
                    await this.executeEntry(action, currentPrice, stake, {
                        action: analysis.action,
                        confidence: finalConfidence,
                        pattern: analysis.pattern,
                        simple_reason: `[DNA] ${kbValidation.reason} | [AI] ${analysis.simple_reason}`
                    });
                }
                return;
            }
            
            this.currentWatchState = {
                status: 'WATCHING',
                action: 'WAIT',
                symbol: this.symbol,
                confidence: analysis.confidence,
                reason: analysis.simple_reason || 'Waiting for DNA-validated setup',
                pattern: analysis.pattern,
                market_price: currentPrice,
                market_rsi: marketState.rsi,
                trend: marketState.trend,
                lastUpdate: Date.now(),
                is_auto_mode: this.mode === 'AUTO',
                confidence_threshold: dynamicThreshold,
                pending_orders: this.pendingLimitOrders.length,
                total_trades: this.totalTrades,
                total_wins: this.totalWins,
                total_losses: this.totalLosses
            };
            
        } catch (error) {
            console.error('❌ [AI Trader] Analysis error:', error.message);
        }
    }
    
    calculateStake(confidence, patternWinRate, trend) {
        const isStrongTrend = trend?.includes('strong_');
        const isProvenPattern = patternWinRate >= 60;
        const isExcellentPattern = patternWinRate >= 70;
        if (confidence >= 85 && isStrongTrend && isExcellentPattern) return this.MAX_STAKE;
        else if (confidence >= 75 && isStrongTrend && isProvenPattern) return this.HIGH_STAKE;
        else if (confidence >= 75) return this.HIGH_STAKE;
        else if (confidence >= 65 && isProvenPattern) return this.CONFIDENT_STAKE;
        else if (confidence >= 65) return this.CONFIDENT_STAKE;
        else if (confidence >= this.confidenceThreshold) return this.BASE_STAKE;
        return this.MIN_STAKE;
    }
    
    async executeEntry(action, entryPrice, stake, analysis) {
        if (this.isExecuting || this.activeTrade) return;
        this.isExecuting = true;
        try {
            const user = await User.findById(this.userId);
            if (!user || user.trades_remaining <= 0) return;
            if (stake < this.MIN_STAKE) return;
            const token = user.is_demo ? user.demo_token : user.real_token;
            if (!derivService.authorized || derivService.currentToken !== token) {
                await derivService.reconnectWithToken(token);
                try { await derivService.subscribeToTicks(this.symbol); this.lastTickTime = Date.now(); } catch (err) {
                    await derivService.forceReconnectForTicks(this.symbol); this.lastTickTime = Date.now();
                }
            }
            console.log(`💸 [AI Trader] ${action} ${this.symbol} | $${entryPrice.toFixed(2)} | $${stake} | ${analysis.confidence}% | ${analysis.pattern}`);
            const tradeResult = await derivService.placeTrade(this.symbol, action, stake, 5, 'm');
            const tradeId = await Trade.create({
                user_id: this.userId, contract_id: tradeResult.buy.contract_id,
                symbol: this.symbol, action, entry_price: entryPrice, stake,
                confidence: analysis.confidence, pattern: analysis.pattern || 'AI Detected',
                rsi: this.currentWatchState?.market_rsi || 50,
                session: this.getCurrentSession(), is_auto: this.mode === 'AUTO' ? 1 : 0
            });
            await User.deductTrade(this.userId);
            this.totalTrades++; this.lastTradeTime = Date.now();
            this.activeTrade = {
                id: tradeId, contract_id: tradeResult.buy.contract_id,
                action, entry_price: entryPrice, stake,
                entry_time: Date.now(), exit_time: Date.now() + 300000,
                confidence: analysis.confidence, pattern: analysis.pattern
            };
            broadcastTradeResult({ id: tradeId, contract_id: tradeResult.buy.contract_id, symbol: this.symbol, action, entry_price: entryPrice, exit_price: null, profit: null, stake, status: 'PENDING' });
            console.log(`✅ [AI Trader] Trade #${tradeId} OPEN | ${action} ${this.symbol} | $${stake}`);
            setTimeout(() => this.checkTradeResult(tradeId, tradeResult.buy.contract_id, entryPrice, stake), 330000);
        } catch (error) { console.error('❌ [AI Trader] Execute error:', error.message); }
        finally { this.isExecuting = false; }
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
                try { contractResult = await derivService.getClosedContract(contractId); if (contractResult) break; } catch (e) {}
                await new Promise(r => setTimeout(r, 30000)); retries--;
            }
            let profit = 0, exitPrice = entryPrice, status = 'LOSS';
            if (contractResult) {
                if (contractResult.profit !== undefined && contractResult.profit !== null) profit = contractResult.profit;
                else if (contractResult.sell_price && contractResult.buy_price) profit = contractResult.sell_price - contractResult.buy_price;
                if (contractResult.exit_tick?.quote) exitPrice = contractResult.exit_tick.quote;
                else if (contractResult.sell_price) exitPrice = contractResult.sell_price;
                if (profit > 0) status = 'WIN'; else { status = 'LOSS'; profit = -stake; }
            } else { profit = -stake; }
            await Trade.updateResult(tradeId, exitPrice, profit, status);
            await User.updateStats(this.userId, status, profit, stake);
            await Pattern.recordTradeResult(this.activeTrade?.pattern || 'Unknown', this.symbol, this.activeTrade?.action || 'BUY', this.getCurrentSession(), status === 'WIN');
            this.recentResults.push(status);
            if (this.recentResults.length > 10) this.recentResults.shift();
            if (status === 'WIN') { this.totalWins++; this.consecutiveLosses = 0; console.log(`🎉 WIN! +$${Math.abs(profit).toFixed(2)} | ${this.totalWins}W/${this.totalLosses}L`); }
            else { this.totalLosses++; this.consecutiveLosses++; console.log(`❌ LOSS #${this.consecutiveLosses} | ${this.totalWins}W/${this.totalLosses}L`);
                if (this.consecutiveLosses >= 3) { this.pausedUntil = Date.now() + 300000; console.log('🛑 Paused 5min'); } }
            broadcastTradeResult({ id: tradeId, contract_id: contractId, symbol: this.symbol, action: this.activeTrade?.action, entry_price: entryPrice, exit_price: exitPrice, profit, stake, status });
            const winRate = this.recentResults.length > 0 ? Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100) : 0;
            console.log(`📊 Trade #${tradeId}: ${status} $${profit.toFixed(2)} | Recent: ${winRate}% | ${this.totalWins}W/${this.totalLosses}L`);
            this.activeTrade = null;
            if (derivService.subscriptions?.size === 0) { try { await derivService.subscribeToTicks(this.symbol); this.lastTickTime = Date.now(); } catch (err) {} }
        } catch (error) { console.error('❌ Result check error:', error.message); try { await Trade.updateResult(tradeId, entryPrice, -stake, 'LOSS'); } catch (e) {} this.activeTrade = null; }
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
            pending_orders: this.pendingLimitOrders.map(o => ({
                id: o.id, action: o.action, entryPrice: o.entryPrice, stake: o.stake,
                confidence: o.confidence, pattern: o.pattern, reason: o.reason,
                created: o.createdAt, expires: o.expiresAt
            })),
            data_ready: this.dataReady, mode: this.mode,
            tick_count: this.tickCount,
            total_trades: this.totalTrades, total_wins: this.totalWins, total_losses: this.totalLosses,
            timestamp: Date.now()
        };
    }
    
    stop() { this.isRunning = false; if (this.analysisInterval) { clearInterval(this.analysisInterval); this.analysisInterval = null; } if (this.tickHealthInterval) { clearInterval(this.tickHealthInterval); this.tickHealthInterval = null; } console.log('🤖 Stopped'); }
    setMode(mode) { this.mode = mode; this.pendingLimitOrders = []; this._lastPendingLog = {}; console.log(`Mode: ${mode}`); }
    setSymbol(symbol) { 
        this.symbol = symbol; this.dataReady = false; this.trendStartTime = 0; this.trendDirection = null; 
        marketData.reset(); derivService.subscribeToTicks(symbol).catch(() => {}); this.tickCount = 0; 
        this.pendingLimitOrders = []; this._lastPendingLog = {}; 
        this.currentWatchState.status = 'BUILDING_DATA'; broadcastAIUpdate(this.getCurrentAnalysis()); 
    }
    setUserId(userId) { this.userId = userId; }
    setConfidenceThreshold(threshold) { this.confidenceThreshold = threshold; }
    
    executeManualTrade(action, stake) { /* same as before */ }
    declineManualSetup() { /* same as before */ }
    getPendingSetup() { /* same as before */ }
    getCurrentSetup() { /* same as before */ }
    isBullishPattern(p) { if(!p)return false; const l=p.toLowerCase(); return l.includes('hammer')||l.includes('bullish')||l.includes('three_white')||l.includes('soldiers')||l.includes('bounce')||l.includes('support'); }
    isBearishPattern(p) { if(!p)return false; const l=p.toLowerCase(); return l.includes('shooting')||l.includes('bearish')||l.includes('three_black')||l.includes('crows')||l.includes('downtrend')||l.includes('resistance')||l.includes('overbought'); }
    isTradeableTrend(t) { return t?.includes('downtrend')||t?.includes('uptrend'); }
    hasTrendException(trend, rsi) {
        const now=Date.now(); if(this.trendDirection!==trend){this.trendDirection=trend;this.trendStartTime=now;}
        const d=now-this.trendStartTime; const s=d>=this.MIN_TREND_DURATION;
        if(trend?.includes('strong_downtrend')&&s&&rsi<25)return{allowed:true,reason:`Sustained strong downtrend ${Math.floor(d/60000)}min`};
        if(trend?.includes('strong_uptrend')&&s&&rsi>75)return{allowed:true,reason:`Sustained strong uptrend ${Math.floor(d/60000)}min`};
        return{allowed:false,reason:null};
    }
    validateSetup(action, pattern, trend, rsi) {
        if(!this.isTradeableTrend(trend))return{valid:false,reason:`SIDEWAYS: ${trend}`};
        const te=this.hasTrendException(trend,rsi);
        if(action==='BUY'&&this.isBearishPattern(pattern)&&!this.isBullishPattern(pattern))return{valid:false,reason:`PATTERN MISMATCH: Cannot BUY on bearish pattern`};
        if(action==='SELL'&&this.isBullishPattern(pattern)&&!this.isBearishPattern(pattern))return{valid:false,reason:`PATTERN MISMATCH: Cannot SELL on bullish pattern`};
        if(action==='SELL'&&rsi<25&&!te.allowed)return{valid:false,reason:`RSI BOUNDARY: ${rsi}<25`};
        if(action==='BUY'&&rsi>75&&!te.allowed)return{valid:false,reason:`RSI BOUNDARY: ${rsi}>75`};
        if(action==='BUY'&&trend?.includes('downtrend')&&rsi>35&&!te.allowed)return{valid:false,reason:`TREND CONTRADICTION`};
        if(action==='SELL'&&trend?.includes('uptrend')&&rsi<65&&!te.allowed)return{valid:false,reason:`TREND CONTRADICTION`};
        return{valid:true,reason:'Setup validated'};
    }
}

module.exports = new AITrader();
