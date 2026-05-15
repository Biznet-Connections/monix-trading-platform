/**
 * AI Trader Service - The Professional
 * Pre-loaded trading DNA + AI enhancement + Perfect memory
 * v6.5.3 - Fixed STAT engine with real database lookup + pattern normalization + balance fetch retry
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
        this._lastPendingLog = {};
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

        this.sessionProfit = 0;
        this.sessionLoss = 0;
        this.currentBalance = 1000;

        this.PCT_MIN = 0.005;
        this.PCT_BASE = 0.01;
        this.PCT_CONFIDENT_BASE = 0.01;
        this.PCT_CONFIDENT_PROVEN = 0.02;
        this.PCT_MAX_BASE = 0.015;
        this.PCT_MAX_PROVEN = 0.03;

        this.MIN_STAKE = 0.50;
        this.BASE_STAKE = 2.00;
        this.CONFIDENT_STAKE = 2.00;
        this.HIGH_STAKE = 2.00;
        this.MAX_STAKE = 2.00;

        this.DAILY_PROFIT_TARGET_PCT = 0.05;
        this.DAILY_LOSS_LIMIT_PCT = 0.06;

        this.BLOCKED_HOURS_START = 8;
        this.BLOCKED_HOURS_END = 17;

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
    }

    roundStake(amount) {
        return Math.max(0.50, Math.round(amount * 2) / 2);
    }

    isProven() {
        if (this.recentResults.length < 20) return false;
        const recentWins = this.recentResults.slice(-20).filter(r => r === 'WIN').length;
        const recentWR = recentWins / 20;
        return recentWR >= 0.60;
    }

    recalculateStakes() {
        const bal = this.currentBalance || 1000;
        const proven = this.isProven();

        this.MIN_STAKE = this.roundStake(bal * this.PCT_MIN);
        this.BASE_STAKE = this.roundStake(bal * this.PCT_BASE);

        if (proven) {
            this.CONFIDENT_STAKE = this.roundStake(bal * this.PCT_CONFIDENT_PROVEN);
            this.MAX_STAKE = this.roundStake(bal * this.PCT_MAX_PROVEN);
        } else {
            this.CONFIDENT_STAKE = this.roundStake(bal * this.PCT_CONFIDENT_BASE);
            this.MAX_STAKE = this.roundStake(bal * this.PCT_MAX_BASE);
        }
        this.HIGH_STAKE = this.MAX_STAKE;

        if (!this._lastBalanceLog || Date.now() - this._lastBalanceLog > 3600000) {
            const provenTag = proven ? '✅ PROVEN' : '⏳ PROVING';
            console.log(`💰 [Stakes] Balance: $${bal.toFixed(2)} | ${provenTag} | MIN=$${this.MIN_STAKE} | BASE=$${this.BASE_STAKE} | CONFIDENT=$${this.CONFIDENT_STAKE} | MAX=$${this.MAX_STAKE}`);
            this._lastBalanceLog = Date.now();
        }
    }

    calculateStatisticalConfidence(pattern, session, rsi, trend, nearSR, hourUTC) {
        let totalWeight = 0;
        let weightedScore = 0;

        // 1. Pattern historical WR (25 weight)
        if (pattern && this._cachedPatternPerformance) {
            const normalizedSearch = pattern.toLowerCase().replace(/_/g, ' ').replace(/ at .*$/, '').trim();
            
            let patternPerf = this._cachedPatternPerformance.find(p =>
                p.pattern.toLowerCase() === normalizedSearch
            );
            
            if (!patternPerf) {
                patternPerf = this._cachedPatternPerformance.find(p => {
                    const dbPattern = p.pattern.toLowerCase().replace(/_/g, ' ');
                    return dbPattern.includes(normalizedSearch) || normalizedSearch.includes(dbPattern);
                });
            }
            
            if (!patternPerf) {
                const keywords = normalizedSearch.split(' ');
                for (const kw of keywords) {
                    if (kw.length < 3) continue;
                    patternPerf = this._cachedPatternPerformance.find(p =>
                        p.pattern.toLowerCase().replace(/_/g, ' ').includes(kw)
                    );
                    if (patternPerf) break;
                }
            }

            if (patternPerf && patternPerf.total >= 3) {
                const patternWR = patternPerf.winRate;
                const patternScore = Math.min(100, Math.max(10, patternWR));
                weightedScore += patternScore * this.CONF_WEIGHTS.patternHistoricalWR;
                totalWeight += this.CONF_WEIGHTS.patternHistoricalWR;
            }
        }

        // 2. Session historical WR (15 weight)
        if (session && this._cachedSessionPerformance) {
            const sessionPerf = this._cachedSessionPerformance.find(s => s.session === session);
            if (sessionPerf && sessionPerf.total >= 3) {
                const sessionWR = parseFloat(sessionPerf.winRate) || 50;
                const sessionScore = Math.min(100, Math.max(10, sessionWR));
                weightedScore += sessionScore * this.CONF_WEIGHTS.sessionHistoricalWR;
                totalWeight += this.CONF_WEIGHTS.sessionHistoricalWR;
            }
        }

        // 3. RSI zone WR (20 weight)
        if (rsi && this._cachedRSIPerformance) {
            const rsiZone = this.getRSIZone(rsi);
            const rsiPerf = this._cachedRSIPerformance.find(r => r.label && r.label.includes(rsiZone));
            if (rsiPerf && rsiPerf.total >= 3) {
                const rsiWR = rsiPerf.winRate;
                const rsiScore = Math.min(100, Math.max(10, rsiWR));
                weightedScore += rsiScore * this.CONF_WEIGHTS.rsiZoneWR;
                totalWeight += this.CONF_WEIGHTS.rsiZoneWR;
            }
        }

        // 4. Hour historical WR (15 weight)
        if (hourUTC !== undefined && this._cachedHourPerformance) {
            const hourPerf = this._cachedHourPerformance.find(h => h.hour === hourUTC);
            if (hourPerf && hourPerf.total >= 3) {
                const hourWR = hourPerf.winRate;
                const hourScore = Math.min(100, Math.max(10, hourWR));
                weightedScore += hourScore * this.CONF_WEIGHTS.hourHistoricalWR;
                totalWeight += this.CONF_WEIGHTS.hourHistoricalWR;
            }
        }

        // 5. Trend alignment (15 weight)
        if (trend && pattern) {
            const trendLower = trend.toLowerCase();
            const patternLower = pattern.toLowerCase();
            const isBullish = patternLower.includes('bullish') || patternLower.includes('hammer') || 
                             patternLower.includes('uptrend') || patternLower.includes('soldiers');
            const isBearish = patternLower.includes('bearish') || patternLower.includes('shooting') || 
                             patternLower.includes('downtrend') || patternLower.includes('crows');

            if (isBullish && !isBearish && (trendLower.includes('uptrend') || trendLower === 'sideways')) {
                weightedScore += 75 * this.CONF_WEIGHTS.trendAlignment;
                totalWeight += this.CONF_WEIGHTS.trendAlignment;
            } else if (isBearish && !isBullish && (trendLower.includes('downtrend') || trendLower === 'sideways')) {
                weightedScore += 75 * this.CONF_WEIGHTS.trendAlignment;
                totalWeight += this.CONF_WEIGHTS.trendAlignment;
            } else if (trendLower.includes('strong')) {
                weightedScore += 25 * this.CONF_WEIGHTS.trendAlignment;
                totalWeight += this.CONF_WEIGHTS.trendAlignment;
            } else {
                weightedScore += 50 * this.CONF_WEIGHTS.trendAlignment;
                totalWeight += this.CONF_WEIGHTS.trendAlignment;
            }
        }

        // 6. Near support/resistance (10 weight)
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

        this.sessionProfit = 0;
        this.sessionLoss = 0;

        // v6.5.3: Fetch balance with retry
        try {
            const bal = await derivService.getBalance();
            if (bal?.balance && bal.balance > 100) {
                this.currentBalance = bal.balance;
            }
        } catch (e) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                const bal = await derivService.getBalance();
                if (bal?.balance && bal.balance > 100) {
                    this.currentBalance = bal.balance;
                }
            } catch (e2) {
                // Keep default $1000
            }
        }
        this.recalculateStakes();

        const session = knowledgeBase.getSessionRules();
        console.log(`🤖 [AI Trader] Starting v6.5.3 FIXED STAT EDITION`);
        console.log(`📚 [AI Trader] Trading DNA loaded: ${session.name} session optimized`);
        console.log(`📊 [AI Trader] Confidence: Statistical WITH real database matching`);
        console.log(`💰 [AI Trader] Balance: $${this.currentBalance.toFixed(2)} | Stakes: Min=$${this.MIN_STAKE} | Base=$${this.BASE_STAKE} | Confident=$${this.CONFIDENT_STAKE} | MAX=$${this.MAX_STAKE}`);
        console.log(`🎯 [AI Trader] Daily target: $${(this.currentBalance * this.DAILY_PROFIT_TARGET_PCT).toFixed(2)} (5%)`);
        console.log(`🛡️ [AI Trader] Daily loss limit: $${(this.currentBalance * this.DAILY_LOSS_LIMIT_PCT).toFixed(2)} (6%)`);
        console.log(`🛑 [AI Trader] HARD BLOCK: ${this.BLOCKED_HOURS_START}:00-${this.BLOCKED_HOURS_END}:00 UTC`);
        console.log(`🛑 [AI Trader] Pauses: 15min after 3 losses | 30min after 5 losses`);
        console.log(`🔍 [AI Trader] SELL filter: 75%+ statistical confidence required`);

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
        if (this.pausedUntil > Date.now()) return;

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
                    const kbRecheck = knowledgeBase.validateSetup({
                        pattern: order.pattern,
                        currentTrend: marketState.trend,
                        rsi: marketState.rsi,
                        nearSupport: marketState.nearSupport,
                        nearResistance: marketState.nearResistance,
                        action: order.action
                    });

                    if (!kbRecheck.valid) {
                        console.log(`🛑 [AI Trader] Pending ${order.action} CANCELLED — KB re-check: ${kbRecheck.reason}`);
                        this.pendingLimitOrders.splice(i, 1);
                        continue;
                    }

                    console.log(`🎯 [AI Trader] PENDING ORDER TRIGGERED: ${order.action} @ $${currentPrice.toFixed(2)}`);
                    this.pendingLimitOrders.splice(i, 1);
                    this.executeEntry(order.action, currentPrice, order.stake, {
                        action: order.action === 'BUY' ? 'CALL' : 'PUT',
                        confidence: order.confidence,
                        pattern: order.pattern,
                        simple_reason: `Limit order triggered. ${order.reason}`
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
        console.log(`📝 [AI Trader] PENDING ORDER: ${action} @ $${entryPrice.toFixed(2)} | $${stake} | 45min`);
        return order;
    }

    async analyzeMarket() {
        try {
            if (this.isExecuting) return;
            if (this.pausedUntil > Date.now()) return;
            if (this.activeTrade) return;

            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) return;

            // HARD BLOCK: London window
            const currentHour = new Date().getUTCHours();
            if (currentHour >= this.BLOCKED_HOURS_START && currentHour < this.BLOCKED_HOURS_END) {
                if (!this._lastLondonLog || Date.now() - this._lastLondonLog > 120000) {
                    console.log(`🛑 [HARD BLOCK] ${currentHour}:00 UTC — London window. No trades.`);
                    this._lastLondonLog = Date.now();
                }
                return;
            }

            // DAILY LIMITS
            const dailyTarget = this.currentBalance * this.DAILY_PROFIT_TARGET_PCT;
            const dailyLossLimit = this.currentBalance * this.DAILY_LOSS_LIMIT_PCT;

            if (this.sessionProfit >= dailyTarget) {
                if (!this._lastDailyLog || Date.now() - this._lastDailyLog > 300000) {
                    console.log(`🎯 [Daily Target] +$${this.sessionProfit.toFixed(2)} reached. Locked.`);
                    this._lastDailyLog = Date.now();
                }
                return;
            }

            if (this.sessionLoss >= dailyLossLimit) {
                if (!this._lastDailyLog || Date.now() - this._lastDailyLog > 300000) {
                    console.log(`🛑 [Daily Limit] -$${this.sessionLoss.toFixed(2)} hit. Stopping.`);
                    this._lastDailyLog = Date.now();
                }
                this.pausedUntil = Date.now() + 86400000;
                this.pendingLimitOrders = [];
                return;
            }

            const marketState = marketData.getMarketState();
            const currentPrice = marketState.price;
            if (this.tickCount > 10 && Date.now() - this.lastTickTime > 60000) return;

            const candleCount = marketState.candleCount;
            if (candleCount < this.MIN_CANDLES_FOR_TRADE) {
                if (candleCount % 3 === 0) console.log(`🔍 [AI Trader] Building: ${candleCount}/${this.MIN_CANDLES_FOR_TRADE} candles`);
                return;
            }
            if (!this.dataReady) this.dataReady = true;

            this.recalculateStakes();

            // Cache performance data
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
                if (t.status === 'WIN') hourStats[h].wins++;
                else hourStats[h].losses++;
            });
            for (const [hour, data] of Object.entries(hourStats)) {
                if (data.total >= 2) {
                    this._cachedHourPerformance.push({
                        hour: parseInt(hour),
                        winRate: Math.round((data.wins / data.total) * 100),
                        total: data.total
                    });
                }
            }

            // API SAVER
            const isNeutralMarket =
                marketState.rsi >= 45 && marketState.rsi <= 55 &&
                !marketState.nearSupport && !marketState.nearResistance &&
                (marketState.lastPattern === 'no_significant_pattern' ||
                 marketState.lastPattern === 'doji' ||
                 marketState.lastPattern === 'none');

            if (isNeutralMarket && this.mode === 'AUTO') {
                if (!this._lastSkipLog || Date.now() - this._lastSkipLog > 60000) {
                    console.log(`⏭️ [API Saver] Neutral RSI (${marketState.rsi}), no pattern — skipping.`);
                    this._lastSkipLog = Date.now();
                }
                return;
            }

            // RSI NEUTRAL BLOCKER
            if (marketState.rsi >= 45 && marketState.rsi <= 55 && !marketState.nearSupport && !marketState.nearResistance) {
                if (!this._lastRSILog || Date.now() - this._lastRSILog > 60000) {
                    console.log(`🛑 [RSI Filter] RSI neutral (${marketState.rsi}) — no edge.`);
                    this._lastRSILog = Date.now();
                }
                return;
            }

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

            const sessionRules = knowledgeBase.getSessionRules();
            dynamicThreshold += sessionRules.confidenceModifier;
            dynamicThreshold = Math.max(50, Math.min(80, dynamicThreshold));

            const recentTrades = await Trade.getUserTrades(this.userId, 5);
            const topPatterns = await Pattern.getTopPatterns(5);

            const marketContext = {
                trend: marketState.trend || 'sideways',
                volatility: marketState.volatility || 0,
                rsiShort: marketState.rsiShort || marketState.rsi,
                lastPattern: marketState.lastPattern || 'none',
                consecutiveLosses: this.consecutiveLosses,
                recentWinRate: this.recentResults.length >= 5 ?
                    Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100) : null,
                patternPerformance: this._cachedPatternPerformance,
                nearSupport: marketState.nearSupport,
                nearResistance: marketState.nearResistance,
                support: marketState.support,
                resistance: marketState.resistance
            };

            const analysis = await deepseekService.analyzeMarket(
                this.symbol, currentPrice, marketState.rsi, 'neutral', null, recentTrades, topPatterns, marketContext
            );

            // Normalize pattern name BEFORE statistical confidence
            if (analysis.pattern) {
                analysis.pattern = deepseekService.normalizePatternName(analysis.pattern);
            }

            const action = analysis.action === 'CALL' ? 'BUY' : (analysis.action === 'PUT' ? 'SELL' : 'WAIT');

            const sessionName = this.getCurrentSession();
            const nearSR = marketState.nearSupport || marketState.nearResistance;
            const statisticalConfidence = this.calculateStatisticalConfidence(
                analysis.pattern, sessionName, marketState.rsi, marketState.trend, nearSR, currentHour
            );

            if (shouldLog || action !== 'WAIT') {
                console.log(`📊 [AI Trader] DeepSeek: ${analysis.action} | AI:${analysis.confidence}% | STAT:${statisticalConfidence}% | ${analysis.pattern}`);
            }

            const effectiveConfidence = statisticalConfidence;

            if (action !== 'WAIT' && effectiveConfidence >= dynamicThreshold) {
                // SELL filter
                if (action === 'SELL' && effectiveConfidence < 75) {
                    if (shouldLog) {
                        console.log(`🛑 [SELL Filter] SELL requires 75%+ stat confidence. Got ${effectiveConfidence}%.`);
                    }
                    return;
                }

                let kbValidation = knowledgeBase.validateSetup({
                    pattern: analysis.pattern, currentTrend: marketState.trend,
                    rsi: marketState.rsi, nearSupport: marketState.nearSupport,
                    nearResistance: marketState.nearResistance, action: action
                });

                if (!kbValidation.valid && kbValidation.reason?.includes('SESSION')) {
                    const currentPattern = this._cachedPatternPerformance?.find(p =>
                        p.pattern.toLowerCase() === (analysis.pattern || '').toLowerCase()
                    );
                    if (currentPattern && currentPattern.winRate >= 65 && currentPattern.total >= 5 && effectiveConfidence >= 70) {
                        kbValidation = {
                            valid: true, action, confidence: effectiveConfidence,
                            reason: `ASIAN OVERRIDE: "${analysis.pattern}" has ${currentPattern.winRate}% WR.`,
                            confirmations: 3, source: 'ASIAN_OVERRIDE', sessionModifier: 0
                        };
                    }
                }

                if (!kbValidation.valid && kbValidation.reason?.includes('SIDEWAYS')) {
                    const currentPattern = this._cachedPatternPerformance?.find(p =>
                        p.pattern.toLowerCase() === (analysis.pattern || '').toLowerCase()
                    );
                    if (currentPattern && currentPattern.winRate >= 70 && currentPattern.total >= 5 && effectiveConfidence >= 75) {
                        kbValidation = {
                            valid: true, action, confidence: effectiveConfidence,
                            reason: `SIDEWAYS OVERRIDE: "${analysis.pattern}" has ${currentPattern.winRate}% WR.`,
                            confirmations: 3, source: 'SIDEWAYS_OVERRIDE', sessionModifier: 0
                        };
                    }
                }

                if (!kbValidation.valid) {
                    if (shouldLog) console.log(`🧬 [AI Trader] KB REJECTED: ${kbValidation.reason}`);
                    if (kbValidation.reason?.includes('TREND CONTRADICTION') ||
                        kbValidation.reason?.includes('TREND_RULE') ||
                        kbValidation.reason?.includes('PATTERN MISMATCH')) {
                        return;
                    }
                    if (marketState.nearSupport || marketState.nearResistance) {
                        const pendingStake = this.calculateStake(effectiveConfidence, 0, marketState.trend);
                        let entryLevel, pendingAction;
                        if (analysis.action === 'CALL' && (marketState.nearSupport || marketState.support > 0)) {
                            pendingAction = 'BUY'; entryLevel = marketState.support || currentPrice * 0.998;
                        } else if (analysis.action === 'PUT' && (marketState.nearResistance || marketState.resistance > 0)) {
                            pendingAction = 'SELL'; entryLevel = marketState.resistance || currentPrice * 1.002;
                        } else if (marketState.nearSupport) {
                            pendingAction = 'BUY'; entryLevel = marketState.support;
                        } else {
                            pendingAction = 'SELL'; entryLevel = marketState.resistance;
                        }
                        if (entryLevel && entryLevel > 0) {
                            this.createPendingOrder({
                                action: pendingAction, entryPrice: entryLevel,
                                stake: pendingStake, confidence: effectiveConfidence,
                                pattern: analysis.pattern, reason: kbValidation.reason
                            });
                        }
                    }
                    return;
                }

                const currentPattern = this._cachedPatternPerformance?.find(p =>
                    p.pattern.toLowerCase() === (analysis.pattern || '').toLowerCase()
                );
                const patternWinRate = currentPattern?.winRate || 0;
                const stake = this.calculateStake(effectiveConfidence, patternWinRate, marketState.trend);

                console.log(`✅ [AI Trader] VALIDATED: ${action} ${this.symbol} | STAT:${effectiveConfidence}% | Stake:$${stake}`);
                console.log(`🧬 [AI Trader] Source: ${kbValidation.source} | ${kbValidation.reason}`);

                if (this.mode === 'AUTO') {
                    await this.executeEntry(action, currentPrice, stake, {
                        action: analysis.action, confidence: effectiveConfidence,
                        pattern: analysis.pattern,
                        simple_reason: `[${kbValidation.source}] ${kbValidation.reason} | STAT:${effectiveConfidence}%`
                    });
                }
                return;
            }

            this.currentWatchState = {
                status: 'WATCHING', action: 'WAIT', symbol: this.symbol,
                confidence: effectiveConfidence || analysis.confidence,
                reason: analysis.simple_reason || 'Waiting for validated setup',
                pattern: analysis.pattern, market_price: currentPrice,
                market_rsi: marketState.rsi, trend: marketState.trend,
                lastUpdate: Date.now(), is_auto_mode: this.mode === 'AUTO',
                confidence_threshold: dynamicThreshold,
                pending_orders: this.pendingLimitOrders.length,
                total_trades: this.totalTrades, total_wins: this.totalWins,
                total_losses: this.totalLosses,
                session_profit: this.sessionProfit, session_loss: this.sessionLoss
            };

        } catch (error) {
            console.error('❌ [AI Trader] Analysis error:', error.message);
        }
    }

    calculateStake(confidence, patternWinRate, trend) {
        this.recalculateStakes();

        if (this.consecutiveLosses >= 2) {
            console.log(`📉 [Stake] Losing streak (${this.consecutiveLosses}) — MIN STAKE ($${this.MIN_STAKE})`);
            return this.MIN_STAKE;
        }

        if (this.sessionProfit >= this.currentBalance * this.DAILY_PROFIT_TARGET_PCT) {
            console.log(`🎯 [Stake] Daily target hit — MIN STAKE ($${this.MIN_STAKE})`);
            return this.MIN_STAKE;
        }

        if (this.sessionProfit >= this.currentBalance * 0.02) {
            console.log(`🔒 [Stake] Profit lock — max BASE ($${this.BASE_STAKE})`);
            if (confidence >= 85 && patternWinRate >= 70) return this.BASE_STAKE;
            return this.MIN_STAKE;
        }

        if (this.sessionProfit >= this.currentBalance * 0.01) {
            console.log(`🔒 [Stake] Profit protection — max BASE ($${this.BASE_STAKE})`);
            if (confidence >= 85 && patternWinRate >= 70) return this.BASE_STAKE;
            return this.MIN_STAKE;
        }

        const recentWins = this.recentResults.slice(-5).filter(r => r === 'WIN').length;
        const last3AreWins = this.recentResults.length >= 3 && this.recentResults.slice(-3).every(r => r === 'WIN');
        const last2AreWins = this.recentResults.length >= 2 && this.recentResults.slice(-2).every(r => r === 'WIN');

        if (last3AreWins && this.consecutiveLosses === 0 && recentWins >= 3 && this.isProven()) {
            console.log(`📈 [Stake] 3-win streak + PROVEN — CONFIDENT ($${this.CONFIDENT_STAKE})`);
            return this.CONFIDENT_STAKE;
        }

        if (last2AreWins && this.consecutiveLosses === 0 && recentWins >= 2) {
            console.log(`📈 [Stake] 2-win streak — BASE ($${this.BASE_STAKE})`);
            return this.BASE_STAKE;
        }

        if (confidence >= 80 && patternWinRate >= 65 && this.consecutiveLosses === 0) {
            console.log(`📈 [Stake] High confidence — BASE ($${this.BASE_STAKE})`);
            return this.BASE_STAKE;
        }

        console.log(`📉 [Stake] Default — MIN ($${this.MIN_STAKE})`);
        return this.MIN_STAKE;
    }

    async executeEntry(action, entryPrice, stake, analysis) {
        if (this.isExecuting || this.activeTrade) return;
        this.isExecuting = true;
        try {
            const user = await User.findById(this.userId);
            if (!user || user.trades_remaining <= 0) return;
            if (stake < 0.50) return;
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
            if (this.recentResults.length > 30) this.recentResults.shift();

            if (status === 'WIN') {
                this.totalWins++; this.consecutiveLosses = 0;
                this.sessionProfit += profit;
                console.log(`🎉 WIN! +$${Math.abs(profit).toFixed(2)} | ${this.totalWins}W/${this.totalLosses}L | Session: +$${this.sessionProfit.toFixed(2)}`);
            } else {
                this.totalLosses++; this.consecutiveLosses++;
                this.sessionLoss += Math.abs(profit);
                console.log(`❌ LOSS #${this.consecutiveLosses} | ${this.totalWins}W/${this.totalLosses}L | Session: +$${this.sessionProfit.toFixed(2)} / -$${this.sessionLoss.toFixed(2)}`);

                if (this.consecutiveLosses >= 5) {
                    this.pausedUntil = Date.now() + 1800000;
                    this.pendingLimitOrders = [];
                    console.log('🛑 HARD PAUSE 30min — 5 consecutive losses.');
                } else if (this.consecutiveLosses >= 3) {
                    this.pausedUntil = Date.now() + 900000;
                    this.pendingLimitOrders = [];
                    console.log('🛑 HARD PAUSE 15min — 3 consecutive losses.');
                }
            }

            try { const bal = await derivService.getBalance(); if (bal?.balance) this.currentBalance = bal.balance; } catch (e) {}

            broadcastTradeResult({ id: tradeId, contract_id: contractId, symbol: this.symbol, action: this.activeTrade?.action, entry_price: entryPrice, exit_price: exitPrice, profit, stake, status });
            const winRate = this.recentResults.length > 0 ? Math.round((this.recentResults.filter(r => r === 'WIN').length / this.recentResults.length) * 100) : 0;
            console.log(`📊 Trade #${tradeId}: ${status} $${profit.toFixed(2)} | Recent: ${winRate}% | ${this.totalWins}W/${this.totalLosses}L`);
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
            type: 'ai_update', watch_state: this.currentWatchState,
            in_trade: !!this.activeTrade, active_trade: this.activeTrade,
            pending_orders: this.pendingLimitOrders.map(o => ({
                id: o.id, action: o.action, entryPrice: o.entryPrice, stake: o.stake,
                confidence: o.confidence, pattern: o.pattern, reason: o.reason,
                created: o.createdAt, expires: o.expiresAt
            })),
            data_ready: this.dataReady, mode: this.mode, tick_count: this.tickCount,
            total_trades: this.totalTrades, total_wins: this.totalWins, total_losses: this.totalLosses,
            session_profit: this.sessionProfit, session_loss: this.sessionLoss, timestamp: Date.now()
        };
    }

    stop() { this.isRunning = false; if (this.analysisInterval) { clearInterval(this.analysisInterval); this.analysisInterval = null; } if (this.tickHealthInterval) { clearInterval(this.tickHealthInterval); this.tickHealthInterval = null; } console.log('🤖 Stopped'); }
    setMode(mode) { this.mode = mode; this.pendingLimitOrders = []; this._lastPendingLog = {}; console.log(`Mode: ${mode}`); }
    setSymbol(symbol) { this.symbol = symbol; this.dataReady = false; this.trendStartTime = 0; this.trendDirection = null; marketData.reset(); derivService.subscribeToTicks(symbol).catch(() => {}); this.tickCount = 0; this.pendingLimitOrders = []; this._lastPendingLog = {}; this.currentWatchState.status = 'BUILDING_DATA'; broadcastAIUpdate(this.getCurrentAnalysis()); }
    setUserId(userId) { this.userId = userId; }
    setConfidenceThreshold(threshold) { this.confidenceThreshold = threshold; }

    executeManualTrade(action, stake) {
        if (!this.isRunning || this.activeTrade) return;
        const currentPrice = marketData.getCurrentPrice();
        if (!currentPrice) return;
        const analysis = { action: action === 'BUY' ? 'CALL' : 'PUT', confidence: 80, pattern: 'Manual Trade', simple_reason: 'Manual trade' };
        this.executeEntry(action, currentPrice, stake, analysis);
    }

    declineManualSetup() { this.pendingManualSetup = null; broadcastAIUpdate(this.getCurrentAnalysis()); }
    getPendingSetup() { return this.pendingManualSetup; }
    getCurrentSetup() { return this.currentWatchState; }

    isBullishPattern(p) { if (!p) return false; const l = p.toLowerCase(); return l.includes('hammer') || l.includes('bullish') || l.includes('three_white') || l.includes('soldiers') || l.includes('bounce') || l.includes('support'); }
    isBearishPattern(p) { if (!p) return false; const l = p.toLowerCase(); return l.includes('shooting') || l.includes('bearish') || l.includes('three_black') || l.includes('crows') || l.includes('downtrend') || l.includes('resistance') || l.includes('overbought'); }
    isTradeableTrend(t) { return t?.includes('downtrend') || t?.includes('uptrend'); }

    hasTrendException(trend, rsi) {
        const now = Date.now();
        if (this.trendDirection !== trend) { this.trendDirection = trend; this.trendStartTime = now; }
        const d = now - this.trendStartTime; const s = d >= this.MIN_TREND_DURATION;
        if (trend?.includes('strong_downtrend') && s && rsi < 25) return { allowed: true, reason: `Sustained strong downtrend ${Math.floor(d/60000)}min` };
        if (trend?.includes('strong_uptrend') && s && rsi > 75) return { allowed: true, reason: `Sustained strong uptrend ${Math.floor(d/60000)}min` };
        return { allowed: false, reason: null };
    }

    validateSetup(action, pattern, trend, rsi) {
        if (!this.isTradeableTrend(trend)) return { valid: false, reason: `SIDEWAYS: ${trend}` };
        const te = this.hasTrendException(trend, rsi);
        if (action === 'BUY' && this.isBearishPattern(pattern) && !this.isBullishPattern(pattern)) return { valid: false, reason: 'PATTERN MISMATCH' };
        if (action === 'SELL' && this.isBullishPattern(pattern) && !this.isBearishPattern(pattern)) return { valid: false, reason: 'PATTERN MISMATCH' };
        if (action === 'SELL' && rsi < 25 && !te.allowed) return { valid: false, reason: `RSI BOUNDARY: ${rsi}<25` };
        if (action === 'BUY' && rsi > 75 && !te.allowed) return { valid: false, reason: `RSI BOUNDARY: ${rsi}>75` };
        if (action === 'BUY' && trend?.includes('downtrend') && rsi > 35 && !te.allowed) return { valid: false, reason: 'TREND CONTRADICTION' };
        if (action === 'SELL' && trend?.includes('uptrend') && rsi < 65 && !te.allowed) return { valid: false, reason: 'TREND CONTRADICTION' };
        return { valid: true, reason: 'Setup validated' };
    }
}

module.exports = new AITrader();
