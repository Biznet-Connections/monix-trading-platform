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
        this.rsiShort = 50;
        this.support = 0;
        this.resistance = 0;
        this.lastPattern = 'none';
        this.lastUpdate = Date.now();
        this.updateInterval = 5000;
        this.tickCount = 0;
        this.calculationCount = 0;
    }

    reset() {
        this.ticks = [];
        this.candles = [];
        this.currentCandle = null;
        this.rsi = 50;
        this.rsiShort = 50;
        this.support = 0;
        this.resistance = 0;
        this.lastPattern = 'none';
        this.lastUpdate = Date.now();
        this.tickCount = 0;
        this.calculationCount = 0;
        console.log('🔄 [MarketData] State completely reset');
    }

    addTick(tick) {
        this.ticks.push(tick);
        this.tickCount++;

        if (this.ticks.length > 2000) {
            this.ticks = this.ticks.slice(-1000);
        }

        this.updateCandle(tick);

        // Force calculation more frequently when building initial candles
        const now = Date.now();
        const needsMoreData = this.candles.length < 14;
        const interval = needsMoreData ? 2000 : this.updateInterval;
        
        if (now - this.lastUpdate >= interval) {
            this.lastUpdate = now;
            this.calculateIndicators();
            this.detectCandlePatterns();
            
            // Log progress while building initial data
            if (this.calculationCount <= 10 || this.calculationCount % 20 === 0) {
                console.log(`📊 [MarketData] Calc #${this.calculationCount} | Candles: ${this.candles.length} | RSI: ${this.rsi} | RSI_short: ${this.rsiShort}`);
            }
            this.calculationCount++;
        }
    }

    updateCandle(tick) {
        const tickTime = new Date(tick.epoch * 1000);
        const minute = tickTime.getMinutes();
        const hour = tickTime.getHours();
        const candleKey = `${hour}:${minute}`;

        if (!this.currentCandle || this.currentCandle.key !== candleKey) {
            if (this.currentCandle) {
                this.candles.push(this.currentCandle);
                if (this.candles.length > 200) {
                    this.candles = this.candles.slice(-100);
                }
                console.log(`🕯️ [MarketData] Candle closed: ${this.currentCandle.key} | O:${this.currentCandle.open.toFixed(2)} H:${this.currentCandle.high.toFixed(2)} L:${this.currentCandle.low.toFixed(2)} C:${this.currentCandle.close.toFixed(2)} | Total candles: ${this.candles.length}`);
            }

            this.currentCandle = {
                key: candleKey,
                minute: minute,
                hour: hour,
                time: tick.epoch,
                open: tick.quote,
                high: tick.quote,
                low: tick.quote,
                close: tick.quote,
                body: 0,
                upperWick: 0,
                lowerWick: 0
            };
        } else {
            this.currentCandle.high = Math.max(this.currentCandle.high, tick.quote);
            this.currentCandle.low = Math.min(this.currentCandle.low, tick.quote);
            this.currentCandle.close = tick.quote;
            
            this.currentCandle.body = Math.abs(this.currentCandle.close - this.currentCandle.open);
            this.currentCandle.upperWick = this.currentCandle.high - Math.max(this.currentCandle.open, this.currentCandle.close);
            this.currentCandle.lowerWick = Math.min(this.currentCandle.open, this.currentCandle.close) - this.currentCandle.low;
        }
    }

    calculateIndicators() {
        // RSI (14-period or whatever candles we have)
        const availableCandles = this.candles.length + (this.currentCandle ? 1 : 0);
        
        if (this.candles.length >= 3) {
            let gains = 0, losses = 0;
            const period = Math.min(14, this.candles.length);
            const recent = this.candles.slice(-period);

            for (let i = 1; i < recent.length; i++) {
                const change = recent[i].close - recent[i - 1].close;
                if (change >= 0) gains += change;
                else losses -= change;
            }

            const avgGain = gains / period;
            const avgLoss = losses / period;

            if (avgLoss !== 0) {
                const rs = avgGain / avgLoss;
                this.rsi = Math.round(100 - (100 / (1 + rs)));
            } else if (avgGain > 0) {
                this.rsi = 100;
            } else {
                this.rsi = 0;
            }
        }

        // Short-term RSI (5-period)
        if (this.candles.length >= 3) {
            let gains5 = 0, losses5 = 0;
            const period5 = Math.min(5, this.candles.length);
            const last5 = this.candles.slice(-period5);

            for (let i = 1; i < last5.length; i++) {
                const change = last5[i].close - last5[i - 1].close;
                if (change >= 0) gains5 += change;
                else losses5 -= change;
            }

            const avgGain5 = gains5 / period5;
            const avgLoss5 = losses5 / period5;

            if (avgLoss5 !== 0) {
                const rs5 = avgGain5 / avgLoss5;
                this.rsiShort = Math.round(100 - (100 / (1 + rs5)));
            } else if (avgGain5 > 0) {
                this.rsiShort = 100;
            } else {
                this.rsiShort = 0;
            }
        }

        // Support & Resistance
        if (this.candles.length >= 3) {
            const lookback = Math.min(20, this.candles.length);
            const recentCandles = this.candles.slice(-lookback);
            
            const recentLows = recentCandles.map(c => c.low);
            this.support = Math.min(...recentLows);

            const recentHighs = recentCandles.map(c => c.high);
            this.resistance = Math.max(...recentHighs);
        }
    }

    detectCandlePatterns() {
        if (this.candles.length < 3) {
            this.lastPattern = 'insufficient_data';
            return;
        }

        const last = this.candles[this.candles.length - 1];
        const prev = this.candles[this.candles.length - 2];
        const prevPrev = this.candles[this.candles.length - 3];

        const body = last.body || 0;
        const totalRange = (last.high - last.low) || 0.0001;
        const bodyRatio = body / totalRange;
        const prevBody = prev.body || 0;

        // Doji
        if (bodyRatio < 0.15 && totalRange > 0) {
            this.lastPattern = 'doji';
            return;
        }

        // Hammer
        if (last.lowerWick > body * 2 && last.upperWick < body * 0.5 && last.close > last.open) {
            if (this.support > 0 && last.low <= this.support * 1.002) {
                this.lastPattern = 'hammer_at_support';
                return;
            }
            this.lastPattern = 'hammer';
            return;
        }

        // Shooting star
        if (last.upperWick > body * 2 && last.lowerWick < body * 0.5 && last.close < last.open) {
            if (this.resistance > 0 && last.high >= this.resistance * 0.998) {
                this.lastPattern = 'shooting_star_at_resistance';
                return;
            }
            this.lastPattern = 'shooting_star';
            return;
        }

        // Bullish engulfing
        if (last.close > last.open && prev.close < prev.open &&
            last.open <= prev.close && last.close >= prev.open &&
            body > prevBody * 1.2) {
            this.lastPattern = 'bullish_engulfing';
            return;
        }

        // Bearish engulfing
        if (last.close < last.open && prev.close > prev.open &&
            last.open >= prev.close && last.close <= prev.open &&
            body > prevBody * 1.2) {
            this.lastPattern = 'bearish_engulfing';
            return;
        }

        // Three white soldiers
        if (last.close > last.open && prev.close > prev.open && prevPrev.close > prevPrev.open &&
            last.close > prev.close && prev.close > prevPrev.close) {
            this.lastPattern = 'three_white_soldiers';
            return;
        }

        // Three black crows
        if (last.close < last.open && prev.close < prev.open && prevPrev.close < prevPrev.open &&
            last.close < prev.close && prev.close < prevPrev.close) {
            this.lastPattern = 'three_black_crows';
            return;
        }

        this.lastPattern = 'no_significant_pattern';
    }

    getMarketState() {
        const currentPrice = this.currentCandle ? this.currentCandle.close : 0;
        let condition = 'neutral';
        let feeling = 'Market is stable';

        if (this.rsi > 0 && this.candles.length >= 3) {
            if (this.rsi < 30) {
                condition = 'oversold';
                feeling = 'Price is very low (oversold)';
            } else if (this.rsi < 40) {
                condition = 'approaching_oversold';
                feeling = 'Price is getting low';
            } else if (this.rsi > 70) {
                condition = 'overbought';
                feeling = 'Price is very high (overbought)';
            } else if (this.rsi > 60) {
                condition = 'approaching_overbought';
                feeling = 'Price is getting high';
            }
        } else if (this.candles.length < 3) {
            feeling = 'Building candle data...';
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
            rsiShort: this.rsiShort,
            support: this.support,
            resistance: this.resistance,
            condition: condition,
            feeling: feeling,
            nearSupport: nearSupport,
            nearResistance: nearResistance,
            distanceToSupport: parseFloat(distanceToSupport.toFixed(2)),
            distanceToResistance: parseFloat(distanceToResistance.toFixed(2)),
            trend: this.detectTrend(),
            volatility: this.calculateVolatility(),
            lastPattern: this.lastPattern,
            candleCount: this.candles.length,
            tickCount: this.tickCount
        };
    }

    detectTrend() {
        if (this.candles.length < 10) return 'building_data';

        const last10 = this.candles.slice(-10);
        let upMoves = 0, downMoves = 0;

        for (let i = 1; i < last10.length; i++) {
            if (last10[i].close > last10[i - 1].close) upMoves++;
            else if (last10[i].close < last10[i - 1].close) downMoves++;
        }

        if (upMoves > downMoves + 3) return 'strong_uptrend';
        if (upMoves > downMoves + 1) return 'uptrend';
        if (downMoves > upMoves + 3) return 'strong_downtrend';
        if (downMoves > upMoves + 1) return 'downtrend';
        return 'sideways';
    }

    calculateVolatility() {
        if (this.candles.length < 3) return 0;

        const last5 = this.candles.slice(-Math.min(5, this.candles.length));
        const prices = last5.map(c => c.close);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / prices.length;
        
        return Math.sqrt(variance);
    }

    getCandles(count = 50) {
        const allCandles = [...this.candles];
        if (this.currentCandle) {
            allCandles.push(this.currentCandle);
        }
        return allCandles.slice(-count);
    }

    getCurrentPrice() {
        return this.currentCandle ? this.currentCandle.close : 0;
    }

    getPriceActionSummary() {
        if (this.candles.length < 3) return null;

        const last5 = this.candles.slice(-Math.min(5, this.candles.length));
        const priceChange = last5[last5.length - 1].close - last5[0].open;
        const highLow = Math.max(...last5.map(c => c.high)) - Math.min(...last5.map(c => c.low));

        return {
            direction: priceChange > 0 ? 'up' : 'down',
            change_amount: Math.abs(priceChange).toFixed(2),
            high_low_range: highLow.toFixed(2),
            candles_analyzed: last5.length
        };
    }
}

module.exports = new MarketDataService();
