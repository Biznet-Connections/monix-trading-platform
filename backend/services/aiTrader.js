/**
 * AI Trader Service - The Professional
 * v15.0.36 - Removed isReady block to allow first trades
 */

const marketData = require('./marketData');
const derivService = require('./derivService');
const Trade = require('../models/Trade');
const User = require('../models/User');
const Pattern = require('../models/Pattern');
const { broadcastAIUpdate, broadcastTradeResult, broadcastNotification } = require('../utils/websocket');

class AITrader {
    constructor() {
        this.isRunning = false;
        this.analysisInterval = null;
        this.tickHealthInterval = null;
        this.balanceSyncInterval = null;
        this.symbols = ['R_75', 'XAU/USD (Gold)', 'R_100'];
        this.symbolData = {};
        this.activeTrade = null;
        this.isExecuting = false;
        this.userId = null;
        this.mode = 'AUTO';
        this.currentWatchState = {
            status: 'INITIALIZING',
            action: 'WAIT',
            symbol: 'R_75',
            entry_price: null,
            take_profit: null,
            stop_loss: null,
            confidence: 0,
            reason: 'Starting up...',
            pattern: null,
            lastUpdate: Date.now(),
            allSymbols: {}
        };

        // Streak tracking
        this.consecutiveLosses = 0;
        this.consecutiveWins = 0;
        this.recentResults = [];
        this.lastTradeTime = 0;
        this.tradeCooldown = 30000;
        this.pausedUntil = 0;

        // Daily tracking
        this.dailyStartBalance = 1000;
        this.dailyProfit = 0;
        this.dailyLoss = 0;
        this.dailyTradeCount = 0;
        this.dailyResetTime = 0;
        this.dailyProfitTarget = 0.05;
        this.dailyLossLimit = 0.05;
        this.dailyProfitReached = false;
        this.dailyLossReached = false;

        // Balance
        this.currentBalance = 1000;
        this.totalTrades = 0;
        this.totalWins = 0;
        this.totalLosses = 0;
        this.sessionProfit = 0;
        this.sessionLoss = 0;

        // Trade parameters
        this.PROFIT_TARGET_PCT = 0.60;
        this.STOP_LOSS_PCT = 0.30;
        this.MAX_TRADE_DURATION = 300000;

        // ðŸš€ DYNAMIC STAKE CONFIGURATION
        this.MIN_STAKE_PCT = 0.005;
        this.BASE_STAKE_PCT = 0.01;
        this.CONFIDENT_STAKE_PCT = 0.02;
        this.MAX_STAKE_PCT = 0.03;

        this.MIN_STAKE_LIMIT = 1;
        this.MAX_STAKE_LIMIT = 999999;

        this.MIN_STAKE = 1;
        this.BASE_STAKE = 10;
        this.CONFIDENT_STAKE = 20;
        this.MAX_STAKE = 30;

        // No session blocking
        this.blockedSessions = {};
        this._lastLondonLog = 0;
        this._lastAnalysisLog = 0;
        this._lastBalanceLog = 0;
        this._dailyLimitLog = 0;
        this._lastLossPauseLog = 0;

        // Bind handlers
        this.handleContractUpdate = this.handleContractUpdate.bind(this);

        // Initialize symbol data
        for (const symbol of this.symbols) {
            this.symbolData[symbol] = {
                trades: 0,
                wins: 0,
                losses: 0,
                winRate: 0,
                netProfit: 0,
                patternPerformance: {},
                sessionPerformance: {},
                rsiPerformance: {},
                hourlyPerformance: {},
                isReady: true, // ðŸš€ FORCE READY - Allow first trades
                lastTrade: null,
                currentStreak: 0,
                bestStreak: 0,
                score: 50
            };
        }
    }

    // â”€â”€â”€ Helper Functions â”€â”€â”€

    roundStake(amount) {
        return Math.max(this.MIN_STAKE_LIMIT, Math.min(this.MAX_STAKE_LIMIT, Math.round(amount * 2) / 2));
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

        let stakeMultiplier = 1.0;
        if (this.consecutiveWins >= 3) {
            stakeMultiplier = 1.5;
        } else if (this.consecutiveLosses >= 3) {
            stakeMultiplier = 0.5;
        } else if (this.consecutiveLosses >= 2) {
            stakeMultiplier = 0.75;
        }

        let minStake = bal * this.MIN_STAKE_PCT * stakeMultiplier;
        let baseStake = bal * this.BASE_STAKE_PCT * stakeMultiplier;
        let confidentStake = bal * this.CONFIDENT_STAKE_PCT * stakeMultiplier;
        let maxStake = bal * this.MAX_STAKE_PCT * stakeMultiplier;

        this.MIN_STAKE = this.roundStake(minStake);
        this.BASE_STAKE = this.roundStake(baseStake);
        this.CONFIDENT_STAKE = this.roundStake(confidentStake);
        this.MAX_STAKE = this.roundStake(maxStake);

        if (this.MAX_STAKE > bal * 0.03) this.MAX_STAKE = this.roundStake(bal * 0.03);
        if (this.CONFIDENT_STAKE > bal * 0.02) this.CONFIDENT_STAKE = this.roundStake(bal * 0.02);

        if (this.MIN_STAKE < 1) this.MIN_STAKE = 1;
        if (this.BASE_STAKE < 1) this.BASE_STAKE = 2;
        if (this.CONFIDENT_STAKE < 1) this.CONFIDENT_STAKE = 5;
        if (this.MAX_STAKE < 1) this.MAX_STAKE = 10;

        if (!this._lastBalanceLog || Date.now() - this._lastBalanceLog > 3600000) {
            console.log(`ðŸ’° [Stakes] Balance: $${bal.toFixed(2)} | Tier: ${tier} | MIN=$${this.MIN_STAKE} | BASE=$${this.BASE_STAKE} | CONFIDENT=$${this.CONFIDENT_STAKE} | MAX=$${this.MAX_STAKE}`);
            this._lastBalanceLog = Date.now();
        }
    }

    getCurrentSession() {
        const hour = new Date().getUTCHours();
        if (hour >= 0 && hour < 9) return 'ASIAN';
        if (hour >= 8 && hour < 17) return 'LONDON';
        return 'NEWYORK';
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

    // â”€â”€â”€ Symbol Learning â”€â”€â”€

    async loadSymbolData() {
        try {
            const trades = await Trade.getUserTrades(this.userId, 1000);
            const symbolMap = {};

            for (const symbol of this.symbols) {
                symbolMap[symbol] = {
                    trades: 0,
                    wins: 0,
                    losses: 0,
                    winRate: 0,
                    netProfit: 0,
                    patternPerformance: {},
                    sessionPerformance: {},
                    rsiPerformance: {},
                    hourlyPerformance: {},
                    isReady: true, // ðŸš€ FORCE READY
                    lastTrade: null
                };
            }

            for (const trade of trades) {
                if (!symbolMap[trade.symbol]) continue;
                const data = symbolMap[trade.symbol];
                data.trades++;
                if (trade.status === 'WIN') {
                    data.wins++;
                    data.netProfit += trade.profit || 0;
                } else if (trade.status === 'LOSS') {
                    data.losses++;
                    data.netProfit -= trade.stake || 0;
                }
                data.winRate = data.trades > 0 ? (data.wins / data.trades) * 100 : 0;
                data.isReady = true; // ðŸš€ ALWAYS READY
                data.lastTrade = trade.executed_at;

                if (trade.session) {
                    if (!data.sessionPerformance[trade.session]) {
                        data.sessionPerformance[trade.session] = { wins: 0, losses: 0, total: 0 };
                    }
                    if (trade.status === 'WIN') data.sessionPerformance[trade.session].wins++;
                    else data.sessionPerformance[trade.session].losses++;
                    data.sessionPerformance[trade.session].total++;
                }

                if (trade.pattern) {
                    if (!data.patternPerformance[trade.pattern]) {
                        data.patternPerformance[trade.pattern] = { wins: 0, losses: 0, total: 0 };
                    }
                    if (trade.status === 'WIN') data.patternPerformance[trade.pattern].wins++;
                    else data.patternPerformance[trade.pattern].losses++;
                    data.patternPerformance[trade.pattern].total++;
                }

                if (trade.rsi) {
                    const rsiZone = this.getRSIZone(trade.rsi);
                    if (!data.rsiPerformance[rsiZone]) {
                        data.rsiPerformance[rsiZone] = { wins: 0, losses: 0, total: 0 };
                    }
                    if (trade.status === 'WIN') data.rsiPerformance[rsiZone].wins++;
                    else data.rsiPerformance[rsiZone].losses++;
                    data.rsiPerformance[rsiZone].total++;
                }

                if (trade.executed_at) {
                    const hour = new Date(trade.executed_at).getUTCHours();
                    if (!data.hourlyPerformance[hour]) {
                        data.hourlyPerformance[hour] = { wins: 0, losses: 0, total: 0 };
                    }
                    if (trade.status === 'WIN') data.hourlyPerformance[hour].wins++;
                    else data.hourlyPerformance[hour].losses++;
                    data.hourlyPerformance[hour].total++;
                }
            }

            for (const symbol of this.symbols) {
                this.symbolData[symbol] = symbolMap[symbol];
                console.log(`ðŸ“Š [Symbol] ${symbol}: ${symbolMap[symbol].trades} trades, ${symbolMap[symbol].winRate.toFixed(1)}% WR, Ready: ${symbolMap[symbol].isReady}`);
            }
        } catch (error) {
            console.error('âŒ Failed to load symbol data:', error.message);
        }
    }

    // â”€â”€â”€ No session blocking â”€â”€â”€

    recordSessionTrade(session, symbol, isWin) {
        const data = this.symbolData[symbol];
        if (!data) return;
        if (!data.sessionPerformance[session]) {
            data.sessionPerformance[session] = { wins: 0, losses: 0, total: 0 };
        }
        if (isWin) data.sessionPerformance[session].wins++;
        else data.sessionPerformance[session].losses++;
        data.sessionPerformance[session].total++;
    }

    // â”€â”€â”€ Update Daily Limits â”€â”€â”€

    async updateDailyLimits() {
        const today = new Date().toDateString();
        if (this._lastDailyReset !== today) {
            this.dailyStartBalance = this.currentBalance;
            this.dailyProfitReached = false;
            this.dailyLossReached = false;
            this.dailyProfit = 0;
            this.dailyLoss = 0;
            this.dailyTradeCount = 0;
            this._lastDailyReset = today;
            console.log(`ðŸ“… [Daily] Reset. Start balance: $${this.dailyStartBalance.toFixed(2)}`);
        }

        const todayProfit = this.currentBalance - this.dailyStartBalance;
        const targetProfit = this.dailyStartBalance * this.dailyProfitTarget;
        const lossLimit = this.dailyStartBalance * this.dailyLossLimit;

        if (todayProfit >= targetProfit && !this.dailyProfitReached) {
            this.dailyProfitReached = true;
            this.pausedUntil = Date.now() + 86400000;
            console.log(`ðŸŽ¯ [Daily Target] Target reached! +$${todayProfit.toFixed(2)}. Stopping for the day.`);
            broadcastNotification('Daily Target Met', `+$${todayProfit.toFixed(2)} profit. Bot paused until tomorrow.`, 'success');
            return true;
        }

        if (todayProfit <= -lossLimit && !this.dailyLossReached) {
            this.dailyLossReached = true;
            this.pausedUntil = Date.now() + 86400000;
            console.log(`ðŸ›‘ [Daily Limit] Loss limit reached! -$${Math.abs(todayProfit).toFixed(2)}. Stopping for the day.`);
            broadcastNotification('Daily Loss Limit Hit', `-$${Math.abs(todayProfit).toFixed(2)} loss. Bot paused until tomorrow.`, 'error');
            return true;
        }

        return false;
    }

    // â”€â”€â”€ Trade Management â”€â”€â”€

    async handleContractUpdate(contract) {
        if (!this.activeTrade || contract.contract_id !== this.activeTrade.contract_id) return;

        const rawProfit = contract.profit !== undefined && contract.profit !== null ? contract.profit : 0;
        let currentProfit = Number(rawProfit);
        if (isNaN(currentProfit)) currentProfit = 0;

        const stake = this.activeTrade.stake;
        const targetProfit = stake * this.PROFIT_TARGET_PCT;
        const maxLoss = stake * this.STOP_LOSS_PCT;

        const isReallyClosed = (contract.is_sold === 1 || contract.status === "sold");
        if (!isReallyClosed) {
            if (!this._lastUnrealizedLog || Date.now() - this._lastUnrealizedLog > 5000) {
                console.log("[Unrealized] " + this.activeTrade.symbol + " #" + contract.contract_id + ": $" + currentProfit.toFixed(2) + " (waiting)");
                this._lastUnrealizedLog = Date.now();
            }
            return;
        }
        const finalProfit = currentProfit;
        const status = finalProfit > 0 ? "WIN" : "LOSS";
        const pct = ((finalProfit / stake) * 100).toFixed(1);
        console.log("[REAL CLOSE] " + this.activeTrade.symbol + " #" + contract.contract_id + ": " + status + " $" + finalProfit.toFixed(2) + " (" + pct + "%)");
        await this.closeTrade(contract.contract_id, finalProfit, status);
    }

    // â”€â”€â”€ FIXED: closeTrade with null check â”€â”€â”€
    async closeTrade(contractId, profit, status) {
        if (!this.activeTrade) {
            console.log(`âš ï¸ No active trade to close for contract ${contractId}`);
            return;
        }

        // GUARD: prevent duplicate close on same contract
        if (this._closingContractId === contractId) {
            console.log('GUARD: Ignoring duplicate close for ' + contractId);
            return;
        }
        this._closingContractId = contractId;

        if (this.activeTrade.contract_id !== contractId) {
            console.log(`âš ï¸ Active trade contract ${this.activeTrade.contract_id} doesn't match ${contractId}`);
            return;
        }

        const tradeData = {
            id: this.activeTrade.id,
            entry_price: this.activeTrade.entry_price,
            stake: this.activeTrade.stake,
            symbol: this.activeTrade.symbol,
            action: this.activeTrade.action,
            pattern: this.activeTrade.pattern || 'Unknown',
            contract_id: this.activeTrade.contract_id
        };

        let finalProfit = Number(profit);
        if (isNaN(finalProfit)) finalProfit = 0;

        try {
            const tradeId = tradeData.id;
            const entryPrice = tradeData.entry_price;
            const stake = tradeData.stake;
            const symbol = tradeData.symbol;

            let exitPrice = entryPrice; // placeholder - not used for P&L

            console.log(`ðŸ“ Closing trade #${tradeId}: ${symbol} ${status} | Profit: $${finalProfit.toFixed(2)} | Exit: $${exitPrice.toFixed(2)}`);

            await Trade.updateResult(tradeId, exitPrice, finalProfit, status);
            await User.updateStats(this.userId, status, finalProfit, stake);
            await Pattern.recordTradeResult(tradeData.pattern, symbol, tradeData.action, this.getCurrentSession(), status === 'WIN');

            this.recentResults.push(status);
            if (this.recentResults.length > 30) this.recentResults.shift();

            const symbolData = this.symbolData[symbol];
            if (symbolData) {
                symbolData.trades++;
                if (status === 'WIN') {
                    symbolData.wins++;
                    symbolData.netProfit += finalProfit;
                } else {
                    symbolData.losses++;
                    symbolData.netProfit -= stake;
                }
                symbolData.winRate = symbolData.trades > 0 ? (symbolData.wins / symbolData.trades) * 100 : 0;
                symbolData.isReady = true; // ðŸš€ ALWAYS READY
                symbolData.lastTrade = new Date();
                if (status === 'WIN') {
                    symbolData.currentStreak = symbolData.currentStreak > 0 ? symbolData.currentStreak + 1 : 1;
                    if (symbolData.currentStreak > symbolData.bestStreak) symbolData.bestStreak = symbolData.currentStreak;
                } else {
                    symbolData.currentStreak = symbolData.currentStreak < 0 ? symbolData.currentStreak - 1 : -1;
                }
            }

            if (status === 'WIN') {
                this.totalWins++;
                this.consecutiveWins++;
                this.consecutiveLosses = 0;
                this.dailyProfit += finalProfit;
                console.log(`ðŸŽ‰ WIN! +$${Math.abs(finalProfit).toFixed(2)} | Streak: ${this.consecutiveWins}W/${this.consecutiveLosses}L`);
                this.recalculateStakes();
            } else {
                this.totalLosses++;
                this.consecutiveLosses++;
                this.consecutiveWins = 0;
                this.dailyLoss += Math.abs(finalProfit);
                console.log(`âŒ LOSS #${this.consecutiveLosses} | -$${Math.abs(finalProfit).toFixed(2)}`);
                this.recordSessionTrade(this.getCurrentSession(), symbol, false);
                this.recalculateStakes();

                if (this.consecutiveLosses >= 3) {
                    this.pausedUntil = Date.now() + 900000;
                    console.log('ðŸ›‘ HARD PAUSE 15min â€” 3 consecutive losses');
                }
            }

            broadcastTradeResult({
                id: tradeId,
                contract_id: contractId,
                symbol: symbol,
                action: tradeData.action,
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
                    console.log(`ðŸ’° New Balance: $${this.currentBalance.toFixed(2)}`);
                }
            } catch (e) {}

            this.activeTrade = null;
            this._closingContractId = null;

        } catch (error) {
            console.error('Close trade error:', error.message);
            this.activeTrade = null;
            this._closingContractId = null;
        }
    }

    // â”€â”€â”€ Analyze Symbol â”€â”€â”€

    async analyzeSymbol(symbol) {
        if (symbol === 'XAU/USD (Gold)') return null;

        // ðŸ§  LEARNING-BASED FILTERS (v15.0.36)
        const __hour = new Date().getUTCHours();
        
        // Blocked symbols based on historical WR < 20%
        const __blockedSymbols = ['R_100']; // 11.8% WR over 407 trades
        if (__blockedSymbols.includes(symbol)) {
            console.log('ðŸ§  [LEARN] ' + symbol + ' blocked (historical WR < 20%)');
            return null;
        }
        
        // Blocked hours based on last 100 trades showing 0% WR
        // SESSION FILTER: only ASIAN session trades (34% WR vs 0% others)
        const __sessionNow = __hour < 8 ? 'ASIAN' : (__hour < 16 ? 'LONDON' : 'NEWYORK');
        if (__sessionNow !== 'ASIAN') {
            console.log('[LEARN] ' + __sessionNow + ' session blocked (0% WR - ASIAN only)');
            return null;
        }
        
        const __blockedHours = [0, 21, 22, 23]; // All 0% WR recently
        if (__blockedHours.includes(__hour)) {
            console.log('ðŸ§  [LEARN] Hour ' + __hour + ':00 UTC blocked (0% WR last 100 trades)');
            return null;
        }
        
        // Blocked patterns based on pattern journal WR < 30%
        const __blockedPatterns = ['oversold_bounce', 'bearish_engulfing', 'FORCE_TRADE', 'doji', 'hammer'];
        const __mState = marketData.getMarketState(symbol);
        const __pattern = __mState.lastPattern || 'none';
        if (__blockedPatterns.includes(__pattern)) {
            console.log('ðŸ§  [LEARN] Pattern ' + __pattern + ' blocked (journal WR < 30%)');
            return null;
        }

        console.log(`ðŸ” [DEBUG-ENTRY] analyzeSymbol called for ${symbol}`);
        try {
            const marketState = marketData.getMarketState(symbol);
            const currentPrice = marketState.price;
            const rsi = marketState.rsi;
            const trend = marketState.trend;
            const session = this.getCurrentSession();
            const hour = new Date().getUTCHours();
            const data = this.symbolData[symbol];

            console.log(`ðŸ” [DEBUG] ${symbol}: Price=$${currentPrice?.toFixed(2) || 'N/A'} | RSI=${rsi} | Trend=${trend} | Data=${!!data}`);

            if (!currentPrice || currentPrice <= 0) {
                console.log(`âŒ [DEBUG] ${symbol}: No valid price`);
                return null;
            }
            if (rsi === 0 || !rsi) {
                console.log(`âŒ [DEBUG] ${symbol}: No valid RSI`);
                return null;
            }
            if (!data) {
                console.log(`âŒ [DEBUG] ${symbol}: No symbol data`);
                return null;
            }

            // Check 1: RSI Zone
            // For FIRST trade (0 trades), allow RSI 45-55 as well
            if (data.trades === 0) {
                // First trade: allow RSI 45-55 as well
                if (!(rsi >= 45 && rsi <= 55) && !(rsi >= 25 && rsi < 35) && !(rsi >= 35 && rsi <= 45)) {
                    console.log(`âŒ [DEBUG] ${symbol}: RSI ${rsi} outside first-trade zones (25-45 or 45-55)`);
                    return null;
                }
            } else {
                // Normal: only 25-45
                if (!(rsi >= 25 && rsi < 35) && !(rsi >= 35 && rsi <= 45)) {
                    console.log(`âŒ [DEBUG] ${symbol}: RSI ${rsi} outside zones (25-45)`);
                    return null;
                }
            }

            // Check 2: Pattern detection
            const pattern = marketState.lastPattern || 'none';
            let patternWR = 0;

            if (pattern !== 'none' && data.patternPerformance[pattern]) {
                const pData = data.patternPerformance[pattern];
                if (pData.total >= 1) {
                    patternWR = (pData.wins / pData.total) * 100;
                }
            }

            // Check 3: Pattern win rate (lower for first trade)
            const minPatternWR = data.trades === 0 ? 5 : (data.trades < 3 ? 20 : 45);
            // ðŸš€ FIRST TRADE: Bypass pattern check if 0 trades
            if (data.trades > 0 && pattern !== 'none' && patternWR > 0 && patternWR < minPatternWR) {
                console.log(`âŒ [DEBUG] ${symbol}: Pattern ${pattern} WR ${patternWR}% < ${minPatternWR}% minimum`);
                return null;
            }

            // Check 4: Setup Quality
            let setupQuality = 0;
            if (session === 'NEWYORK') setupQuality += 20;
            else if (session === 'ASIAN') setupQuality += 10;
            else if (session === 'LONDON') setupQuality += 5;
            if (rsi >= 35 && rsi <= 45) setupQuality += 20;
            else if (rsi >= 25 && rsi < 35) setupQuality += 15;
            if (trend && !trend.includes('sideways')) setupQuality += 15;

            if (pattern !== 'none' && pattern !== 'no_significant_pattern') {
                setupQuality += 15;
            } else if (pattern === 'none' || pattern === 'no_significant_pattern') {
                setupQuality += 8;
            }

            if (this.consecutiveLosses === 0) setupQuality += 5;

            // ðŸš€ LOWERED THRESHOLDS FOR FIRST TRADE
            const minSetupQuality = data.trades === 0 ? 10 : (data.trades < 3 ? 30 : 50);
            console.log(`ðŸ” [DEBUG] ${symbol}: SetupQuality=${setupQuality} | MinRequired=${minSetupQuality}`);
            if (setupQuality < minSetupQuality) {
                console.log(`âŒ [DEBUG] ${symbol}: Setup quality ${setupQuality} < ${minSetupQuality} minimum`);
                return null;
            }

            // Check 5: Confidence
            let confidence = 55;
            if (patternWR > 0 && patternWR > 40) confidence += (patternWR - 40) * 0.25;
            if (session === 'NEWYORK') confidence += 10;
            else if (session === 'LONDON') confidence += 5;
            if (rsi >= 35 && rsi <= 45) confidence += 10;
            if (this.consecutiveWins >= 2) confidence += 5;
            if (this.consecutiveLosses >= 2) confidence -= 10;

            confidence = Math.min(95, Math.max(40, Math.round(confidence)));

            // ðŸš€ LOWERED THRESHOLDS FOR FIRST TRADE
            const minConfidence = data.trades === 0 ? 20 : (data.trades < 3 ? 35 : 50);
            console.log(`ðŸ” [DEBUG] ${symbol}: Confidence=${confidence} | MinRequired=${minConfidence}`);
            if (confidence < minConfidence) {
                console.log(`âŒ [DEBUG] ${symbol}: Confidence ${confidence} < ${minConfidence} minimum`);
                return null;
            }

            // Check 6: Action (BUY or SELL)
            let action = 'WAIT';
            if (trend === 'uptrend' || trend === 'strong_uptrend') {
                if (rsi < 45 && rsi >= 25) action = 'BUY';
                else if (rsi > 65) action = 'SELL';
            } else if (trend === 'downtrend' || trend === 'strong_downtrend') {
                if (rsi > 65) action = 'SELL';
                else if (rsi < 45 && rsi >= 25) action = 'BUY';
            } else {
                if (rsi < 35) action = 'BUY';
                else if (rsi > 65) action = 'SELL';
            }

            if (action === 'WAIT') {
                console.log(`âŒ [DEBUG] ${symbol}: Action is WAIT`);
                return null;
            }

            const takeProfit = action === 'BUY' ? currentPrice * (1 + this.PROFIT_TARGET_PCT) : currentPrice * (1 - this.PROFIT_TARGET_PCT);
            const stopLoss = action === 'BUY' ? currentPrice * (1 - this.STOP_LOSS_PCT) : currentPrice * (1 + this.STOP_LOSS_PCT);

            // ðŸš€ SIGNAL GENERATED!
            console.log(`âœ… [SIGNAL] ${symbol}: ${action} | RSI: ${rsi} | Quality: ${setupQuality} | Confidence: ${confidence} | Pattern: ${pattern} | WR: ${patternWR}`);
            console.log(`ðŸŽ¯ [SIGNAL] Entry: $${currentPrice.toFixed(2)} | TP: $${takeProfit.toFixed(2)} | SL: $${stopLoss.toFixed(2)}`);
            
            return {
                symbol,
                action,
                confidence,
                pattern: pattern !== 'none' ? pattern : (action === 'BUY' ? 'oversold_bounce' : 'overbought_rejection'),
                entry_price: currentPrice,
                take_profit: takeProfit,
                stop_loss: stopLoss,
                setupQuality,
                patternWR,
                rsi,
                trend,
                session,
                reason: `${action} signal on ${symbol} (RSI: ${rsi}, Trend: ${trend}, Quality: ${setupQuality}, Confidence: ${confidence}%)`
            };

        } catch (error) {
            console.error(`âŒ Analyze ${symbol} error:`, error.message);
            return null;
        }
    }

    // â”€â”€â”€ Find Best Setup â”€â”€â”€

    async findBestSetup() {
        let bestSignal = null;
        let bestScore = 0;

        for (const symbol of this.symbols) {
            const signal = await this.analyzeSymbol(symbol);
            if (!signal) continue;

            const score = signal.confidence * 0.6 + signal.setupQuality * 0.4;
            if (score > bestScore) {
                bestScore = score;
                bestSignal = signal;
            }
        }

        return bestSignal;
    }

    // â”€â”€â”€ Execute Entry â”€â”€â”€

    async executeEntry(signal) {
        if (this.isExecuting || this.activeTrade) return;
        if (!signal || signal.action === 'WAIT') return;

        this.isExecuting = true;

        try {
            const user = await User.findById(this.userId);
            if (!user || user.trades_remaining <= 0) {
                this.isExecuting = false;
                return;
            }

            const stake = this.calculateStake(signal.confidence, signal.setupQuality);

            console.log(`ðŸ’¸ ${signal.action} ${signal.symbol} | $${signal.entry_price.toFixed(2)} | $${stake} | ${signal.confidence}%`);

            const tradeResult = await derivService.placeTrade(signal.symbol, signal.action, stake, 2, 'm');

            const tradeId = await Trade.create({
                user_id: this.userId,
                contract_id: tradeResult.buy.contract_id,
                symbol: signal.symbol,
                action: signal.action,
                entry_price: signal.entry_price,
                stake: stake,
                confidence: signal.confidence,
                pattern: signal.pattern,
                rsi: signal.rsi,
                session: signal.session,
                is_auto: this.mode === 'AUTO' ? 1 : 0
            });

            await User.deductTrade(this.userId);
            this.totalTrades++;
            this.lastTradeTime = Date.now();
            this.dailyTradeCount++;

            this.activeTrade = {
                id: tradeId,
                contract_id: tradeResult.buy.contract_id,
                symbol: signal.symbol,
                action: signal.action,
                entry_price: signal.entry_price,
                stake: stake,
                entry_time: Date.now(),
                exit_time: Date.now() + this.MAX_TRADE_DURATION,
                confidence: signal.confidence,
                pattern: signal.pattern,
                isSniper: stake >= this.MAX_STAKE * 0.9
            };

            broadcastTradeResult({
                id: tradeId,
                contract_id: tradeResult.buy.contract_id,
                symbol: signal.symbol,
                action: signal.action,
                entry_price: signal.entry_price,
                exit_price: null,
                profit: null,
                stake: stake,
                status: 'PENDING'
            });

            console.log(`âœ… Trade #${tradeId} OPEN | ${signal.symbol} ${signal.action} | $${stake}`);

        } catch (error) {
            console.error('âŒ Execute error:', error.message);
        } finally {
            this.isExecuting = false;
        }
    }

    calculateStake(confidence, setupQuality) {
        this.recalculateStakes();

        if (this.consecutiveLosses >= 2) {
            return this.MIN_STAKE;
        }

        if (this.consecutiveWins >= 3 && confidence >= 75) {
            console.log(`ðŸš€ Win streak ${this.consecutiveWins} + High confidence â†’ Using CONFIDENT stake`);
            return this.CONFIDENT_STAKE;
        }

        let stake = this.BASE_STAKE;
        if (setupQuality >= 75) stake = this.CONFIDENT_STAKE;
        else if (setupQuality >= 60) stake = this.BASE_STAKE;
        else stake = this.MIN_STAKE;

        if (stake > this.MAX_STAKE) {
            stake = this.MAX_STAKE;
        }
        if (stake < this.MIN_STAKE) {
            stake = this.MIN_STAKE;
        }

        return stake;
    }

    // â”€â”€â”€ Analyze Market â”€â”€â”€

    async analyzeMarket() {
        try {
            if (this.isExecuting) return;
            if (this.pausedUntil > Date.now()) return;
            if (this.activeTrade) return;

            const dailyLimitHit = await this.updateDailyLimits();
            if (dailyLimitHit) return;

            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) return;

            const now = Date.now();
            if (now - this.dailyResetTime > 24 * 60 * 60 * 1000) {
                this.dailyTradeCount = 0;
                this.dailyResetTime = now;
            }

            if (this.dailyTradeCount >= 12) {
                if (!this._dailyLimitLog || Date.now() - this._dailyLimitLog > 3600000) {
                    console.log(`ðŸ“Š [Daily Limit] Reached ${this.dailyTradeCount} trades. Pausing until tomorrow.`);
                    this._dailyLimitLog = Date.now();
                }
                return;
            }

            const bestSignal = await this.findBestSetup();

            if (bestSignal) {
                console.log(`ðŸš€ [TRADE SIGNAL] ${bestSignal.symbol}: ${bestSignal.action} | Conf: ${bestSignal.confidence}% | Quality: ${bestSignal.setupQuality}`);
                await this.executeEntry(bestSignal);
            } else {
                const session = this.getCurrentSession();
                if (!this._lastAnalysisLog || Date.now() - this._lastAnalysisLog > 30000) {
                    const status = [];
                    for (const symbol of this.symbols) {
                        const data = this.symbolData[symbol];
                        const mState = marketData.getMarketState(symbol);
                        status.push(`${symbol}: ${data?.trades || 0} trades, ${data?.winRate?.toFixed(1) || 0}% WR, RSI: ${mState.rsi || 0}`);
                    }
                    console.log(`ðŸ” [Analysis] ${session} | ${status.join(' | ')}`);
                    this._lastAnalysisLog = Date.now();
                }
            }
        } catch (error) {
            console.error('âŒ Analysis error:', error.message);
        }
    }

    // â”€â”€â”€ Lifecycle â”€â”€â”€

    async syncBalanceFromDeriv() {
        if (!derivService.authorized) return;
        try {
            const balanceResult = await derivService.getBalance();
            if (balanceResult && balanceResult.balance > 0) {
                const newBalance = balanceResult.balance;
                if (Math.abs(newBalance - this.currentBalance) > 0.01) {
                    console.log(`ðŸ’° [AI Trader] Balance updated: $${this.currentBalance.toFixed(2)} â†’ $${newBalance.toFixed(2)}`);
                    this.currentBalance = newBalance;
                    await this.updateDailyLimits();
                    this.recalculateStakes();
                }
            }
        } catch (error) {
            console.error('âŒ [AI Trader] Failed to sync balance:', error.message);
        }
    }

    async seedCandlesFromHistory(symbol) {
        try {
            const result = await derivService.getCandles(symbol, 60, 30);
            if (result?.success && result.candles && result.candles.length > 0) {
                let seeded = 0;
                result.candles.forEach(c => {
                    if (c.close) {
                        marketData.addTick({ epoch: c.epoch, quote: c.close }, symbol);
                        seeded++;
                    }
                });
                if (seeded > 0) {
                    console.log(`ðŸ“Š [AI Trader] Seeded ${seeded} candles for ${symbol}`);
                }
            }
        } catch (e) {
            console.log(`âš ï¸ [AI Trader] Could not seed candles for ${symbol}: ${e.message}`);
        }
    }

    // â”€â”€â”€ START â”€â”€â”€

    async start(userId, symbol = 'R_75', mode = 'AUTO') {
        if (this.isRunning) {
            console.log('âš ï¸ [AI Trader] Already running, stopping first...');
            this.stop();
        }

        this.userId = userId;
        this.mode = mode;

        try {
            const user = await User.findById(userId);
            if (!user) {
                console.error(`âŒ [AI Trader] User ${userId} not found`);
                return;
            }

            const token = user.is_demo ? user.demo_token : user.real_token;
            if (!token || token.trim().length < 10) {
                console.error(`âŒ [AI Trader] No valid Deriv token found for user ${userId}`);
                return;
            }

            console.log(`ðŸ”‘ [AI Trader] Connecting to Deriv with ${user.is_demo ? 'DEMO' : 'REAL'} account...`);

            try {
                await derivService.connect(token, false, user.is_demo);
                console.log(`âœ… [AI Trader] Connected to Deriv successfully!`);
            } catch (connError) {
                console.error(`âŒ [AI Trader] Failed to connect:`, connError.message);
                return;
            }

        } catch (err) {
            console.error(`âŒ [AI Trader] Failed to get user:`, err.message);
            return;
        }

        this.isRunning = true;
        this.isExecuting = false;
        this.activeTrade = null;
        this.consecutiveLosses = 0;
        this.consecutiveWins = 0;
        this.recentResults = [];
        this.tickCount = 0;
        this.dailyTradeCount = 0;

        await this.loadSymbolData();

        let balanceRetries = 3;
        while (balanceRetries > 0) {
            try {
                const bal = await derivService.getBalance();
                if (bal?.balance && bal.balance > 0) {
                    this.currentBalance = bal.balance;
                    this.dailyStartBalance = bal.balance;
                    console.log(`ðŸ’° [AI Trader] Initial balance synced: $${this.currentBalance.toFixed(2)}`);
                    break;
                }
            } catch (e) {}
            balanceRetries--;
            if (balanceRetries > 0) await new Promise(r => setTimeout(r, 2000));
        }

        this.recalculateStakes();

        const session = this.getCurrentSession();
        console.log(`ðŸ¤– [AI Trader] Starting v15.0.36 (First Trade Ready)`);
        console.log(`ðŸ“š [AI Trader] Symbols: ${this.symbols.join(', ')} | Session: ${session}`);
        console.log(`ðŸ’° [AI Trader] Balance: $${this.currentBalance.toFixed(2)}`);
        console.log(`ðŸŽ¯ [AI Trader] Profit Target: ${this.PROFIT_TARGET_PCT * 100}% | Stop Loss: ${this.STOP_LOSS_PCT * 100}%`);
        console.log(`ðŸ“Š [Stakes] MIN: $${this.MIN_STAKE} | BASE: $${this.BASE_STAKE} | CONFIDENT: $${this.CONFIDENT_STAKE} | MAX: $${this.MAX_STAKE}`);

        // ðŸš€ SYMBOL MAPPING: Map Deriv symbols to display names
        const symbolMap = {
            'frxXAUUSD': 'XAU/USD (Gold)',
            'frxXAGUSD': 'XAG/USD (Silver)',
            'frxXPTUSD': 'XPT/USD (Platinum)',
            'frxXPDUSD': 'XPD/USD (Palladium)',
            'R_10': 'R_10',
            'R_25': 'R_25',
            'R_50': 'R_50',
            'R_75': 'R_75',
            'R_100': 'R_100',
            'R_10_2S': 'R_10_2S',
            'R_25_2S': 'R_25_2S',
            'R_50_2S': 'R_50_2S',
            'R_75_2S': 'R_75_2S',
            'R_100_2S': 'R_100_2S',
            'BOOM300': 'Boom 300',
            'BOOM500': 'Boom 500',
            'BOOM1000': 'Boom 1000',
            'CRASH300': 'Crash 300',
            'CRASH500': 'Crash 500',
            'CRASH1000': 'Crash 1000'
        };

        // Subscribe to all symbols with retry
        for (const sym of this.symbols) {
            let retries = 5;
            let subscribed = false;
            while (retries > 0 && !subscribed) {
                try {
                    await derivService.subscribeToTicks(sym);
                    console.log(`ðŸ“¡ Subscribed to ${sym}`);
                    subscribed = true;
                    setTimeout(() => this.seedCandlesFromHistory(sym), 2000);
                } catch (err) {
                    retries--;
                    console.log(`âš ï¸ [AI Trader] Subscribe error for ${sym}: ${err.message} (${retries} retries left)`);
                    if (retries > 0) await new Promise(r => setTimeout(r, 3000));
                }
            }
            if (!subscribed) {
                console.log(`âŒ [AI Trader] Failed to subscribe to ${sym} after multiple attempts`);
            }
        }

        // ðŸš€ FIXED: Listen to ticks with symbol mapping
        derivService.on('tick', (tick) => {
            // Map Deriv symbol to display name
            let symbol = tick.symbol;
            if (symbolMap[symbol]) {
                symbol = symbolMap[symbol];
            }

            // Also check if symbol contains XAUUSD
            if (symbol && symbol.includes('XAUUSD')) {
                symbol = 'XAU/USD (Gold)';
            }

            marketData.addTick(tick, symbol);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount === 1) {
                console.log(`ðŸŽ‰ FIRST TICK! ${symbol} Price: $${tick.quote?.toFixed(2)}`);
                this.dataReady = true;
            }
            if (this.tickCount % 100 === 0) {
                console.log(`ðŸ“ˆ Tick #${this.tickCount} - ${symbol} $${tick.quote?.toFixed(2)}`);
            }
            this.onMarketUpdate();
        });

        derivService.on('contract_update', this.handleContractUpdate);

        this.analysisInterval = setInterval(() => this.analyzeMarket(), 10000);

        this.tickHealthInterval = setInterval(async () => {
            const timeSinceLastTick = Date.now() - this.lastTickTime;
            if (this.tickCount > 0 && timeSinceLastTick > 90000 && !this.forceReconnecting) {
                this.forceReconnecting = true;
                try {
                    await derivService.forceReconnectForTicks('R_75');
                    this.lastTickTime = Date.now();
                } catch (err) {}
                this.forceReconnecting = false;
            }
        }, 60000);

        this.balanceSyncInterval = setInterval(() => this.syncBalanceFromDeriv(), 30000);

        setInterval(async () => {
            if (this.activeTrade) {
                const timeOpen = Date.now() - this.activeTrade.entry_time;
                if (timeOpen > this.MAX_TRADE_DURATION) {
                    console.log(`â° Trade timeout! Closing after ${Math.floor(timeOpen / 1000)}s`);
                    try {
                        const contractResult = await derivService.getClosedContract(this.activeTrade.contract_id);
                        if (contractResult && contractResult.proposal_open_contract) {
                            const contract = contractResult.proposal_open_contract;
                            let profit = 0;
                            if (contract.profit !== undefined && contract.profit !== null) {
                                profit = Number(contract.profit);
                            }
                            if (isNaN(profit)) profit = -this.activeTrade.stake;
                            const status = profit > 0 ? 'WIN' : 'LOSS';
                            await this.closeTrade(this.activeTrade.contract_id, profit, status);
                        } else {
                            await this.closeTrade(this.activeTrade.contract_id, -this.activeTrade.stake, 'LOSS');
                        }
                    } catch (err) {
                        await this.closeTrade(this.activeTrade.contract_id, -this.activeTrade.stake, 'LOSS');
                    }
                }
            }
        }, 5000);

        setTimeout(() => {
            this.syncBalanceFromDeriv();
            this.analyzeMarket();
        }, 5000);
    }

    onMarketUpdate() {
        if (this.activeTrade) {
            const now = Date.now();
            const timeLeft = this.activeTrade.exit_time - now;
            if (timeLeft > 0) {
                broadcastAIUpdate({
                    type: 'active_trade_update',
                    trade: {
                        ...this.activeTrade,
                        current_price: marketData.getCurrentPrice(this.activeTrade.symbol),
                        time_remaining: Math.floor(timeLeft / 1000)
                    }
                });
            }
        }
        broadcastAIUpdate(this.getCurrentAnalysis());
    }

    getCurrentAnalysis() {
        const allSymbols = {};
        for (const symbol of this.symbols) {
            const data = this.symbolData[symbol];
            const mState = marketData.getMarketState(symbol);
            allSymbols[symbol] = {
                price: mState.price,
                rsi: mState.rsi,
                trend: mState.trend,
                winRate: data?.winRate || 0,
                trades: data?.trades || 0,
                isReady: data?.isReady || false,
                score: data?.score || 50
            };
        }

        return {
            type: 'ai_update',
            watch_state: {
                status: this.activeTrade ? 'IN_TRADE' : 'WATCHING',
                action: this.activeTrade ? this.activeTrade.action : 'WAIT',
                symbol: this.activeTrade ? this.activeTrade.symbol : 'Watching',
                entry_price: this.activeTrade?.entry_price || null,
                take_profit: this.activeTrade?.take_profit || null,
                stop_loss: this.activeTrade?.stop_loss || null,
                confidence: this.activeTrade?.confidence || 0,
                pattern: this.activeTrade?.pattern || null,
                reason: this.activeTrade ? `${this.activeTrade.action} ${this.activeTrade.symbol} active` : 'Searching for setups...',
                lastUpdate: Date.now(),
                allSymbols: allSymbols,
                daily_trades: this.dailyTradeCount,
                consecutive_wins: this.consecutiveWins,
                consecutive_losses: this.consecutiveLosses,
                balance: this.currentBalance
            },
            active_trade: this.activeTrade,
            in_trade: !!this.activeTrade,
            daily_trades: this.dailyTradeCount,
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
        if (this.balanceSyncInterval) { clearInterval(this.balanceSyncInterval); this.balanceSyncInterval = null; }
        derivService.removeListener('contract_update', this.handleContractUpdate);
        console.log('ðŸ¤– AI Trader Stopped');
    }

    setMode(mode) { this.mode = mode; console.log(`Mode: ${mode}`); }
    setUserId(userId) { this.userId = userId; }
    getCurrentSetup() { return this.currentWatchState; }
    getPendingSetup() { return null; }
    declineManualSetup() {}
    executeManualTrade(action, stake) {}
}

module.exports = new AITrader();
