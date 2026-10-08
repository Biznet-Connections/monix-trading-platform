const fs = require('fs');
const path = './backend/services/aiTrader.js';
let c = fs.readFileSync(path, 'utf8');
const orig = c;
let applied = [];

// ─── FIX 1: Insert learning-based filter at top of analyzeSymbol ───
const filterCode = `
        // 🧠 LEARNING-BASED FILTERS (v15.0.32)
        const __hour = new Date().getUTCHours();
        
        // Blocked symbols based on historical WR < 20%
        const __blockedSymbols = ['R_100']; // 11.8% WR over 407 trades
        if (__blockedSymbols.includes(symbol)) {
            console.log('🧠 [LEARN] ' + symbol + ' blocked (historical WR < 20%)');
            return null;
        }
        
        // Blocked hours based on last 100 trades showing 0% WR
        const __blockedHours = [0, 21, 22, 23]; // All 0% WR recently
        if (__blockedHours.includes(__hour)) {
            console.log('🧠 [LEARN] Hour ' + __hour + ':00 UTC blocked (0% WR last 100 trades)');
            return null;
        }
        
        // Blocked patterns based on pattern journal WR < 30%
        const __blockedPatterns = ['oversold_bounce', 'bearish_engulfing', 'FORCE_TRADE', 'doji', 'hammer'];
        const __mState = marketData.getMarketState(symbol);
        const __pattern = __mState.lastPattern || 'none';
        if (__blockedPatterns.includes(__pattern)) {
            console.log('🧠 [LEARN] Pattern ' + __pattern + ' blocked (journal WR < 30%)');
            return null;
        }
`;

if (!c.includes('LEARNING-BASED FILTERS')) {
    c = c.replace(
        /(async analyzeSymbol\(symbol\) \{\s*\n)(\s*if \(symbol === 'XAU\/USD \(Gold\)'\) return null;\s*\n)/,
        `$1$2${filterCode}\n`
    );
    applied.push('learning filters');
} else {
    applied.push('learning filters (already present)');
}

// ─── FIX 2: Remove XAU skip (already there, keep it) - no change needed ───

// ─── Version bump ───
c = c.replace(/v15\.0\.31/g, 'v15.0.32');
applied.push('version -> v15.0.32');

fs.writeFileSync(path, c);
console.log('Changes applied:', orig !== c ? 'YES' : 'NO');
console.log('Applied:', applied.join(' | '));
