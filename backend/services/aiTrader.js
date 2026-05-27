/**
 * AI Trader Service - The Professional
 * Pre-loaded trading DNA + AI enhancement + Perfect memory
 * v13.0.0 - FULL DEBUG + WebSocket broadcasting
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
        this.symbol = 'R_75';
        this.mode = 'AUTO';
        this.lastSetupNotified = false;
        this.currentSetupId = null;
        this.confidenceThreshold = 65;
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.lastTradeTime = 0;
        this.tradeCooldown = 90000;
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

        this.PCT_MIN_SMALL = 0.02;
        this.PCT_BASE_SMALL = 0.05;
        this.PCT_CONFIDENT_SMALL = 0.08;
        this.PCT_MAX_SMALL = 0.10;

        this.PCT_MIN_MEDIUM = 0.01;
        this.PCT_BASE_MEDIUM = 0.025;
        this.PCT_CONFIDENT_MEDIUM = 0.04;
        this.PCT_MAX_MEDIUM = 0.06;

        this.PCT_MIN_LARGE = 0.005;
        this.PCT_BASE_LARGE = 0.01;
        this.PCT_CONFIDENT_LARGE = 0.025;
        this.PCT_MAX_LARGE = 0.05;

        this.PCT_MIN_XL = 0.005;
        this.PCT_BASE_XL = 0.01;
        this.PCT_CONFIDENT_XL = 0.02;
        this.PCT_MAX_XL = 0.03;

        this.MIN_STAKE = 0.50;
        this.BASE_STAKE = 2.00;
        this.CONFIDENT_STAKE = 2.00;
        this.HIGH_STAKE = 2.00;
        this.MAX_STAKE = 2.00;

        this.DAILY_PROFIT_TARGET_PCT = 0.10;
        this.DAILY_LOSS_LIMIT_PCT = 0.05;

        this.BLOCKED_HOURS_START = 8;
        this.BLOCKED_HOURS_END = 17;

        this.RSI_BUY_MAX = 75;
        this.RSI_SELL_MIN = 25;

        this._trendHistory = [];
        this.TREND_CONFIRM_COUNT = 2;

        this.GOLDEN_HOURS = [1, 6, 7, 18, 20, 21, 22];

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
        this.MIN_TREND_DURATION = 5 * 60 * 1000;

        this._lastLondonLog = 0;
        this._lastRSILog = 0;
        this._lastSkipLog = 0;
        this._lastAnalysisLog = 0;
        this._lastBalanceLog = 0;
        this._lastDailyLog = 0;
        this._lastExhaustionLog = 0;
        this._lastTickCount = 0;
        this.tickHeartbeat = null;
    }

    roundStake(amount) {
        return Math.max(0.50, Math.round(amount * 2) / 2);
    }

    isProven() {
        if (this.recentResults.length < 20) return false;
        const recentWins = this.recentResults.slice(-20).filter(r => r === 'WIN').length;
        const recentWR = recentWins / 20;
        return recentWR >= 0.55;
    }

    getAccountTier() {
        const bal = this.currentBalance || 1000;
        if (bal < 500) return 'SMALL';
        if (bal < 2000) return 'MEDIUM';
        if (bal < 10000) return 'LARGE';
        return 'XL';
    }

    recalculateStakes() {
        const bal = this.currentBalance || 1000;
        const tier = this.getAccountTier();

        let pctMin, pctBase, pctConfident, pctMax;
        switch (tier) {
            case 'SMALL':
                pctMin = this.PCT_MIN_SMALL; pctBase = this.PCT_BASE_SMALL;
                pctConfident = this.PCT_CONFIDENT_SMALL; pctMax = this.PCT_MAX_SMALL;
                break;
            case 'MEDIUM':
                pctMin = this.PCT_MIN_MEDIUM; pctBase = this.PCT_BASE_MEDIUM;
                pctConfident = this.PCT_CONFIDENT_MEDIUM; pctMax = this.PCT_MAX_MEDIUM;
                break;
            case 'LARGE':
                pctMin = this.PCT_MIN_LARGE; pctBase = this.PCT_BASE_LARGE;
                pctConfident = this.PCT_CONFIDENT_LARGE; pctMax = this.PCT_MAX_LARGE;
                break;
            case 'XL':
            default:
                pctMin = this.PCT_MIN_XL; pctBase = this.PCT_BASE_XL;
                pctConfident = this.PCT_CONFIDENT_XL; pctMax = this.PCT_MAX_XL;
                break;
        }

        this.MIN_STAKE = this.roundStake(bal * pctMin);
        this.BASE_STAKE = this.roundStake(bal * pctBase);
        this.CONFIDENT_STAKE = this.roundStake(bal * pctConfident);
        this.MAX_STAKE = this.roundStake(bal * pctMax);
        this.HIGH_STAKE = this.MAX_STAKE;

        if (!this._lastBalanceLog || Date.now() - this._lastBalanceLog > 3600000) {
            const provenTag = this.isProven() ? '✅ PROVEN' : '⏳ PROVING';
            console.log(`💰 [Stakes] Balance: $${bal.toFixed(2)} | Tier: ${tier} | ${provenTag} | MIN=$${this.MIN_STAKE} | BASE=$${this.BASE_STAKE} | CONFIDENT=$${this.CONFIDENT_STAKE} | MAX=$${this.MAX_STAKE}`);
            this._lastBalanceLog = Date.now();
        }
    }

    async shouldBlockLondon() {
        const currentHour = new Date().getUTCHours();
        if (currentHour < this.BLOCKED_HOURS_START || currentHour >= this.BLOCKED_HOURS_END) return false;

        try {
            const symbolSessionStats = await Trade.getSymbolSessionStats(this.userId, this.symbol);
            const londonPerf = symbolSessionStats?.find(s => s.session === 'LONDON');
            
            if (!londonPerf || londonPerf.total < 10) {
                return false;
            }

            const londonWR = parseFloat(londonPerf.win_rate) || 0;
            if (londonWR < 50 && londonPerf.total >= 10) {
                console.log(`🛑 [London] ${this.symbol} blocked - ${londonWR}% WR`);
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    async syncBalanceFromDeriv() {
        if (!derivService.authorized) return;
        try {
            const balanceResult = await derivService.getBalance();
            if (balanceResult && balanceResult.balance > 0) {
                this.currentBalance = balanceResult.balance;
                this.recalculateStakes();
                console.log(`💰 [AI Trader] Live Balance: $${this.currentBalance.toFixed(2)}`);
            }
        } catch (error) {
            console.error('❌ [AI Trader] Failed to sync balance:', error.message);
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
                    console.log(`📊 [AI Trader] Seeded ${seeded} candles`);
                    this.dataReady = true;
                }
            }
        } catch (e) {
            console.log(`⚠️ [AI Trader] Could not seed candles: ${e.message}`);
        }
    }

    getConfirmedTrend(rawTrend) {
        this._trendHistory.push(rawTrend);
        if (this._trendHistory.length > 5) this._trendHistory.shift();
        if (this._trendHistory.length < this.TREND_CONFIRM_COUNT) return rawTrend;
        const lastN = this._trendHistory.slice(-this.TREND_CONFIRM_COUNT);
        const allSame = lastN.every(t => t === lastN[0]);
        if (allSame) return lastN[0];
        const prevN = this._trendHistory.slice(-this.TREND_CONFIRM_COUNT - 1, -1);
        const prevSame = prevN.every(t => t === prevN[0]);
        if (prevSame && prevN.length >= this.TREND_CONFIRM_COUNT) return prevN[0];
        return rawTrend;
    }

    calculateSetupQuality(pattern, session, rsi, trend, hour, nearSR) {
        let score = 0;
        if (session === 'NEWYORK') score += 20;
        else if (session === 'ASIAN') score += 10;
        if (this.GOLDEN_HOURS.includes(hour)) score += 15;
        if (rsi >= 35 && rsi <= 45) score += 20;
        else if (rsi >= 25 && rsi < 35) score += 10;
        else if (rsi > 45 && rsi <= 55) score += 5;
        if (pattern === 'uptrend_pullback') score += 15;
        else if (pattern === 'bullish_engulfing' || pattern === 'hammer') score += 10;
        else if (pattern && !pattern.includes('doji') && !pattern.includes('bearish')) score += 5;
        if (trend && pattern) {
            const trendLower = trend.toLowerCase();
            const isBullish = pattern.includes('bullish') || pattern.includes('hammer') || pattern.includes('uptrend');
            const isBearish = pattern.includes('bearish') || pattern.includes('shooting') || pattern.includes('downtrend');
            if (isBullish && (trendLower.includes('uptrend') || trendLower === 'sideways')) score += 15;
            else if (isBearish && (trendLower.includes('downtrend') || trendLower === 'sideways')) score += 15;
            else if (!trendLower.includes('strong_')) score += 5;
        }
        if (nearSR) score += 10;
        if (this.consecutiveLosses === 0) score += 5;
        return Math.min(100, score);
    }

    calculateStatisticalConfidence(pattern, session, rsi, trend, nearSR, hourUTC) {
        let totalWeight = 0;
        let weightedScore = 0;
        if (pattern && this._cachedPatternPerformance) {
            const normalizedSearch = pattern.toLowerCase().replace(/_/g, ' ').replace(/ at .*$/, '').trim();
            let patternPerf = this._cachedPatternPerformance.find(p => p.pattern.toLowerCase() === normalizedSearch);
            if (!patternPerf) {
                patternPerf = this._cachedPatternPerformance.find(p => {
                    const dbPattern = p.pattern.toLowerCase().replace(/_/g, ' ');
                    return dbPattern.includes(normalizedSearch) || normalizedSearch.includes(dbPattern);
                });
            }
            if (patternPerf && patternPerf.total >= 3) {
                const patternScore = Math.min(100, Math.max(10, patternPerf.winRate));
                weightedScore += patternScore * this.CONF_WEIGHTS.patternHistoricalWR;
                totalWeight += this.CONF_WEIGHTS.patternHistoricalWR;
            }
        }
        if (session && this._cachedSessionPerformance) {
            const sessionPerf = this._cachedSessionPerformance.find(s => s.session === session);
            if (sessionPerf && sessionPerf.total >= 3) {
                const sessionWR = parseFloat(sessionPerf.winRate) || 50;
                weightedScore += Math.min(100, Math.max(10, sessionWR)) * this.CONF_WEIGHTS.sessionHistoricalWR;
                totalWeight += this.CONF_WEIGHTS.sessionHistoricalWR;
            }
        }
        if (rsi && this._cachedRSIPerformance) {
            const rsiZone = this.getRSIZone(rsi);
            const rsiPerf = this._cachedRSIPerformance.find(r => r.label && r.label.includes(rsiZone));
            if (rsiPerf && rsiPerf.total >= 3) {
                weightedScore += Math.min(100, Math.max(10, rsiPerf.winRate)) * this.CONF_WEIGHTS.rsiZoneWR;
                totalWeight += this.CONF_WEIGHTS.rsiZoneWR;
            }
        }
        if (hourUTC !== undefined && this._cachedHourPerformance) {
            const hourPerf = this._cachedHourPerformance.find(h => h.hour === hourUTC);
            if (hourPerf && hourPerf.total >= 3) {
                weightedScore += Math.min(100, Math.max(10, hourPerf.winRate)) * this.CONF_WEIGHTS.hourHistoricalWR;
                totalWeight += this.CONF_WEIGHTS.hourHistoricalWR;
            }
        }
        if (trend && pattern) {
            const trendLower = trend.toLowerCase();
            const patternLower = pattern.toLowerCase();
            const isBullish = patternLower.includes('bullish') || patternLower.includes('hammer') || patternLower.includes('uptrend') || patternLower.includes('soldiers');
            const isBearish = patternLower.includes('bearish') || patternLower.includes('shooting') || patternLower.includes('downtrend') || patternLower.includes('crows');
            if (isBullish && !isBearish && (trendLower.includes('uptrend') || trendLower === 'sideways')) {
                weightedScore += 75 * this.CONF_WEIGHTS.trendAlignment;
                totalWeight += this.CONF_WEIGHTS.trendAlignment;
            } else if (isBearish && !isBullish && (trendLower.includes('downtrend') || trendLower === 'sideways')) {
                weightedScore += 75 * this.CONF_WEIGHTS.trendAlignment;
                totalWeight += this.CONF_WEIGHTS.trendAlignment;
            } else {
                weightedScore += 40 * this.CONF_WEIGHTS.trendAlignment;
                totalWeight += this.CONF_WEIGHTS.trendAlignment;
            }
        }
        if (nearSR) {
            weightedScore += 70 * this.CONF_WEIGHTS.nearSR;
            totalWeight += this.CONF_WEIGHTS.nearSR;
        }
        if (totalWeight === 0) return 50;
        return Math.min(95, Math.max(5, Math.round(weightedScore / totalWeight)));
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

    async start(userId, symbol = 'R_75', mode = 'AUTO') {
        if (this.isRunning) return;

        this.userId = userId;
        
        try {
            const user = await User.findById(userId);
            if (!user) {
                console.error(`❌ [AI Trader] User ${userId} not found`);
                return;
            }
            
            if (user.default_symbol) {
                this.symbol = user.default_symbol;
                console.log(`💾 [AI Trader] Loaded saved symbol: ${this.symbol}`);
            } else {
                this.symbol = symbol || 'R_75';
            }
            
            this.mode = mode;
            
            const token = user.is_demo ? user.demo_token : user.real_token;
            
            if (!token) {
                console.error(`❌ [AI Trader] No Deriv token found`);
                return;
            }
            
            console.log(`🔑 [AI Trader] Connecting to Deriv with ${user.is_demo ? 'DEMO' : 'REAL'} account...`);
            
            await derivService.connect(token, false, user.is_demo);
            
            console.log(`✅ [AI Trader] Connected to Deriv successfully!`);
            
        } catch (err) {
            console.error(`❌ [AI Trader] Failed to connect:`, err.message);
            return;
        }
        
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
        this._trendHistory = [];
        this.sniperTradeActive = false;
        this.lastStakeWasMax = false;
        this.tradesSinceBigLoss = 0;
        this.sessionProfit = 0;
        this.sessionLoss = 0;

        setTimeout(async () => {
            try {
                const bal = await derivService.getBalance();
                if (bal?.balance && bal.balance > 10) {
                    this.currentBalance = bal.balance;
                    this.recalculateStakes();
                    console.log(`💰 [Balance] Updated: $${this.currentBalance.toFixed(2)}`);
                }
            } catch (e) {}
        }, 5000);

        this.recalculateStakes();

        const session = knowledgeBase.getSessionRules();
        const tier = this.getAccountTier();
        console.log(`🤖 [AI Trader] Starting v13.0.0`);
        console.log(`📚 [AI Trader] Symbol: ${this.symbol} | Session: ${session.name}`);
        console.log(`💰 [AI Trader] Account Tier: ${tier} | Balance: $${this.currentBalance.toFixed(2)}`);

        marketData.reset();

        const derivSymbol = derivService.symbolMap?.[this.symbol] || this.symbol;
        if (!derivService.subscriptions?.has(derivSymbol)) {
            try { await derivService.subscribeToTicks(this.symbol); } catch (err) {}
        }

        derivService.on('tick', (tick) => {
            marketData.addTick(tick);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount === 1) {
                console.log(`🎉 FIRST TICK! Price: $${tick.quote?.toFixed(2)}`);
                this.dataReady = true;
            }
            if (this.tickCount % 100 === 0) console.log(`📈 Tick #${this.tickCount} - $${tick.quote?.toFixed(2)}`);
            this.onMarketUpdate();
        });

        setTimeout(() => this.seedCandlesFromHistory(), 2000);

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

        this.balanceSyncInterval = setInterval(() => this.syncBalanceFromDeriv(), 60000);

        this.tickHeartbeat = setInterval(() => {
            if (this.tickCount === this._lastTickCount && this.isRunning && this.tickCount > 0) {
                console.warn(`⚠️ No ticks in 30 seconds! Reconnecting...`);
                derivService.forceReconnectForTicks(this.symbol).catch(() => {});
            }
            this._lastTickCount = this.tickCount;
        }, 30000);

        setTimeout(() => {
            this.syncBalanceFromDeriv();
            this.analyzeMarket();
        }, 5000);
    }

    onMarketUpdate() {
        if (this.activeTrade) { this.updateActiveTrade(); }
        this.checkPendingLimitOrders();
        broadcastAIUpdate(this.getCurrentAnalysis());
    }

    checkPendingLimitOrders() {
        if (this.pendingLimitOrders.length === 0) return;
        if (this.pausedUntil > Date.now()) return;
        const currentPrice = marketData.getCurrentPrice();
        if (!currentPrice) return;
        const marketState = marketData.getMarketState();
        const now = Date.now();
        for (let i = this.pendingLimitOrders.length - 1; i >= 0; i--) {
            const order = this.pendingLimitOrders[i];
            if (now > order.expiresAt) {
                console.log(`⏰ Pending order expired: ${order.action}`);
                this.pendingLimitOrders.splice(i, 1);
                continue;
            }
            const distancePercent = Math.abs(currentPrice - order.entryPrice) / order.entryPrice * 100;
            if (distancePercent <= order.proximityThreshold) {
                const confirmationsMet = this.checkOrderConfirmations(order, marketState);
                if (confirmationsMet) {
                    const kbRecheck = knowledgeBase.validateSetup({
                        pattern: order.pattern, currentTrend: marketState.trend,
                        rsi: marketState.rsi, nearSupport: marketState.nearSupport,
                        nearResistance: marketState.nearResistance, action: order.action
                    });
                    if (!kbRecheck.valid) {
                        console.log(`🛑 Pending ${order.action} CANCELLED — KB: ${kbRecheck.reason}`);
                        this.pendingLimitOrders.splice(i, 1);
                        continue;
                    }
                    console.log(`🎯 PENDING TRIGGERED: ${order.action} @ $${currentPrice.toFixed(2)}`);
                    this.pendingLimitOrders.splice(i, 1);
                    this.executeEntry(order.action, currentPrice, order.stake, {
                        action: order.action === 'BUY' ? 'CALL' : 'PUT',
                        confidence: order.confidence, pattern: order.pattern,
                        simple_reason: `Limit order. ${order.reason}`
                    });
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
                case 'CANDLE_BULLISH': if (marketState.lastPattern?.includes('bullish') || marketState.lastPattern === 'hammer') met++; break;
                case 'CANDLE_BEARISH': if (marketState.lastPattern?.includes('bearish') || marketState.lastPattern === 'shooting_star') met++; break;
                case 'NO_STRONG_DOWNTREND': if (!marketState.trend?.includes('strong_downtrend')) met++; break;
                case 'NO_STRONG_UPTREND': if (!marketState.trend?.includes('strong_uptrend')) met++; break;
                default: met++;
            }
        }
        return met >= order.minConfirmations;
    }

    createPendingOrder(params) {
        const { action, entryPrice, stake, confidence, pattern, reason } = params;
        const exists = this.pendingLimitOrders.find(o => o.action === action && Math.abs(o.entryPrice - entryPrice) / entryPrice < 0.001);
        if (exists) return null;
        if (this.pendingLimitOrders.length >= 3) this.pendingLimitOrders.shift();
        const order = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            action, entryPrice, stake, confidence, pattern, reason,
            proximityThreshold: 0.15, conditions: [], minConfirmations: 2,
            createdAt: Date.now(), expiresAt: Date.now() + (45 * 60 * 1000)
        };
        if (action === 'BUY') order.conditions = ['RSI_OVERSOLD', 'CANDLE_BULLISH', 'NO_STRONG_DOWNTREND'];
        else order.conditions = ['RSI_OVERBOUGHT', 'CANDLE_BEARISH', 'NO_STRONG_UPTREND'];
        this.pendingLimitOrders.push(order);
        console.log(`📝 PENDING: ${action} @ $${entryPrice.toFixed(2)} | $${stake}`);
        return order;
    }

    async analyzeMarket() {
        try {
            if (this.isExecuting) return;
            if (this.pausedUntil > Date.now()) return;
            if (this.activeTrade) return;
            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) return;

            const currentHour = new Date().getUTCHours();
            const blockLondon = await this.shouldBlockLondon();
            if (blockLondon) return;

            const dailyTarget = this.currentBalance * this.DAILY_PROFIT_TARGET_PCT;
            const dailyLossLimit = this.currentBalance * this.DAILY_LOSS_LIMIT_PCT;
            if (this.sessionProfit >= dailyTarget) return;
            if (this.sessionLoss >= dailyLossLimit) {
                this.pausedUntil = Date.now() + 86400000;
                this.pendingLimitOrders = [];
                return;
            }

            const marketState = marketData.getMarketState();
            const currentPrice = marketState.price;
            
            if (this.tickCount === 0) return;
            if (!this.dataReady && this.tickCount > 0) {
                this.dataReady = true;
                console.log(`✅ Data ready! ${this.tickCount} ticks received.`);
            }

            this.recalculateStakes();

            const rawTrend = marketState.trend;
            const confirmedTrend = this.getConfirmedTrend(rawTrend);

            this._cachedPatternPerformance = await Trade.getPatternPerformance(this.userId, this.symbol);
            this._cachedRSIPerformance = await Trade.getRSIPerformance(this.userId, this.symbol);
            this._cachedSessionPerformance = await Trade.getSessionPerformance(this.userId, this.symbol);

            this._cachedHourPerformance = [];
            const hourStats = {};
            const allTrades = await Trade.getUserTrades(this.userId, 200);
            allTrades.forEach(t => {
                if (t.status === 'PENDING' || !t.executed_at) return;
                const h = new Date(t.executed_at).getUTCHours();
                if (!hourStats[h]) hourStats[h] = { wins: 0, losses: 0, total: 0 };
                hourStats[h].total++;
                if (t.status === 'WIN') hourStats[h].wins++; else hourStats[h].losses++;
            });
            for (const [hour, data] of Object.entries(hourStats)) {
                if (data.total >= 2) {
                    this._cachedHourPerformance.push({ hour: parseInt(hour), winRate: Math.round((data.wins / data.total) * 100), total: data.total });
                }
            }

            const shouldLog = !this._lastAnalysisLog || Date.now() - this._lastAnalysisLog > 30000;
            if (shouldLog) {
                const session = knowledgeBase.getSessionRules();
                console.log(`🔍 ${this.symbol} | $${currentPrice.toFixed(2)} | RSI: ${marketState.rsi} | Trend: ${rawTrend} | Ticks: ${this.tickCount}`);
                this._lastAnalysisLog = Date.now();
            }

            let dynamicThreshold = this.confidenceThreshold;
            if (this.recentResults.length >= 5) {
                const recentWinRate = this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length;
                if (recentWinRate >= 0.7) dynamicThreshold = Math.max(55, this.confidenceThreshold - 10);
                else if (recentWinRate <= 0.3) dynamicThreshold = Math.min(80, this.confidenceThreshold + 15);
            }
            if (this.consecutiveLosses >= 2) dynamicThreshold = Math.max(dynamicThreshold, 70);
            if (this.GOLDEN_HOURS.includes(currentHour)) dynamicThreshold = Math.max(55, dynamicThreshold - 5);
            const sessionRules = knowledgeBase.getSessionRules();
            dynamicThreshold += sessionRules.confidenceModifier;
            dynamicThreshold = Math.max(60, Math.min(80, dynamicThreshold));

            const recentTrades = await Trade.getUserTrades(this.userId, 5);
            const topPatterns = await Pattern.getTopPatterns(5);
            const marketContext = {
                trend: confirmedTrend, volatility: marketState.volatility || 0,
                rsiShort: marketState.rsiShort || marketState.rsi, lastPattern: marketState.lastPattern || 'none',
                consecutiveLosses: this.consecutiveLosses,
                patternPerformance: this._cachedPatternPerformance,
                nearSupport: marketState.nearSupport, nearResistance: marketState.nearResistance,
                support: marketState.support, resistance: marketState.resistance
            };

            const analysis = await deepseekService.analyzeMarket(this.symbol, currentPrice, marketState.rsi, 'neutral', null, recentTrades, topPatterns, marketContext);
            if (analysis.pattern) analysis.pattern = deepseekService.normalizePatternName(analysis.pattern);

            const action = analysis.action === 'CALL' ? 'BUY' : (analysis.action === 'PUT' ? 'SELL' : 'WAIT');

            if (action === 'BUY' && marketState.rsi >= this.RSI_BUY_MAX) return;
            if (action === 'SELL' && marketState.rsi <= this.RSI_SELL_MIN) return;

            const sessionName = this.getCurrentSession();
            const nearSR = marketState.nearSupport || marketState.nearResistance;
            const statisticalConfidence = this.calculateStatisticalConfidence(analysis.pattern, sessionName, marketState.rsi, confirmedTrend, nearSR, currentHour);
            const aiConf = analysis.confidence || 50;
            let combinedConfidence = Math.round((aiConf * 0.4) + (statisticalConfidence * 0.6));
            if (this.GOLDEN_HOURS.includes(currentHour)) combinedConfidence = Math.min(95, combinedConfidence + 5);

            const setupQuality = this.calculateSetupQuality(analysis.pattern, sessionName, marketState.rsi, confirmedTrend, currentHour, nearSR);

            const effectiveConfidence = combinedConfidence;

            if (action !== 'WAIT' && effectiveConfidence >= dynamicThreshold) {
                if (action === 'SELL' && effectiveConfidence < 75) return;
                if (setupQuality < 45 && this.consecutiveLosses >= 1) return;

                let kbValidation = knowledgeBase.validateSetup({
                    pattern: analysis.pattern, currentTrend: confirmedTrend,
                    rsi: marketState.rsi, nearSupport: marketState.nearSupport,
                    nearResistance: marketState.nearResistance, action: action
                });

                if (!kbValidation.valid && kbValidation.reason?.includes('SESSION')) {
                    const cp = this._cachedPatternPerformance?.find(p => p.pattern.toLowerCase() === (analysis.pattern || '').toLowerCase());
                    if (cp && cp.winRate >= 65 && cp.total >= 5 && effectiveConfidence >= 70) {
                        kbValidation = { valid: true, action, confidence: effectiveConfidence, reason: `OVERRIDE: "${analysis.pattern}" ${cp.winRate}% WR`, source: 'OVERRIDE' };
                    }
                }

                if (!kbValidation.valid) return;

                const stake = this.calculateStake(effectiveConfidence, 0, confirmedTrend, setupQuality);

                console.log(`✅ VALIDATED: ${action} ${this.symbol} | COMB:${effectiveConfidence}% | Stake:$${stake}`);

                if (this.mode === 'AUTO') {
                    await this.executeEntry(action, currentPrice, stake, {
                        action: analysis.action, confidence: effectiveConfidence,
                        pattern: analysis.pattern,
                        simple_reason: `${kbValidation.reason}`
                    });
                }
                return;
            }

            this.currentWatchState = {
                status: 'WATCHING', 
                action: action === 'BUY' ? 'BUY' : (action === 'SELL' ? 'SELL' : 'WAIT'),
                action_display: action === 'BUY' ? '📈 BUY (UP)' : (action === 'SELL' ? '📉 SELL (DOWN)' : '⏳ WAITING'),
                symbol: this.symbol,
                confidence: effectiveConfidence || combinedConfidence,
                reason: analysis.simple_reason || 'Waiting for validated setup',
                pattern: analysis.pattern, 
                market_price: currentPrice,
                market_rsi: marketState.rsi, 
                market_support: marketState.support,
                market_resistance: marketState.resistance,
                market_feeling: marketState.condition === 'oversold' ? 'Price is low' : (marketState.condition === 'overbought' ? 'Price is high' : 'Market is stable'),
                entry_price: currentPrice,
                take_profit: currentPrice * (action === 'BUY' ? 1.005 : 0.995),
                stop_loss: currentPrice * (action === 'BUY' ? 0.998 : 1.002),
                entry_condition: action !== 'WAIT' ? `${action} at market price` : null,
                estimated_entry_time: action !== 'WAIT' ? 'Now' : null,
                trend: confirmedTrend,
                lastUpdate: Date.now(), 
                is_auto_mode: this.mode === 'AUTO',
                confidence_threshold: dynamicThreshold,
                pending_orders: this.pendingLimitOrders.map(o => ({
                    action: o.action,
                    entryPrice: o.entryPrice,
                    stake: o.stake,
                    confidence: o.confidence,
                    pattern: o.pattern,
                    reason: o.reason,
                    expires: o.expiresAt
                })),
                total_trades: this.totalTrades, 
                total_wins: this.totalWins, 
                total_losses: this.totalLosses,
                session_profit: this.sessionProfit, 
                session_loss: this.sessionLoss
            };
            
            // BROADCAST AI UPDATE TO FRONTEND
            console.log(`📡 [AI Trader] Broadcasting AI update: action=${this.currentWatchState.action}, confidence=${this.currentWatchState.confidence}, symbol=${this.currentWatchState.symbol}, rsi=${this.currentWatchState.market_rsi}`);
            broadcastAIUpdate(this.currentWatchState);
            
        } catch (error) {
            console.error('❌ Analysis error:', error.message);
        }
    }

    calculateStake(confidence, patternWinRate, trend, setupQuality = 50) {
        this.recalculateStakes();
        const bal = this.currentBalance || 1000;
        const tier = this.getAccountTier();

        if (this.lastStakeWasMax && this.tradesSinceBigLoss < 3) {
            return this.MIN_STAKE;
        }

        if (this.consecutiveLosses >= 2) {
            return this.MIN_STAKE;
        }

        if (this.sessionProfit >= bal * this.DAILY_PROFIT_TARGET_PCT) {
            return this.MIN_STAKE;
        }

        if (setupQuality >= 85 && this.consecutiveLosses === 0 && !this.sniperTradeActive && tier !== 'SMALL') {
            console.log(`🔫 SNIPER (Quality:${setupQuality}/100) — MAX ($${this.MAX_STAKE})`);
            this.sniperTradeActive = true;
            return this.MAX_STAKE;
        }

        if (setupQuality >= 75) {
            return this.CONFIDENT_STAKE;
        }

        if (setupQuality >= 60) {
            return this.BASE_STAKE;
        }

        return this.MIN_STAKE;
    }

    async executeEntry(action, entryPrice, stake, analysis) {
        if (this.isExecuting || this.activeTrade) return;
        this.isExecuting = true;
        try {
            const user = await User.findById(this.userId);
            if (!user || user.trades_remaining <= 0) return;
            if (stake < 0.50) return;
            
            console.log(`💸 ${action} ${this.symbol} | $${entryPrice.toFixed(2)} | $${stake} | ${analysis.confidence}%`);
            
            const tradeResult = await derivService.placeTrade(this.symbol, action, stake, 2, 'm');
            
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
                entry_time: Date.now(), exit_time: Date.now() + 120000,
                confidence: analysis.confidence, pattern: analysis.pattern,
                isSniper: stake >= this.MAX_STAKE * 0.9
            };
            
            broadcastTradeResult({ id: tradeId, contract_id: tradeResult.buy.contract_id, symbol: this.symbol, action, entry_price: entryPrice, exit_price: null, profit: null, stake, status: 'PENDING' });
            console.log(`✅ Trade #${tradeId} OPEN | ${action} | $${stake}`);
            
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
            let contractResult = null;
            let retries = 15;
            
            while (retries > 0 && !contractResult) {
                try { 
                    contractResult = await derivService.getClosedContract(contractId); 
                    if (contractResult && (contractResult.proposal_open_contract || contractResult.contract)) {
                        break;
                    }
                } catch (e) {}
                await new Promise(r => setTimeout(r, 5000)); 
                retries--;
            }
            
            let profit = -stake;
            let exitPrice = entryPrice;
            let status = 'LOSS';
            let actualProfit = 0;
            
            if (contractResult) {
                const contract = contractResult.proposal_open_contract?.contract || contractResult.contract || contractResult;
                
                if (contract) {
                    if (contract.exit_tick?.quote) exitPrice = contract.exit_tick.quote;
                    else if (contract.sell_price) exitPrice = contract.sell_price;
                    
                    const isCall = contract.contract_type === 'CALL';
                    
                    if (contract.profit !== undefined && contract.profit !== null) {
                        actualProfit = parseFloat(contract.profit);
                        profit = actualProfit;
                    } else if (contract.sell_price && contract.buy_price) {
                        actualProfit = contract.sell_price - contract.buy_price;
                        profit = actualProfit;
                    } else {
                        const priceChange = exitPrice - entryPrice;
                        if (isCall) {
                            actualProfit = priceChange > 0 ? stake * (priceChange / entryPrice) : -stake;
                        } else {
                            actualProfit = priceChange < 0 ? stake * Math.abs(priceChange / entryPrice) : -stake;
                        }
                        profit = actualProfit;
                    }
                    
                    if (profit > 0) {
                        status = 'WIN';
                    } else if (profit < 0) {
                        status = 'LOSS';
                        profit = profit;
                    } else {
                        status = 'LOSS';
                        profit = -stake;
                    }
                    
                    console.log(`📊 Contract ${contractId}: Type=${contract.contract_type}, Entry=$${contract.buy_price || entryPrice}, Exit=$${exitPrice}, Profit=$${profit.toFixed(2)}`);
                } else {
                    console.log(`⚠️ No contract data found for ${contractId}, marking as loss`);
                    profit = -stake;
                    status = 'LOSS';
                }
            } else {
                console.log(`⚠️ No contract result for ${contractId}, marking as loss`);
                profit = -stake;
                status = 'LOSS';
            }

            const wasSniper = this.activeTrade?.isSniper || false;
            if (wasSniper) {
                this.sniperTradeActive = false;
                this.lastStakeWasMax = (status === 'LOSS');
                this.tradesSinceBigLoss = 0;
            }
            if (this.lastStakeWasMax) {
                this.tradesSinceBigLoss++;
                if (this.tradesSinceBigLoss >= 3) this.lastStakeWasMax = false;
            }

            await Trade.updateResult(tradeId, exitPrice, profit, status);
            await User.updateStats(this.userId, status, profit, stake);
            await Pattern.recordTradeResult(this.activeTrade?.pattern || 'Unknown', this.symbol, this.activeTrade?.action || 'BUY', this.getCurrentSession(), status === 'WIN');
            
            this.recentResults.push(status);
            if (this.recentResults.length > 30) this.recentResults.shift();

            if (status === 'WIN') {
                this.totalWins++;
                this.consecutiveLosses = 0;
                this.sessionProfit += profit;
                console.log(`🎉 WIN! +$${Math.abs(profit).toFixed(2)} | ${this.totalWins}W/${this.totalLosses}L`);
            } else {
                this.totalLosses++;
                this.consecutiveLosses++;
                this.sessionLoss += Math.abs(profit);
                console.log(`❌ LOSS #${this.consecutiveLosses} | -$${Math.abs(profit).toFixed(2)} | ${this.totalWins}W/${this.totalLosses}L`);
                if (this.consecutiveLosses >= 5) {
                    this.pausedUntil = Date.now() + 1800000;
                    this.pendingLimitOrders = [];
                    console.log('🛑 HARD PAUSE 30min — 5 losses');
                } else if (this.consecutiveLosses >= 3) {
                    this.pausedUntil = Date.now() + 900000;
                    this.pendingLimitOrders = [];
                    console.log('🛑 HARD PAUSE 15min — 3 losses');
                }
            }

            try { 
                const bal = await derivService.getBalance(); 
                if (bal?.balance) {
                    this.currentBalance = bal.balance;
                    console.log(`💰 New Balance: $${this.currentBalance.toFixed(2)}`);
                }
            } catch (e) {}

            broadcastTradeResult({ id: tradeId, contract_id: contractId, symbol: this.symbol, action: this.activeTrade?.action, entry_price: entryPrice, exit_price: exitPrice, profit, stake, status });
            
            const winRate = this.recentResults.length > 0 ? Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100) : 0;
            console.log(`📊 Trade #${tradeId}: ${status} $${profit.toFixed(2)} | Recent WR: ${winRate}%`);
            
            this.activeTrade = null;
            
            if (derivService.subscriptions?.size === 0) {
                try { await derivService.subscribeToTicks(this.symbol); this.lastTickTime = Date.now(); } catch (err) {}
            }
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
            pending_orders: this.pendingLimitOrders,
            data_ready: this.dataReady, 
            mode: this.mode, 
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
        if (this.tickHealthInterval) { clearInterval(this.tickHealthInterval); this.tickHealthInterval = null; }
        if (this.balanceSyncInterval) { clearInterval(this.balanceSyncInterval); this.balanceSyncInterval = null; }
        if (this.tickHeartbeat) { clearInterval(this.tickHeartbeat); this.tickHeartbeat = null; }
        console.log('🤖 Stopped');
    }

    setMode(mode) { this.mode = mode; this.pendingLimitOrders = []; console.log(`Mode: ${mode}`); }

    setSymbol(symbol) {
        if (this.symbol === symbol && this.dataReady && this.tickCount > 0) {
            console.log(`📡 Already on ${symbol}, skipping reset`);
            return;
        }

        console.log(`🔄 Switching symbol from ${this.symbol} to ${symbol}`);
        
        this.symbol = symbol;
        this.dataReady = false;
        this.trendStartTime = 0;
        this.trendDirection = null;
        this._trendHistory = [];
        this.pendingLimitOrders = [];
        this._lastPendingLog = {};
        this.tickCount = 0;
        this.lastTickTime = Date.now();

        marketData.reset();

        derivService.subscribeToTicks(symbol)
            .then(() => {
                console.log(`✅ Subscribed to ${symbol}`);
                setTimeout(() => {
                    if (this.tickCount === 0) {
                        console.error(`❌ No ticks after 5 seconds, re-subscribing...`);
                        derivService.subscribeToTicks(symbol).catch(e => console.error(e.message));
                    } else {
                        console.log(`✅ Tick flow confirmed: ${this.tickCount} ticks`);
                        this.dataReady = true;
                    }
                }, 5000);
            })
            .catch(err => {
                console.error(`❌ Subscribe failed:`, err.message);
                setTimeout(() => derivService.subscribeToTicks(symbol).catch(e => console.error(e.message)), 3000);
            });

        setTimeout(() => this.seedCandlesFromHistory(), 1500);

        this.currentWatchState.status = 'BUILDING_DATA';
        this.currentWatchState.reason = `Switched to ${symbol}, waiting for ticks...`;
        broadcastAIUpdate(this.getCurrentAnalysis());
    }

    setUserId(userId) { this.userId = userId; }
    setConfidenceThreshold(threshold) { this.confidenceThreshold = threshold; }

    executeManualTrade(action, stake) {
        if (!this.isRunning || this.activeTrade) return;
        const currentPrice = marketData.getCurrentPrice();
        if (!currentPrice) return;
        this.executeEntry(action, currentPrice, stake, { action: action === 'BUY' ? 'CALL' : 'PUT', confidence: 80, pattern: 'Manual Trade', simple_reason: 'Manual trade' });
    }

    declineManualSetup() { this.pendingManualSetup = null; broadcastAIUpdate(this.getCurrentAnalysis()); }
    getPendingSetup() { return this.pendingManualSetup; }
    getCurrentSetup() { return this.currentWatchState; }

    isBullishPattern(p) { if (!p) return false; const l = p.toLowerCase(); return l.includes('hammer') || l.includes('bullish') || l.includes('three_white') || l.includes('soldiers'); }
    isBearishPattern(p) { if (!p) return false; const l = p.toLowerCase(); return l.includes('shooting') || l.includes('bearish') || l.includes('three_black') || l.includes('crows'); }
    isTradeableTrend(t) { return t?.includes('downtrend') || t?.includes('uptrend'); }

    hasTrendException(trend, rsi) {
        const now = Date.now();
        if (this.trendDirection !== trend) { this.trendDirection = trend; this.trendStartTime = now; }
        const d = now - this.trendStartTime;
        if (trend?.includes('strong_downtrend') && d >= this.MIN_TREND_DURATION && rsi < 25) {
            return { allowed: true, reason: `Sustained downtrend ${Math.floor(d/60000)}min` };
        }
        if (trend?.includes('strong_uptrend') && d >= this.MIN_TREND_DURATION && rsi > 75) {
            return { allowed: true, reason: `Sustained uptrend ${Math.floor(d/60000)}min` };
        }
        return { allowed: false, reason: null };
    }

    validateSetup(action, pattern, trend, rsi) {
        if (!this.isTradeableTrend(trend)) return { valid: false, reason: `SIDEWAYS: ${trend}` };
        const te = this.hasTrendException(trend, rsi);
        if (action === 'BUY' && this.isBearishPattern(pattern) && !this.isBullishPattern(pattern)) return { valid: false, reason: 'PATTERN MISMATCH' };
        if (action === 'SELL' && this.isBullishPattern(pattern) && !this.isBearishPattern(pattern)) return { valid: false, reason: 'PATTERN MISMATCH' };
        if (action === 'SELL' && rsi < 25 && !te.allowed) return { valid: false, reason: `RSI BOUNDARY: ${rsi}<25` };
        if (action === 'BUY' && rsi > 75 && !te.allowed) return { valid: false, reason: `RSI BOUNDARY: ${rsi}>75` };
        return { valid: true, reason: 'Setup validated' };
    }
}

module.exports = new AITrader();
