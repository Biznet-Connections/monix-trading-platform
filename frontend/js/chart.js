let chart = null;
let chartData = [];
let liveInterval = null;
let currentPrice = 0;

function generateCandleData(count = 100, startPrice = 32500) {
    let data = [];
    let price = startPrice;
    const now = new Date();
    
    for (let i = count; i > 0; i--) {
        const date = new Date(now);
        date.setMinutes(now.getMinutes() - i);
        
        const open = price;
        const change = (Math.random() - 0.5) * 30;
        const close = open + change;
        const high = Math.max(open, close) + Math.random() * 15;
        const low = Math.min(open, close) - Math.random() * 15;
        price = close;
        
        data.push({
            x: date.getTime(),
            y: [parseFloat(open.toFixed(2)), parseFloat(high.toFixed(2)), parseFloat(low.toFixed(2)), parseFloat(close.toFixed(2))]
        });
    }
    currentPrice = price;
    return data;
}

function initChart(isDark = true) {
    const chartElement = document.querySelector("#candlestick-chart");
    if (!chartElement) return;
    
    chartData = generateCandleData(100);
    currentPrice = chartData[chartData.length - 1].y[3];
    
    const options = {
        series: [{ name: 'candlestick', data: chartData }],
        chart: {
            type: 'candlestick',
            height: 400,
            background: 'transparent',
            toolbar: { show: false, tools: { download: false, zoom: false, zoomin: false, zoomout: false, pan: false, reset: false } },
            animations: { enabled: true, dynamicAnimation: { enabled: true, speed: 500 } },
            zoom: { enabled: false }
        },
        plotOptions: {
            candlestick: {
                colors: { upward: '#22c55e', downward: '#ef4444' },
                wick: { useFillColor: true }
            }
        },
        xaxis: {
            type: 'datetime',
            labels: { style: { colors: isDark ? '#94a3b8' : '#475569', fontSize: '10px' }, datetimeFormatter: { hour: 'HH:mm' } },
            axisBorder: { show: false },
            axisTicks: { show: false },
            crosshairs: { show: true, width: 1, stroke: { color: isDark ? '#475569' : '#cbd5e1', width: 1 } }
        },
        yaxis: {
            labels: { style: { colors: isDark ? '#94a3b8' : '#475569', fontSize: '10px' }, formatter: (value) => `$${value.toFixed(2)}` },
            opposite: true,
            tooltip: { enabled: true },
            crosshairs: { show: true, stroke: { color: isDark ? '#475569' : '#cbd5e1', width: 1 } }
        },
        grid: {
            show: true,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            strokeDashArray: 0,
            position: 'back',
            xaxis: { lines: { show: true } },
            yaxis: { lines: { show: true } }
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            enabled: true,
            x: { format: 'HH:mm:ss' },
            y: { formatter: (value) => `$${value.toFixed(2)}` }
        },
        responsive: [{
            breakpoint: 768,
            options: { chart: { height: 300 } }
        }]
    };
    
    if (chart) {
        chart.destroy();
    }
    
    chart = new ApexCharts(chartElement, options);
    chart.render();
    
    // Update live price display
    const livePriceEl = document.getElementById('livePrice');
    if (livePriceEl) livePriceEl.innerHTML = `$${currentPrice.toFixed(2)}`;
    
    // Start live updates if not already running
    if (liveInterval) clearInterval(liveInterval);
    liveInterval = setInterval(() => {
        if (!chartData.length) return;
        
        const lastCandle = chartData[chartData.length - 1];
        const now = Date.now();
        const change = (Math.random() - 0.5) * 8;
        const newClose = lastCandle.y[3] + change;
        
        if (now - lastCandle.x > 60000) {
            // Create new candle
            const newCandle = {
                x: now - (now % 60000),
                y: [lastCandle.y[3], lastCandle.y[3], lastCandle.y[3], newClose]
            };
            newCandle.y[1] = Math.max(newCandle.y[1], newClose) + Math.random() * 5;
            newCandle.y[2] = Math.min(newCandle.y[2], newClose) - Math.random() * 5;
            chartData.push(newCandle);
            if (chartData.length > 200) chartData.shift();
            currentPrice = newCandle.y[3];
        } else {
            // Update current candle
            const updatedCandle = { ...lastCandle };
            updatedCandle.y[3] = newClose;
            updatedCandle.y[1] = Math.max(updatedCandle.y[1], newClose);
            updatedCandle.y[2] = Math.min(updatedCandle.y[2], newClose);
            chartData[chartData.length - 1] = updatedCandle;
            currentPrice = newClose;
        }
        
        chart.updateSeries([{ data: chartData }]);
        
        const livePriceEl = document.getElementById('livePrice');
        if (livePriceEl) livePriceEl.innerHTML = `$${currentPrice.toFixed(2)}`;
        
    }, 2000);
    
    return chart;
}

function updateChartTheme(isDark) {
    if (chart) {
        chart.updateOptions({
            grid: { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' },
            xaxis: { labels: { style: { colors: isDark ? '#94a3b8' : '#475569' } }, crosshairs: { stroke: { color: isDark ? '#475569' : '#cbd5e1' } } },
            yaxis: { labels: { style: { colors: isDark ? '#94a3b8' : '#475569' } }, crosshairs: { stroke: { color: isDark ? '#475569' : '#cbd5e1' } } },
            tooltip: { theme: isDark ? 'dark' : 'light' }
        });
    }
}

function changeTimeframe(tf) {
    let granularity = 60;
    let count = 100;
    
    switch(tf) {
        case '1m':
            granularity = 60;
            count = 100;
            break;
        case '5m':
            granularity = 300;
            count = 100;
            break;
        case '15m':
            granularity = 900;
            count = 100;
            break;
        case '1h':
            granularity = 3600;
            count = 100;
            break;
        case '4h':
            granularity = 14400;
            count = 100;
            break;
        case '1d':
            granularity = 86400;
            count = 50;
            break;
        default:
            granularity = 60;
            count = 100;
    }
    
    // Generate new mock data with different granularity
    chartData = generateCandleData(count, currentPrice);
    chart.updateSeries([{ data: chartData }]);
    
    showToast(`Timeframe changed to ${tf}`, 'info');
    
    // If connected to Deriv, fetch real candles
    if (window.wsConnected && window.wsConnected()) {
        fetchRealCandles(granularity, count);
    }
}

async function fetchRealCandles(granularity, count) {
    try {
        const symbol = document.getElementById('symbolSelect')?.value || 'R_75';
        const token = localStorage.getItem('monix_token');
        const response = await fetch(`/api/market/candles?symbol=${symbol}&granularity=${granularity}&count=${count}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && data.candles && data.candles.length > 0) {
            chartData = data.candles;
            chart.updateSeries([{ data: chartData }]);
        }
    } catch (error) {
        console.error('Failed to fetch real candles:', error);
    }
}

function updateConfidenceBars(confidence) {
    const container = document.getElementById('confidenceBars');
    if (!container) return;
    container.innerHTML = '';
    const filledCount = Math.floor(confidence / 10);
    for (let i = 0; i < 10; i++) {
        const filled = i < filledCount;
        container.innerHTML += `<div class="h-2 rounded-sm ${filled ? 'bg-emerald-500' : 'bg-slate-700'}"></div>`;
    }
}

function updateChartPrice(price) {
    currentPrice = price;
    const livePriceEl = document.getElementById('livePrice');
    if (livePriceEl) livePriceEl.innerHTML = `$${price.toFixed(2)}`;
}

// Initialize timeframe buttons after DOM load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tf = btn.dataset.tf;
            if (typeof changeTimeframe === 'function') {
                changeTimeframe(tf);
            }
            
            // Update active button style
            document.querySelectorAll('.tf-btn').forEach(b => {
                b.classList.remove('bg-indigo-600', 'text-white');
                b.classList.add('hover:bg-slate-700');
            });
            btn.classList.add('bg-indigo-600', 'text-white');
            btn.classList.remove('hover:bg-slate-700');
        });
    });
});

// Expose functions globally
window.initChart = initChart;
window.updateChartTheme = updateChartTheme;
window.changeTimeframe = changeTimeframe;
window.updateConfidenceBars = updateConfidenceBars;
window.updateChartPrice = updateChartPrice;
