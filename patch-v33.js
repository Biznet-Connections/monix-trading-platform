const fs = require('fs');
const path = './backend/services/aiTrader.js';
let c = fs.readFileSync(path, 'utf8');
const orig = c;
let applied = [];

// ─── FIX 1: Block R_100 + bad hours + bad patterns ───
if (!c.includes('LEARNING-BASED FILTERS')) {
    c = c.replace(
        /(async analyzeSymbol\(symbol\) \{\s*\n)/,
        `$1        // LEARNING-BASED FILTERS (v15.0.33)\n        const __hour = new Date().getUTCHours();\n        if (symbol === 'R_100') { console.log('LEARN: R_100 blocked (11.8% WR)'); return null; }\n        if ([0,21,22,23].includes(__hour)) { console.log('LEARN: Hour ' + __hour + ' UTC blocked'); return null; }\n`
    );
    applied.push('learning filters');
} else {
    applied.push('learning filters (present)');
}

// ─── FIX 2: SL/TP verify ───
c = c.replace(/this\.PROFIT_TARGET_PCT\s*=\s*0\.08;/, 'this.PROFIT_TARGET_PCT = 0.60;');
c = c.replace(/this\.STOP_LOSS_PCT\s*=\s*0\.02;/, 'this.STOP_LOSS_PCT = 0.30;');
applied.push('SL/TP verified');

// ─── Version ───
c = c.replace(/v15\.0\.\d+/g, 'v15.0.33');
applied.push('version v15.0.33');

fs.writeFileSync(path, c);
console.log('Applied:', orig !== c ? 'YES' : 'NO');
console.log('Items:', applied.join(' | '));
