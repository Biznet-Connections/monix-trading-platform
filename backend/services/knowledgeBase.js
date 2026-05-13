/**
 * MONIX TRADING KNOWLEDGE BASE
 * Pre-loaded professional trading wisdom
 * v6.1 - Asian session tuned (-2 instead of -5)
 */

const TRADING_KNOWLEDGE = {
    sessions: {
        ASIAN: {
            hours: '00:00-09:00 UTC',
            personality: 'RANGING',
            volatility: 'LOW',
            bestStrategy: 'Buy support, sell resistance. Tight ranges. Take quick profits.',
            avoidStrategy: 'Do not trade breakouts. Most breakouts in Asian are fakeouts.',
            confidenceModifier: -2,
            recommendedStakeModifier: 0.5,
            maxTradeDuration: 5,
            bestSymbols: ['R_25', 'R_50'],
            rules: {
                supportBounce: { action: 'BUY', reliability: 'HIGH', minConfidence: 55 },
                resistanceReject: { action: 'SELL', reliability: 'HIGH', minConfidence: 55 },
                breakout: { action: 'WAIT', reliability: 'LOW', reason: 'Asian breakouts are usually fakeouts' },
                trendFollow: { action: 'WAIT', reliability: 'LOW', reason: 'Asian rarely trends strongly' }
            }
        },
        LONDON: {
            hours: '08:00-17:00 UTC',
            personality: 'TRENDING',
            volatility: 'MEDIUM',
            bestStrategy: 'Trade WITH momentum. First breakout is usually real. Hold for full move.',
            avoidStrategy: 'Do not fade the initial London move. Do not try to pick tops/bottoms.',
            confidenceModifier: 5,
            recommendedStakeModifier: 1.0,
            maxTradeDuration: 5,
            bestSymbols: ['R_75', 'R_100', 'EUR/USD', 'GBP/USD'],
            rules: {
                breakout: { action: 'FOLLOW', reliability: 'HIGH', minConfidence: 55 },
                trendContinuation: { action: 'FOLLOW', reliability: 'HIGH', minConfidence: 50 },
                supportBounce: { action: 'BUY', reliability: 'MEDIUM', minConfidence: 60, note: 'Only in uptrend' },
                resistanceReject: { action: 'SELL', reliability: 'MEDIUM', minConfidence: 60, note: 'Only in downtrend' }
            }
        },
        NEWYORK: {
            hours: '13:00-22:00 UTC',
            personality: 'VOLATILE',
            volatility: 'HIGH',
            bestStrategy: 'Trade pullbacks to support/resistance. Wait for retracement. Larger moves.',
            avoidStrategy: 'Do not chase breakouts. Do not enter mid-move without pullback.',
            confidenceModifier: 0,
            recommendedStakeModifier: 1.0,
            maxTradeDuration: 5,
            bestSymbols: ['R_100', 'XAU/USD (Gold)', 'US500 (S&P 500)'],
            rules: {
                pullbackToSupport: { action: 'BUY', reliability: 'HIGH', minConfidence: 55, note: 'In uptrend' },
                pullbackToResistance: { action: 'SELL', reliability: 'HIGH', minConfidence: 55, note: 'In downtrend' },
                breakout: { action: 'WAIT', reliability: 'LOW', reason: 'NY breakouts often reverse violently' },
                reversal: { action: 'TRADE', reliability: 'MEDIUM', minConfidence: 65, note: 'NY reversals are powerful but risky' }
            }
        }
    },

    patterns: {
        hammer: {
            AT_SUPPORT: { action: 'BUY', reliability: 'HIGH', minConfidence: 55, confirmation: 'Next candle must close bullish', note: 'Classic reversal signal at support' },
            AT_RESISTANCE: { action: 'WAIT', reliability: 'LOW', reason: 'Hammer at resistance is not a valid signal' },
            IN_DOWNTREND: { action: 'WAIT', reliability: 'LOW', reason: 'Hammers in downtrends are usually fakeouts. Wait for trend change.' },
            IN_UPTREND: { action: 'BUY', reliability: 'MEDIUM', note: 'Continuation signal if at support within uptrend' },
            MID_RANGE: { action: 'WAIT', reliability: 'LOW', reason: 'No context. Wait for support/resistance proximity.' }
        },
        shooting_star: {
            AT_RESISTANCE: { action: 'SELL', reliability: 'HIGH', minConfidence: 55, confirmation: 'Next candle must close bearish' },
            AT_SUPPORT: { action: 'WAIT', reliability: 'LOW', reason: 'Shooting star at support is not a valid signal' },
            IN_UPTREND: { action: 'WAIT', reliability: 'LOW', reason: 'Shooting stars in uptrends are usually fakeouts' },
            IN_DOWNTREND: { action: 'SELL', reliability: 'MEDIUM', note: 'Continuation signal if at resistance within downtrend' },
            MID_RANGE: { action: 'WAIT', reliability: 'LOW', reason: 'No context' }
        },
        bullish_engulfing: {
            AT_SUPPORT: { action: 'BUY', reliability: 'HIGH', minConfidence: 55 },
            IN_DOWNTREND: { action: 'BUY', reliability: 'MEDIUM', minConfidence: 60, note: 'Potential reversal. Need confirmation.' },
            IN_UPTREND: { action: 'BUY', reliability: 'HIGH', note: 'Strong continuation' },
            MID_RANGE: { action: 'WAIT', reliability: 'LOW' }
        },
        bearish_engulfing: {
            AT_RESISTANCE: { action: 'SELL', reliability: 'HIGH', minConfidence: 55 },
            IN_UPTREND: { action: 'SELL', reliability: 'MEDIUM', minConfidence: 60, note: 'Potential reversal. Need confirmation.' },
            IN_DOWNTREND: { action: 'SELL', reliability: 'HIGH', note: 'Strong continuation' },
            MID_RANGE: { action: 'WAIT', reliability: 'LOW' }
        },
        doji: {
            AT_SUPPORT: { action: 'BUY', reliability: 'MEDIUM', minConfidence: 60, note: 'Only if next candle is bullish' },
            AT_RESISTANCE: { action: 'SELL', reliability: 'MEDIUM', minConfidence: 60, note: 'Only if next candle is bearish' },
            EVERYWHERE_ELSE: { action: 'WAIT', reliability: 'LOW', reason: 'Doji = indecision. Wait for confirmation.' }
        },
        three_white_soldiers: {
            AFTER_DOWNTREND: { action: 'BUY', reliability: 'HIGH', minConfidence: 55, note: 'Strong reversal signal' },
            IN_UPTREND: { action: 'BUY', reliability: 'HIGH', note: 'Strong continuation' },
            IN_DOWNTREND: { action: 'WAIT', reliability: 'LOW', reason: 'Counter-trend. Wait for trend confirmation.' }
        },
        three_black_crows: {
            AFTER_UPTREND: { action: 'SELL', reliability: 'HIGH', minConfidence: 55, note: 'Strong reversal signal' },
            IN_DOWNTREND: { action: 'SELL', reliability: 'HIGH', note: 'Strong continuation' },
            IN_UPTREND: { action: 'WAIT', reliability: 'LOW', reason: 'Counter-trend. Wait for trend confirmation.' }
        }
    },

    rsiRules: {
        DEEPLY_OVERSOLD: { range: [0, 25], inRanging: { action: 'BUY', confidence: 65 }, inUptrend: { action: 'BUY', confidence: 70, note: 'Buy the dip in uptrend' }, inDowntrend: { action: 'WAIT', confidence: 30, reason: 'RSI 25 in downtrend = momentum is strong down. Do not catch knife.' }, inStrongDowntrend: { action: 'WAIT', confidence: 10, reason: 'Strong downtrend overrides oversold RSI. Trend is king.' } },
        OVERSOLD: { range: [25, 35], inRanging: { action: 'BUY', confidence: 60 }, inUptrend: { action: 'BUY', confidence: 65 }, inDowntrend: { action: 'WAIT', confidence: 40, reason: 'Still in downtrend. Wait for reversal signal.' } },
        NEUTRAL: { range: [35, 65], inRanging: { action: 'USE_PATTERN', confidence: 55 }, inUptrend: { action: 'BUY_ON_PULLBACK', confidence: 60 }, inDowntrend: { action: 'SELL_ON_BOUNCE', confidence: 60 } },
        OVERBOUGHT: { range: [65, 75], inRanging: { action: 'SELL', confidence: 60 }, inDowntrend: { action: 'SELL', confidence: 65 }, inUptrend: { action: 'WAIT', confidence: 40, reason: 'Still in uptrend. Wait for reversal signal.' } },
        DEEPLY_OVERBOUGHT: { range: [75, 100], inRanging: { action: 'SELL', confidence: 65 }, inDowntrend: { action: 'SELL', confidence: 70, note: 'Sell the bounce in downtrend' }, inUptrend: { action: 'WAIT', confidence: 30, reason: 'RSI 75 in uptrend = momentum is strong up. Do not short.' }, inStrongUptrend: { action: 'WAIT', confidence: 10, reason: 'Strong uptrend overrides overbought RSI. Trend is king.' } }
    },

    trendRules: {
        strong_uptrend: { primaryAction: 'BUY', secondaryAction: 'WAIT', forbiddenActions: ['SELL'], rule: 'Never short a strong uptrend. Only buy pullbacks or continuation.' },
        uptrend: { primaryAction: 'BUY', secondaryAction: 'SELL_ONLY_AT_RESISTANCE', rule: 'Buy pullbacks. Only sell at clear resistance with confirmation.' },
        sideways: { primaryAction: 'RANGE_TRADE', rule: 'Buy support. Sell resistance. Wait for confirmation at levels.' },
        downtrend: { primaryAction: 'SELL', secondaryAction: 'BUY_ONLY_AT_SUPPORT', rule: 'Sell bounces. Only buy at clear support with confirmation.' },
        strong_downtrend: { primaryAction: 'SELL', secondaryAction: 'WAIT', forbiddenActions: ['BUY'], rule: 'Never buy a strong downtrend. Only sell continuation or bounces.' }
    },

    riskManagement: {
        maxRiskPerTrade: 0.02, minRiskRewardRatio: 2.0, maxConsecutiveLosses: 3,
        pauseAfterLosses: 5, maxDailyLoss: 25, scaleUpOnWinStreak: true,
        scaleDownOnLossStreak: true, minConfidenceForTrade: 55
    },

    confirmation: {
        minConfirmations: 2,
        factors: ['PATTERN_CONTEXT', 'RSI_ALIGNMENT', 'TREND_ALIGNMENT', 'SESSION_RULES', 'CANDLE_CLOSE', 'VOLUME_OR_VOLATILITY'],
        requiredForEntry: ['PATTERN_CONTEXT', 'TREND_ALIGNMENT'],
        niceToHave: ['RSI_ALIGNMENT', 'SESSION_RULES', 'CANDLE_CLOSE']
    }
};

function getSessionRules() {
    const hour = new Date().getUTCHours();
    if (hour >= 0 && hour < 9) return { name: 'ASIAN', ...TRADING_KNOWLEDGE.sessions.ASIAN };
    if (hour >= 8 && hour < 17) return { name: 'LONDON', ...TRADING_KNOWLEDGE.sessions.LONDON };
    return { name: 'NEWYORK', ...TRADING_KNOWLEDGE.sessions.NEWYORK };
}

function getPatternContext(pattern, trend, nearSupport, nearResistance) {
    if (!pattern || !TRADING_KNOWLEDGE.patterns[pattern.toLowerCase()]) return { action: 'UNKNOWN_PATTERN', reliability: 'LOW', reason: 'Pattern not in knowledge base' };
    const patternRules = TRADING_KNOWLEDGE.patterns[pattern.toLowerCase()];
    if (nearSupport) return patternRules.AT_SUPPORT || patternRules.MID_RANGE;
    if (nearResistance) return patternRules.AT_RESISTANCE || patternRules.MID_RANGE;
    if (trend?.includes('downtrend')) return patternRules.IN_DOWNTREND || patternRules.MID_RANGE;
    if (trend?.includes('uptrend')) return patternRules.IN_UPTREND || patternRules.MID_RANGE;
    return patternRules.MID_RANGE || { action: 'WAIT', reliability: 'LOW', reason: 'No context for pattern' };
}

function getRSIRule(rsi, trend) {
    if (!rsi || rsi <= 0) return { action: 'NO_DATA' };
    const rules = TRADING_KNOWLEDGE.rsiRules;
    let range;
    if (rsi < 25) range = rules.DEEPLY_OVERSOLD;
    else if (rsi < 35) range = rules.OVERSOLD;
    else if (rsi < 65) range = rules.NEUTRAL;
    else if (rsi < 75) range = rules.OVERBOUGHT;
    else range = rules.DEEPLY_OVERBOUGHT;
    if (trend?.includes('strong_downtrend')) return range.inStrongDowntrend || range.inDowntrend;
    if (trend?.includes('downtrend')) return range.inDowntrend;
    if (trend?.includes('strong_uptrend')) return range.inStrongUptrend || range.inUptrend;
    if (trend?.includes('uptrend')) return range.inUptrend;
    return range.inRanging;
}

function getTrendRule(trend) {
    if (!trend) return TRADING_KNOWLEDGE.trendRules.sideways;
    return TRADING_KNOWLEDGE.trendRules[trend] || TRADING_KNOWLEDGE.trendRules.sideways;
}

function countConfirmations(factors) {
    let count = 0;
    if (factors.patternContext) count++;
    if (factors.rsiAlignment) count++;
    if (factors.trendAlignment) count++;
    if (factors.sessionFavorable) count++;
    if (factors.candleConfirmation) count++;
    return count;
}

function validateSetup(params) {
    const { pattern, currentTrend, rsi, nearSupport, nearResistance, action } = params;
    const session = getSessionRules();
    const confirmations = { patternContext: false, rsiAlignment: false, trendAlignment: false, sessionFavorable: false, candleConfirmation: false };
    let reasons = [];

    const trendRule = getTrendRule(currentTrend);
    if (trendRule.forbiddenActions?.includes(action)) {
        return { valid: false, action: 'WAIT', confidence: 0, reason: trendRule.rule, confirmations: 0, source: 'TREND_RULE' };
    }
    if (trendRule.primaryAction === action || (trendRule.primaryAction === 'BUY' && action === 'BUY')) confirmations.trendAlignment = true;

    if (pattern && pattern !== 'no_significant_pattern' && pattern !== 'none') {
        const normalizedPattern = pattern.toLowerCase().replace(/_/g, ' ');
        let matchedPattern = null;
        for (const key of Object.keys(TRADING_KNOWLEDGE.patterns)) {
            if (normalizedPattern.includes(key)) { matchedPattern = key; break; }
        }
        if (matchedPattern) {
            const patternContext = getPatternContext(matchedPattern, currentTrend, nearSupport, nearResistance);
            if (patternContext.action === 'WAIT') reasons.push(`PATTERN: ${patternContext.reason || 'Pattern context suggests WAIT'}`);
            else if (patternContext.action === action) confirmations.patternContext = true;
            else reasons.push(`PATTERN: ${matchedPattern} suggests ${patternContext.action}, not ${action}`);
        }
    }

    if (rsi && rsi > 0) {
        const rsiRule = getRSIRule(rsi, currentTrend);
        if (rsiRule.action === 'WAIT') reasons.push(`RSI: ${rsiRule.reason || 'RSI suggests WAIT'}`);
        else if (rsiRule.action === action || (rsiRule.action === 'BUY' && action === 'BUY')) confirmations.rsiAlignment = true;
    }

    if (session.confidenceModifier >= 0) confirmations.sessionFavorable = true;
    else reasons.push(`SESSION: ${session.name} session has lower reliability`);

    const confirmationCount = countConfirmations(confirmations);
    const minRequired = TRADING_KNOWLEDGE.confirmation.minConfirmations;

    if (confirmationCount >= minRequired && confirmations.trendAlignment) {
        let baseConfidence = 55;
        if (confirmations.patternContext) baseConfidence += 10;
        if (confirmations.rsiAlignment) baseConfidence += 5;
        if (confirmations.sessionFavorable) baseConfidence += session.confidenceModifier;
        baseConfidence = Math.min(90, Math.max(40, baseConfidence));
        return { valid: true, action, confidence: baseConfidence, reason: `Validated (${confirmationCount}/${Object.keys(confirmations).length} confirmations)`, confirmations: confirmationCount, source: 'KNOWLEDGE_BASE', sessionModifier: session.confidenceModifier };
    }

    if (reasons.length === 0) reasons.push('Insufficient confirmations for entry');
    return { valid: false, action: 'WAIT', confidence: 0, reason: reasons.join(' | '), confirmations: confirmationCount, source: 'KNOWLEDGE_BASE' };
}

module.exports = { TRADING_KNOWLEDGE, getSessionRules, getPatternContext, getRSIRule, getTrendRule, validateSetup, countConfirmations };
