const fs = require('fs');
const path = './backend/services/aiTrader.js';
let c = fs.readFileSync(path, 'utf8');

// Fix exit price: use entry price + actual profit move
c = c.replace(
  /let exitPrice = entryPrice;\s*\n\s*if \(status === 'WIN'\) \{\s*\n\s*exitPrice = entryPrice \* \(1 \+ \(finalProfit \/ stake\)\);\s*\n\s*\} else \{\s*\n\s*exitPrice = entryPrice \* \(1 - \(Math\.abs\(finalProfit\) \/ stake\)\);\s*\n\s*\}/,
  `let exitPrice = entryPrice; // placeholder - not used for P&L`
);

c = c.replace(/v15\.0\.\d+/g, 'v15.0.34');
fs.writeFileSync(path, c);
console.log('Fixed exit price display');
