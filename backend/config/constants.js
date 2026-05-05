module.exports = {
    TRADING_SYMBOLS: {
        VOLATILITY_1S: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100'],
        VOLATILITY_2S: ['R_10_2S', 'R_25_2S', 'R_50_2S', 'R_75_2S', 'R_100_2S'],
        BOOM_CRASH: ['Boom 300', 'Boom 500', 'Boom 1000', 'Crash 300', 'Crash 500', 'Crash 1000'],
        FOREX: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'USD/CHF'],
        COMMODITIES: ['XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD'],
        CRYPTO: ['BTC/USD', 'ETH/USD', 'LTC/USD', 'XRP/USD', 'ADA/USD', 'DOT/USD']
    },
    
    SESSIONS: {
        ASIAN: { start: 0, end: 9, name: 'ASIAN' },
        LONDON: { start: 8, end: 17, name: 'LONDON' },
        NEWYORK: { start: 13, end: 22, name: 'NEWYORK' }
    },
    
    CANDLESTICK_PATTERNS: [
        'Bullish Engulfing', 'Bearish Engulfing', 'Hammer', 'Shooting Star',
        'Doji', 'Morning Star', 'Evening Star', 'Three White Soldiers',
        'Three Black Crows', 'Piercing Pattern', 'Dark Cloud Cover'
    ],
    
    getCurrentSession: () => {
        const hour = new Date().getUTCHours();
        if (hour >= 0 && hour < 9) return 'ASIAN';
        if (hour >= 8 && hour < 17) return 'LONDON';
        return 'NEWYORK';
    },
    
    isValidSymbol: (symbol) => {
        const allSymbols = [
            ...module.exports.TRADING_SYMBOLS.VOLATILITY_1S,
            ...module.exports.TRADING_SYMBOLS.VOLATILITY_2S,
            ...module.exports.TRADING_SYMBOLS.BOOM_CRASH,
            ...module.exports.TRADING_SYMBOLS.FOREX,
            ...module.exports.TRADING_SYMBOLS.COMMODITIES,
            ...module.exports.TRADING_SYMBOLS.CRYPTO
        ];
        return allSymbols.includes(symbol);
    }
};
