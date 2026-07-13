/**
 * AI Trader Service - The Professional
 * v15.0.7 - Dynamic stake scaling based on account size, bigger wins
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
        
        // 🚀 DYNAMIC TRADE PARAMETERS (Scale with account)
        this.PROFIT_TARGET_PCT = 0.08;   // 8% base
        this.STOP_LOSS_PCT = 0.02;       // 2% base
        this.MAX_TRADE_DURATION = 300000;
        
        // 🚀 STAKE CONFIGURATION (Dynamic based on balance)
        this.MIN_STAKE_PCT = 0.005;       // 0.5% of balance (minimum)
        this.BASE_STAKE_PCT = 0.01;       // 1% of balance
        this.CONFIDENT_STAKE_PCT = 0.02;  // 2% of balance (for high confidence)
        this.MAX_STAKE_PCT = 0.03;        // 3% of balance (maximum)
        
        // 🚀 FIXED: No hard cap on stakes (scales with account)
        this.MIN_STAKE_LIMIT = 1;          // Minimum $1
        this.MAX_STAKE_LIMIT = 999999;    // No practical cap
        
        // Current stakes (recalculated on balance change)
        this.MIN_STAKE = 1;
        this.BASE_STAKE = 10;
        this.CONFIDENT_STAKE = 20;
        this.MAX_STAKE = 30;
        
        // Session blocking
        this.blockedSessions = {};
        this._lastLondonLog = 0;
        this._lastAnalysisLog = 0;
        this._lastBalanceLog = 0;
        this._dailyLimitLog = 0;
        this._lastLossPauseLog = 0;
        this._londonBlocked = false;
        
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
                isReady: false,
                lastTrade: null,
                currentStreak: 0,
                bestStreak: 0,
                score: 50
            };
        }
    }

    // ─── Helper Functions ───

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

        // 🚀 DYNAMIC STAKE CALCULATION (Scale with account)
        let stakeMultiplier = 1.0;
        if (this.consecutiveWins >= 3) {
            stakeMultiplier = 1.5;  // Win streak: 50% bigger stakes
            console.log(`📈 [Psychology] Win streak: ${this.consecutiveWins} → Stake +50%`);
        } else if (this.consecutiveLosses >= 3) {
            stakeMultiplier = 0.5;  // Loss streak: 50% smaller stakes
            console.log(`📉 [Psychology] Loss streak: ${this.consecutiveLosses} → Stake -50%`);
        } else if (this.consecutiveLosses >= 2) {
            stakeMultiplier = 0.75;  // 2 losses: 25% smaller
        }

        // Calculate stakes based on balance percentages
        let minStake = bal * this.MIN_STAKE_PCT * stakeMultiplier;
        let baseStake = bal * this.BASE_STAKE_PCT * stakeMultiplier;
        let confidentStake = bal * this.CONFIDENT_STAKE_PCT * stakeMultiplier;
        let maxStake = bal * this.MAX_STAKE_PCT * stakeMultiplier;

        // Round to nearest $0.50
        this.MIN_STAKE = this.roundStake(minStake);
        this.BASE_STAKE = this.roundStake(baseStake);
        this.CONFIDENT_STAKE = this.roundStake(confidentStake);
        this.MAX_STAKE = this.roundStake(maxStake);

        // Safety: Never risk more than 3% of account
        if (this.MAX_STAKE > bal * 0.03) this.MAX_STAKE = this.roundStake(bal * 0.03);
        if (this.CONFIDENT_STAKE > bal * 0.02) this.CONFIDENT_STAKE = this.roundStake(bal * 0.02);
        
        // Ensure minimum stake is at least $1
        if (this.MIN_STAKE < 1) this.MIN_STAKE = 1;
        if (this.BASE_STAKE < 1) this.BASE_STAKE = 2;
        if (this.CONFIDENT_STAKE < 1) this.CONFIDENT_STAKE = 5;
        if (this.MAX_STAKE < 1) this.MAX_STAKE = 10;

        if (!this._lastBalanceLog || Date.now() - this._lastBalanceLog > 3600000) {
            console.log(`💰 [Stakes] Balance: $${bal.toFixed(2)} | Tier: ${tier} | MIN=$${this.MIN_STAKE} | BASE=$${this.BASE_STAKE} | CONFIDENT=$${this.CONFIDENT_STAKE} | MAX=$${this.MAX_STAKE} (${(this.MAX_STAKE/bal*100).toFixed(1)}% of balance)`);
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

    // ─── Symbol Learning ───

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
                    isReady: false,
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
                data.isReady = data.trades >= 1;
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
                console.log(`📊 [Symbol] ${symbol}: ${symbolMap[symbol].trades} trades, ${symbolMap[symbol].winRate.toFixed(1)}% WR, Ready: ${symbolMap[symbol].isReady}`);
            }
        } catch (error) {
            console.error('❌ Failed to load symbol data:', error.message);
        }
    }

    // ─── Session Blocking ───

    async isSessionBlocked(session, symbol) {
        const data = this.symbolData[symbol];
        if (!data || !data.sessionPerformance[session]) return false;
        const perf = data.sessionPerformance[session];
        if (perf.total < 10) return false;
        const winRate = (perf.wins / perf.total) * 100;
        if (winRate < 30 && perf.total >= 10) {
            return true;
        }
        return false;
    }

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

    // ─── Update Daily Limits ───

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
            console.log(`📅 [Daily] Reset. Start balance: $${this.dailyStartBalance.toFixed(2)}`);
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

    // ─── Trade Management ───

    async handleContractUpdate(contract) {
        if (!this.activeTrade || contract.contract_id !== this.activeTrade.contract_id) return;

        const rawProfit = contract.profit !== undefined && contract.profit !== null ? contract.profit : 0;
        let currentProfit = Number(rawProfit);
        if (isNaN(currentProfit)) currentProfit = 0;

        const stake = this.activeTrade.stake;
        const targetProfit = stake * this.PROFIT_TARGET_PCT;
        const maxLoss = stake * this.STOP_LOSS_PCT;

        console.log(`📊 [Trade Monitor] ${this.activeTrade.symbol} Contract ${contract.contract_id}: Profit=$${currentProfit.toFixed(2)} | Target=$${targetProfit.toFixed(2)} | Stop=$${maxLoss.toFixed(2)}`);

        if (currentProfit >= targetProfit) {
            console.log(`🎯 PROFIT TARGET HIT! Closing at +$${currentProfit.toFixed(2)}`);
            await this.closeTrade(contract.contract_id, currentProfit, 'WIN');
        } else if (currentProfit <= -maxLoss) {
            console.log(`🛑 STOP LOSS HIT! Closing at -$${Math.abs(currentProfit).toFixed(2)}`);
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
            const symbol = this.activeTrade.symbol;

            let exitPrice = entryPrice;
            if (status === 'WIN') {
                exitPrice = entryPrice * (1 + (finalProfit / stake));
            } else {
                exitPrice = entryPrice * (1 - (Math.abs(finalProfit) / stake));
            }

            console.log(`📝 Closing trade #${tradeId}: ${symbol} ${status} | Profit: $${finalProfit.toFixed(2)} | Exit: $${exitPrice.toFixed(2)}`);

            await Trade.updateResult(tradeId, exitPrice, finalProfit, status);
            await User.updateStats(this.userId, status, finalProfit, stake);
            await Pattern.recordTradeResult(this.activeTrade.pattern, symbol, this.activeTrade.action, this.getCurrentSession(), status === 'WIN');

            this.recentResults.push(status);
            if (this.recentResults.length > 30) this.recentResults.shift();

            // Update per-symbol data
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
                symbolData.isReady = symbolData.trades >= 1;
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
                console.log(`🎉 WIN! +$${Math.abs(finalProfit).toFixed(2)} | Streak: ${this.consecutiveWins}W/${this.consecutiveLosses}L`);
                // Recalculate stakes after win (may increase)
                this.recalculateStakes();
            } else {
                this.totalLosses++;
                this.consecutiveLosses++;
                this.consecutiveWins = 0;
                this.dailyLoss += Math.abs(finalProfit);
                console.log(`❌ LOSS #${this.consecutiveLosses} | -$${Math.abs(finalProfit).toFixed(2)}`);
                this.recordSessionTrade(this.getCurrentSession(), symbol, false);
                // Recalculate stakes after loss (may decrease)
                this.recalculateStakes();

                if (this.consecutiveLosses >= 3) {
                    this.pausedUntil = Date.now() + 900000;
                    console.log('🛑 HARD PAUSE 15min — 3 consecutive losses');
                }
            }

            broadcastTradeResult({
                id: tradeId,
                contract_id: contractId,
                symbol: symbol,
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

    // ─── Analyze Symbol ───

    async analyzeSymbol(symbol) {
        try {
            const marketState = marketData.getMarketState(symbol);
            const currentPrice = marketState.price;
            const rsi = marketState.rsi;
            const trend = marketState.trend;
            const session = this.getCurrentSession();
            const hour = new Date().getUTCHours();
            const data = this.symbolData[symbol];

            if (!currentPrice || currentPrice <= 0) return null;
            if (rsi === 0 || !rsi) return null;
            if (!data || !data.isReady) {
                return null;
            }

            // Check 1: Session blocking (London is blocked by default)
            const sessionBlocked = await this.isSessionBlocked(session, symbol);
            if (sessionBlocked) {
                return null;
            }

            // Check 2: RSI Zone (only 35-45 or 25-35)
            if (!(rsi >= 25 && rsi < 35) && !(rsi >= 35 && rsi <= 45)) {
                return null;
            }

            // Check 3: Pattern detection with default bonus
            const pattern = marketState.lastPattern || 'none';
            let patternWR = 0;
            let hasPatternData = false;
            
            if (pattern !== 'none' && data.patternPerformance[pattern]) {
                const pData = data.patternPerformance[pattern];
                if (pData.total >= 1) {
                    patternWR = (pData.wins / pData.total) * 100;
                    hasPatternData = true;
                }
            }

            // Check 4: Pattern win rate (less strict for new symbols)
            const minPatternWR = data.trades < 3 ? 30 : 45;
            if (pattern !== 'none' && patternWR > 0 && patternWR < minPatternWR) {
                return null;
            }

            // Check 5: Setup Quality with pattern bonus
            let setupQuality = 0;
            if (session === 'NEWYORK') setupQuality += 20;
            else if (session === 'ASIAN') setupQuality += 10;
            if (rsi >= 35 && rsi <= 45) setupQuality += 20;
            else if (rsi >= 25 && rsi < 35) setupQuality += 15;
            if (trend && !trend.includes('sideways')) setupQuality += 15;
            
            if (pattern !== 'none' && pattern !== 'no_significant_pattern') {
                setupQuality += 15;
            } else if (pattern === 'none' || pattern === 'no_significant_pattern') {
                setupQuality += 8;
            }
            
            if (this.consecutiveLosses === 0) setupQuality += 5;

            const minSetupQuality = data.trades < 3 ? 50 : 60;
            if (setupQuality < minSetupQuality) {
                return null;
            }

            // Check 6: Confidence
            let confidence = 55;
            if (patternWR > 0 && patternWR > 40) confidence += (patternWR - 40) * 0.25;
            if (session === 'NEWYORK') confidence += 10;
            if (rsi >= 35 && rsi <= 45) confidence += 10;
            if (this.consecutiveWins >= 2) confidence += 5;
            if (this.consecutiveLosses >= 2) confidence -= 10;

            confidence = Math.min(95, Math.max(40, Math.round(confidence)));

            const minConfidence = data.trades < 3 ? 50 : 55;
            if (confidence < minConfidence) {
                return null;
            }

            // Check 7: Action (BUY or SELL)
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
                return null;
            }

            // Generate signal
            const takeProfit = action === 'BUY' ? currentPrice * (1 + this.PROFIT_TARGET_PCT) : currentPrice * (1 - this.PROFIT_TARGET_PCT);
            const stopLoss = action === 'BUY' ? currentPrice * (1 - this.STOP_LOSS_PCT) : currentPrice * (1 + this.STOP_LOSS_PCT);

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
            console.error(`❌ Analyze ${symbol} error:`, error.message);
            return null;
        }
    }

    // ─── Find Best Setup ───

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

    // ─── Execute Entry ───

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

            // 🚀 Calculate stake with dynamic sizing
            const stake = this.calculateStake(signal.confidence, signal.setupQuality);

            console.log(`💸 ${signal.action} ${signal.symbol} | $${signal.entry_price.toFixed(2)} | $${stake} | ${signal.confidence}%`);

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

            console.log(`✅ Trade #${tradeId} OPEN | ${signal.symbol} ${signal.action} | $${stake}`);

        } catch (error) {
            console.error('❌ Execute error:', error.message);
        } finally {
            this.isExecuting = false;
        }
    }

    // 🚀 DYNAMIC STAKE CALCULATION
    calculateStake(confidence, setupQuality) {
        // Recalculate stakes based on current balance
        this.recalculateStakes();

        // If on a loss streak, use minimum stake
        if (this.consecutiveLosses >= 2) {
            console.log(`🛡️ Loss streak (${this.consecutiveLosses}) → Using MIN stake: $${this.MIN_STAKE}`);
            return this.MIN_STAKE;
        }

        // If on a win streak with high confidence, use confident stake
        if (this.consecutiveWins >= 3 && confidence >= 75) {
            console.log(`🚀 Win streak ${this.consecutiveWins} + High confidence → Using CONFIDENT stake: $${this.CONFIDENT_STAKE}`);
            return this.CONFIDENT_STAKE;
        }

        // Use base stake for normal trades
        let stake = this.BASE_STAKE;

        // Adjust based on setup quality
        if (setupQuality >= 75) {
            stake = this.CONFIDENT_STAKE;
        } else if (setupQuality >= 60) {
            stake = this.BASE_STAKE;
        } else {
            stake = this.MIN_STAKE;
        }

        // Safety: never exceed max stake
        if (stake > this.MAX_STAKE) {
            console.log(`🛑 [Safety] Stake capped: $${stake} → $${this.MAX_STAKE}`);
            stake = this.MAX_STAKE;
        }

        // Ensure minimum stake
        if (stake < this.MIN_STAKE) {
            stake = this.MIN_STAKE;
        }

        return stake;
    }

    // ─── Analyze Market ───

    async analyzeMarket() {
        try {
            if (this.isExecuting) return;
            if (this.pausedUntil > Date.now()) return;
            if (this.activeTrade) return;

            const dailyLimitHit = await this.updateDailyLimits();
            if (dailyLimitHit) return;

            const timeSinceLastTrade = Date.now() - this.lastTradeTime;
            if (this.lastTradeTime > 0 && timeSinceLastTrade < this.tradeCooldown) return;

            // Reset daily trade count
            const now = Date.now();
            if (now - this.dailyResetTime > 24 * 60 * 60 * 1000) {
                this.dailyTradeCount = 0;
                this.dailyResetTime = now;
            }

            if (this.dailyTradeCount >= 12) {
                if (!this._dailyLimitLog || Date.now() - this._dailyLimitLog > 3600000) {
                    console.log(`📊 [Daily Limit] Reached ${this.dailyTradeCount} trades. Pausing until tomorrow.`);
                    this._dailyLimitLog = Date.now();
                }
                return;
            }

            // Find best setup
            const bestSignal = await this.findBestSetup();

            if (bestSignal) {
                console.log(`✅ ${bestSignal.symbol}: ${bestSignal.action} | Conf: ${bestSignal.confidence}% | Quality: ${bestSignal.setupQuality} | ${bestSignal.reason}`);
                await this.executeEntry(bestSignal);
            } else {
                const session = this.getCurrentSession();
                if (session !== 'LONDON' && !this._lastAnalysisLog || Date.now() - this._lastAnalysisLog > 30000) {
                    const status = [];
                    for (const symbol of this.symbols) {
                        const data = this.symbolData[symbol];
                        const mState = marketData.getMarketState(symbol);
                        status.push(`${symbol}: ${data?.trades || 0} trades, ${data?.winRate?.toFixed(1) || 0}% WR, RSI: ${mState.rsi || 0}`);
                    }
                    console.log(`🔍 [Analysis] ${session} | ${status.join(' | ')}`);
                    this._lastAnalysisLog = Date.now();
                }
            }
        } catch (error) {
            console.error('❌ Analysis error:', error.message);
        }
    }

    // ─── Lifecycle ───

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
                    console.log(`📊 [AI Trader] Seeded ${seeded} candles for ${symbol}`);
                }
            }
        } catch (e) {
            console.log(`⚠️ [AI Trader] Could not seed candles for ${symbol}: ${e.message}`);
        }
    }

    async start(userId, symbol = 'R_75', mode = 'AUTO') {
        if (this.isRunning) {
            console.log('⚠️ [AI Trader] Already running, stopping first...');
            this.stop();
        }

        this.userId = userId;
        this.mode = mode;

        try {
            const user = await User.findById(userId);
            if (!user) {
                console.error(`❌ [AI Trader] User ${userId} not found`);
                return;
            }

            const token = user.is_demo ? user.demo_token : user.real_token;
            if (!token || token.trim().length < 10) {
                console.error(`❌ [AI Trader] No valid Deriv token found for user ${userId}`);
                return;
            }

            console.log(`🔑 [AI Trader] Connecting to Deriv with ${user.is_demo ? 'DEMO' : 'REAL'} account...`);

            try {
                await derivService.connect(token, false, user.is_demo);
                console.log(`✅ [AI Trader] Connected to Deriv successfully!`);
            } catch (connError) {
                console.error(`❌ [AI Trader] Failed to connect:`, connError.message);
                return;
            }

        } catch (err) {
            console.error(`❌ [AI Trader] Failed to get user:`, err.message);
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

        // Load symbol data
        await this.loadSymbolData();

        // Sync balance
        let balanceRetries = 3;
        while (balanceRetries > 0) {
            try {
                const bal = await derivService.getBalance();
                if (bal?.balance && bal.balance > 0) {
                    this.currentBalance = bal.balance;
                    this.dailyStartBalance = bal.balance;
                    console.log(`💰 [AI Trader] Initial balance synced: $${this.currentBalance.toFixed(2)}`);
                    break;
                }
            } catch (e) {}
            balanceRetries--;
            if (balanceRetries > 0) await new Promise(r => setTimeout(r, 2000));
        }

        this.recalculateStakes();

        const session = this.getCurrentSession();
        console.log(`🤖 [AI Trader] Starting v15.0.7 (Dynamic Stake Scaling)`);
        console.log(`📚 [AI Trader] Symbols: ${this.symbols.join(', ')} | Session: ${session}`);
        console.log(`💰 [AI Trader] Balance: $${this.currentBalance.toFixed(2)}`);
        console.log(`🎯 [AI Trader] Profit Target: ${this.PROFIT_TARGET_PCT * 100}% | Stop Loss: ${this.STOP_LOSS_PCT * 100}%`);
        console.log(`📊 [Stakes] MIN: $${this.MIN_STAKE} | BASE: $${this.BASE_STAKE} | CONFIDENT: $${this.CONFIDENT_STAKE} | MAX: $${this.MAX_STAKE}`);

        // Subscribe to all symbols with retry
        for (const sym of this.symbols) {
            let retries = 5;
            let subscribed = false;
            while (retries > 0 && !subscribed) {
                try {
                    await derivService.subscribeToTicks(sym);
                    console.log(`📡 Subscribed to ${sym}`);
                    subscribed = true;
                    setTimeout(() => this.seedCandlesFromHistory(sym), 2000);
                } catch (err) {
                    retries--;
                    console.log(`⚠️ [AI Trader] Subscribe error for ${sym}: ${err.message} (${retries} retries left)`);
                    if (retries > 0) await new Promise(r => setTimeout(r, 3000));
                }
            }
            if (!subscribed) {
                console.log(`❌ [AI Trader] Failed to subscribe to ${sym} after multiple attempts`);
            }
        }

        // Listen to ticks for all symbols
        derivService.on('tick', (tick) => {
            const symbol = tick.symbol || this.symbols.find(s => s.includes(tick.symbol)) || 'R_75';
            marketData.addTick(tick, symbol);
            this.tickCount++;
            this.lastTickTime = Date.now();
            if (this.tickCount === 1) {
                console.log(`🎉 FIRST TICK! ${symbol} Price: $${tick.quote?.toFixed(2)}`);
                this.dataReady = true;
            }
            if (this.tickCount % 100 === 0) {
                console.log(`📈 Tick #${this.tickCount} - ${symbol} $${tick.quote?.toFixed(2)}`);
            }
            this.onMarketUpdate();
        });

        derivService.on('contract_update', this.handleContractUpdate);

        // Analysis interval (every 10 seconds)
        this.analysisInterval = setInterval(() => this.analyzeMarket(), 10000);

        // Tick health check
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

        // Auto-close timeout
        setInterval(async () => {
            if (this.activeTrade) {
                const timeOpen = Date.now() - this.activeTrade.entry_time;
                if (timeOpen > this.MAX_TRADE_DURATION) {
                    console.log(`⏰ Trade timeout! Closing after ${Math.floor(timeOpen / 1000)}s`);
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
        console.log('🤖 AI Trader Stopped');
    }

    setMode(mode) { this.mode = mode; console.log(`Mode: ${mode}`); }
    setUserId(userId) { this.userId = userId; }
    getCurrentSetup() { return this.currentWatchState; }
    getPendingSetup() { return null; }
    declineManualSetup() {}
    executeManualTrade(action, stake) {}
}

module.exports = new AITrader();
