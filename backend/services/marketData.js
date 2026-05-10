/**
 * Market Data Service - Processes real-time market data
 * Converts ticks → candles → indicators → patterns
 */

class MarketDataService {
    constructor() {
        this.ticks = [];
        this.candles = [];
        this.currentCandle = null;
        this.rsi = 50;
        this.support = 0;
        this.resistance = 0;
        this.lastUpdate = Date.now();
        this.updateInterval = 5000;
    }

    addTick(tick) {
        this.ticks.push(tick);
        
        if (this.ticks.length > 1000) {
            this.ticks.shift();
        }
        
        this.updateCandle(tick);
        
        const now = Date.now();
        if (now - this.lastUpdate >= this.updateInterval) {
            this.lastUpdate = now;
            this.calculateIndicators();
        }
    }

    updateCandle(tick) {
        const tickTime = new Date(tick.epoch * 1000);
        const minute = tickTime.getMinutes();
        
        if (!this.currentCandle || this.currentCandle.minute !== minute) {
            if (this.currentCandle) {
                this.candles.push(this.currentCandle);
                if (this.candles.length > 100) {
                    this.candles.shift();
                }
            }
            
            this.currentCandle = {
                minute: minute,
                time: tick.epoch,
                open: tick.quote,
                high: tick.quote,
                low: tick.quote,
                close: tick.quote
            };
        } else {
            this.currentCandle.high = Math.max(this.currentCandle.high, tick.quote);
            this.currentCandle.low = Math.min(this.currentCandle.low, tick.quote);
            this.currentCandle.close = tick.quote;
        }
    }

    calculateIndicators() {
        if (this.candles.length >= 14) {
            let gains = 0, losses = 0;
            const last14 = this.candles.slice(-14);
            
            for (let i = 1; i < last14.length; i++) {
                const change = last14[i].close - last14[i-1].close;
                if (change >= 0) gains += change;
                else losses -= change;
            }
            
            const avgGain = gains / 14;
            const avgLoss = losses / 14;
            
            if (avgLoss !== 0) {
                const rs = avgGain / avgLoss;
                this.rsi = 100 - (100 / (1 + rs));
                this.rsi = Math.round(this.rsi);
            }
        }
        
        const recentLows = this.candles.slice(-20).map(c => c.low);
        this.support = Math.min(...recentLows);
        
        const recentHighs = this.candles.slice(-20).map(c => c.high);
        this.resistance = Math.max(...recentHighs);
    }

    getMarketState() {
        const currentPrice = this.currentCandle ? this.currentCandle.close : 0;
        let condition = 'neutral';
        let feeling = 'Market is stable';
        
        if (this.rsi < 35) {
            condition = 'oversold';
            feeling = 'Price is low (oversold)';
        } else if (this.rsi > 65) {
            condition = 'overbought';
            feeling = 'Price is high (overbought)';
        }
        
        let nearSupport = false;
        let nearResistance = false;
        let distanceToSupport = 0;
        let distanceToResistance = 0;
        
        if (this.support > 0 && currentPrice > 0) {
            distanceToSupport = ((currentPrice - this.support) / this.support) * 100;
            nearSupport = distanceToSupport < 0.5;
        }
        
        if (this.resistance > 0 && currentPrice > 0) {
            distanceToResistance = ((this.resistance - currentPrice) / this.resistance) * 100;
            nearResistance = distanceToResistance < 0.5;
        }
        
        return {
            price: currentPrice,
            rsi: this.rsi,
            support: this.support,
            resistance: this.resistance,
            condition: condition,
            feeling: feeling,
            nearSupport: nearSupport,
            nearResistance: nearResistance,
            distanceToSupport: distanceToSupport,
            distanceToResistance: distanceToResistance,
            trend: this.detectTrend(),
            volatility: this.calculateVolatility()
        };
    }
    
    detectTrend() {
        if (this.candles.length < 10) return 'neutral';
        
        const last10 = this.candles.slice(-10);
        let upMoves = 0, downMoves = 0;
        
        for (let i = 1; i < last10.length; i++) {
            if (last10[i].close > last10[i-1].close) upMoves++;
            else if (last10[i].close < last10[i-1].close) downMoves++;
        }
        
        if (upMoves > downMoves + 2) return 'uptrend';
        if (downMoves > upMoves + 2) return 'downtrend';
        return 'sideways';
    }
    
    calculateVolatility() {
        if (this.candles.length < 10) return 0;
        
        const last10 = this.candles.slice(-10);
        let sum = 0;
        
        for (let i = 1; i < last10.length; i++) {
            const change = Math.abs(last10[i].close - last10[i-1].close);
            sum += change;
        }
        
        return sum / 9;
    }
    
    getCandles(count = 50) {
        return this.candles.slice(-count);
    }
    
    getCurrentPrice() {
        return this.currentCandle ? this.currentCandle.close : 0;
    }
}

module.exports = new MarketDataService();
