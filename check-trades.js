const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('✅ Connected to MongoDB\n');
  
  const tradeSchema = new mongoose.Schema({}, { strict: false });
  const Trade = mongoose.model('Trade', tradeSchema);
  
  const trades = await Trade.find({}).sort({ executed_at: -1 }).limit(10);
  
  console.log('📊 LAST 10 TRADES:\n');
  console.log('ACTION\tSYMBOL\tSTATUS\tPROFIT\tCONTRACT');
  console.log('─'.repeat(60));
  
  trades.forEach(t => {
    const profit = t.profit || 0;
    const profitStr = profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`;
    console.log(`${t.action}\t${t.symbol}\t${t.status}\t${profitStr}\t${t.contract_id}`);
  });
  
  const wins = trades.filter(t => t.status === 'WIN').length;
  const losses = trades.filter(t => t.status === 'LOSS').length;
  const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);
  
  console.log('\n' + '═'.repeat(60));
  console.log(`📈 SUMMARY: ${wins} Wins / ${losses} Losses | Net: ${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`);
  
  process.exit();
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
