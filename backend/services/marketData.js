/**
 * Market Data Service - Multi-Symbol Support
 * FIXED: RSI calculation from tick data
 */
class MarketData {
    constructor() {
        this.symbolData = {};
        this.defaultSymbol = 'R_75';
    }

    getSymbolData(symbol = this.defaultSymbol) {
        if (!this.symbolData[symbol]) {
            this.symbolData[symbol] = {
                prices: [],
                ticks: [],
                candles: [],
                lastPrice: null,
                lastCandle: null,
                rsi: 50,
                trend: 'sideways',
                support: null,
                resistance: null,
                nearSupport: false,
                nearResistance: false,
                volatility: 0,
                lastPattern: 'none',
                lastUpdate: null,
                candleCount: 0,
                currentCandle: null,
                candleStartTime: null
            };
        }
        return this.symbolData[symbol];
    }

    addTick(tick, symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        const price = tick.quote || tick.price || 0;
        
        if (price <= 0) return data;

        data.ticks.push(tick);
        data.prices.push(price);
        data.lastPrice = price;
        data.lastUpdate = Date.now();

        // Keep only last 500 data points
        if (data.ticks.length > 500) data.ticks.shift();
        if (data.prices.length > 500) data.prices.shift();

        // Update candle
        this.updateCandle(tick, symbol);

        // Calculate indicators if we have enough data
        if (data.prices.length >= 14) {
            this.calculateIndicators(symbol);
        }

        return data;
    }

    updateCandle(tick, symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        const price = tick.quote || tick.price || 0;
        const now = Date.now();
        const candleInterval = 60000;

        if (price <= 0) return;

        if (!data.currentCandle || now - data.candleStartTime > candleInterval) {
            if (data.currentCandle) {
                data.candles.push(data.currentCandle);
                if (data.candles.length > 200) data.candles.shift();
                data.candleCount = data.candles.length;
            }
            data.candleStartTime = now - (now % candleInterval);
            data.currentCandle = {
                open: price,
                high: price,
                low: price,
                close: price,
                epoch: Math.floor(now / 1000),
                volume: 1
            };
            data.lastCandle = data.currentCandle;
        } else {
            const candle = data.currentCandle;
            candle.high = Math.max(candle.high, price);
            candle.low = Math.min(candle.low, price);
            candle.close = price;
            candle.volume++;
        }
    }

    calculateIndicators(symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        const prices = data.prices;

        if (prices.length < 14) {
            data.rsi = 50;
            return;
        }

        // Calculate RSI (14-period)
        let gains = 0;
        let losses = 0;
        const period = 14;
        const startIdx = prices.length - period - 1;
        const endIdx = prices.length - 1;

        for (let i = Math.max(0, startIdx); i < endIdx; i++) {
            const change = prices[i + 1] - prices[i];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;

        if (avgLoss === 0) {
            data.rsi = 100;
        } else if (avgGain === 0) {
            data.rsi = 0;
        } else {
            const rs = avgGain / avgLoss;
            data.rsi = 100 - (100 / (1 + rs));
        }

        // Clamp RSI to 0-100
        data.rsi = Math.min(100, Math.max(0, Math.round(data.rsi)));

        // Calculate trend
        data.trend = this.detectTrend(prices);

        // Calculate support/resistance
        const levels = this.findSupportResistance(data.candles);
        data.support = levels.support;
        data.resistance = levels.resistance;
        data.nearSupport = levels.nearSupport;
        data.nearResistance = levels.nearResistance;

        // Calculate volatility
        data.volatility = this.calculateVolatility(prices);
    }

    detectTrend(prices) {
        if (prices.length < 20) return 'building_data';
        const recent = prices.slice(-20);
        const sma5 = recent.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const sma10 = recent.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const sma20 = recent.reduce((a, b) => a + b, 0) / 20;

        if (sma5 > sma10 && sma10 > sma20) {
            const strength = (sma5 - sma20) / sma20;
            if (strength > 0.005) return 'strong_uptrend';
            return 'uptrend';
        }
        if (sma5 < sma10 && sma10 < sma20) {
            const strength = (sma20 - sma5) / sma20;
            if (strength > 0.005) return 'strong_downtrend';
            return 'downtrend';
        }
        return 'sideways';
    }

    findSupportResistance(candles) {
        if (!candles || candles.length < 10) {
            return { support: null, resistance: null, nearSupport: false, nearResistance: false };
        }

        const recent = candles.slice(-20);
        let support = Infinity;
        let resistance = -Infinity;

        recent.forEach(c => {
            if (c.low < support) support = c.low;
            if (c.high > resistance) resistance = c.high;
        });

        const lastPrice = recent[recent.length - 1]?.close || 0;
        const nearSupport = support ? (lastPrice - support) / support < 0.003 : false;
        const nearResistance = resistance ? (resistance - lastPrice) / resistance < 0.003 : false;

        return { support, resistance, nearSupport, nearResistance };
    }

    calculateVolatility(prices) {
        if (prices.length < 20) return 0;
        const recent = prices.slice(-20);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const variance = recent.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / recent.length;
        return Math.sqrt(variance);
    }

    getMarketState(symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        const price = data.lastPrice || 0;
        const rsi = data.rsi || 50;
        const trend = data.trend || 'building_data';
        const support = data.support || 0;
        const resistance = data.resistance || 0;
        const nearSupport = data.nearSupport || false;
        const nearResistance = data.nearResistance || false;
        const volatility = data.volatility || 0;
        const lastPattern = data.lastPattern || 'none';

        return {
            price,
            rsi,
            trend,
            support,
            resistance,
            nearSupport,
            nearResistance,
            volatility,
            lastPattern
        };
    }

    getCurrentPrice(symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        return data.lastPrice || 0;
    }

    getCandles(count = 30, symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        const candles = data.candles.slice(-count);
        if (data.currentCandle) {
            candles.push(data.currentCandle);
        }
        return candles;
    }

    getRSI(symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        return data.rsi || 50;
    }

    getTrend(symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        return data.trend || 'building_data';
    }

    getVolatility(symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        return data.volatility || 0;
    }

    setLastPattern(pattern, symbol = this.defaultSymbol) {
        const data = this.getSymbolData(symbol);
        data.lastPattern = pattern;
    }

    reset(symbol = this.defaultSymbol) {
        if (symbol === 'all') {
            this.symbolData = {};
        } else {
            delete this.symbolData[symbol];
        }
    }

    getAllSymbolsData() {
        const result = {};
        for (const [symbol, data] of Object.entries(this.symbolData)) {
            result[symbol] = {
                price: data.lastPrice || 0,
                rsi: data.rsi || 50,
                trend: data.trend || 'building_data',
                volatility: data.volatility || 0,
                candleCount: data.candleCount || 0,
                lastUpdate: data.lastUpdate || null
            };
        }
        return result;
    }
}

module.exports = new MarketData();
