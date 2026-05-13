/**
 * Market Data Service - Professional Edition
 * Processes ticks → candles → indicators → supply/demand zones → liquidity detection
 * v6.0 - Professional Trader Edition
 */

class MarketDataService {
    constructor() {
        this.ticks = [];
        this.candles = [];
        this.currentCandle = null;
        this.rsi = null;
        this.rsiShort = null;
        this.support = 0;
        this.resistance = 0;
        this.lastPattern = 'none';
        this.lastUpdate = Date.now();
        this.updateInterval = 5000;
        this.tickCount = 0;
        this.calculationCount = 0;
        
        // NEW: Supply/Demand Zones
        this.supplyZones = [];    // Resistance zones where price reversed down
        this.demandZones = [];    // Support zones where price reversed up
        this.liquidityLevels = []; // Levels where stops are clustered
        this.swingHighs = [];
        this.swingLows = [];
    }

    reset() {
        this.ticks = [];
        this.candles = [];
        this.currentCandle = null;
        this.rsi = null;
        this.rsiShort = null;
        this.support = 0;
        this.resistance = 0;
        this.lastPattern = 'none';
        this.lastUpdate = Date.now();
        this.tickCount = 0;
        this.calculationCount = 0;
        this.supplyZones = [];
        this.demandZones = [];
        this.liquidityLevels = [];
        this.swingHighs = [];
        this.swingLows = [];
        console.log('🔄 [MarketData] State completely reset (Professional Edition)');
    }

    addTick(tick) {
        this.ticks.push(tick);
        this.tickCount++;
        if (this.ticks.length > 2000) this.ticks = this.ticks.slice(-1000);
        this.updateCandle(tick);

        const now = Date.now();
        const needsMoreData = this.candles.length < 10;
        const interval = needsMoreData ? 2000 : this.updateInterval;
        
        if (now - this.lastUpdate >= interval) {
            this.lastUpdate = now;
            this.calculateIndicators();
            this.detectCandlePatterns();
            this.detectSupplyDemandZones();
            this.detectLiquidityLevels();
            this.detectSwingPoints();
            
            if (this.calculationCount <= 10 || this.calculationCount % 20 === 0) {
                console.log(`📊 [MarketData] Calc #${this.calculationCount} | Candles: ${this.candles.length} | RSI: ${this.rsi !== null ? this.rsi : 'calc...'} | Zones: S${this.supplyZones.length}/D${this.demandZones.length}`);
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
                if (this.candles.length > 300) this.candles = this.candles.slice(-200);
                // Only log every 3 candles to reduce spam
                if (this.candles.length % 3 === 0) {
                    console.log(`🕯️ [MarketData] Candle: ${this.currentCandle.key} | O:${this.currentCandle.open.toFixed(2)} C:${this.currentCandle.close.toFixed(2)} | Total: ${this.candles.length}`);
                }
            }

            this.currentCandle = {
                key: candleKey, minute, hour, time: tick.epoch,
                open: tick.quote, high: tick.quote, low: tick.quote, close: tick.quote,
                body: 0, upperWick: 0, lowerWick: 0,
                volume: 1, isComplete: false
            };
        } else {
            this.currentCandle.high = Math.max(this.currentCandle.high, tick.quote);
            this.currentCandle.low = Math.min(this.currentCandle.low, tick.quote);
            this.currentCandle.close = tick.quote;
            this.currentCandle.volume = (this.currentCandle.volume || 1) + 1;
            this.currentCandle.body = Math.abs(this.currentCandle.close - this.currentCandle.open);
            this.currentCandle.upperWick = this.currentCandle.high - Math.max(this.currentCandle.open, this.currentCandle.close);
            this.currentCandle.lowerWick = Math.min(this.currentCandle.open, this.currentCandle.close) - this.currentCandle.low;
        }
    }

    calculateIndicators() {
        // RSI (14-period or whatever we have)
        if (this.candles.length >= 2) {
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
            } else if (avgGain > 0) { this.rsi = 100; }
            else { this.rsi = 0; }
        }

        // Short-term RSI
        if (this.candles.length >= 2) {
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
            } else if (avgGain5 > 0) { this.rsiShort = 100; }
            else { this.rsiShort = 0; }
        }

        // Support & Resistance (20-period)
        if (this.candles.length >= 1) {
            const lookback = Math.min(20, this.candles.length);
            const recentCandles = this.candles.slice(-lookback);
            this.support = Math.min(...recentCandles.map(c => c.low));
            this.resistance = Math.max(...recentCandles.map(c => c.high));
        }
    }

    /**
     * NEW: Detect supply and demand zones
     * Supply zone = area where price reversed sharply DOWN (resistance)
     * Demand zone = area where price reversed sharply UP (support)
     */
    detectSupplyDemandZones() {
        if (this.candles.length < 10) return;

        // Look for strong reversal candles in the last 30 candles
        const lookback = Math.min(30, this.candles.length);
        const recentCandles = this.candles.slice(-lookback);

        for (let i = 2; i < recentCandles.length; i++) {
            const candle = recentCandles[i];
            const body = candle.body || 0;
            const range = candle.high - candle.low;
            
            // Strong bearish reversal (supply zone created)
            if (body > 0 && range > 0 && candle.close < candle.open && body > range * 0.6) {
                const zone = {
                    type: 'SUPPLY',
                    top: candle.high,
                    bottom: candle.open,
                    strength: Math.min(10, Math.round(body / (range || 1) * 10)),
                    created: candle.time || Date.now(),
                    tested: 0
                };
                this.addZoneIfNew(zone, this.supplyZones);
            }
            
            // Strong bullish reversal (demand zone created)
            if (body > 0 && range > 0 && candle.close > candle.open && body > range * 0.6) {
                const zone = {
                    type: 'DEMAND',
                    top: candle.close,
                    bottom: candle.low,
                    strength: Math.min(10, Math.round(body / (range || 1) * 10)),
                    created: candle.time || Date.now(),
                    tested: 0
                };
                this.addZoneIfNew(zone, this.demandZones);
            }
        }

        // Clean up old zones (keep max 5 of each)
        if (this.supplyZones.length > 5) this.supplyZones = this.supplyZones.slice(-5);
        if (this.demandZones.length > 5) this.demandZones = this.demandZones.slice(-5);
    }

    /**
     * NEW: Add a zone if it doesn't overlap with existing ones
     */
    addZoneIfNew(newZone, zoneArray) {
        const overlaps = zoneArray.find(z => {
            const overlapTop = Math.min(z.top, newZone.top);
            const overlapBottom = Math.max(z.bottom, newZone.bottom);
            return overlapTop > overlapBottom;
        });
        
        if (!overlaps) {
            zoneArray.push(newZone);
        } else {
            // Increase strength of existing zone (price tested it again)
            overlaps.tested++;
            overlaps.strength = Math.min(10, overlaps.strength + 1);
        }
    }

    /**
     * NEW: Detect liquidity levels (where stop losses cluster)
     * Above recent highs = buy stops (liquidity for SELL)
     * Below recent lows = sell stops (liquidity for BUY)
     */
    detectLiquidityLevels() {
        if (this.candles.length < 10) return;
        
        this.liquidityLevels = [];
        const lookback = Math.min(20, this.candles.length);
        const recentCandles = this.candles.slice(-lookback);
        
        // Find clusters of highs (liquidity above)
        const highs = recentCandles.map(c => c.high);
        const avgHigh = highs.reduce((a, b) => a + b, 0) / highs.length;
        const highCluster = highs.filter(h => h > avgHigh);
        
        if (highCluster.length >= 3) {
            this.liquidityLevels.push({
                type: 'BUY_STOPS',
                level: Math.max(...highCluster),
                description: 'Stops clustered above recent highs'
            });
        }
        
        // Find clusters of lows (liquidity below)
        const lows = recentCandles.map(c => c.low);
        const avgLow = lows.reduce((a, b) => a + b, 0) / lows.length;
        const lowCluster = lows.filter(l => l < avgLow);
        
        if (lowCluster.length >= 3) {
            this.liquidityLevels.push({
                type: 'SELL_STOPS',
                level: Math.min(...lowCluster),
                description: 'Stops clustered below recent lows'
            });
        }
    }

    /**
     * NEW: Detect swing highs and lows (market structure)
     */
    detectSwingPoints() {
        if (this.candles.length < 5) return;
        
        const recentCandles = this.candles.slice(-Math.min(20, this.candles.length));
        
        for (let i = 2; i < recentCandles.length - 2; i++) {
            const current = recentCandles[i];
            const prev1 = recentCandles[i - 1];
            const prev2 = recentCandles[i - 2];
            const next1 = recentCandles[i + 1];
            const next2 = recentCandles[i + 2];
            
            // Swing high
            if (current.high > prev1.high && current.high > prev2.high && 
                current.high > next1.high && current.high > next2.high) {
                const swing = { price: current.high, time: current.time, type: 'HIGH' };
                if (!this.swingHighs.find(s => Math.abs(s.price - swing.price) / swing.price < 0.001)) {
                    this.swingHighs.push(swing);
                    if (this.swingHighs.length > 10) this.swingHighs.shift();
                }
            }
            
            // Swing low
            if (current.low < prev1.low && current.low < prev2.low && 
                current.low < next1.low && current.low < next2.low) {
                const swing = { price: current.low, time: current.time, type: 'LOW' };
                if (!this.swingLows.find(s => Math.abs(s.price - swing.price) / swing.price < 0.001)) {
                    this.swingLows.push(swing);
                    if (this.swingLows.length > 10) this.swingLows.shift();
                }
            }
        }
    }

    detectCandlePatterns() {
        if (this.candles.length < 2) {
            this.lastPattern = 'insufficient_data';
            return;
        }

        const last = this.candles[this.candles.length - 1];
        const prev = this.candles.length >= 2 ? this.candles[this.candles.length - 2] : null;
        const prevPrev = this.candles.length >= 3 ? this.candles[this.candles.length - 3] : null;

        const body = last.body || 0;
        const totalRange = (last.high - last.low) || 0.0001;
        const bodyRatio = body / totalRange;

        // Doji
        if (bodyRatio < 0.15 && totalRange > 0) { this.lastPattern = 'doji'; return; }

        // Hammer
        if (last.lowerWick > body * 2 && last.upperWick < body * 0.5 && last.close > last.open) {
            if (this.support > 0 && last.low <= this.support * 1.002) { this.lastPattern = 'hammer_at_support'; return; }
            this.lastPattern = 'hammer'; return;
        }

        // Shooting star
        if (last.upperWick > body * 2 && last.lowerWick < body * 0.5 && last.close < last.open) {
            if (this.resistance > 0 && last.high >= this.resistance * 0.998) { this.lastPattern = 'shooting_star_at_resistance'; return; }
            this.lastPattern = 'shooting_star'; return;
        }

        // Bullish engulfing
        if (prev && last.close > last.open && prev.close < prev.open && last.open <= prev.close && last.close >= prev.open && body > (prev.body || 0) * 1.2) {
            this.lastPattern = 'bullish_engulfing'; return;
        }

        // Bearish engulfing
        if (prev && last.close < last.open && prev.close > prev.open && last.open >= prev.close && last.close <= prev.open && body > (prev.body || 0) * 1.2) {
            this.lastPattern = 'bearish_engulfing'; return;
        }

        // Three white soldiers
        if (prevPrev && last.close > last.open && prev.close > prev.open && prevPrev.close > prevPrev.open && last.close > prev.close && prev.close > prevPrev.close) {
            this.lastPattern = 'three_white_soldiers'; return;
        }

        // Three black crows
        if (prevPrev && last.close < last.open && prev.close < prev.open && prevPrev.close < prevPrev.open && last.close < prev.close && prev.close < prevPrev.close) {
            this.lastPattern = 'three_black_crows'; return;
        }

        this.lastPattern = 'no_significant_pattern';
    }

    /**
     * NEW: Check if current price is near a supply or demand zone
     */
    isNearSupplyZone(currentPrice) {
        if (!currentPrice) return { near: false };
        for (const zone of this.supplyZones) {
            if (currentPrice >= zone.bottom && currentPrice <= zone.top) {
                return { near: true, zone, type: 'SUPPLY', strength: zone.strength };
            }
            // Within 0.3% proximity
            const proximity = Math.abs(currentPrice - zone.top) / zone.top;
            if (proximity < 0.003) {
                return { near: true, zone, type: 'SUPPLY_APPROACHING', strength: zone.strength };
            }
        }
        return { near: false };
    }

    isNearDemandZone(currentPrice) {
        if (!currentPrice) return { near: false };
        for (const zone of this.demandZones) {
            if (currentPrice >= zone.bottom && currentPrice <= zone.top) {
                return { near: true, zone, type: 'DEMAND', strength: zone.strength };
            }
            const proximity = Math.abs(currentPrice - zone.bottom) / zone.bottom;
            if (proximity < 0.003) {
                return { near: true, zone, type: 'DEMAND_APPROACHING', strength: zone.strength };
            }
        }
        return { near: false };
    }

    getMarketState() {
        const currentPrice = this.currentCandle ? this.currentCandle.close : 0;
        let condition = 'neutral';
        let feeling = 'Building candle data...';

        if (this.rsi !== null && this.candles.length >= 2) {
            feeling = 'Market is stable';
            if (this.rsi < 30) { condition = 'oversold'; feeling = 'Price is very low (oversold)'; }
            else if (this.rsi < 40) { condition = 'approaching_oversold'; feeling = 'Price is getting low'; }
            else if (this.rsi > 70) { condition = 'overbought'; feeling = 'Price is very high (overbought)'; }
            else if (this.rsi > 60) { condition = 'approaching_overbought'; feeling = 'Price is getting high'; }
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

        // Check supply/demand zones too
        const supplyCheck = this.isNearSupplyZone(currentPrice);
        const demandCheck = this.isNearDemandZone(currentPrice);

        return {
            price: currentPrice,
            rsi: this.rsi !== null ? this.rsi : 50,
            rsi_actual: this.rsi,
            rsiShort: this.rsiShort !== null ? this.rsiShort : 50,
            rsiShort_actual: this.rsiShort,
            support: this.support,
            resistance: this.resistance,
            condition, feeling,
            nearSupport: nearSupport || demandCheck.near,
            nearResistance: nearResistance || supplyCheck.near,
            distanceToSupport: parseFloat(distanceToSupport.toFixed(2)),
            distanceToResistance: parseFloat(distanceToResistance.toFixed(2)),
            trend: this.detectTrend(),
            volatility: this.calculateVolatility(),
            lastPattern: this.lastPattern,
            candleCount: this.candles.length,
            tickCount: this.tickCount,
            supplyZones: this.supplyZones,
            demandZones: this.demandZones,
            liquidityLevels: this.liquidityLevels,
            swingHighs: this.swingHighs,
            swingLows: this.swingLows,
            nearSupplyZone: supplyCheck,
            nearDemandZone: demandCheck
        };
    }

    detectTrend() {
        if (this.candles.length < 3) return 'building_data';
        const lastN = this.candles.slice(-Math.min(10, this.candles.length));
        let upMoves = 0, downMoves = 0;
        for (let i = 1; i < lastN.length; i++) {
            if (lastN[i].close > lastN[i - 1].close) upMoves++;
            else if (lastN[i].close < lastN[i - 1].close) downMoves++;
        }
        const total = upMoves + downMoves;
        if (total === 0) return 'sideways';
        const upRatio = upMoves / total;
        if (upRatio > 0.7) return 'strong_uptrend';
        if (upRatio > 0.55) return 'uptrend';
        if (upRatio < 0.3) return 'strong_downtrend';
        if (upRatio < 0.45) return 'downtrend';
        return 'sideways';
    }

    calculateVolatility() {
        if (this.candles.length < 2) return 0;
        const lastN = this.candles.slice(-Math.min(5, this.candles.length));
        const prices = lastN.map(c => c.close);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / prices.length;
        return Math.sqrt(variance);
    }

    getCandles(count = 50) {
        const allCandles = [...this.candles];
        if (this.currentCandle) allCandles.push(this.currentCandle);
        return allCandles.slice(-count);
    }

    getCurrentPrice() {
        return this.currentCandle ? this.currentCandle.close : 0;
    }

    getPriceActionSummary() {
        if (this.candles.length < 2) return null;
        const lastN = this.candles.slice(-Math.min(5, this.candles.length));
        const priceChange = lastN[lastN.length - 1].close - lastN[0].open;
        const highLow = Math.max(...lastN.map(c => c.high)) - Math.min(...lastN.map(c => c.low));
        return {
            direction: priceChange > 0 ? 'up' : 'down',
            change_amount: Math.abs(priceChange).toFixed(2),
            high_low_range: highLow.toFixed(2),
            candles_analyzed: lastN.length
        };
    }

    /**
     * NEW: Get the nearest supply/demand zone to current price
     */
    getNearestZone(currentPrice) {
        const supplyCheck = this.isNearSupplyZone(currentPrice);
        const demandCheck = this.isNearDemandZone(currentPrice);
        if (supplyCheck.near && demandCheck.near) {
            return supplyCheck.zone.top - currentPrice < currentPrice - demandCheck.zone.bottom ? supplyCheck : demandCheck;
        }
        if (supplyCheck.near) return supplyCheck;
        if (demandCheck.near) return demandCheck;
        return null;
    }
}

module.exports = new MarketDataService();
