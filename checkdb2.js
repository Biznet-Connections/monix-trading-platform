const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://omnixra_user:omnixra2005@omnixra-cluster.9mbcmgr.mongodb.net/omnixra?retryWrites=true&w=majority')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    const Trade = mongoose.model('Trade', new mongoose.Schema({}, { strict: false, collection: 'trades' }));
    const trades = await Trade.find().sort({ executed_at: -1 }).lean();
    
    console.log('═══════════════════════════════════');
    console.log('📊 RSI RANGE PERFORMANCE');
    console.log('═══════════════════════════════════');
    const rsiRanges = {
        'RSI 0-25 (Deeply Oversold)': { min: 0, max: 25, wins: 0, losses: 0, profit: 0 },
        'RSI 25-35 (Oversold)': { min: 25, max: 35, wins: 0, losses: 0, profit: 0 },
        'RSI 35-45 (Approaching Oversold)': { min: 35, max: 45, wins: 0, losses: 0, profit: 0 },
        'RSI 45-55 (Neutral)': { min: 45, max: 55, wins: 0, losses: 0, profit: 0 },
        'RSI 55-65 (Approaching Overbought)': { min: 55, max: 65, wins: 0, losses: 0, profit: 0 },
        'RSI 65-75 (Overbought)': { min: 65, max: 75, wins: 0, losses: 0, profit: 0 },
        'RSI 75-100 (Deeply Overbought)': { min: 75, max: 100, wins: 0, losses: 0, profit: 0 }
    };
    trades.forEach(t => {
        const rsi = t.rsi || 50;
        Object.values(rsiRanges).forEach(range => {
            if (rsi >= range.min && rsi < range.max) {
                if (t.status === 'WIN') range.wins++;
                else range.losses++;
                range.profit += (t.profit || 0);
            }
        });
    });
    Object.entries(rsiRanges).forEach(([label, d]) => {
        const total = d.wins + d.losses;
        if (total > 0) {
            const wr = ((d.wins/total)*100).toFixed(0);
            const emoji = wr >= 65 ? '🟢' : wr >= 50 ? '🟡' : '🔴';
            console.log(`${emoji} ${label.padEnd(35)} ${d.wins}W/${d.losses}L (${wr}%) | $${d.profit.toFixed(2)}`);
        }
    });
    
    console.log('\n═══════════════════════════════════');
    console.log('📈 ACTION PERFORMANCE (BUY vs SELL)');
    console.log('═══════════════════════════════════');
    ['BUY', 'SELL'].forEach(action => {
        const a = trades.filter(t => t.action === action);
        const w = a.filter(t => t.status === 'WIN').length;
        const l = a.filter(t => t.status === 'LOSS').length;
        const p = a.reduce((s, t) => s + (t.profit || 0), 0);
        const wr = (w+l) > 0 ? ((w/(w+l))*100).toFixed(0) : 0;
        console.log(`${action.padEnd(10)} ${w}W/${l}L (${wr}%) | $${p.toFixed(2)} | ${a.length} trades`);
    });
    
    console.log('\n═══════════════════════════════════');
    console.log('🕐 HOURLY PERFORMANCE');
    console.log('═══════════════════════════════════');
    const hours = {};
    trades.forEach(t => {
        const h = new Date(t.executed_at).getUTCHours();
        const key = `${h.toString().padStart(2,'0')}:00 UTC`;
        if (!hours[key]) hours[key] = { wins: 0, losses: 0, profit: 0 };
        if (t.status === 'WIN') hours[key].wins++;
        else hours[key].losses++;
        hours[key].profit += (t.profit || 0);
    });
    Object.entries(hours).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).forEach(([h, d]) => {
        const total = d.wins + d.losses;
        const wr = total > 0 ? ((d.wins/total)*100).toFixed(0) : 0;
        const barLen = Math.max(0, Math.min(10, Math.floor(total/2)));
        const bar = '█'.repeat(barLen) + '░'.repeat(Math.max(0, 10 - barLen));
        const emoji = wr >= 65 ? '🟢' : wr >= 50 ? '🟡' : '🔴';
        console.log(`${emoji} ${h.padEnd(12)} ${bar} ${d.wins}W/${d.losses}L (${wr}%) | $${d.profit.toFixed(2)}`);
    });
    
    console.log('\n═══════════════════════════════════');
    console.log('📉 WIN/LOSS STREAK ANALYSIS');
    console.log('═══════════════════════════════════');
    let currentStreak = 0, streakType = null, streaks = [];
    trades.slice().reverse().forEach(t => {
        const result = t.status === 'WIN' ? 'W' : 'L';
        if (result !== streakType) {
            if (streakType) streaks.push({ type: streakType, count: currentStreak });
            streakType = result; currentStreak = 1;
        } else { currentStreak++; }
    });
    if (streakType) streaks.push({ type: streakType, count: currentStreak });
    const winStreaks = streaks.filter(s => s.type === 'W').sort((a,b) => b.count - a.count);
    const lossStreaks = streaks.filter(s => s.type === 'L').sort((a,b) => b.count - a.count);
    console.log('Longest Win Streak:', winStreaks[0]?.count || 0, 'wins');
    console.log('Longest Loss Streak:', lossStreaks[0]?.count || 0, 'losses');
    console.log('Current Streak:', streakType === 'W' ? `${currentStreak} wins` : `${currentStreak} losses`);
    
    console.log('\n═══════════════════════════════════');
    console.log('📅 PROFIT BY DAY');
    console.log('═══════════════════════════════════');
    const days = {};
    trades.forEach(t => {
        const d = new Date(t.executed_at).toISOString().split('T')[0];
        if (!days[d]) days[d] = { wins: 0, losses: 0, profit: 0 };
        if (t.status === 'WIN') days[d].wins++; else days[d].losses++;
        days[d].profit += (t.profit || 0);
    });
    Object.entries(days).sort((a,b) => a[0].localeCompare(b[0])).forEach(([day, d]) => {
        const total = d.wins + d.losses;
        const wr = total > 0 ? ((d.wins/total)*100).toFixed(0) : 0;
        const emoji = d.profit >= 0 ? '🟢' : '🔴';
        console.log(`${emoji} ${day} ${d.wins}W/${d.losses}L (${wr}%) | $${d.profit.toFixed(2)}`);
    });
    
    console.log('\n═══════════════════════════════════');
    console.log('🎯 CONFIDENCE VS RESULT');
    console.log('═══════════════════════════════════');
    const confRanges = {
        '50-60%': { min: 50, max: 60, wins: 0, losses: 0 },
        '60-70%': { min: 60, max: 70, wins: 0, losses: 0 },
        '70-80%': { min: 70, max: 80, wins: 0, losses: 0 },
        '80-90%': { min: 80, max: 90, wins: 0, losses: 0 }
    };
    trades.forEach(t => {
        const c = t.confidence || 50;
        Object.values(confRanges).forEach(range => {
            if (c >= range.min && c < range.max) {
                if (t.status === 'WIN') range.wins++; else range.losses++;
            }
        });
    });
    Object.entries(confRanges).forEach(([label, d]) => {
        const total = d.wins + d.losses;
        if (total > 0) {
            const wr = ((d.wins/total)*100).toFixed(0);
            console.log(`${label.padEnd(12)} ${d.wins}W/${d.losses}L (${wr}% WR) | ${total} trades`);
        }
    });
    
    console.log('\n═══════════════════════════════════');
    console.log('💰 WIN/LOSS DOLLARS BY STAKE');
    console.log('═══════════════════════════════════');
    const stakeDetails = {};
    trades.forEach(t => {
        const s = '$' + (t.stake || 0).toFixed(0);
        if (!stakeDetails[s]) stakeDetails[s] = { totalWon: 0, totalLost: 0, wins: 0, losses: 0 };
        if (t.status === 'WIN') { stakeDetails[s].totalWon += (t.profit || 0); stakeDetails[s].wins++; }
        else { stakeDetails[s].totalLost += (t.profit || 0); stakeDetails[s].losses++; }
    });
    Object.entries(stakeDetails).forEach(([s, d]) => {
        console.log(`${s.padEnd(10)} Won: +$${d.totalWon.toFixed(2)} | Lost: -$${Math.abs(d.totalLost).toFixed(2)} | Net: $${(d.totalWon + d.totalLost).toFixed(2)}`);
    });
    
    console.log('\n✅ Done.');
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
