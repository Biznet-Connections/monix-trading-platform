const fs = require('fs');
const path = './backend/services/aiTrader.js';
let content = fs.readFileSync(path, 'utf8');

// Add debug logging at the end of analyzeSymbol before return
const debugLog = `
            // 🚀 DEBUG: Log why we're returning signal
            console.log(\`🔍 [SIGNAL] \${symbol}: \${action} | RSI: \${rsi} | Quality: \${setupQuality} | Confidence: \${confidence} | Pattern: \${pattern} | WR: \${patternWR}\`);
            return {`;

content = content.replace(
  /return \{/,
  debugLog
);

fs.writeFileSync(path, content);
console.log('✅ Debug logging added');
