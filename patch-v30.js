const fs = require('fs');
const path = './backend/services/aiTrader.js';
let c = fs.readFileSync(path, 'utf8');
const orig = c;

// FIX 1: Guard against duplicate closeTrade calls
c = c.replace(
  "async closeTrade(contractId, profit, status) {\n        if (!this.activeTrade) {",
  "async closeTrade(contractId, profit, status) {\n        if (!this.activeTrade) {\n            return;\n        }\n        // Guard: if already processing this contract, ignore duplicate\n        if (this._closingContractId === contractId) {\n            console.log('\\u26A0\\uFE0F [Guard] Ignoring duplicate close for ' + contractId);\n            return;\n        }\n        this._closingContractId = contractId;"
);

// FIX 2: Clear _closingContractId after activeTrade is nulled
c = c.replace(
  "this.activeTrade = null;\n\n        } catch (error) {\n            console.error(`\\u274C Close trade error:`",
  "this.activeTrade = null;\n            this._closingContractId = null;\n\n        } catch (error) {\n            console.error(`\\u274C Close trade error:`"
);

// FIX 3: Guard in handleContractUpdate - skip if closing already in progress
c = c.replace(
  "async handleContractUpdate(contract) {\n        if (!this.activeTrade || contract.contract_id !== this.activeTrade.contract_id) return;",
  "async handleContractUpdate(contract) {\n        if (!this.activeTrade || contract.contract_id !== this.activeTrade.contract_id) return;\n        if (this._closingContractId === contract.contract_id) return;"
);

// FIX 4: Skip XAU/USD (frxXAUUSD) trades - Deriv does not support 2-min duration for forex
c = c.replace(
  "const derivSymbol = this.convertSymbol(symbol);\n        const contractType = action === 'BUY' ? 'CALL' : 'PUT';",
  "const derivSymbol = this.convertSymbol(symbol);\n        if (derivSymbol.startsWith('frx')) {\n            throw new Error('Forex symbols need duration >= 15m. Skipping ' + derivSymbol);\n        }\n        const contractType = action === 'BUY' ? 'CALL' : 'PUT';"
);

// FIX 5: In aiTrader analyzeSymbol, skip XAU/USD entirely
c = c.replace(
  "async analyzeSymbol(symbol) {\n        console.log(`\\uD83D\\uDD0D [DEBUG-ENTRY] analyzeSymbol called for ${symbol}`);",
  "async analyzeSymbol(symbol) {\n        if (symbol === 'XAU/USD (Gold)') return null;\n        console.log(`\\uD83D\\uDD0D [DEBUG-ENTRY] analyzeSymbol called for ${symbol}`);"
);

// Version bump
c = c.replace(/v15\.0\.29/g, 'v15.0.30');

fs.writeFileSync(path, c);
console.log('Patched aiTrader.js -> v15.0.30');
console.log('Changes applied:', orig !== c ? 'YES' : 'NO');
