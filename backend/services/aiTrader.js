/**
 * AI Trader Service - The Brain
 * Runs continuously, watches market, decides when to enter/exit
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
        this.currentAnalysis = null;
        this.currentWatchState = {
            status: 'INITIALIZING',
            action: 'WAIT',
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
        this.userId = 1;
        this.symbol = 'R_75';
        this.mode = 'AUTO';
        this.lastSetupNotified = false;
        this.currentSetupId = null;
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
        this.lastSetupNotified = false;
        
        console.log(`🤖 [AI Trader] Starting with ${mode} mode for user ${userId}, symbol ${symbol}`);
        
        await derivService.subscribeToTicks(symbol);
        
        derivService.on('tick', (tick) => {
            marketData.addTick(tick);
            this.onMarketUpdate();
        });
        
        this.analysisInterval = setInterval(() => {
            this.analyzeMarket();
        }, 10000);
        
        setTimeout(() => this.analyzeMarket(), 1000);
    }
    
    onMarketUpdate() {
        if (this.currentWatchState.action === 'WAIT' && this.currentWatchState.entry_price) {
            const currentPrice = marketData.getCurrentPrice();
            const marketState = marketData.getMarketState();
            
            let shouldEnter = false;
            
            if (this.currentWatchState.action === 'WAIT_BUY') {
                if (marketState.nearSupport || currentPrice <= this.currentWatchState.entry_price) {
                    shouldEnter = true;
                }
            } else if (this.currentWatchState.action === 'WAIT_SELL') {
                if (marketState.nearResistance || currentPrice >= this.currentWatchState.entry_price) {
                    shouldEnter = true;
                }
            }
            
            if (shouldEnter && !this.activeTrade) {
                this.executeEntry();
            }
        }
        
        if (this.activeTrade) {
            this.updateActiveTrade();
        }
        
        broadcastAIUpdate(this.getCurrentAnalysis());
    }
    
    async analyzeMarket() {
        try {
            const marketState = marketData.getMarketState();
            const currentPrice = marketState.price;
            
            const recentTrades = await Trade.getUserTrades(this.userId, 10);
            const patterns = await Pattern.getTopPatterns(5);
            
            const analysis = await deepseekService.analyzeMarket(
                this.symbol,
                currentPrice,
                marketState.rsi,
                'neutral',
                null,
                recentTrades,
                patterns
            );
            
            const action = analysis.action === 'CALL' ? 'BUY' : (analysis.action === 'PUT' ? 'SELL' : 'WAIT');
            const takeProfit = analysis.take_profit || (action === 'BUY' ? currentPrice * 1.004 : currentPrice * 0.996);
            const stopLoss = analysis.stop_loss || (action === 'BUY' ? currentPrice * 0.998 : currentPrice * 1.002);
            
            let watchAction = 'WAIT';
            let entryCondition = null;
            let estimatedTime = null;
            let entryPrice = null;
            let isNewSetup = false;
            
            if (action === 'BUY' && marketState.nearSupport) {
                watchAction = 'WAIT_BUY';
                entryCondition = `Price hits support at $${marketState.support.toFixed(2)}`;
                estimatedTime = '~1-2 minutes';
                entryPrice = marketState.support;
                if (analysis.confidence >= 50) isNewSetup = true;
            } else if (action === 'SELL' && marketState.nearResistance) {
                watchAction = 'WAIT_SELL';
                entryCondition = `Price hits resistance at $${marketState.resistance.toFixed(2)}`;
                estimatedTime = '~1-2 minutes';
                entryPrice = marketState.resistance;
                if (analysis.confidence >= 50) isNewSetup = true;
            } else if (analysis.confidence > 70) {
                watchAction = action;
                entryCondition = 'Market conditions are optimal now';
                estimatedTime = 'Now';
                entryPrice = currentPrice;
                if (analysis.confidence >= 50) isNewSetup = true;
            } else {
                watchAction = 'WAIT';
                entryCondition = 'Waiting for better setup';
                estimatedTime = 'Unknown';
                entryPrice = null;
                this.lastSetupNotified = false;
            }
            
            // Check if this is a new valid setup (50%+ confidence and not notified yet)
            const setupKey = `${watchAction}_${entryPrice}_${analysis.confidence}`;
            if (isNewSetup && !this.activeTrade && setupKey !== this.currentSetupId) {
                this.currentSetupId = setupKey;
                this.lastSetupNotified = false;
            }
            
            if (isNewSetup && !this.lastSetupNotified && !this.activeTrade && watchAction !== 'WAIT') {
                this.lastSetupNotified = true;
                
                // Broadcast new setup alert
                broadcastNewSetup({
                    symbol: this.symbol,
                    action: watchAction,
                    action_display: watchAction === 'BUY' ? 'BUY (Price will go UP)' : 'SELL (Price will go DOWN)',
                    entry_price: entryPrice,
                    take_profit: takeProfit,
                    stop_loss: stopLoss,
                    confidence: analysis.confidence,
                    reason: analysis.simple_reason,
                    pattern: analysis.pattern,
                    entry_condition: entryCondition,
                    estimated_time: estimatedTime,
                    market_price: currentPrice,
                    market_rsi: marketState.rsi,
                    market_feeling: marketState.feeling,
                    market_support: marketState.support,
                    market_resistance: marketState.resistance
                });
                
                console.log(`🔔 [AI Trader] NEW SETUP DETECTED! ${watchAction} at $${entryPrice} with ${analysis.confidence}% confidence`);
            }
            
            // For AUTO mode, execute immediately if setup is valid and not waiting
            if (this.mode === 'AUTO' && watchAction !== 'WAIT' && watchAction !== 'WAIT_BUY' && watchAction !== 'WAIT_SELL' && !this.activeTrade && analysis.confidence >= 50) {
                console.log(`🤖 [AI Trader] AUTO MODE: Executing trade immediately`);
                await this.executeEntry();
            }
            
            this.currentWatchState = {
                status: this.activeTrade ? 'IN_TRADE' : 'WATCHING',
                action: watchAction,
                action_display: watchAction === 'BUY' ? 'BUY (Price will go UP)' : (watchAction === 'SELL' ? 'SELL (Price will go DOWN)' : 'WAITING'),
                entry_price: entryPrice,
                entry_condition: entryCondition,
                estimated_entry_time: estimatedTime,
                take_profit: takeProfit,
                stop_loss: stopLoss,
                confidence: analysis.confidence,
                reason: analysis.simple_reason || analysis.reasoning,
                pattern: analysis.pattern,
                market_price: currentPrice,
                market_rsi: marketState.rsi,
                market_feeling: marketState.feeling,
                market_support: marketState.support,
                market_resistance: marketState.resistance,
                trend: marketState.trend,
                lastUpdate: Date.now(),
                is_auto_mode: this.mode === 'AUTO',
                is_new_setup: isNewSetup && !this.activeTrade
            };
            
            console.log(`🤖 [AI Trader] Analysis: ${watchAction} | Confidence: ${analysis.confidence}% | ${entryCondition || ''}`);
            
        } catch (error) {
            console.error('❌ [AI Trader] Analysis error:', error.message);
        }
    }
    
    async executeEntry() {
        if (this.activeTrade) {
            console.log('⚠️ [AI Trader] Already in a trade, cannot execute new entry');
            return;
        }
        
        const user = await User.findById(this.userId);
        if (user.trades_remaining <= 0) {
            console.log('⚠️ [AI Trader] No trades remaining');
            broadcastNotification('No Trades Left', 'Your voucher has no remaining trades', 'warning');
            return;
        }
        
        const entryPrice = this.currentWatchState.entry_price || marketData.getCurrentPrice();
        const stake = user.base_stake || 0.35;
        
        if (stake < 0.35) {
            console.log(`⚠️ [AI Trader] Stake $${stake} below minimum $0.35`);
            return;
        }
        
        const action = this.currentWatchState.action === 'BUY' ? 'BUY' : 
                      (this.currentWatchState.action === 'SELL' ? 'SELL' : 
                      (this.currentWatchState.action === 'WAIT_BUY' ? 'BUY' : 'SELL'));
        
        if (action !== 'BUY' && action !== 'SELL') {
            console.log('⚠️ [AI Trader] No valid action to execute');
            return;
        }
        
        try {
            const token = user.is_demo ? user.demo_token : user.real_token;
            if (!derivService.authorized || derivService.currentToken !== token) {
                await derivService.reconnectWithToken(token);
            }
            
            const tradeResult = await derivService.placeTrade(this.symbol, action, stake, 5, 'm');
            
            const tradeId = await Trade.create({
                user_id: this.userId,
                contract_id: tradeResult.buy.contract_id,
                symbol: this.symbol,
                action: action,
                entry_price: entryPrice,
                stake: stake,
                confidence: this.currentWatchState.confidence,
                pattern: this.currentWatchState.pattern || 'AI Detected',
                rsi: this.currentWatchState.market_rsi || 50,
                session: this.getCurrentSession(),
                is_auto: this.mode === 'AUTO' ? 1 : 0
            });
            
            await User.deductTrade(this.userId);
            
            const exitTime = Date.now() + (5 * 60 * 1000);
            
            this.activeTrade = {
                id: tradeId,
                contract_id: tradeResult.buy.contract_id,
                action: action,
                entry_price: entryPrice,
                stake: stake,
                entry_time: Date.now(),
                exit_time: exitTime,
                confidence: this.currentWatchState.confidence,
                pattern: this.currentWatchState.pattern
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
            
            broadcastNotification('Trade Executed', `${action} ${this.symbol} at $${entryPrice.toFixed(2)}`, 'success');
            
            console.log(`✅ [AI Trader] Trade executed: ${action} ${this.symbol} at $${entryPrice.toFixed(2)}`);
            
            setTimeout(() => this.checkTradeResult(tradeId, tradeResult.buy.contract_id, entryPrice, stake), 330000);
            
            this.currentWatchState.status = 'IN_TRADE';
            this.lastSetupNotified = false;
            this.currentSetupId = null;
            
        } catch (error) {
            console.error('❌ [AI Trader] Execute entry error:', error.message);
            broadcastNotification('Trade Failed', error.message, 'error');
        }
    }
    
    async updateActiveTrade() {
        if (!this.activeTrade) return;
        
        const now = Date.now();
        const timeLeft = this.activeTrade.exit_time - now;
        
        if (timeLeft <= 0) {
            return;
        }
        
        const currentPrice = marketData.getCurrentPrice();
        const pnl = this.activeTrade.action === 'BUY' 
            ? currentPrice - this.activeTrade.entry_price 
            : this.activeTrade.entry_price - currentPrice;
        const pnlAmount = pnl * this.activeTrade.stake;
        
        broadcastAIUpdate({
            type: 'active_trade_update',
            trade: {
                ...this.activeTrade,
                current_price: currentPrice,
                pnl: pnlAmount,
                time_remaining: Math.floor(timeLeft / 1000)
            }
        });
    }
    
    async checkTradeResult(tradeId, contractId, entryPrice, stake) {
        try {
            let contractResult = null;
            let retries = 10;
            
            while (retries > 0 && !contractResult) {
                contractResult = await derivService.getClosedContract(contractId);
                if (contractResult) break;
                await new Promise(r => setTimeout(r, 30000));
                retries--;
            }
            
            if (contractResult) {
                let profit = contractResult.profit || 0;
                const status = profit > 0 ? 'WIN' : 'LOSS';
                
                await Trade.updateResult(tradeId, contractResult.exit_tick?.quote || entryPrice, profit, status);
                await User.updateStats(this.userId, status, profit, stake);
                await Pattern.recordTradeResult(this.currentWatchState.pattern, this.symbol, this.activeTrade?.action, this.getCurrentSession(), status === 'WIN');
                
                broadcastTradeResult({
                    id: tradeId,
                    contract_id: contractId,
                    symbol: this.symbol,
                    action: this.activeTrade?.action,
                    entry_price: entryPrice,
                    exit_price: contractResult.exit_tick?.quote || entryPrice,
                    profit: profit,
                    stake: stake,
                    status: status
                });
                
                console.log(`✅ [AI Trader] Trade ${tradeId} result: ${status} $${profit.toFixed(2)}`);
                
                this.activeTrade = null;
                this.currentWatchState.status = 'WATCHING';
                this.lastSetupNotified = false;
                
            } else {
                console.log(`⚠️ [AI Trader] No result found for contract ${contractId}, assuming LOSS`);
                await Trade.updateResult(tradeId, entryPrice, -stake, 'LOSS');
                await User.updateStats(this.userId, 'LOSS', -stake, stake);
                this.activeTrade = null;
                this.currentWatchState.status = 'WATCHING';
                this.lastSetupNotified = false;
            }
        } catch (error) {
            console.error('❌ [AI Trader] Result check error:', error.message);
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
            timestamp: Date.now()
        };
    }
    
    stop() {
        this.isRunning = false;
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        console.log('🤖 [AI Trader] Stopped');
    }
    
    setMode(mode) {
        this.mode = mode;
        console.log(`🤖 [AI Trader] Mode changed to ${mode}`);
    }
    
    setSymbol(symbol) {
        this.symbol = symbol;
        console.log(`🤖 [AI Trader] Symbol changed to ${symbol}`);
        derivService.subscribeToTicks(symbol);
        this.lastSetupNotified = false;
        this.currentSetupId = null;
        this.currentWatchState.status = 'ANALYZING_NEW_SYMBOL';
        this.currentWatchState.reason = `Analyzing ${symbol}... Please wait 10-15 seconds`;
        broadcastAIUpdate(this.getCurrentAnalysis());
    }
    
    setUserId(userId) {
        this.userId = userId;
        console.log(`🤖 [AI Trader] User changed to ${userId}`);
    }
    
    getCurrentSetup() {
        if (this.currentWatchState.action === 'WAIT' || this.currentWatchState.action === 'WAIT_BUY' || this.currentWatchState.action === 'WAIT_SELL') {
            return null;
        }
        return {
            action: this.currentWatchState.action,
            entry_price: this.currentWatchState.entry_price,
            take_profit: this.currentWatchState.take_profit,
            stop_loss: this.currentWatchState.stop_loss,
            confidence: this.currentWatchState.confidence,
            reason: this.currentWatchState.reason,
            pattern: this.currentWatchState.pattern,
            market_price: this.currentWatchState.market_price,
            market_feeling: this.currentWatchState.market_feeling
        };
    }
}

module.exports = new AITrader();
