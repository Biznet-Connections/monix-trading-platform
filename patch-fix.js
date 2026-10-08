const fs = require('fs');
const path = './backend/services/aiTrader.js';
let c = fs.readFileSync(path, 'utf8');
const orig = c;

// FIX 1: Reset ALL blocking state on startup
c = c.replace(
  "this.dailyTradeCount = 0;\n\n        await this.loadSymbolData();",
  "this.dailyTradeCount = 0;\n" +
  "        this.pausedUntil = 0;\n" +
  "        this.dailyTargetMet = false;\n" +
  "        this.dailyLossReached = false;\n" +
  "        this.dailyProfit = 0;\n" +
  "        this.dailyLoss = 0;\n" +
  "        this._lastDailyReset = null;\n" +
  "        this.lastTradeTime = 0;\n" +
  "        this._lastSessionLog = 0;\n" +
  "        this._lastAnalysisLog = 0;\n" +
  "        this.activeTrade = null;\n" +
  "        this.isExecuting = false;\n" +
  "        console.log('\\u{1F513} [Reset] All pause/limit/active-trade state cleared on startup');\n\n" +
  "        await this.loadSymbolData();"
);

// FIX 2: UTC day rollover resets counters + pauses
c = c.replace(
  "const now = Date.now();\n            if (now - this.dailyResetTime > 24 * 60 * 60 * 1000) {",
  "const now = Date.now();\n" +
  "            const todayUTC = new Date().toISOString().slice(0,10);\n" +
  "            if (this._lastUTCDate !== todayUTC) {\n" +
  "                this._lastUTCDate = todayUTC;\n" +
  "                this.dailyTradeCount = 0;\n" +
  "                this.pausedUntil = 0;\n" +
  "                this.dailyTargetMet = false;\n" +
  "                this.dailyLossReached = false;\n" +
  "                this.dailyProfit = 0;\n" +
  "                this.dailyLoss = 0;\n" +
  "                this.dailyResetTime = now;\n" +
  "                console.log('\\u{1F4C5} [Daily] UTC day changed -> counters + pause reset');\n" +
  "            }\n" +
  "            if (now - this.dailyResetTime > 24 * 60 * 60 * 1000) {"
);

// FIX 3: Watchdog - force close stuck trades after 10 min
c = c.replace(
  "setInterval(async () => {\n            if (this.activeTrade) {",
  "setInterval(async () => {\n" +
  "            if (this.activeTrade && (Date.now() - this.activeTrade.entry_time) > 600000) {\n" +
  "                console.log('\\u{1F6A8} [WATCHDOG] Force-closing stuck trade #' + this.activeTrade.id);\n" +
  "                try {\n" +
  "                    await this.closeTrade(this.activeTrade.contract_id, -this.activeTrade.stake, 'LOSS');\n" +
  "                } catch (e) {\n" +
  "                    this.activeTrade = null;\n" +
  "                }\n" +
  "            }\n" +
  "            if (this.activeTrade) {"
);

// FIX 4: Version bump
c = c.replace(/v15\.0\.23/g, 'v15.0.29');

fs.writeFileSync(path, c);
console.log('Patched aiTrader.js -> v15.0.29');
console.log('Changes applied:', orig !== c ? 'YES' : 'NO - patterns did not match');
