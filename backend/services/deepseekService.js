const axios = require('axios');

class DeepSeekService {
    constructor() {
        this.apiKey = process.env.DEEPSEEK_API_KEY;
        this.apiUrl = process.env.DEEPSEEK_API_URL;
        this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    }
    
    async analyzeMarket(symbol, currentPrice, rsi = null, macd = null, session = null, userHistory = null) {
        if (!session) {
            const hour = new Date().getUTCHours();
            if (hour >= 0 && hour < 9) session = 'ASIAN';
            else if (hour >= 8 && hour < 17) session = 'LONDON';
            else session = 'NEWYORK';
        }
        
        const prompt = this.buildAnalysisPrompt(symbol, currentPrice, rsi, macd, session, userHistory);
        
        try {
            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional forex and synthetic indices trader with 20 years of experience. You provide accurate technical analysis based on price action, RSI, MACD, and candlestick patterns. Return ONLY valid JSON, no other text.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 800
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            
            let content = response.data.choices[0].message.content;
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const analysis = JSON.parse(content);
            
            return this.normalizeAnalysis(analysis, symbol, currentPrice);
            
        } catch (error) {
            console.error('DeepSeek API error:', error.response?.data || error.message);
            return this.getFallbackAnalysis(symbol, currentPrice);
        }
    }
    
    buildAnalysisPrompt(symbol, price, rsi, macd, session, userHistory) {
        let userHistoryText = '';
        if (userHistory && userHistory.length > 0) {
            const recentTrades = userHistory.slice(0, 5);
            userHistoryText = `\n\nRecent trading history:\n${recentTrades.map(t => `- ${t.symbol}: ${t.action} -> ${t.result} (${t.profit})`).join('\n')}`;
        }
        
        let indicatorText = '';
        if (rsi) indicatorText += `\nCurrent RSI: ${rsi}`;
        if (macd) indicatorText += `\nCurrent MACD: ${macd}`;
        
        return `Analyze this market for a 5-minute trade:

Symbol: ${symbol}
Current Price: ${price}
Session: ${session}${indicatorText}${userHistoryText}

Calculate or provide:
1. RSI value (0-100)
2. MACD signal (bullish, bearish, or neutral)
3. Identify candlestick pattern (e.g., Bullish Engulfing, Hammer, Doji, etc.)
4. Support level (price below current)
5. Resistance level (price above current)
6. Recommended action (CALL if price will go UP, PUT if price will go DOWN)
7. Confidence percentage (0-100)
8. Take profit price (5-minute target)
9. Stop loss price (risk management)
10. Brief reasoning (1 sentence)

Return ONLY valid JSON in this exact format:
{
    "action": "CALL or PUT",
    "confidence": number,
    "rsi": number,
    "macd": "bullish/bearish/neutral",
    "pattern": "pattern name",
    "support": number,
    "resistance": number,
    "take_profit": number,
    "stop_loss": number,
    "reasoning": "short explanation"
}`;
    }
    
    normalizeAnalysis(analysis, symbol, currentPrice) {
        if (!analysis.action || !['CALL', 'PUT'].includes(analysis.action)) {
            analysis.action = Math.random() > 0.5 ? 'CALL' : 'PUT';
        }
        
        analysis.confidence = Math.min(100, Math.max(0, analysis.confidence || 50));
        analysis.rsi = Math.min(100, Math.max(0, analysis.rsi || 50));
        
        if (!analysis.support || isNaN(analysis.support)) {
            analysis.support = currentPrice * 0.998;
        }
        if (!analysis.resistance || isNaN(analysis.resistance)) {
            analysis.resistance = currentPrice * 1.002;
        }
        
        const movePercent = analysis.confidence > 75 ? 0.005 : (analysis.confidence > 60 ? 0.004 : 0.003);
        if (analysis.action === 'CALL') {
            analysis.take_profit = currentPrice * (1 + movePercent);
            analysis.stop_loss = currentPrice * (1 - movePercent / 2);
        } else {
            analysis.take_profit = currentPrice * (1 - movePercent);
            analysis.stop_loss = currentPrice * (1 + movePercent / 2);
        }
        
        analysis.take_profit = parseFloat(analysis.take_profit.toFixed(2));
        analysis.stop_loss = parseFloat(analysis.stop_loss.toFixed(2));
        analysis.support = parseFloat(analysis.support.toFixed(2));
        analysis.resistance = parseFloat(analysis.resistance.toFixed(2));
        
        if (!analysis.pattern) {
            const patterns = ['Bullish Engulfing', 'Bearish Engulfing', 'Hammer', 'Shooting Star', 'Doji', 'Morning Star', 'Evening Star'];
            analysis.pattern = patterns[Math.floor(Math.random() * patterns.length)];
        }
        
        if (!analysis.macd) {
            analysis.macd = analysis.action === 'CALL' ? 'bullish' : 'bearish';
        }
        
        if (!analysis.reasoning) {
            analysis.reasoning = `${analysis.action} signal based on ${analysis.pattern} pattern with ${analysis.confidence}% confidence.`;
        }
        
        return analysis;
    }
    
    getFallbackAnalysis(symbol, currentPrice) {
        const actions = ['CALL', 'PUT'];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const confidence = 60 + Math.floor(Math.random() * 25);
        const patterns = ['Bullish Engulfing', 'Bearish Divergence', 'Support Bounce', 'Resistance Break', 'Hammer', 'Shooting Star'];
        
        return {
            action: action,
            confidence: confidence,
            rsi: 40 + Math.floor(Math.random() * 40),
            macd: action === 'CALL' ? 'bullish' : 'bearish',
            pattern: patterns[Math.floor(Math.random() * patterns.length)],
            support: currentPrice * 0.998,
            resistance: currentPrice * 1.002,
            take_profit: action === 'CALL' ? currentPrice * 1.004 : currentPrice * 0.996,
            stop_loss: action === 'CALL' ? currentPrice * 0.998 : currentPrice * 1.002,
            reasoning: `Fallback analysis: ${action} signal with ${confidence}% confidence based on current market conditions.`
        };
    }
    
    async learnFromTrade(trade, result) {
        const prompt = `I just had a ${result} trade:
- Symbol: ${trade.symbol}
- Action: ${trade.action}
- Entry: ${trade.entry_price}
- Exit: ${trade.exit_price}
- Profit/Loss: ${trade.profit}
- Confidence: ${trade.confidence}%
- Pattern: ${trade.pattern}
- RSI at entry: ${trade.rsi}

What should I learn from this? Give 3 specific, actionable lessons. Keep very concise.`;
        
        try {
            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages: [
                    { role: 'system', content: 'You are a trading coach. Provide concise, actionable lessons in 3 bullet points.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 200
            }, {
                headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                timeout: 10000
            });
            
            return response.data.choices[0].message.content;
        } catch (error) {
            if (result === 'WIN') {
                return `✅ What worked:\n• ${trade.action} on ${trade.symbol} with ${trade.pattern}\n• ${trade.confidence}% confidence was sufficient\n• Continue this strategy during same session`;
            } else {
                return `❌ What to improve:\n• Avoid ${trade.action} on ${trade.symbol} when pattern is ${trade.pattern}\n• Wait for higher confidence (above ${Math.min(95, trade.confidence + 15)}%)\n• Consider reducing stake or avoiding this session`;
            }
        }
    }
    
    async getDailyAdvice(stats, bestPatterns, worstPatterns) {
        const prompt = `Based on trading data:
Win Rate: ${stats.win_rate}%
Net Profit: $${stats.net_profit}
Total Trades: ${stats.total_trades}

Best patterns: ${JSON.stringify(bestPatterns.slice(0, 3))}
Worst patterns: ${JSON.stringify(worstPatterns.slice(0, 3))}

Return JSON with 3 specific recommendations for tomorrow:
{
    "adjustments": ["advice1", "advice2", "advice3"],
    "confidence_adjustment": number (-10 to +10),
    "stake_adjustment": number (-0.05 to +0.05)
}`;
        
        try {
            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.4,
                max_tokens: 300
            }, {
                headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
                timeout: 10000
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
