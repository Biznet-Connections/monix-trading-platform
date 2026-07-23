const fs = require('fs');
const path = './backend/services/aiTrader.js';

let content = fs.readFileSync(path, 'utf8');

// Lower setup quality for first trade
content = content.replace(
  /const minSetupQuality = data\.trades < 3 \? 45 : 55;/g,
  'const minSetupQuality = data.trades === 0 ? 30 : (data.trades < 3 ? 40 : 55);'
);

// Lower confidence for first trade
content = content.replace(
  /const minConfidence = data\.trades < 3 \? 50 : 55;/g,
  'const minConfidence = data.trades === 0 ? 35 : (data.trades < 3 ? 45 : 55);'
);

fs.writeFileSync(path, content);
console.log('✅ First trade thresholds lowered successfully');
