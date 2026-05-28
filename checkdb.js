const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://omnixra_user:omnixra2005@omnixra-cluster.9mbcmgr.mongodb.net/omnixra?retryWrites=true&w=majority')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const Trade = mongoose.model('Trade', new mongoose.Schema({}, { strict: false, collection: 'trades' }));
    const trades = await Trade.find().sort({ executed_at: -1 }).lean();
    const wins = trades.filter(t => t.status === 'WIN').length;
    const losses = trades.filter(t => t.status === 'LOSS').length;
    const netProfit = trades.reduce((s, t) => s + (t.profit || 0), 0);
    
    console.log('═══════════════════════════════════');
    console.log('📊 TRADE SUMMARY');
    console.log('═══════════════════════════════════');
    console.log('Total Trades:', trades.length);
    console.log('Wins:', wins);
    console.log('Losses:', losses);
    console.log('Win Rate:', trades.length > 0 ? ((wins/trades.length)*100).toFixed(1) + '%' : '0%');
    console.log('Net Profit: $' + netProfit.toFixed(2));
    
    console.log('\n═══════════════════════════════════');
    console.log('📈 PATTERN PERFORMANCE');
    console.log('═══════════════════════════════════');
    const patterns = {};
    trades.forEach(t => {
        const p = t.pattern || 'Unknown';
        if (!patterns[p]) patterns[p] = { wins: 0, losses: 0, totalProfit: 0 };
        patterns[p].totalProfit += (t.profit || 0);
        if (t.status === 'WIN') patterns[p].wins++;
        else patterns[p].losses++;
    });
    Object.entries(patterns)
        .sort((a, b) => (b[1].wins + b[1].losses) - (a[1].wins + a[1].losses))
        .forEach(([p, d]) => {
            const total = d.wins + d.losses;
            const wr = total > 0 ? ((d.wins/total)*100).toFixed(0) : 0;
            const emoji = wr >= 65 ? '🟢' : wr >= 50 ? '🟡' : '🔴';
            console.log(`${emoji} ${p.padEnd(30)} ${d.wins}W/${d.losses}L (${wr}%) | $${d.totalProfit.toFixed(2)}`);
        });
    
    console.log('\n═══════════════════════════════════');
    console.log('🕐 SESSION PERFORMANCE');
    console.log('═══════════════════════════════════');
    const sessions = {};
    trades.forEach(t => {
        const s = t.session || 'Unknown';
        if (!sessions[s]) sessions[s] = { wins: 0, losses: 0, totalProfit: 0 };
        sessions[s].totalProfit += (t.profit || 0);
        if (t.status === 'WIN') sessions[s].wins++;
        else sessions[s].losses++;
    });
    Object.entries(sessions).forEach(([s, d]) => {
        const total = d.wins + d.losses;
        const wr = total > 0 ? ((d.wins/total)*100).toFixed(0) : 0;
        console.log(`${s.padEnd(15)} ${d.wins}W/${d.losses}L (${wr}%) | $${d.totalProfit.toFixed(2)}`);
    });
    
    console.log('\n═══════════════════════════════════');
    console.log('💰 STAKE ANALYSIS');
    console.log('═══════════════════════════════════');
    const stakes = {};
    trades.forEach(t => {
        const s = '$' + (t.stake || 0).toFixed(0);
        if (!stakes[s]) stakes[s] = { wins: 0, losses: 0, totalProfit: 0 };
        stakes[s].totalProfit += (t.profit || 0);
        if (t.status === 'WIN') stakes[s].wins++;
        else stakes[s].losses++;
    });
    Object.entries(stakes).forEach(([s, d]) => {
        const total = d.wins + d.losses;
        const wr = total > 0 ? ((d.wins/total)*100).toFixed(0) : 0;
        console.log(`${s.padEnd(10)} ${d.wins}W/${d.losses}L (${wr}%) | $${d.totalProfit.toFixed(2)}`);
    });
    
    console.log('\n═══════════════════════════════════');
    console.log('🕐 LAST 5 TRADES');
    console.log('═══════════════════════════════════');
    trades.slice(0, 5).forEach(t => {
        const emoji = t.status === 'WIN' ? '✅' : '❌';
        console.log(`${emoji} ${new Date(t.executed_at).toLocaleString()} | ${t.action} ${t.symbol} | ${t.pattern} | $${(t.profit||0).toFixed(2)}`);
    });
    
    console.log('\n✅ Done.');
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
