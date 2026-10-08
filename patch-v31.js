const fs = require('fs');
const path = './backend/services/aiTrader.js';
let c = fs.readFileSync(path, 'utf8');
const orig = c;
let applied = [];

// ─── FIX 1: Add duplicate close guard ───
if (!c.includes('_closingContractId')) {
    c = c.replace(
        /(async closeTrade\(contractId, profit, status\) \{\s*\n\s*if \(!this\.activeTrade\) \{[\s\S]*?return;\s*\n\s*\})/,
        (match) => match + `\n\n        // GUARD: prevent duplicate close on same contract\n        if (this._closingContractId === contractId) {\n            console.log('GUARD: Ignoring duplicate close for ' + contractId);\n            return;\n        }\n        this._closingContractId = contractId;`
    );
    applied.push('close guard');
} else {
    applied.push('close guard (already present)');
}

// Clear _closingContractId wherever activeTrade is nulled inside closeTrade
c = c.replace(
    /this\.activeTrade = null;(\s*\n\s*\}) catch \(error\) \{\s*\n\s*console\.error\(`[^`]*Close trade error[^`]*`[^\)]*\);\s*\n\s*this\.activeTrade = null;\s*\n\s*\}/,
    `this.activeTrade = null;\n            this._closingContractId = null;\n\n        } catch (error) {\n            console.error('Close trade error:', error.message);\n            this.activeTrade = null;\n            this._closingContractId = null;\n        }`
);
applied.push('clear closing id');

// ─── FIX 2: Widen stop-loss/take-profit ───
c = c.replace(/this\.PROFIT_TARGET_PCT\s*=\s*0\.08;/, 'this.PROFIT_TARGET_PCT = 0.60;');
c = c.replace(/this\.STOP_LOSS_PCT\s*=\s*0\.02;/, 'this.STOP_LOSS_PCT = 0.30;');
applied.push('widen SL/TP');

// ─── FIX 3: Skip XAU/USD in analyzeSymbol ───
if (!c.includes("if (symbol === 'XAU/USD (Gold)') return null;")) {
    c = c.replace(
        /(async analyzeSymbol\(symbol\) \{\s*\n)/,
        `$1        if (symbol === 'XAU/USD (Gold)') return null;\n`
    );
    applied.push('skip XAU');
} else {
    applied.push('skip XAU (already present)');
}

// ─── FIX 4: Version bump ───
c = c.replace(/v15\.0\.\d+/g, 'v15.0.31');
applied.push('version -> v15.0.31');

fs.writeFileSync(path, c);
console.log('Changes applied:', orig !== c ? 'YES' : 'NO');
console.log('Applied items:', applied.join(' | '));
console.log('File size before/after:', orig.length, '/', c.length);
