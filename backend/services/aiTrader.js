/**
 * AI Trader Service - The Professional
 * v13.0.4 - LONDON OVERRIDE: Exceptional setups only (quality > 85, pattern WR > 75%)
 * TARGET: 5+ quality trades per day
 */
const marketData = require('./marketData');
const deepseekService = require('./deepseekService');
const derivService = require('./derivService');
const Trade = require('../models/Trade');
const User = require('../models/User');
const Pattern = require('../models/Pattern');
const knowledgeBase = require('./knowledgeBase');
const { broadcastAIUpdate, broadcastTradeResult, broadcastNotification, broadcastNewSetup, broadcastSymbolSwitch } = require('../utils/websocket');

class AITrader {
    constructor() {
        this.isRunning = false;
        this.analysisInterval = null;
        this.tickHealthInterval = null;
        this.balanceSyncInterval = null;
        this.opportunityScanInterval = null;
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
        this.userId = null;
        this.symbol = 'R_75';
        this.mode = 'AUTO';
        this.lastSetupNotified = false;
        this.currentSetupId = null;
        this.confidenceThreshold = 65;
        this.consecutiveLosses = 0;
        this.consecutiveWins = 0;
        this.recentResults = [];
        this.lastTradeTime = 0;
        this.tradeCooldown = 30000;
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
        this.dailyStartBalance = 1000;
        this.dailyProfitTarget = 0.05;
        this.dailyLossLimit = 0.05;
        this.dailyProfitReached = false;
        this.dailyLossReached = false;

        // 🚀 SWING TRADER MODE: Bigger wins, breathing room
        this.PROFIT_TARGET_PCT = 0.08;   // 8% profit target - BIGGER WINS
        this.STOP_LOSS_PCT = 0.02;       // 2% stop loss - BREATHING ROOM
        this.MAX_TRADE_DURATION = 300000; // 5 minutes max
        this.MAX_STAKE_LIMIT = 25;
        this.MIN_STAKE_LIMIT = 1;
        
        this.watchedSymbols = ['R_75'];
        this.symbolKnowledge = {};
        this.currentOpportunityScore = 0;
        this.lastSwitchTime = 0;
        this.minTimeOnSymbol = 5 * 60 * 1000;
        this.switchCooldown = 2 * 60 * 1000;

        this.blockedSessions = {};
        this.sessionTradeCount = {};
        this._londonBlocked = false;
        this._londonWR = 0;
        this._londonTotal = 0;

        this.lossReasons = {
            WRONG_TREND: 0,
            BAD_SESSION: 0,
            RSI_OUTSIDE_RANGE: 0,
            PATTERN_FAILED: 0,
            NO_CONFIRMATION: 0,
            STOP_LOSS_HIT: 0,
            TIMEOUT: 0
        };

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
        this._lastLossPauseLog = 0;
        this._lastSessionBlockLog = {};
        this._londonBlockLog = 0;
        this._rsiBlockLog = 0;
        this._dailyTradeCount = 0;
        this._dailyResetTime = 0;
        
        this.handleContractUpdate = this.handleContractUpdate.bind(this);
    }

    roundStake(amount) {
        return Math.max(this.MIN_STAKE_LIMIT, Math.min(this.MAX_STAKE_LIMIT, Math.round(amount * 2) / 2));
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

        let stakeMultiplier = 1.0;
        if (this.consecutiveWins >= 3) {
            stakeMultiplier = 1.25;
            console.log(`📈 [Psychology] Win streak: ${this.consecutiveWins} → Stake +25%`);
        } else if (this.consecutiveLosses >= 3) {
            stakeMultiplier = 0.5;
            console.log(`📉 [Psychology] Loss streak: ${this.consecutiveLosses} → Stake -50%`);
        } else if (this.consecutiveLosses >= 2) {
            stakeMultiplier = 0.75;
        }

        this.MIN_STAKE = this.roundStake(bal * pctMin * stakeMultiplier);
        this.BASE_STAKE = this.roundStake(bal * pctBase * stakeMultiplier);
        this.CONFIDENT_STAKE = this.roundStake(bal * pctConfident * stakeMultiplier);
        this.MAX_STAKE = this.roundStake(bal * pctMax * stakeMultiplier);
        this.HIGH_STAKE = this.MAX_STAKE;

        if (this.MIN_STAKE > this.MAX_STAKE_LIMIT) this.MIN_STAKE = this.MAX_STAKE_LIMIT;
        if (this.BASE_STAKE > this.MAX_STAKE_LIMIT) this.BASE_STAKE = this.MAX_STAKE_LIMIT;
        if (this.CONFIDENT_STAKE > this.MAX_STAKE_LIMIT) this.CONFIDENT_STAKE = this.MAX_STAKE_LIMIT;
        if (this.MAX_STAKE > this.MAX_STAKE_LIMIT) this.MAX_STAKE = this.MAX_STAKE_LIMIT;
        if (this.MIN_STAKE < this.MIN_STAKE_LIMIT) this.MIN_STAKE = this.MIN_STAKE_LIMIT;
        if (this.BASE_STAKE < this.MIN_STAKE_LIMIT) this.BASE_STAKE = this.MIN_STAKE_LIMIT;
        if (this.CONFIDENT_STAKE < this.MIN_STAKE_LIMIT) this.CONFIDENT_STAKE = this.MIN_STAKE_LIMIT;
        if (this.MAX_STAKE < this.MIN_STAKE_LIMIT) this.MAX_STAKE = this.MIN_STAKE_LIMIT;

        if (!this._lastBalanceLog || Date.now() - this._lastBalanceLog > 3600000) {
            const provenTag = this.isProven() ? '✅ PROVEN' : '⏳ PROVING';
            console.log(`💰 [Stakes] Balance: $${bal.toFixed(2)} | Tier: ${tier} | ${provenTag} | MIN=$${this.MIN_STAKE} | BASE=$${this.BASE_STAKE} | CONFIDENT=$${this.CONFIDENT_STAKE} | MAX=$${this.MAX_STAKE} (Capped at $${this.MAX_STAKE_LIMIT})`);
            this._lastBalanceLog = Date.now();
        }
    }

    async updateDailyLimits() {
        const today = new Date().toDateString();
        if (this._lastDailyReset !== today) {
            this.dailyStartBalance = this.currentBalance;
            this.dailyProfitReached = false;
            this.dailyLossReached = false;
            this.sessionProfit = 0;
            this.sessionLoss = 0;
            this._dailyTradeCount = 0;
            this._dailyResetTime = Date.now();
            this._lastDailyReset = today;
            console.log(`📅 [Daily] Reset. Start balance: $${this.dailyStartBalance.toFixed(2)} | Target: $${(this.dailyStartBalance * this.dailyProfitTarget).toFixed(2)} | Loss limit: $${(this.dailyStartBalance * this.dailyLossLimit).toFixed(2)}`);
        }

        const todayProfit = this.currentBalance - this.dailyStartBalance;
        const targetProfit = this.dailyStartBalance * this.dailyProfitTarget;
        const lossLimit = this.dailyStartBalance * this.dailyLossLimit;

        if (todayProfit >= targetProfit && !this.dailyProfitReached) {
            this.dailyProfitReached = true;
            this.pausedUntil = Date.now() + 86400000;
            console.log(`🎯 [Daily Target] Target reached! +$${todayProfit.toFixed(2)}. Stopping for the day.`);
            broadcastNotification('Daily Target Met', `+$${todayProfit.toFixed(2)} profit. Bot paused until tomorrow.`, 'success');
            return true;
        }

        if (todayProfit <= -lossLimit && !this.dailyLossReached) {
            this.dailyLossReached = true;
            this.pausedUntil = Date.now() + 86400000;
            console.log(`🛑 [Daily Limit] Loss limit reached! -$${Math.abs(todayProfit).toFixed(2)}. Stopping for the day.`);
            broadcastNotification('Daily Loss Limit Hit', `-$${Math.abs(todayProfit).toFixed(2)} loss. Bot paused until tomorrow.`, 'error');
            return true;
        }

        return false;
    }

    async isSessionBlocked(session) {
        const stats = this.blockedSessions[session];
        if (!stats || stats.total < 10) return false;
        
        const winRate = (stats.wins / stats.total) * 100;
        if (winRate < 30 && stats.total >= 10) {
            if (!this._lastSessionBlockLog[session] || Date.now() - this._lastSessionBlockLog[session] > 3600000) {
                console.log(`🚫 [Session Block] ${session} blocked - ${winRate.toFixed(1)}% WR over ${stats.total} trades`);
                this._lastSessionBlockLog[session] = Date.now();
            }
            return true;
        }
        return false;
    }

    recordSessionTrade(session, isWin) {
        if (!this.blockedSessions[session]) {
            this.blockedSessions[session] = { wins: 0, losses: 0, total: 0 };
        }
        if (isWin) this.blockedSessions[session].wins++;
        else this.blockedSessions[session].losses++;
        this.blockedSessions[session].total++;
    }

    async tagLossReason(tradeId, reason) {
        this.lossReasons[reason]++;
        await Trade.updateLossReason(tradeId, reason);
        console.log(`🏷️ [Loss Tag] ${reason} - ${this.lossReasons[reason]} total`);
    }

    async getOpportunityScore(symbol, currentConditions) {
        const knowledge = this.symbolKnowledge[symbol];
        if (!knowledge || knowledge.totalTrades < 5) return 50;

        let score = 50;

        const winRate = knowledge.wins / knowledge.totalTrades;
        score += (winRate - 0.5) * 60;

        const sessionPerf = knowledge.sessionPerformance[currentConditions.session];
        if (sessionPerf && sessionPerf.total >= 3) {
            const sessionWR = sessionPerf.wins / sessionPerf.total;
            score += (sessionWR - 0.5) * 50;
        }

        const recentTrades = knowledge.recentTrades || [];
        if (recentTrades.length >= 5) {
            const recentWR = recentTrades.filter(t => t.status === 'WIN').length / recentTrades.length;
            score += (recentWR - 0.5) * 40;
        }

        return Math.min(100, Math.max(0, score));
    }

    async findBestSymbol() {
        return { bestSymbol: this.symbol, bestScore: 50, alternatives: [] };
    }

    getTopAlternatives(count) {
        return [];
    }

    async switchSymbol(newSymbol) {
        console.log(`🔄 [AI Trader] Switching symbol to ${newSymbol}`);
        this.symbol = newSymbol;
        this.dataReady = false;
        this.tickCount = 0;
        this.lastTickTime = Date.now();
        
        marketData.reset();
        
        try {
            await derivService.subscribeToTicks(newSymbol);
            console.log(`✅ [AI Trader] Subscribed to ${newSymbol}`);
            setTimeout(() => this.seedCandlesFromHistory(), 1500);
        } catch (err) {
            console.error(`❌ [AI Trader] Subscribe failed:`, err.message);
        }
        
        this.currentWatchState.status = 'SWITCHED_SYMBOL';
        this.currentWatchState.symbol = newSymbol;
        this.currentWatchState.reason = `Switched to ${newSymbol} - better opportunity detected`;
        broadcastAIUpdate(this.getCurrentAnalysis());
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
            if (londonWR < 30 && londonPerf.total >= 10) {
                if (!this._lastLondonLog || Date.now() - this._lastLondonLog > 3600000) {
                    console.log(`🛑 [London Block] ${this.symbol} blocked - ${londonWR}% WR over ${londonPerf.total} trades`);
                    this._lastLondonLog = Date.now();
                }
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
                const newBalance = balanceResult.balance;
                if (Math.abs(newBalance - this.currentBalance) > 0.01) {
                    console.log(`💰 [AI Trader] Balance updated: $${this.currentBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
                    this.currentBalance = newBalance;
                    await this.updateDailyLimits();
                    this.recalculateStakes();
                }
            }
        } catch (error) {
            console.error('❌ [AI Trader] Failed to sync balance:', error.message);
        }
    }

    async seedCandlesFromHistory() {
        try {
            const result = await derivService.getCandles(this.symbol, 60, 30);
            if (result?.success && result.candles && result.candles.length > 0) {
                let seeded = 0;
                result.candles.forEach(c => {
                    if (c.close) {
                        marketData.addTick({ epoch: c.epoch, quote: c.close });
                        seeded++;
                    }
                });
                if (seeded > 0) {
                    console.log(`📊 [AI Trader] Seeded ${seeded} candles for ${this.symbol}`);
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
        if (this.consecutiveWins >= 2) score += 10;
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

    async handleContractUpdate(contract) {
        if (!this.activeTrade || contract.contract_id !== this.activeTrade.contract_id) return;
        
        const rawProfit = contract.profit !== undefined && contract.profit !== null ? contract.profit : 0;
        let currentProfit = Number(rawProfit);
        if (isNaN(currentProfit)) currentProfit = 0;
        
        const stake = this.activeTrade.stake;
        const targetProfit = stake * this.PROFIT_TARGET_PCT;
        const maxLoss = stake * this.STOP_LOSS_PCT;
        
        console.log(`📊 [Trade Monitor] Contract ${contract.contract_id}: Profit=$${currentProfit.toFixed(2)} | Target=$${targetProfit.toFixed(2)} | Stop=$${maxLoss.toFixed(2)}`);
        
        if (currentProfit >= targetProfit) {
            console.log(`🎯 PROFIT TARGET HIT! Closing trade at +$${currentProfit.toFixed(2)}`);
            await this.closeTrade(contract.contract_id, currentProfit, 'WIN');
        } else if (currentProfit <= -maxLoss) {
            console.log(`🛑 STOP LOSS HIT! Closing trade at -$${Math.abs(currentProfit).toFixed(2)}`);
            await this.closeTrade(contract.contract_id, currentProfit, 'LOSS');
        } else if (contract.is_sold === 1 || contract.status === 'sold') {
            console.log(`🏁 Contract ${contract.contract_id} sold! Profit: $${currentProfit.toFixed(2)}`);
            const status = currentProfit > 0 ? 'WIN' : 'LOSS';
            await this.closeTrade(contract.contract_id, currentProfit, status);
        }
    }

    async closeTrade(contractId, profit, status) {
        if (!this.activeTrade || this.activeTrade.contract_id !== contractId) return;
        
        let finalProfit = Number(profit);
        if (isNaN(finalProfit)) finalProfit = 0;
        
        try {
            const tradeId = this.activeTrade.id;
            const entryPrice = this.activeTrade.entry_price;
            const stake = this.activeTrade.stake;
            
            let exitPrice = entryPrice;
            if (status === 'WIN') {
                exitPrice = entryPrice * (1 + (finalProfit / stake));
            } else {
                exitPrice = entryPrice * (1 - (Math.abs(finalProfit) / stake));
            }
            
            console.log(`📝 Closing trade #${tradeId}: ${status} | Profit: $${finalProfit.toFixed(2)} | Exit: $${exitPrice.toFixed(2)}`);
            
            await Trade.updateResult(tradeId, exitPrice, finalProfit, status);
            await User.updateStats(this.userId, status, finalProfit, stake);
            await Pattern.recordTradeResult(this.activeTrade.pattern, this.symbol, this.activeTrade.action, this.getCurrentSession(), status === 'WIN');
            
            this.recentResults.push(status);
            if (this.recentResults.length > 30) this.recentResults.shift();
            
            if (status === 'WIN') {
                this.totalWins++;
                this.consecutiveWins++;
                this.consecutiveLosses = 0;
                this.sessionProfit += finalProfit;
                console.log(`🎉 WIN! +$${Math.abs(finalProfit).toFixed(2)} | Streak: ${this.consecutiveWins}W/${this.consecutiveLosses}L`);
            } else {
                this.totalLosses++;
                this.consecutiveLosses++;
                this.consecutiveWins = 0;
                this.sessionLoss += Math.abs(finalProfit);
                console.log(`❌ LOSS #${this.consecutiveLosses} | -$${Math.abs(finalProfit).toFixed(2)}`);
                this.recordSessionTrade(this.getCurrentSession(), false);
                await this.tagLossReason(tradeId, 'STOP_LOSS_HIT');
            }
            
            broadcastTradeResult({
                id: tradeId,
                contract_id: contractId,
                symbol: this.symbol,
                action: this.activeTrade.action,
                entry_price: entryPrice,
                exit_price: exitPrice,
                profit: finalProfit,
                stake: stake,
                status: status
            });
            
            try {
                const bal = await derivService.getBalance();
                if (bal?.balance) {
                    this.currentBalance = bal.balance;
                    await this.updateDailyLimits();
                    this.recalculateStakes();
                    console.log(`💰 New Balance: $${this.currentBalance.toFixed(2)}`);
                }
            } catch (e) {}
            
            this.activeTrade = null;
            
        } catch (error) {
            console.error(`❌ Close trade error:`, error.message);
        }
    }

    async start(userId, symbol = 'R_75', mode = 'AUTO') {
        if (this.isRunning) {
            console.log('⚠️ [AI Trader] Already running, stopping first...');
            this.stop();
        }

        this.userId = userId;

        try {
            const user = await User.findById(userId);
            if (!user) {
                console.error(`❌ [AI Trader] User ${userId} not found`);
                this.currentWatchState = {
                    status: 'ERROR',
                    action: 'WAIT',
                    symbol: symbol,
                    confidence: 0,
                    reason: `User not found. Please log in again.`,
                    lastUpdate: Date.now()
                };
                broadcastAIUpdate({ watch_state: this.currentWatchState });
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

            if (!token || token.trim().length < 10) {
                console.error(`❌ [AI Trader] No valid Deriv token found for user ${userId}`);
                this.currentWatchState = {
                    status: 'NO_TOKEN',
                    action: 'WAIT',
                    symbol: this.symbol,
                    confidence: 0,
                    reason: `No API token configured. Please add your ${user.is_demo ? 'DEMO' : 'REAL'} token in Settings.`,
                    lastUpdate: Date.now()
                };
                broadcastAIUpdate({ watch_state: this.currentWatchState });
                return;
            }

            console.log(`🔑 [AI Trader] Connecting to Deriv with ${user.is_demo ? 'DEMO' : 'REAL'} account...`);

            try {
                await derivService.connect(token, false, user.is_demo);
                console.log(`✅ [AI Trader] Connected to Deriv successfully!`);
            } catch (connError) {
                console.error(`❌ [AI Trader] Failed to connect:`, connError.message);
                this.currentWatchState = {
                    status: 'CONNECTION_ERROR',
                    action: 'WAIT',
                    symbol: this.symbol,
                    confidence: 0,
                    reason: `Failed to connect to Deriv: ${connError.message}. Please check your API token.`,
                    lastUpdate: Date.now()
                };
                broadcastAIUpdate({ watch_state: this.currentWatchState });
                return;
            }

        } catch (err) {
            console.error(`❌ [AI Trader] Failed to get user:`, err.message);
            this.currentWatchState = {
                status: 'ERROR',
                action: 'WAIT',
                symbol: this.symbol,
                confidence: 0,
                reason: `Error loading user data. Please refresh.`,
                lastUpdate: Date.now()
            };
            broadcastAIUpdate({ watch_state: this.currentWatchState });
            return;
        }

        this.isRunning = true;
        this.isExecuting = false;
        this.pendingManualSetup = null;
        this.pendingLimitOrders = [];
        this._lastPendingLog = {};
        this.lastSetupNotified = false;
        this.consecutiveLosses = 0;
        this.consecutiveWins = 0;
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

        await this.loadSymbolKnowledge();

        let balanceRetries = 3;
        let balanceSynced = false;

        while (balanceRetries > 0 && !balanceSynced) {
            try {
                const bal = await derivService.getBalance();
                if (bal?.balance && bal.balance > 0) {
                    this.currentBalance = bal.balance;
                    this.dailyStartBalance = bal.balance;
                    balanceSynced = true;
                    console.log(`💰 [AI Trader] Initial balance synced: $${this.currentBalance.toFixed(2)}`);
                } else {
                    console.log(`⚠️ [AI Trader] Balance sync attempt ${4 - balanceRetries}/3 returned ${bal?.balance || 'null'}`);
                }
            } catch (e) {
                console.log(`⚠️ [AI Trader] Balance sync error: ${e.message}`);
            }
            if (!balanceSynced) {
                balanceRetries--;
                if (balanceRetries > 0) await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!balanceSynced) {
            console.log(`⚠️ [AI Trader] Could not get initial balance after retries, using default $${this.currentBalance.toFixed(2)}`);
        }

        this.recalculateStakes();

        const session = knowledgeBase.getSessionRules();
        const tier = this.getAccountTier();
        console.log(`🤖 [AI Trader] Starting v13.0.4 (London Override for Exceptional Setups)`);
        console.log(`📚 [AI Trader] Symbol: ${this.symbol} | Session: ${session.name}`);
        console.log(`💰 [AI Trader] Account Tier: ${tier} | Balance: $${this.currentBalance.toFixed(2)}`);
        console.log(`🎯 [AI Trader] Profit Target: ${this.PROFIT_TARGET_PCT * 100}% | Stop Loss: ${this.STOP_LOSS_PCT * 100}%`);
        console.log(`🛡️ [Emergency] Max Stake: $${this.MAX_STAKE_LIMIT} | Min Stake: $${this.MIN_STAKE_LIMIT}`);

        marketData.reset();

        const derivSymbol = derivService.symbolMap?.[this.symbol] || this.symbol;
        if (!derivService.subscriptions?.has(derivSymbol)) {
            try { await derivService.subscribeToTicks(this.symbol); } catch (err) {
                console.log(`⚠️ [AI Trader] Subscribe error: ${err.message}`);
            }
        }

        derivService.on('tick', (tick) => {
            marketData.addTick(tick);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount === 1) {
                console.log(`🎉 FIRST TICK! Price: $${tick.quote?.toFixed(2)} on ${this.symbol}`);
                this.dataReady = true;
            }
            if (this.tickCount % 100 === 0) console.log(`📈 Tick #${this.tickCount} - $${tick.quote?.toFixed(2)} on ${this.symbol}`);
            this.onMarketUpdate();
        });

        derivService.on('contract_update', this.handleContractUpdate);

        setTimeout(() => this.seedCandlesFromHistory(), 2000);

        this.analysisInterval = setInterval(() => this.analyzeMarket(), 10000);
        this.opportunityScanInterval = setInterval(() => this.findBestSymbol(), 30000);

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

        this.balanceSyncInterval = setInterval(() => this.syncBalanceFromDeriv(), 30000);

        this.tickHeartbeat = setInterval(() => {
            if (this.tickCount === this._lastTickCount && this.isRunning && this.tickCount > 0) {
                console.warn(`⚠️ No ticks in 30 seconds on ${this.symbol}! Reconnecting...`);
                derivService.forceReconnectForTicks(this.symbol).catch(() => {});
            }
            this._lastTickCount = this.tickCount;
        }, 30000);

        setTimeout(() => {
            this.syncBalanceFromDeriv();
            this.analyzeMarket();
        }, 5000);
    }

    async loadSymbolKnowledge() {
        try {
            const trades = await Trade.getUserTrades(this.userId, 500);
            const symbolMap = new Map();
            
            for (const trade of trades) {
                if (!symbolMap.has(trade.symbol)) {
                    symbolMap.set(trade.symbol, {
                        totalTrades: 0,
                        wins: 0,
                        losses: 0,
                        netProfit: 0,
                        sessionPerformance: {},
                        recentTrades: [],
                        avgVolatility: 0,
                        bullishPerformance: 0,
                        bearishPerformance: 0
                    });
                }
                
                const data = symbolMap.get(trade.symbol);
                data.totalTrades++;
                if (trade.status === 'WIN') {
                    data.wins++;
                    data.netProfit += trade.profit || 0;
                } else if (trade.status === 'LOSS') {
                    data.losses++;
                    data.netProfit -= trade.stake || 0;
                }
                
                if (trade.session) {
                    if (!data.sessionPerformance[trade.session]) {
                        data.sessionPerformance[trade.session] = { wins: 0, losses: 0, total: 0 };
                    }
                    if (trade.status === 'WIN') data.sessionPerformance[trade.session].wins++;
                    else data.sessionPerformance[trade.session].losses++;
                    data.sessionPerformance[trade.session].total++;
                }
                
                data.recentTrades.unshift(trade);
                if (data.recentTrades.length > 10) data.recentTrades.pop();
                
                if (trade.action === 'BUY' && trade.status === 'WIN') data.bullishPerformance++;
                if (trade.action === 'SELL' && trade.status === 'WIN') data.bearishPerformance++;
                
                data.score = await this.getOpportunityScore(trade.symbol, { session: this.getCurrentSession(), hour: new Date().getUTCHours(), trend: 'sideways' });
            }
            
            for (const [symbol, data] of symbolMap) {
                this.symbolKnowledge[symbol] = data;
                console.log(`📊 [Symbol] ${symbol}: ${data.totalTrades} trades, ${(data.wins/data.totalTrades*100).toFixed(1)}% WR, Score: ${data.score}`);
            }
        } catch (error) {
            console.error('❌ [AI Trader] Failed to load symbol knowledge:', error.message);
        }
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
            
            // Reset daily trade counter at midnight
            const now = Date.now();
            if (now - this._dailyResetTime > 24 * 60 * 60 * 1000) {
                this._dailyTradeCount = 0;
                this._dailyResetTime = now;
            }
            
            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade > 24 * 60 * 60 * 1000) {
                if (this.consecutiveLosses > 0 || this.pausedUntil > Date.now()) {
                    console.log(`🔄 [Reset] No trades in 24 hours. Resetting streak: losses=${this.consecutiveLosses}, paused=${this.pausedUntil > Date.now()}`);
                    this.consecutiveLosses = 0;
                    this.consecutiveWins = 0;
                    this.pausedUntil = 0;
                    this._lastLossPauseLog = 0;
                }
            }
            
            if (this.pausedUntil > Date.now()) {
                const remaining = Math.floor((this.pausedUntil - Date.now()) / 1000);
                if (remaining % 60 === 0 && remaining < 300) {
                    console.log(`⏰ [Pause] Bot paused for ${Math.floor(remaining / 60)} more minutes`);
                }
                return;
            }
            
            // Daily trade limit: target 5-8 quality trades per day
            if (this._dailyTradeCount >= 8) {
                if (!this._dailyLimitLog || Date.now() - this._dailyLimitLog > 3600000) {
                    console.log(`📊 [Daily Limit] Reached ${this._dailyTradeCount} trades. Pausing until tomorrow.`);
                    this._dailyLimitLog = Date.now();
                }
                return;
            }
            
            const currentSession = this.getCurrentSession();
            
            // 🚀 LONDON OVERRIDE: Check if London is blocked but setup is EXCEPTIONAL
            // We need to check London stats first
            let londonWR = 0;
            let londonTotal = 0;
            let londonBlocked = false;
            
            if (currentSession === 'LONDON') {
                const recentLondonTrades = await Trade.getSymbolSessionStats(this.userId, this.symbol);
                const londonStats = recentLondonTrades?.find(s => s.session === 'LONDON');
                londonWR = londonStats ? parseFloat(londonStats.win_rate) || 0 : 0;
                londonTotal = londonStats ? londonStats.total || 0 : 0;
                
                // If London has improved to 40%+ WR and 20+ trades, unblock it
                if (londonWR >= 40 && londonTotal >= 20) {
                    console.log(`🟢 [London] WR improved to ${londonWR}% over ${londonTotal} trades. UNBLOCKED.`);
                    londonBlocked = false;
                } else {
                    londonBlocked = true;
                    this._londonWR = londonWR;
                    this._londonTotal = londonTotal;
                    if (!this._lastLondonLog || Date.now() - this._lastLondonLog > 3600000) {
                        console.log(`🚫 [London] Blocked - ${londonWR}% WR over ${londonTotal} trades. EXCEPTIONAL setups only.`);
                        this._lastLondonLog = Date.now();
                    }
                }
            }
            
            if (this.consecutiveLosses >= 2) {
                const recentTrades = await Trade.getUserTrades(this.userId, 5);
                const recentLosses = recentTrades.filter(t => t.status === 'LOSS' && 
                    (Date.now() - new Date(t.executed_at).getTime()) < 6 * 60 * 60 * 1000);
                
                if (recentLosses.length < 2) {
                    console.log(`🔄 [Reset] Losses are old (${recentLosses.length} recent). Resetting streak from ${this.consecutiveLosses} to 0`);
                    this.consecutiveLosses = 0;
                } else if (this.consecutiveLosses >= 2) {
                    if (!this._lastLossPauseLog || Date.now() - this._lastLossPauseLog > 60000) {
                        console.log(`🛑 [Psychology] ${this.consecutiveLosses} consecutive RECENT losses. Pausing for 15 minutes.`);
                        this._lastLossPauseLog = Date.now();
                    }
                    this.pausedUntil = Date.now() + 900000;
                    return;
                }
            }
            
            const dailyLimitHit = await this.updateDailyLimits();
            if (dailyLimitHit) return;
            
            const timeSinceLastTradeCheck = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTradeCheck < this.tradeCooldown) return;

            const currentHour = new Date().getUTCHours();
            
            const sessionBlocked = await this.isSessionBlocked(currentSession);
            if (sessionBlocked) return;

            const marketState = marketData.getMarketState();
            const currentPrice = marketState.price;

            if (this.tickCount === 0) return;
            if (!this.dataReady && this.tickCount > 0) {
                this.dataReady = true;
                console.log(`✅ Data ready! ${this.tickCount} ticks received.`);
            }
            
            if (marketState.rsi >= 45 && marketState.rsi <= 55) {
                if (!this._rsiBlockLog || Date.now() - this._rsiBlockLog > 3600000) {
                    console.log(`🚫 [EMERGENCY] RSI neutral zone (${marketState.rsi}) blocked - 27% WR, -$1,220 loss. NO TRADING.`);
                    this._rsiBlockLog = Date.now();
                }
                return;
            }

            let dynamicThreshold = this.confidenceThreshold;
            if (this.consecutiveLosses >= 2) {
                dynamicThreshold = Math.min(85, dynamicThreshold + 10);
            } else if (this.consecutiveWins >= 3) {
                dynamicThreshold = Math.max(55, dynamicThreshold - 5);
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
                console.log(`🔍 ${this.symbol} | $${currentPrice.toFixed(2)} | RSI: ${marketState.rsi} | Trend: ${rawTrend} | Ticks: ${this.tickCount} | Streak: ${this.consecutiveWins}W/${this.consecutiveLosses}L`);
                this._lastAnalysisLog = Date.now();
            }

            if (this.GOLDEN_HOURS.includes(currentHour)) dynamicThreshold = Math.max(55, dynamicThreshold - 5);
            const sessionRules = knowledgeBase.getSessionRules();
            dynamicThreshold += sessionRules.confidenceModifier;
            dynamicThreshold = Math.max(55, Math.min(85, dynamicThreshold));

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
            
            const LOSING_PATTERNS = ['doji', 'hammer', 'three_white_soldiers', 'three white soldiers', 'pullback_to_support', 'pullback in uptrend'];
            if (LOSING_PATTERNS.some(p => analysis.pattern?.toLowerCase().includes(p))) {
                console.log(`🚫 [EMERGENCY] Pattern "${analysis.pattern}" blocked - losing pattern. NO TRADING.`);
                return;
            }

            const action = analysis.action === 'CALL' ? 'BUY' : (analysis.action === 'PUT' ? 'SELL' : 'WAIT');

            if (action === 'BUY' && marketState.rsi >= this.RSI_BUY_MAX) return;
            if (action === 'SELL' && marketState.rsi <= this.RSI_SELL_MIN) return;

            const sessionName = this.getCurrentSession();
            const nearSR = marketState.nearSupport || marketState.nearResistance;
            const statisticalConfidence = this.calculateStatisticalConfidence(analysis.pattern, sessionName, marketState.rsi, confirmedTrend, nearSR, currentHour);
            const aiConf = analysis.confidence || 50;
            let combinedConfidence = Math.round((aiConf * 0.4) + (statisticalConfidence * 0.6));
            if (this.GOLDEN_HOURS.includes(currentHour)) combinedConfidence = Math.min(95, combinedConfidence + 5);
            
            if (this.consecutiveWins >= 2) combinedConfidence = Math.min(95, combinedConfidence + 8);
            if (this.consecutiveLosses >= 2) combinedConfidence = Math.max(40, combinedConfidence - 10);

            const setupQuality = this.calculateSetupQuality(analysis.pattern, sessionName, marketState.rsi, confirmedTrend, currentHour, nearSR);
            
            // 🟢 LONDON OVERRIDE: Check if exceptional setup
            if (londonBlocked && currentSession === 'LONDON') {
                // Only override if setup is EXCEPTIONAL
                // setupQuality > 85 AND patternWinRate > 75%
                // Get pattern win rate from cached data
                let patternWinRate = 0;
                if (analysis.pattern && this._cachedPatternPerformance) {
                    const patternData = this._cachedPatternPerformance.find(p => 
                        p.pattern.toLowerCase() === analysis.pattern.toLowerCase()
                    );
                    if (patternData) patternWinRate = patternData.winRate || 0;
                }
                
                if (setupQuality > 85 && patternWinRate > 75) {
                    console.log(`🔓 [London OVERRIDE] EXCEPTIONAL SETUP! Quality: ${setupQuality}, Pattern WR: ${patternWinRate}%`);
                    console.log(`   Trading London despite ${londonWR}% WR over ${londonTotal} trades.`);
                    londonBlocked = false; // Allow the trade
                } else {
                    console.log(`🚫 [London] Setup quality: ${setupQuality}, Pattern WR: ${patternWinRate}% - Not exceptional enough.`);
                    return; // Skip
                }
            }

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

                console.log(`✅ VALIDATED: ${action} ${this.symbol} | COMB:${effectiveConfidence}% | Stake:$${stake} | Streak: ${this.consecutiveWins}W/${this.consecutiveLosses}L`);

                if (this.mode === 'AUTO') {
                    await this.executeEntry(action, currentPrice, stake, {
                        action: analysis.action, confidence: effectiveConfidence,
                        pattern: analysis.pattern,
                        simple_reason: `${kbValidation.reason}`
                    });
                    this._dailyTradeCount++; // Increment daily trade counter
                    console.log(`📊 Daily trades: ${this._dailyTradeCount}/8`);
                }
                return;
            }

            this.currentWatchState = {
                status: 'WATCHING', action: 'WAIT', symbol: this.symbol,
                confidence: effectiveConfidence || combinedConfidence,
                reason: analysis.simple_reason || 'Waiting for setup',
                pattern: analysis.pattern, market_price: currentPrice,
                market_rsi: marketState.rsi, trend: confirmedTrend,
                lastUpdate: Date.now(), is_auto_mode: this.mode === 'AUTO',
                confidence_threshold: dynamicThreshold,
                pending_orders: this.pendingLimitOrders,
                total_trades: this.totalTrades, total_wins: this.totalWins, total_losses: this.totalLosses,
                session_profit: this.sessionProfit, session_loss: this.sessionLoss,
                consecutive_wins: this.consecutiveWins, consecutive_losses: this.consecutiveLosses,
                daily_trades: this._dailyTradeCount
            };
        } catch (error) {
            console.error('❌ Analysis error:', error.message);
        }
    }

    calculateStake(confidence, patternWinRate, trend, setupQuality = 50) {
        this.recalculateStakes();
        const bal = this.currentBalance || 1000;

        if (this.lastStakeWasMax && this.tradesSinceBigLoss < 3) {
            return this.MIN_STAKE;
        }

        if (this.consecutiveLosses >= 2) {
            return this.MIN_STAKE;
        }
        
        if (this.consecutiveWins >= 3 && confidence >= 75) {
            console.log(`🚀 [Psychology] Win streak ${this.consecutiveWins} + High confidence → Using CONFIDENT stake`);
            return Math.min(this.CONFIDENT_STAKE, this.MAX_STAKE_LIMIT);
        }

        if (this.sessionProfit >= bal * this.DAILY_PROFIT_TARGET_PCT) {
            return this.MIN_STAKE;
        }

        let stake = this.BASE_STAKE;
        if (setupQuality >= 75) {
            stake = this.CONFIDENT_STAKE;
        } else if (setupQuality >= 60) {
            stake = this.BASE_STAKE;
        } else {
            stake = this.MIN_STAKE;
        }
        
        if (stake > this.MAX_STAKE_LIMIT) {
            console.log(`🛑 [Emergency] Stake capped: $${stake} → $${this.MAX_STAKE_LIMIT}`);
            stake = this.MAX_STAKE_LIMIT;
        }
        if (stake < this.MIN_STAKE_LIMIT) {
            stake = this.MIN_STAKE_LIMIT;
        }
        
        return stake;
    }

    async executeEntry(action, entryPrice, stake, analysis) {
        if (this.isExecuting || this.activeTrade) return;
        this.isExecuting = true;
        try {
            const user = await User.findById(this.userId);
            if (!user || user.trades_remaining <= 0) {
                this.isExecuting = false;
                return;
            }
            if (stake < this.MIN_STAKE_LIMIT) {
                this.isExecuting = false;
                return;
            }

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
                entry_time: Date.now(), exit_time: Date.now() + this.MAX_TRADE_DURATION,
                confidence: analysis.confidence, pattern: analysis.pattern,
                isSniper: stake >= this.MAX_STAKE * 0.9
            };

            broadcastTradeResult({ id: tradeId, contract_id: tradeResult.buy.contract_id, symbol: this.symbol, action, entry_price: entryPrice, exit_price: null, profit: null, stake, status: 'PENDING' });
            console.log(`✅ Trade #${tradeId} OPEN | ${action} | $${stake}`);

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
            session_profit: this.sessionProfit, session_loss: this.sessionLoss, timestamp: Date.now(),
            consecutive_wins: this.consecutiveWins, consecutive_losses: this.consecutiveLosses,
            opportunity_score: this.currentOpportunityScore,
            best_alternatives: this.getTopAlternatives(3),
            daily_trades: this._dailyTradeCount
        };
    }

    stop() {
        this.isRunning = false;
        if (this.analysisInterval) { clearInterval(this.analysisInterval); this.analysisInterval = null; }
        if (this.opportunityScanInterval) { clearInterval(this.opportunityScanInterval); this.opportunityScanInterval = null; }
        if (this.tickHealthInterval) { clearInterval(this.tickHealthInterval); this.tickHealthInterval = null; }
        if (this.balanceSyncInterval) { clearInterval(this.balanceSyncInterval); this.balanceSyncInterval = null; }
        if (this.tickHeartbeat) { clearInterval(this.tickHeartbeat); this.tickHeartbeat = null; }
        derivService.removeListener('contract_update', this.handleContractUpdate);
        console.log('🤖 AI Trader Stopped');
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
