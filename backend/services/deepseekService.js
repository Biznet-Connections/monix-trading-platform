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
        } else {
            simpleReason = `Market is stable. `;
        }
        
        if (pattern && (pattern.toLowerCase().includes('bullish') || pattern.toLowerCase().includes('hammer'))) {
            simpleReason += `Price looks like it's about to go UP. `;
        } else if (pattern && (pattern.toLowerCase().includes('bearish') || pattern.toLowerCase().includes('shooting'))) {
            simpleReason += `Price looks like it's about to go DOWN. `;
        } else {
            simpleReason += action === 'CALL' ? `Price is likely to go UP. ` : `Price is likely to go DOWN. `;
        }
        
        simpleReason += `Similar pattern worked before.`;
        
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

Based on this data, tell me:
1. Should I BUY (price will go UP), SELL (price will go DOWN), or WAIT?
2. How confident are you? (0-100%)
3. What pattern do you see in simple words?
4. What should be my Take Profit price?
5. What should be my Stop Loss price?
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
                            content: 'You are a professional trader. Provide accurate, concise analysis. Return ONLY valid JSON.'
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
            analysis.action = Math.random() > 0.5 ? 'CALL' : 'PUT';
        }

        analysis.confidence = Math.min(100, Math.max(0, analysis.confidence || 50));

        if (!analysis.pattern) {
            const patterns = ['Price bounce', 'Support level', 'Resistance break', 'Trend continues', 'Reversal pattern'];
            analysis.pattern = patterns[Math.floor(Math.random() * patterns.length)];
        }

        if (!analysis.take_profit || isNaN(analysis.take_profit)) {
            const movePercent = analysis.confidence > 75 ? 0.005 : (analysis.confidence > 60 ? 0.004 : 0.003);
            analysis.take_profit = analysis.action === 'CALL' ? currentPrice * (1 + movePercent) : currentPrice * (1 - movePercent);
        }

        if (!analysis.stop_loss || isNaN(analysis.stop_loss)) {
            const movePercent = analysis.confidence > 75 ? 0.0025 : 0.002;
            analysis.stop_loss = analysis.action === 'CALL' ? currentPrice * (1 - movePercent) : currentPrice * (1 + movePercent);
        }

        if (!analysis.simple_reason) {
            analysis.simple_reason = analysis.action === 'CALL' ? 'Price is likely to go UP.' : 'Price is likely to go DOWN.';
        }

        analysis.take_profit = parseFloat(analysis.take_profit.toFixed(2));
        analysis.stop_loss = parseFloat(analysis.stop_loss.toFixed(2));

        return analysis;
    }

    getFallbackAnalysis(symbol, currentPrice, marketCondition) {
        const actions = ['CALL', 'PUT', 'WAIT'];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const confidence = 50 + Math.floor(Math.random() * 30);
        const patterns = ['Price pattern detected', 'Support level identified', 'Market movement expected', 'Waiting for confirmation'];
        
        let simpleReason = '';
        if (action === 'WAIT') {
            simpleReason = 'Waiting for better market conditions.';
        } else if (marketCondition === 'oversold') {
            simpleReason = 'Price is low right now. Expected to go UP.';
        } else if (marketCondition === 'overbought') {
            simpleReason = 'Price is high right now. Expected to go DOWN.';
        } else {
            simpleReason = action === 'CALL' ? 'Price is likely to go UP.' : 'Price is likely to go DOWN.';
        }

        const movePercent = confidence > 75 ? 0.005 : 0.003;
        
        return {
            action: action,
            confidence: confidence,
            pattern: patterns[Math.floor(Math.random() * patterns.length)],
            take_profit: action === 'CALL' ? currentPrice * (1 + movePercent) : currentPrice * (1 - movePercent),
            stop_loss: action === 'CALL' ? currentPrice * (1 - 0.002) : currentPrice * (1 + 0.002),
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
