const axios = require('axios');
const knowledgeBase = require('./knowledgeBase');

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
        return context;
    }

    async analyzeMarket(symbol, currentPrice, rsi = null, macd = null, session = null, userHistory = null, patterns = null, marketContext = null) {
        if (!session) {
            const hour = new Date().getUTCHours();
            if (hour >= 0 && hour < 9) session = 'ASIAN';
            else if (hour >= 8 && hour < 17) session = 'LONDON';
            else session = 'NEWYORK';
        }

        const sessionRules = knowledgeBase.getSessionRules();
        const sessionName = sessionRules.name;

        let marketCondition = 'neutral';
        if (rsi && rsi > 0) {
            if (rsi < 30) marketCondition = 'oversold';
            else if (rsi > 70) marketCondition = 'overbought';
            else if (rsi < 40) marketCondition = 'approaching_oversold';
            else if (rsi > 60) marketCondition = 'approaching_overbought';
        }

        let contextText = '\n\nCRITICAL MARKET CONTEXT:';

        if (marketContext) {
            if (marketContext.trend) {
                const trendEmoji = marketContext.trend.includes('downtrend') ? '🔴' :
                    marketContext.trend.includes('uptrend') ? '🟢' : '🟡';
                contextText += `\n${trendEmoji} MARKET TREND: ${marketContext.trend.replace(/_/g, ' ').toUpperCase()}`;

                const trendRule = knowledgeBase.getTrendRule(marketContext.trend);
                if (trendRule) {
                    contextText += `\n📐 RULE: ${trendRule.rule}`;
                    if (trendRule.forbiddenActions?.length > 0) {
                        contextText += `\n🚫 FORBIDDEN: ${trendRule.forbiddenActions.join(', ')} — never do these in this trend.`;
                    }
                }
            }

            if (marketContext.rsiShort) {
                const shortMomentum = marketContext.rsiShort > 70 ? '(overbought momentum)' :
                    marketContext.rsiShort < 30 ? '(oversold momentum)' : '(neutral momentum)';
                contextText += `\n📊 Short-term RSI (5-min): ${marketContext.rsiShort} ${shortMomentum}`;
            }

            if (marketContext.volatility) {
                const volLevel = marketContext.volatility > 20 ? 'HIGH' :
                    marketContext.volatility > 10 ? 'MODERATE' : 'LOW';
                contextText += `\n📈 Volatility: ${marketContext.volatility.toFixed(2)} (${volLevel})`;
            }

            if (marketContext.lastPattern && marketContext.lastPattern !== 'none' &&
                marketContext.lastPattern !== 'no_significant_pattern' &&
                marketContext.lastPattern !== 'insufficient_data') {
                const patternName = marketContext.lastPattern.replace(/_/g, ' ');

                const patternContext = knowledgeBase.getPatternContext(
                    marketContext.lastPattern,
                    marketContext.trend,
                    marketContext.nearSupport,
                    marketContext.nearResistance
                );

                contextText += `\n🕯️ Recent candle pattern: ${patternName}`;
                if (patternContext && patternContext.action !== 'UNKNOWN_PATTERN') {
                    contextText += `\n📐 PATTERN RULE: ${patternName} → ${patternContext.action} (reliability: ${patternContext.reliability})`;
                    if (patternContext.note) contextText += `\n   Note: ${patternContext.note}`;
                    if (patternContext.reason) contextText += `\n   Reason: ${patternContext.reason}`;
                }

                if (marketContext.nearSupport) contextText += `\n📍 Price is NEAR SUPPORT ($${marketContext.support?.toFixed(2)})`;
                if (marketContext.nearResistance) contextText += `\n📍 Price is NEAR RESISTANCE ($${marketContext.resistance?.toFixed(2)})`;
            }

            if (marketContext.consecutiveLosses > 0) {
                contextText += `\n\n⚠️ BOT STATUS: ${marketContext.consecutiveLosses} consecutive losses. BE VERY CONSERVATIVE.`;
                if (marketContext.consecutiveLosses >= 2) {
                    contextText += `\n🛑 Only recommend trades with 70%+ confidence and confirmed by historical data.`;
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

        contextText += `\n\n🕐 SESSION: ${sessionName}`;
        contextText += `\n📐 SESSION RULE: ${sessionRules.bestStrategy}`;
        contextText += `\n⚠️ AVOID: ${sessionRules.avoidStrategy}`;
        contextText += `\n📊 Confidence modifier: ${sessionRules.confidenceModifier >= 0 ? '+' : ''}${sessionRules.confidenceModifier}%`;

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

        let rsiContext = '';
        if (rsi && rsi > 0) {
            const rsiRule = knowledgeBase.getRSIRule(rsi, marketContext?.trend);
            if (rsiRule) {
                rsiContext = `\n\n📊 RSI ANALYSIS (from trading knowledge):`;
                rsiContext += `\nRSI ${rsi} → Recommended action: ${rsiRule.action}`;
                if (rsiRule.reason) rsiContext += `\nReason: ${rsiRule.reason}`;
                if (rsiRule.note) rsiContext += `\nNote: ${rsiRule.note}`;
            }
        }

        const prompt = `You are a PROFESSIONAL ICT/SMC trader with years of experience. You have deep knowledge of:
- Order blocks, liquidity grabs, supply/demand zones
- Multi-timeframe analysis (1m, 5m, 15m, 1h)
- Session-based trading (Asian ranges, London trends, New York volatility)
- Candlestick pattern recognition with CONTEXT (not just pattern alone)
- Risk management (always 1:2 minimum risk/reward)
- The trend is ALWAYS king. Never fight a strong trend.

CURRENT MARKET:
- Symbol: ${symbol}
- Current Price: $${currentPrice}
- RSI (14-period): ${rsi || 'N/A'} → ${marketCondition}
- Session: ${session}${contextText}${rsiContext}${learningContext}

TRADING RULES (HARD RULES - NEVER BREAK):
1. NEVER trade against a strong trend. If strong downtrend → only PUT or WAIT.
2. Always check WHERE the pattern formed (at support? resistance? mid-range?)
3. A hammer at support = BUY. A hammer in downtrend = WAIT (fakeout).
4. RSI < 25 in downtrend = still WAIT (trend is stronger than RSI)
5. RSI > 75 in uptrend = still WAIT (trend is stronger than RSI)
6. ${sessionRules.name} session: ${sessionRules.bestStrategy}
7. Risk/Reward MUST be 1:2 minimum.
8. Use historical data to adjust confidence.
9. If bot has losing streak, BE CONSERVATIVE.

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
                            content: 'You are a profit-focused professional ICT/SMC trader. You understand trend analysis, supply/demand zones, RSI, candlestick patterns WITH context, session-based strategies, and risk management. You NEVER trade against strong trends. You know that context (where the pattern forms) is more important than the pattern itself. Return ONLY valid JSON.'
                        },
                        { role: 'user', content: prompt }
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

    /**
     * UPDATED: Normalize pattern names to match Knowledge Base standards
     * This ensures learning data is consistent across the system
     */
    normalizePatternName(pattern) {
        if (!pattern) return 'market analysis';

        const lowerPattern = pattern.toLowerCase().trim();

        // Pattern name mapping: DeepSeek natural language → KB standard names
        const patternMap = {
            'sell bounce': 'bearish_engulfing',
            'sell_bounce': 'bearish_engulfing',
            'sell on bounce': 'bearish_engulfing',
            'sell_on_bounce': 'bearish_engulfing',
            'buy pullback': 'bullish_engulfing',
            'buy_pullback': 'bullish_engulfing',
            'buy on pullback': 'bullish_engulfing',
            'buy_on_pullback': 'bullish_engulfing',
            'oversold bounce': 'hammer',
            'oversold_bounce': 'hammer',
            'overbought drop': 'shooting_star',
            'overbought_drop': 'shooting_star',
            'downtrend continuation': 'bearish_engulfing',
            'downtrend_continuation': 'bearish_engulfing',
            'uptrend continuation': 'bullish_engulfing',
            'uptrend_continuation': 'bullish_engulfing',
            'strong uptrend continuation': 'bullish_engulfing',
            'strong downtrend continuation': 'bearish_engulfing',
            'doji at support': 'doji',
            'doji_at_support': 'doji',
            'doji at resistance': 'doji',
            'doji_at_resistance': 'doji',
            'hammer at support': 'hammer',
            'hammer_at_support': 'hammer',
            'shooting star at resistance': 'shooting_star',
            'shooting_star_at_resistance': 'shooting_star',
        };

        // Check for exact match first
        if (patternMap[lowerPattern]) {
            return patternMap[lowerPattern];
        }

        // Check if any KB standard pattern is contained in the name
        const kbPatterns = ['hammer', 'shooting_star', 'bullish_engulfing', 'bearish_engulfing',
            'doji', 'three_white_soldiers', 'three_black_crows'
        ];

        for (const kbPattern of kbPatterns) {
            if (lowerPattern.includes(kbPattern)) {
                return kbPattern;
            }
        }

        // Return original if no mapping found
        return pattern;
    }

    normalizeAnalysis(analysis, symbol, currentPrice, marketCondition, marketContext) {
        if (!analysis.action || !['CALL', 'PUT', 'WAIT'].includes(analysis.action)) {
            analysis.action = 'WAIT';
        }
        analysis.confidence = Math.min(100, Math.max(0, Math.round(analysis.confidence || 50)));

        // Normalize pattern name to KB standard
        analysis.pattern = this.normalizePatternName(analysis.pattern);

        // Knowledge base validation on DeepSeek's output
        if (marketContext?.trend && analysis.action !== 'WAIT') {
            const trendRule = knowledgeBase.getTrendRule(marketContext.trend);
            if (trendRule?.forbiddenActions?.includes(analysis.action === 'CALL' ? 'BUY' : 'SELL')) {
                console.log(`⚠️ [DeepSeek] DeepSeek recommended ${analysis.action} but trend rule forbids it → WAIT`);
                analysis.action = 'WAIT';
                analysis.confidence = Math.min(analysis.confidence, 30);
                analysis.simple_reason = trendRule.rule;
            }
        }

        // Pattern history override
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
            if (historyPattern && historyPattern.winRate >= 70 && historyPattern.total >= 3 && analysis.action !== 'WAIT') {
                analysis.confidence = Math.min(100, analysis.confidence + 10);
                console.log(`⭐ [DeepSeek] Pattern "${analysis.pattern}" has ${historyPattern.winRate}% historical win rate. Boosting confidence to ${analysis.confidence}%.`);
            }
        }

        // Session modifier
        if (marketContext?.trend) {
            const sessionRules = knowledgeBase.getSessionRules();
            if (analysis.action !== 'WAIT') {
                analysis.confidence = Math.min(100, Math.max(10, analysis.confidence + sessionRules.confidenceModifier));
            }
        }

        if (!analysis.pattern) analysis.pattern = 'market analysis';

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
        const sessionRules = knowledgeBase.getSessionRules();

        let action = 'WAIT';
        let confidence = 50;
        let simpleReason = 'Using fallback analysis with trading knowledge.';

        const trendRule = knowledgeBase.getTrendRule(trend);
        if (trendRule?.forbiddenActions) {
            action = 'WAIT';
            confidence = 55;
            simpleReason = trendRule.rule;
        } else if (marketCondition === 'oversold' && !trend.includes('downtrend')) {
            action = 'CALL';
            confidence = 60 + sessionRules.confidenceModifier;
            simpleReason = `RSI oversold in non-downtrend. ${sessionRules.name} session. Bounce likely.`;
        } else if (marketCondition === 'overbought' && !trend.includes('uptrend')) {
            action = 'PUT';
            confidence = 60 + sessionRules.confidenceModifier;
            simpleReason = `RSI overbought in non-uptrend. ${sessionRules.name} session. Pullback likely.`;
        } else if (marketContext?.lastPattern === 'hammer_at_support' && !trend.includes('downtrend')) {
            action = 'CALL';
            confidence = 65;
            simpleReason = 'Hammer at support. High probability reversal.';
        } else if (marketContext?.lastPattern === 'shooting_star_at_resistance' && !trend.includes('uptrend')) {
            action = 'PUT';
            confidence = 65;
            simpleReason = 'Shooting star at resistance. High probability reversal.';
        } else {
            simpleReason = `Market neutral. ${sessionRules.name} session. Waiting for clear setup.`;
        }

        if (marketContext?.consecutiveLosses >= 2 && confidence < 70) {
            action = 'WAIT';
            confidence = 50;
            simpleReason = 'Conservative fallback during losing streak.';
        }

        return {
            action,
            confidence,
            pattern: this.normalizePatternName('fallback with knowledge base'),
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
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
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
