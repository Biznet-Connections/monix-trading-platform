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

    translateToSimpleLanguage(rsi, marketCondition, pattern, action) {
        let simpleReason = '';
        
        if (marketCondition === 'oversold') {
            simpleReason = `Price is low right now. `;
        } else if (marketCondition === 'overbought') {
            simpleReason = `Price is high right now. `;
        } else if (rsi && rsi < 40) {
            simpleReason = `Price is getting low. `;
        } else if (rsi && rsi > 60) {
            simpleReason = `Price is getting high. `;
        } else {
            simpleReason = `Market is stable. `;
        }
        
        if (pattern && (pattern.toLowerCase().includes('bullish') || pattern.toLowerCase().includes('hammer') || pattern.toLowerCase().includes('support'))) {
            simpleReason += `Price looks like it's about to go UP. `;
        } else if (pattern && (pattern.toLowerCase().includes('bearish') || pattern.toLowerCase().includes('shooting') || pattern.toLowerCase().includes('resistance'))) {
            simpleReason += `Price looks like it's about to go DOWN. `;
        } else if (action === 'CALL' || action === 'BUY') {
            simpleReason += `Price is likely to go UP. `;
        } else if (action === 'PUT' || action === 'SELL') {
            simpleReason += `Price is likely to go DOWN. `;
        } else {
            simpleReason += `Waiting for clearer signal. `;
        }
        
        simpleReason += `Risk/reward ratio is favorable (1:2).`;
        
        return simpleReason;
    }

    async analyzeMarket(symbol, currentPrice, rsi = null, macd = null, session = null, userHistory = null, patterns = null) {
        if (!session) {
            const hour = new Date().getUTCHours();
            if (hour >= 0 && hour < 9) session = 'ASIAN';
            else if (hour >= 8 && hour < 17) session = 'LONDON';
            else session = 'NEWYORK';
        }

        let marketCondition = 'neutral';
        if (rsi) {
            if (rsi < 35) marketCondition = 'oversold';
            else if (rsi > 65) marketCondition = 'overbought';
            else if (rsi < 45) marketCondition = 'approaching_oversold';
            else if (rsi > 55) marketCondition = 'approaching_overbought';
        }

        let patternsText = '';
        if (patterns && patterns.length > 0) {
            patternsText = `\n\nSuccessful patterns from history:\n${patterns.slice(0, 3).map(p => `- ${p.pattern_name}: ${p.win_rate}% win rate on ${p.symbol}`).join('\n')}`;
        }

        let userHistoryText = '';
        if (userHistory && userHistory.length > 0) {
            const recentTrades = userHistory.slice(0, 5);
            userHistoryText = `\n\nRecent trading history:\n${recentTrades.map(t => `- ${t.symbol}: ${t.action} -> ${t.result} (${t.profit})`).join('\n')}`;
        }

        const prompt = `You are a professional trader analyzing ${symbol}.

Current price: $${currentPrice}
RSI: ${rsi || 'N/A'} (${marketCondition})
Session: ${session}
${patternsText}
${userHistoryText}

IMPORTANT: 
- Risk/Reward should be at least 1:2 (Take Profit = 2x Stop Loss distance)
- Take Profit target should be DOUBLE the Stop Loss distance
- Confidence threshold for entry is 55% or higher
- In ranging markets, trade bounces off support/resistance

Based on this data, tell me:
1. Should I BUY (CALL - price will go UP), SELL (PUT - price will go DOWN), or WAIT?
2. How confident are you? (0-100%) - Be honest, 55%+ is enough to trade
3. What pattern do you see in simple words?
4. What should be my Take Profit price? (aim for 0.8-1.0% move)
5. What should be my Stop Loss price? (0.4-0.5% move)
6. Simple 1-sentence reason anyone can understand.

Return ONLY valid JSON:
{
    "action": "CALL or PUT or WAIT",
    "confidence": number,
    "pattern": "simple pattern name",
    "take_profit": number,
    "stop_loss": number,
    "simple_reason": "one sentence explanation"
}

If WAIT, explain what you're waiting for in the simple_reason.`;

        try {
            const response = await this.callWithRateLimit(async () => {
                return await axios.post(this.apiUrl, {
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a professional trader. Provide accurate, concise analysis. Risk/Reward should be at least 1:2. Confidence 55%+ is acceptable for trade entry. Return ONLY valid JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3,
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
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const analysis = JSON.parse(content);

            return this.normalizeAnalysis(analysis, symbol, currentPrice, marketCondition);

        } catch (error) {
            console.error('DeepSeek API error:', error.response?.data || error.message);
            return this.getFallbackAnalysis(symbol, currentPrice, marketCondition);
        }
    }

    normalizeAnalysis(analysis, symbol, currentPrice, marketCondition) {
        if (!analysis.action || !['CALL', 'PUT', 'WAIT'].includes(analysis.action)) {
            analysis.action = 'WAIT';
        }

        analysis.confidence = Math.min(100, Math.max(0, analysis.confidence || 50));

        if (!analysis.pattern) {
            const patterns = ['Price at support', 'Price at resistance', 'RSI signal', 'Trend continuation', 'Range bounce'];
            analysis.pattern = patterns[Math.floor(Math.random() * patterns.length)];
        }

        // NEW: Force 1:2 Risk/Reward ratio
        // Risk = 0.4% (stop loss), Reward = 0.8% (take profit)
        const riskPercent = 0.004; // 0.4% stop loss
        const rewardPercent = 0.008; // 0.8% take profit (2x risk)
        
        if (analysis.action === 'CALL') {
            analysis.stop_loss = currentPrice * (1 - riskPercent);
            analysis.take_profit = currentPrice * (1 + rewardPercent);
        } else if (analysis.action === 'PUT') {
            analysis.stop_loss = currentPrice * (1 + riskPercent);
            analysis.take_profit = currentPrice * (1 - rewardPercent);
        } else {
            // For WAIT, use reasonable defaults
            analysis.stop_loss = currentPrice * 0.996;
            analysis.take_profit = currentPrice * 1.004;
        }

        if (!analysis.simple_reason) {
            if (analysis.action === 'CALL') {
                analysis.simple_reason = `Price at good level. Risk $0.40 to make $0.80 (1:2 ratio).`;
            } else if (analysis.action === 'PUT') {
                analysis.simple_reason = `Price at good level. Risk $0.40 to make $0.80 (1:2 ratio).`;
            } else {
                analysis.simple_reason = `Waiting for better price level. Confidence ${analysis.confidence}% needs ${analysis.confidence >= 55 ? 'good' : 'higher'}.`;
            }
        }

        analysis.take_profit = parseFloat(analysis.take_profit.toFixed(2));
        analysis.stop_loss = parseFloat(analysis.stop_loss.toFixed(2));

        return analysis;
    }

    getFallbackAnalysis(symbol, currentPrice, marketCondition) {
        // NEW: Use 1:2 risk/reward even in fallback
        const riskPercent = 0.004;
        const rewardPercent = 0.008;
        
        let action = 'WAIT';
        let confidence = 50;
        
        if (marketCondition === 'oversold') {
            action = 'CALL';
            confidence = 60;
        } else if (marketCondition === 'overbought') {
            action = 'PUT';
            confidence = 60;
        } else if (marketCondition === 'approaching_oversold') {
            action = 'CALL';
            confidence = 55;
        } else if (marketCondition === 'approaching_overbought') {
            action = 'PUT';
            confidence = 55;
        }
        
        const patterns = ['Price pattern detected', 'Support level identified', 'Resistance level identified', 'RSI signal'];
        
        let simpleReason = '';
        if (action === 'CALL') {
            simpleReason = `Price at support level. Risk $0.40 to make $0.80 (1:2 ratio).`;
        } else if (action === 'PUT') {
            simpleReason = `Price at resistance level. Risk $0.40 to make $0.80 (1:2 ratio).`;
        } else {
            simpleReason = 'Waiting for better price level or RSI signal.';
        }

        return {
            action: action,
            confidence: confidence,
            pattern: patterns[Math.floor(Math.random() * patterns.length)],
            take_profit: action === 'CALL' ? currentPrice * (1 + rewardPercent) : currentPrice * (1 - rewardPercent),
            stop_loss: action === 'CALL' ? currentPrice * (1 - riskPercent) : currentPrice * (1 + riskPercent),
            simple_reason: simpleReason
        };
    }

    async getDailyAdvice(stats, bestPatterns, worstPatterns) {
        const prompt = `Based on trading data:
Win Rate: ${stats.win_rate}%
Net Profit: $${stats.net_profit}
Total Trades: ${stats.total_trades}

Return JSON:
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
                    "Focus on your best performing symbols",
                    "Use JACKPOT mode for higher confidence trades",
                    "Reduce stake during losing streaks"
                ],
                confidence_adjustment: 0,
                stake_adjustment: 0
            };
        }
    }
}

module.exports = new DeepSeekService();
