const fs = require('fs');
const path = './backend/services/aiTrader.js';

let content = fs.readFileSync(path, 'utf8');

// Lower setup quality threshold
content = content.replace(
  /const minSetupQuality = data\.trades < 3 \? 45 : 55;/g,
  'const minSetupQuality = data.trades < 3 ? 35 : 50;'
);

// Lower confidence threshold
content = content.replace(
  /const minConfidence = data\.trades < 3 \? 50 : 55;/g,
  'const minConfidence = data.trades < 3 ? 40 : 50;'
);

fs.writeFileSync(path, content);
console.log('✅ Thresholds lowered successfully');
