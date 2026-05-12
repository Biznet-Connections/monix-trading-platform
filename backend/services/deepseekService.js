const axios = require('axios');

class DeepSeekService {
    constructor() {
        this.apiKey = process.env.DEEPSEEK_API_KEY;
        this.apiUrl = process.env.DEEPSEEK_API_URL;
        this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
        this.lastCallTime = 0;
        this.minDelay = 2000;
    }

    async callWithRateLimit(fn) {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        if (timeSinceLastCall < this.minDelay) {
            await new Promise(resolve => setTimeout(resolve, this.minDelay - timeSinceLastCall));
        }
        this.lastCallTime = Date.now();
        return fn();
    }

    /**
     * Build learning context from historical trade data
     */
    buildLearningContext(patternPerformance, rsiPerformance, trendPerformance, sessionPerformance, topPatterns) {
        let context = '';

        if (patternPerformance && patternPerformance.length > 0) {
            context += '\n📊 YOUR PATTERN PERFORMANCE ON THIS SYMBOL:';
            patternPerformance.slice(0, 5).forEach(p => {
                const emoji = p.winRate >= 70 ? '🟢' : p.winRate >= 50 ? '🟡' : '🔴';
                const reliable = p.isReliable ? '' : ' ⚠️(low sample)';
                context += `\n${emoji} "${p.pattern}" → ${p.winRate}% win (${p.wins}W/${p.losses}L, ${p.total} trades)${reliable}`;
            });
            
            const bestPattern = patternPerformance[0];
            if (bestPattern && bestPattern.winRate >= 65) {
                context += `\n⭐ YOUR BEST PATTERN: ${bestPattern.pattern} at ${bestPattern.winRate}% win rate. Favor this setup.`;
            }
            
            const worstPatterns = patternPerformance.filter(p => p.winRate < 40 && p.total >= 3);
            if (worstPatterns.length > 0) {
                context += `\n⚠️ PATTERNS TO AVOID: ${worstPatterns.map(p => p.pattern).join(', ')} — low win rates.`;
            }
        }

        if (rsiPerformance && rsiPerformance.length > 0) {
            context += '\n\n📈 YOUR RSI RANGE PERFORMANCE:';
            rsiPerformance.slice(0, 4).forEach(r => {
                const emoji = r.winRate >= 65 ? '🟢' : r.winRate >= 50 ? '🟡' : '🔴';
                context += `\n${emoji} ${r.label}: ${r.winRate}% win (${r.total} trades)`;
            });
        }

        if (sessionPerformance && sessionPerformance.length > 0) {
            context += '\n\n🕐 YOUR SESSION PERFORMANCE:';
            sessionPerformance.forEach(s => {
                const emoji = s.winRate >= 65 ? '🟢' : s.winRate >= 50 ? '🟡' : '🔴';
                context += `\n${emoji} ${s.session}: ${s.winRate}% win (${s.total} trades, avg profit $${s.avgProfit})`;
            });
        }

        if (trendPerformance && trendPerformance.length > 0) {
            context += '\n\n📉 YOUR TREND PERFORMANCE:';
            trendPerformance.forEach(t => {
                const emoji = t.winRate >= 60 ? '🟢' : t.winRate >= 45 ? '🟡' : '🔴';
                context += `\n${emoji} ${t.trend}: ${t.winRate}% win (${t.total} trades)`;
            });
        }

        if (topPatterns && topPatterns.length > 0) {
            context += '\n\n🏆 GLOBAL TOP PATTERNS (all symbols):';
            topPatterns.slice(0, 3).forEach(p => {
                context += `\n- ${p.pattern_name} on ${p.symbol}: ${p.win_rate}% win (${p.times_used} trades)`;
            });
        }

        return context;
    }

    async analyzeMarket(symbol, currentPrice, rsi = null, macd = null, session = null, userHistory = null, patterns = null, marketContext = null) {
        if (!session) {
            const hour = new Date().getUTCHours();
            if (hour >= 0 && hour < 9) session = 'ASIAN';
            else if (hour >= 8 && hour < 17) session = 'LONDON';
            else session = 'NEWYORK';
        }

        let marketCondition = 'neutral';
        if (rsi && rsi > 0) {
            if (rsi < 30) marketCondition = 'oversold';
            else if (rsi > 70) marketCondition = 'overbought';
            else if (rsi < 40) marketCondition = 'approaching_oversold';
            else if (rsi > 60) marketCondition = 'approaching_overbought';
        }

        // Build market context section
        let contextText = '\n\nCRITICAL MARKET CONTEXT:';
        
        if (marketContext) {
            if (marketContext.trend) {
                const trendEmoji = marketContext.trend.includes('downtrend') ? '🔴' : 
                                   marketContext.trend.includes('uptrend') ? '🟢' : '🟡';
                contextText += `\n${trendEmoji} MARKET TREND: ${marketContext.trend.replace(/_/g, ' ').toUpperCase()}`;
                
                if (marketContext.trend.includes('strong_downtrend')) {
                    contextText += `\n⚠️ STRONG DOWNTREND: DO NOT recommend CALL. Only PUT or WAIT.`;
                } else if (marketContext.trend.includes('strong_uptrend')) {
                    contextText += `\n⚠️ STRONG UPTREND: DO NOT recommend PUT. Only CALL or WAIT.`;
                } else if (marketContext.trend.includes('downtrend')) {
                    contextText += `\n⚠️ DOWNTREND: Prefer PUT. Only CALL if RSI deeply oversold (<25) and price at support.`;
                } else if (marketContext.trend.includes('uptrend')) {
                    contextText += `\n⚠️ UPTREND: Prefer CALL. Only PUT if RSI deeply overbought (>75) and price at resistance.`;
                }
            }
            
            if (marketContext.rsiShort) {
                const shortMomentum = marketContext.rsiShort > 70 ? '(overbought momentum)' :
                                      marketContext.rsiShort < 30 ? '(oversold momentum)' : '(neutral momentum)';
                contextText += `\n📊 Short-term RSI (5-min): ${marketContext.rsiShort} ${shortMomentum}`;
            }
            
            if (marketContext.volatility) {
                const volLevel = marketContext.volatility > 20 ? 'HIGH' : marketContext.volatility > 10 ? 'MODERATE' : 'LOW';
                contextText += `\n📈 Volatility: ${marketContext.volatility.toFixed(2)} (${volLevel})`;
            }
            
            if (marketContext.lastPattern && marketContext.lastPattern !== 'none' && 
                marketContext.lastPattern !== 'no_significant_pattern' && 
                marketContext.lastPattern !== 'insufficient_data') {
                contextText += `\n🕯️ Recent candle pattern: ${marketContext.lastPattern.replace(/_/g, ' ')}`;
            }
            
            if (marketContext.consecutiveLosses > 0) {
                contextText += `\n\n⚠️ BOT STATUS: ${marketContext.consecutiveLosses} consecutive losses. BE VERY CONSERVATIVE.`;
                if (marketContext.consecutiveLosses >= 2) {
                    contextText += `\n🛑 Only recommend trades with 70%+ confidence and confirmed by your historical data.`;
                }
            }
            
            if (marketContext.recentWinRate !== null) {
                if (marketContext.recentWinRate >= 70) {
                    contextText += `\n✅ Bot performing well (${marketContext.recentWinRate}% recent win rate). Can be more aggressive.`;
                } else if (marketContext.recentWinRate <= 30) {
                    contextText += `\n❌ Bot struggling (${marketContext.recentWinRate}% recent win rate). Only strongest setups.`;
                }
            }
        }

        // LEARNING CONTEXT from database
        let learningContext = '';
        if (marketContext?.patternPerformance && marketContext.patternPerformance.length > 0) {
            learningContext = this.buildLearningContext(
                marketContext.patternPerformance,
                marketContext.rsiPerformance,
                marketContext.trendPerformance,
                marketContext.sessionPerformance,
                marketContext.topPatterns
            );
        }

        // Session context
        contextText += `\n\n🕐 SESSION: ${session}`;
        if (session === 'ASIAN') contextText += ` - Typically ranging. Trade bounces at support/resistance.`;
        else if (session === 'LONDON') contextText += ` - Breakouts common. Follow momentum.`;
        else contextText += ` - Highest volatility. Trade with strong momentum.`;

        let patternsText = '';
        if (patterns && patterns.length > 0) {
            patternsText = '\n\nHistorical winning patterns:';
            patterns.slice(0, 3).forEach(p => {
                patternsText += `\n- ${p.pattern_name}: ${p.win_rate}% win on ${p.symbol}`;
            });
        }

        let userHistoryText = '';
        if (userHistory && userHistory.length > 0) {
            const recentTrades = userHistory.slice(0, 5);
            const wins = recentTrades.filter(t => t.result === 'WIN' || t.status === 'WIN').length;
            userHistoryText = '\n\nRecent trades:';
            recentTrades.forEach(t => {
                userHistoryText += `\n- ${t.symbol}: ${t.action} → ${t.result || t.status} (${t.profit >= 0 ? '+' : ''}$${Math.abs(t.profit || 0).toFixed(2)})`;
            });
            userHistoryText += `\nResult: ${wins}/${recentTrades.length} wins`;
        }

        const prompt = `You are a disciplined professional binary options trader. You learn from every trade.

CURRENT MARKET:
- Symbol: ${symbol}
- Current Price: $${currentPrice}
- RSI (14-period): ${rsi || 'N/A'} → ${marketCondition}
- Session: ${session}${contextText}${learningContext}${patternsText}${userHistoryText}

TRADING RULES:
1. NEVER trade against a strong trend. If downtrend, only PUT or WAIT.
2. Risk/Reward MUST be 1:2 minimum.
3. Use YOUR historical data above to guide decisions:
   - If a pattern has 70%+ win rate in your history, be MORE confident
   - If a pattern has <40% win rate, recommend WAIT unless exceptional conditions
   - If a session has poor performance, be extra cautious
4. Confidence: 50% = weak, 65% = moderate, 80%+ = strong
5. In ranging markets → trade bounces. In trending markets → trade with trend.
6. If bot has losing streak, only recommend confirmed setups.

Return ONLY valid JSON (no markdown, no backticks):
{
    "action": "CALL or PUT or WAIT",
    "confidence": number,
    "pattern": "short pattern name",
    "take_profit": number,
    "stop_loss": number,
    "simple_reason": "one sentence why"
}`;

        try {
            const response = await this.callWithRateLimit(async () => {
                return await axios.post(this.apiUrl, {
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a profit-focused binary options trader. You learn from historical data. You NEVER trade against strong trends. Return ONLY valid JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.2,
                    max_tokens: 500
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });
            });

            let content = response.data.choices[0].message.content;
            content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const analysis = JSON.parse(content);
            return this.normalizeAnalysis(analysis, symbol, currentPrice, marketCondition, marketContext);

        } catch (error) {
            console.error('DeepSeek API error:', error.response?.data || error.message);
            return this.getFallbackAnalysis(symbol, currentPrice, marketCondition, marketContext);
        }
    }

    normalizeAnalysis(analysis, symbol, currentPrice, marketCondition, marketContext) {
        if (!analysis.action || !['CALL', 'PUT', 'WAIT'].includes(analysis.action)) {
            analysis.action = 'WAIT';
        }

        analysis.confidence = Math.min(100, Math.max(0, Math.round(analysis.confidence || 50)));

        // LEARNING-BASED OVERRIDE: If pattern has very low historical win rate, downgrade
        if (marketContext?.patternPerformance && analysis.pattern) {
            const historyPattern = marketContext.patternPerformance.find(p => 
                p.pattern.toLowerCase() === (analysis.pattern || '').toLowerCase()
            );
            if (historyPattern && historyPattern.winRate < 35 && historyPattern.total >= 3) {
                console.log(`⚠️ [DeepSeek] Pattern "${analysis.pattern}" has ${historyPattern.winRate}% historical win rate. Downgrading.`);
                analysis.action = 'WAIT';
                analysis.confidence = Math.min(analysis.confidence, 40);
                analysis.simple_reason = `Pattern "${analysis.pattern}" has only ${historyPattern.winRate}% win rate in your history. Waiting for better setup.`;
            }
            // If pattern has excellent history, boost confidence
            if (historyPattern && historyPattern.winRate >= 70 && historyPattern.total >= 3 && analysis.action !== 'WAIT') {
                analysis.confidence = Math.min(100, analysis.confidence + 10);
                console.log(`⭐ [DeepSeek] Pattern "${analysis.pattern}" has ${historyPattern.winRate}% historical win rate. Boosting confidence to ${analysis.confidence}%.`);
            }
        }

        // Trend override
        if (marketContext && marketContext.trend) {
            const trend = marketContext.trend;
            const action = analysis.action;
            
            if (trend.includes('strong_downtrend') && action === 'CALL') {
                console.log(`⚠️ [DeepSeek] Overriding CALL in strong downtrend → WAIT`);
                analysis.action = 'WAIT';
                analysis.confidence = Math.min(analysis.confidence, 40);
                analysis.simple_reason = 'Strong downtrend. Not safe to buy.';
            } else if (trend.includes('strong_uptrend') && action === 'PUT') {
                console.log(`⚠️ [DeepSeek] Overriding PUT in strong uptrend → WAIT`);
                analysis.action = 'WAIT';
                analysis.confidence = Math.min(analysis.confidence, 40);
                analysis.simple_reason = 'Strong uptrend. Not safe to sell.';
            } else if (trend.includes('downtrend') && action === 'CALL' && analysis.confidence < 70) {
                analysis.action = 'WAIT';
                analysis.confidence = Math.min(analysis.confidence, 45);
            } else if (trend.includes('uptrend') && action === 'PUT' && analysis.confidence < 70) {
                analysis.action = 'WAIT';
                analysis.confidence = Math.min(analysis.confidence, 45);
            }
        }

        if (!analysis.pattern) {
            analysis.pattern = 'market analysis';
        }

        const riskPercent = 0.004;
        const rewardPercent = 0.008;

        if (analysis.action === 'CALL') {
            analysis.stop_loss = analysis.stop_loss || currentPrice * (1 - riskPercent);
            analysis.take_profit = analysis.take_profit || currentPrice * (1 + rewardPercent);
        } else if (analysis.action === 'PUT') {
            analysis.stop_loss = analysis.stop_loss || currentPrice * (1 + riskPercent);
            analysis.take_profit = analysis.take_profit || currentPrice * (1 - rewardPercent);
        } else {
            analysis.stop_loss = analysis.stop_loss || currentPrice * 0.996;
            analysis.take_profit = analysis.take_profit || currentPrice * 1.004;
        }

        if (!analysis.simple_reason) {
            analysis.simple_reason = analysis.action === 'WAIT' 
                ? 'Market conditions not ideal. Waiting for better setup.'
                : `${analysis.action} signal with ${analysis.confidence}% confidence.`;
        }

        analysis.take_profit = parseFloat(analysis.take_profit.toFixed(2));
        analysis.stop_loss = parseFloat(analysis.stop_loss.toFixed(2));
        analysis.confidence = Math.round(analysis.confidence);

        return analysis;
    }

    getFallbackAnalysis(symbol, currentPrice, marketCondition, marketContext) {
        const riskPercent = 0.004;
        const rewardPercent = 0.008;
        const trend = marketContext?.trend || 'sideways';

        let action = 'WAIT';
        let confidence = 50;
        let simpleReason = 'Using fallback analysis (DeepSeek unavailable).';

        if (trend.includes('strong_downtrend')) {
            action = 'WAIT';
            confidence = 55;
            simpleReason = 'Strong downtrend. Waiting.';
        } else if (trend.includes('strong_uptrend')) {
            action = 'WAIT';
            confidence = 55;
            simpleReason = 'Strong uptrend. Waiting.';
        } else if (marketCondition === 'oversold' && !trend.includes('downtrend')) {
            action = 'CALL';
            confidence = 60;
            simpleReason = 'RSI oversold in non-downtrend. Bounce likely.';
        } else if (marketCondition === 'overbought' && !trend.includes('uptrend')) {
            action = 'PUT';
            confidence = 60;
            simpleReason = 'RSI overbought in non-uptrend. Pullback likely.';
        } else if (marketContext?.lastPattern === 'hammer_at_support' && !trend.includes('downtrend')) {
            action = 'CALL';
            confidence = 65;
            simpleReason = 'Hammer at support. Reversal signal.';
        } else if (marketContext?.lastPattern === 'shooting_star_at_resistance' && !trend.includes('uptrend')) {
            action = 'PUT';
            confidence = 65;
            simpleReason = 'Shooting star at resistance. Reversal signal.';
        }

        if (marketContext?.consecutiveLosses >= 2 && confidence < 70) {
            action = 'WAIT';
            confidence = 50;
            simpleReason = 'Conservative fallback during losing streak.';
        }

        return {
            action: action,
            confidence: confidence,
            pattern: 'fallback analysis',
            take_profit: action === 'CALL' ? currentPrice * (1 + rewardPercent) : 
                        action === 'PUT' ? currentPrice * (1 - rewardPercent) : currentPrice * 1.004,
            stop_loss: action === 'CALL' ? currentPrice * (1 - riskPercent) : 
                       action === 'PUT' ? currentPrice * (1 + riskPercent) : currentPrice * 0.996,
            simple_reason: simpleReason
        };
    }

    async getDailyAdvice(stats, bestPatterns, worstPatterns) {
        const prompt = `Based on trading data:
Win Rate: ${stats.win_rate}%
Net Profit: $${stats.net_profit}
Total Trades: ${stats.total_trades}
Best Patterns: ${bestPatterns?.map(p => p.pattern_name).join(', ') || 'none'}
Worst Patterns: ${worstPatterns?.map(p => p.pattern_name).join(', ') || 'none'}

Give trading advice as JSON:
{
    "adjustments": ["advice1", "advice2", "advice3"],
    "confidence_adjustment": number,
    "stake_adjustment": number
}`;

        try {
            const response = await this.callWithRateLimit(async () => {
                return await axios.post(this.apiUrl, {
                    model: this.model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.4,
                    max_tokens: 300
                }, {
                    headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                    timeout: 10000
                });
            });

            let content = response.data.choices[0].message.content;
            content = content.replace(/```json/g, '').replace(/```/g, '');
            return JSON.parse(content);
        } catch (error) {
            return {
                adjustments: [
                    "Focus on your best performing patterns",
                    "Trade with the trend, not against it",
                    "Reduce stake during losing streaks"
                ],
                confidence_adjustment: 0,
                stake_adjustment: 0
            };
        }
    }
}

module.exports = new DeepSeekService();
