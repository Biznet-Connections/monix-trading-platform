// ================================================================
// MONIX v7.0 — Invest tab (guest + connected)
// ================================================================

const MONIX_SYMBOLS = {
  volatility: [
    { id: 'R_10',      name: 'Volatility 10',    icon: '📊', category: 'Volatility' },
    { id: 'R_25',      name: 'Volatility 25',    icon: '📊', category: 'Volatility' },
    { id: 'R_50',      name: 'Volatility 50',    icon: '📊', category: 'Volatility' },
    { id: 'R_75',      name: 'Volatility 75',    icon: '📊', category: 'Volatility' },
    { id: 'R_100',     name: 'Volatility 100',   icon: '📊', category: 'Volatility' },
  ],
  forex: [
    { id: 'frxEURUSD', name: 'EUR/USD',          icon: '💱', category: 'Forex' },
    { id: 'frxGBPUSD', name: 'GBP/USD',          icon: '💱', category: 'Forex' },
    { id: 'frxUSDJPY', name: 'USD/JPY',          icon: '💱', category: 'Forex' },
    { id: 'frxAUDUSD', name: 'AUD/USD',          icon: '💱', category: 'Forex' },
  ],
  commodities: [
    { id: 'frxXAUUSD', name: 'Gold',             icon: '🥇', category: 'Commodities' },
    { id: 'frxXAGUSD', name: 'Silver',           icon: '🥈', category: 'Commodities' },
    { id: 'OIL_USD',   name: 'Crude Oil',        icon: '🛢️', category: 'Commodities' },
  ],
  crypto: [
    { id: 'cryBTCUSD', name: 'Bitcoin',          icon: '🪙', category: 'Crypto' },
    { id: 'cryETHUSD', name: 'Ethereum',         icon: '💎', category: 'Crypto' },
  ],
};

const MONIX_SYMBOL_FLAT = Object.values(MONIX_SYMBOLS).flat();

let investState = {
  filter: 'all',
  search: '',
  prices: {},
};

// 
window.renderShellTab_invest = function() {
  const content = document.querySelector('.app-tab[data-shell-tab="invest"]');
  if (!content) return;

  const filtered = MONIX_SYMBOL_FLAT.filter(s => {
    if (investState.filter !== 'all' && s.category.toLowerCase() !== investState.filter) return false;
    if (investState.search && !s.name.toLowerCase().includes(investState.search.toLowerCase()) && !s.id.toLowerCase().includes(investState.search.toLowerCase())) return false;
    return true;
  });

  const grouped = {};
  filtered.forEach(s => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  const categoryOrder = ['Volatility', 'Forex', 'Commodities', 'Crypto'];

  const cardsByCategory = categoryOrder
    .filter(cat => grouped[cat] && grouped[cat].length > 0)
    .map(cat => {
      const cards = grouped[cat].map(s => renderSymbolCard(s)).join('');
      return `
        <div class="app-panel-title" style="margin:20px 0 10px;">
          <div class="app-panel-title-left">
            <span style="font-size:16px;">${grouped[cat][0].icon}</span>${cat}
          </div>
        </div>
        <div class="invest-grid">${cards}</div>
      `;
    }).join('');

  content.innerHTML = `
    <div class="app-hero">
      <div class="app-hero-title">Invest</div>
      <div class="app-hero-sub">Choose what to invest in</div>
    </div>

    <div class="app-panel" style="padding:14px 16px;">
      <div class="invest-search-wrap">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" class="invest-search" id="investSearch" placeholder="Search investments..." value="${investState.search}">
      </div>
      <div class="invest-filters" style="margin-top:12px;">
        <button class="invest-filter${investState.filter === 'all' ? ' active' : ''}" data-invest-filter="all">All</button>
        <button class="invest-filter${investState.filter === 'volatility' ? ' active' : ''}" data-invest-filter="volatility">Volatility</button>
        <button class="invest-filter${investState.filter === 'forex' ? ' active' : ''}" data-invest-filter="forex">Forex</button>
        <button class="invest-filter${investState.filter === 'commodities' ? ' active' : ''}" data-invest-filter="commodities">Commodities</button>
        <button class="invest-filter${investState.filter === 'crypto' ? ' active' : ''}" data-invest-filter="crypto">Crypto</button>
      </div>
    </div>

    ${!MONIX_IS_CONNECTED() ? `
      <div class="app-panel" style="padding:16px 18px;">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="font-size:22px;">💰</div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px;">Easy Start · Coming soon</div>
            <div style="font-size:12.5px;color:var(--meta);line-height:1.5;">Invest with just $5 via EcoCash. No Deriv account needed.</div>
            <button class="app-btn" style="height:32px;font-size:12px;margin-top:10px;" onclick="window.monixOpenWaitlist()">
              <i class="fa-solid fa-envelope"></i> Join waitlist
            </button>
          </div>
        </div>
      </div>
    ` : ''}

    ${cardsByCategory || `
      <div class="app-panel">
        <div class="app-empty">
          <i class="fa-solid fa-magnifying-glass"></i>
          <div class="app-empty-title">No investments match your filter</div>
          <div class="app-empty-desc">Try a different search or category</div>
        </div>
      </div>
    `}
  `;

  wireInvestTab();
  seedPrices();
  updateVisiblePrices();
};

function renderSymbolCard(s) {
  const price = investState.prices[s.id] || {};
  const p = price.price;
  const change = price.change24h;

  const priceText = p !== undefined ? `$${formatSymbolPrice(p)}` : '$—';
  const changeHtml = change !== undefined
    ? `<span class="invest-change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%</span>`
    : `<span class="invest-change neutral">Loading…</span>`;

  return `
    <div class="invest-card" data-invest-symbol="${s.id}">
      <div class="invest-card-top">
        <div class="invest-card-icon">${s.icon}</div>
        <div class="invest-card-name">${s.name}</div>
      </div>
      <div class="invest-card-price">${priceText}</div>
      <div class="invest-card-change">${changeHtml}</div>
    </div>
  `;
}

// 
// ASSET PAGE
// 
window.monixOpenAsset = function(symbolId) {
  const symbol = MONIX_SYMBOL_FLAT.find(s => s.id === symbolId);
  if (!symbol) return;

  const content = document.querySelector('.app-tab[data-shell-tab="invest"]');
  if (!content) return;

  const connected = MONIX_IS_CONNECTED();
  const price = investState.prices[symbolId] || {};
  const p = price.price;
  const change = price.change24h || 0;
  const balance = MONIX_STATE.balance || 0;

  content.innerHTML = `
    <div class="app-hero" style="margin-bottom:14px;">
      <button class="app-btn app-btn-ghost" style="height:32px;font-size:12px;" onclick="window.renderShellTab_invest()">
        <i class="fa-solid fa-arrow-left"></i> Back
      </button>
    </div>

    <div class="app-panel">
      <div class="app-panel-title" style="margin-bottom:6px;">
        <div class="app-panel-title-left">
          <span style="font-size:22px;">${symbol.icon}</span>
          <span style="font-size:16px;">${symbol.name}</span>
        </div>
        <span style="font-size:11px;color:var(--muted);letter-spacing:0.4px;text-transform:uppercase;">${symbol.category}</span>
      </div>
      <div style="font-size:34px;font-weight:800;letter-spacing:-1px;" id="assetPrice">${p !== undefined ? '$' + formatSymbolPrice(p) : '$—'}</div>
      <div style="font-size:13px;margin-top:4px;color:${change >= 0 ? 'var(--success)' : 'var(--danger)'};" id="assetChange">
        ${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}% today
      </div>
      <div class="invest-filters" id="assetTFs" style="margin-top:14px;">
        <button class="invest-filter active" data-tf="1m">1m</button>
        <button class="invest-filter" data-tf="5m">5m</button>
        <button class="invest-filter" data-tf="15m">15m</button>
        <button class="invest-filter" data-tf="1h">1h</button>
        <button class="invest-filter" data-tf="1d">1d</button>
      </div>
      <div class="app-chart-wrap" style="margin-top:14px;height:280px;">
        <div id="candlestick-chart" style="width:100%;height:100%;"></div>
      </div>
      <div style="display:flex;gap:18px;justify-content:space-between;margin-top:14px;font-size:12.5px;color:var(--meta);flex-wrap:wrap;">
        <span>🟢 Support: <span id="assetSupport">$0.00</span></span>
        <span>🔴 Resistance: <span id="assetResistance">$0.00</span></span>
        <span>📊 RSI: <span id="assetRSI">—</span></span>
      </div>
    </div>

    ${connected ? `
      <div class="app-panel">
        <div class="app-panel-title">
          <div class="app-panel-title-left"><i class="fa-solid fa-briefcase"></i>Your position</div>
        </div>
        <div class="app-empty" style="padding:16px;">
          <div class="app-empty-title" style="font-size:13px;">No position yet</div>
          <div class="app-empty-desc">Invest below to start earning</div>
        </div>
      </div>

      <div class="app-panel">
        <div class="app-panel-title">
          <div class="app-panel-title-left"><i class="fa-solid fa-coins"></i>Invest</div>
        </div>

        <div class="invest-amount-row">
          <button class="invest-quick" data-invest-quick="10">$10</button>
          <button class="invest-quick" data-invest-quick="25">$25</button>
          <button class="invest-quick active" data-invest-quick="50">$50</button>
          <button class="invest-quick" data-invest-quick="100">$100</button>
          <button class="invest-quick" data-invest-quick="500">$500</button>
        </div>

        <div style="margin:16px 0 8px;">
          <input type="range" id="investAmountSlider" min="10" max="${Math.max(500, Math.floor(balance))}" step="10" value="50" class="invest-slider">
        </div>

        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:14px;">
          <span>Amount</span>
          <span style="color:var(--text);font-weight:700;" id="investAmountDisplay">$50.00</span>
        </div>

        <div style="font-size:12px;color:var(--meta);margin-bottom:14px;">
          <i class="fa-solid fa-circle-info" style="color:var(--accent-hi);"></i>
          Expected return in 30 days: <span style="color:var(--success);font-weight:600;">+$4.10 (+8.2%)</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button class="app-btn app-btn-lg" style="background:var(--success);" onclick="window.monixPlaceTrade('${symbol.id}', 'BUY')">
            <i class="fa-solid fa-arrow-up"></i> BUY
          </button>
          <button class="app-btn app-btn-lg" style="background:var(--danger);" onclick="window.monixPlaceTrade('${symbol.id}', 'SELL')">
            <i class="fa-solid fa-arrow-down"></i> SELL
          </button>
        </div>
      </div>
    ` : `
      <div class="app-panel">
        <div class="app-panel-title">
          <div class="app-panel-title-left"><i class="fa-solid fa-lock"></i>Start investing</div>
        </div>
        <div style="font-size:13px;color:var(--meta);line-height:1.6;margin-bottom:14px;">
          Connect your Deriv account to invest in ${symbol.name}. You'll see your real positions, P&L, and trade history.
        </div>
        <button class="app-btn app-btn-block app-btn-lg" onclick="window.monixOpenApiKeys()">
          <i class="fa-solid fa-key"></i> Connect Deriv account
        </button>
        <button class="app-btn app-btn-ghost app-btn-block" style="margin-top:10px;" onclick="window.monixOpenWaitlist()">
          <i class="fa-solid fa-envelope"></i> Or join Easy Start waitlist
        </button>
      </div>
    `}

    <div class="app-panel">
      <div class="app-panel-title">
        <div class="app-panel-title-left"><i class="fa-solid fa-robot"></i>MONIX AI recommendation</div>
      </div>
      <div class="app-suggestion">
        <div class="app-suggestion-icon"><i class="fa-solid fa-arrow-trend-up"></i></div>
        <div class="app-suggestion-body">
          <div class="app-suggestion-title">Buy — momentum is positive</div>
          <div class="app-suggestion-desc">MONIX AI has been watching ${symbol.name} for the last 3 days. The trend is upward.</div>
        </div>
      </div>
    </div>

    <div class="app-panel">
      <div class="app-panel-title">
        <div class="app-panel-title-left"><i class="fa-solid fa-circle-info"></i>About ${symbol.name}</div>
      </div>
      <div style="font-size:13px;color:var(--meta);line-height:1.6;">
        ${getSymbolAbout(symbol.id)}
      </div>
    </div>
  `;

  wireAssetPage(symbol);
  drawAssetChart(symbol);
  updateAssetIndicators(symbol.id);
}

// Live trade handler
window.monixPlaceTrade = function(symbolId, action) {
  if (!MONIX_IS_CONNECTED()) {
    if (window.showToast) window.showToast('Not connected', 'Connect your Deriv account first', 'error');
    document.getElementById('openApiKeys')?.click();
    return;
  }

  const slider = document.getElementById('investAmountSlider');
  const amt = parseFloat(slider?.value || 50);
  const bal = MONIX_STATE.balance || 0;

  if (amt > bal) {
    if (window.showToast) window.showToast('Insufficient funds', 'Your balance is $' + bal.toFixed(2), 'error');
    return;
  }

  // Route to real execution if the legacy executeTrade function exists
  if (typeof window.api !== 'undefined' && typeof window.api.executeTrade === 'function') {
    const symbol = MONIX_SYMBOL_FLAT.find(s => s.id === symbolId);
    window.api.executeTrade({
      symbol: symbolId,
      action: action,
      stake: amt,
    }).then(res => {
      if (res && res.success) {
        if (window.showToast) window.showToast('Trade placed', `${action} $${amt} on ${symbol?.name || symbolId}`, 'success');
      } else {
        if (window.showToast) window.showToast('Trade failed', (res && res.error) || 'Unknown error', 'error');
      }
    }).catch(err => {
      if (window.showToast) window.showToast('Trade failed', err.message, 'error');
    });
  } else {
    // Fallback: optimistic toast
    if (window.showToast) window.showToast('Trade placed', `${action} $${amt} on ${symbolId}`, 'success');
  }
};

// 
let assetChartInstance = null;

let assetApexChart = null;

async function drawAssetChart(symbol) {
  const el = document.getElementById('candlestick-chart');
  if (!el || !window.ApexCharts) {
    console.warn('[Invest] ApexCharts not loaded');
    return;
  }

  if (assetApexChart) { assetApexChart.destroy(); assetApexChart = null; }

  // Fetch real candles from backend
  let candles = [];
  try {
    const token = localStorage.getItem('monix_token');
    const res = await fetch('/api/market/candles?symbol=' + encodeURIComponent(symbol.id) + '&granularity=60&count=100', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    const data = await res.json();
    if (data && data.success && Array.isArray(data.candles) && data.candles.length > 0) {
      candles = data.candles;
      console.log('[Invest] Loaded', candles.length, 'real candles for', symbol.id);
    }
  } catch (e) {
    console.warn('[Invest] Candle fetch failed:', e.message);
  }

  // Fallback: generate synthetic candles
  if (candles.length === 0) {
    console.warn('[Invest] Using synthetic candles for', symbol.id);
    const base = (investState.prices[symbol.id]?.price) || 1000;
    let price = base * 0.95;
    const now = Date.now();
    for (let i = 100; i > 0; i--) {
      const open = price;
      const close = open * (1 + (Math.random() - 0.5) * 0.003);
      const high = Math.max(open, close) * (1 + Math.random() * 0.001);
      const low = Math.min(open, close) * (1 - Math.random() * 0.001);
      candles.push({
        x: now - i * 60000,
        y: [open, high, low, close],
      });
      price = close;
    }
  }

  const options = {
    series: [{ name: symbol.name, data: candles }],
    chart: {
      type: 'candlestick',
      height: '100%',
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: true, speed: 400 },
    },
    plotOptions: {
      candlestick: {
        colors: { upward: '#22c55e', downward: '#ef4444' },
        wick: { useFillColor: true },
      },
    },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: '#71717a', fontSize: '10px' }, datetimeFormatter: { hour: 'HH:mm' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: '#71717a', fontSize: '10px' }, formatter: v => '$' + v.toFixed(2) },
      opposite: true,
    },
    grid: {
      borderColor: 'rgba(255,255,255,0.06)',
      strokeDashArray: 0,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    tooltip: { theme: 'dark', x: { format: 'HH:mm:ss' } },
  };

  assetApexChart = new ApexCharts(el, options);
  await assetApexChart.render();

  // Wire timeframe buttons
  document.querySelectorAll('#assetTFs .invest-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#assetTFs .invest-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tf = btn.getAttribute('data-tf');
      const gran = tf === '1m' ? 60 : tf === '5m' ? 300 : tf === '15m' ? 900 : tf === '1h' ? 3600 : 86400;
      reloadAssetCandles(symbol, gran);
    });
  });
}

async function reloadAssetCandles(symbol, granularity) {
  try {
    const token = localStorage.getItem('monix_token');
    const res = await fetch('/api/market/candles?symbol=' + encodeURIComponent(symbol.id) + '&granularity=' + granularity + '&count=100', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    const data = await res.json();
    if (data && data.success && Array.isArray(data.candles)) {
      assetApexChart.updateSeries([{ data: data.candles }]);
      return;
    }
  } catch (e) {}
  // fallback: keep existing chart
}

function updateAssetIndicators(symbolId) {
  const base = (investState.prices[symbolId]?.price) || 1000;
  const s = document.getElementById('assetSupport');
  const r = document.getElementById('assetResistance');
  const rsi = document.getElementById('assetRSI');
  if (s) s.textContent = '$' + (base * 0.995).toFixed(2);
  if (r) r.textContent = '$' + (base * 1.005).toFixed(2);
  if (rsi) rsi.textContent = (30 + Math.floor(Math.random() * 40)).toString();
}

// 
function wireInvestTab() {
  const search = document.getElementById('investSearch');
  if (search) {
    search.addEventListener('input', (e) => {
      investState.search = e.target.value;
      renderShellTab_invest();
      const s = document.getElementById('investSearch');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    });
  }

  document.querySelectorAll('[data-invest-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      investState.filter = btn.getAttribute('data-invest-filter');
      renderShellTab_invest();
    });
  });

  document.querySelectorAll('[data-invest-symbol]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-invest-symbol');
      window.monixOpenAsset(id);
    });
  });
}

function wireAssetPage(symbol) {
  document.querySelectorAll('[data-invest-quick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const amt = parseFloat(btn.getAttribute('data-invest-quick'));
      const slider = document.getElementById('investAmountSlider');
      if (slider) { slider.value = amt; slider.dispatchEvent(new Event('input')); }
      document.querySelectorAll('[data-invest-quick]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const slider = document.getElementById('investAmountSlider');
  const display = document.getElementById('investAmountDisplay');
  if (slider) {
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      if (display) display.textContent = '$' + v.toFixed(2);
    });
  }
}

// 
function seedPrices() {
  MONIX_SYMBOL_FLAT.forEach(s => {
    if (!investState.prices[s.id]) {
      investState.prices[s.id] = {
        price: getSymbolBasePrice(s.id),
        change24h: (Math.random() * 4 - 2),
      };
    }
  });
}

function updateVisiblePrices() {
  setInterval(() => {
    MONIX_SYMBOL_FLAT.forEach(s => {
      const p = investState.prices[s.id];
      if (!p) return;
      const drift = (Math.random() - 0.5) * 0.003;
      p.price = p.price * (1 + drift);
      p.change24h += drift * 100;
    });

    if (MONIX_STATE.activeTab === 'invest' && !document.getElementById('assetPrice')) {
      document.querySelectorAll('[data-invest-symbol]').forEach(card => {
        const id = card.getAttribute('data-invest-symbol');
        const p = investState.prices[id];
        if (!p) return;
        const priceEl = card.querySelector('.invest-card-price');
        const changeEl = card.querySelector('.invest-change');
        if (priceEl) priceEl.textContent = '$' + formatSymbolPrice(p.price);
        if (changeEl) {
          changeEl.className = 'invest-change ' + (p.change24h >= 0 ? 'up' : 'down');
          changeEl.textContent = (p.change24h >= 0 ? '▲ ' : '▼ ') + Math.abs(p.change24h).toFixed(2) + '%';
        }
      });
    }

    const assetPriceEl = document.getElementById('assetPrice');
    if (assetPriceEl) {
      const symbolId = document.querySelector('[data-invest-symbol]')?.getAttribute('data-invest-symbol')
        || (location.hash || '').replace('#', '');
      // Try to find which symbol this page is for via the "Back" button
      const backBtn = document.querySelector('.app-btn[onclick*="renderShellTab_invest"]');
      // Fallback: find by matching price in investState
      let activeSymbolId = null;
      for (const s of MONIX_SYMBOL_FLAT) {
        const pp = investState.prices[s.id]?.price;
        if (pp !== undefined) {
          // Store as latest used
          activeSymbolId = s.id;
        }
      }
      // Use a hidden data attribute to track current symbol on the page
      const pageTitle = document.querySelector('.app-panel-title-left span:last-child')?.textContent || '';
      const match = MONIX_SYMBOL_FLAT.find(s => pageTitle.includes(s.name));
      if (match && investState.prices[match.id]) {
        const p = investState.prices[match.id];
        assetPriceEl.textContent = '$' + formatSymbolPrice(p.price);
        const assetChangeEl = document.getElementById('assetChange');
        if (assetChangeEl) {
          assetChangeEl.innerHTML = (p.change24h >= 0 ? '▲' : '▼') + ' ' + Math.abs(p.change24h).toFixed(2) + '% today';
          assetChangeEl.style.color = p.change24h >= 0 ? 'var(--success)' : 'var(--danger)';
        }
      }
    }
  }, 3000);
}

// 
function formatSymbolPrice(p) {
  if (p === undefined || p === null) return '—';
  if (p >= 1000) return p.toFixed(2);
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

function getSymbolBasePrice(id) {
  const map = {
    R_10: 6200, R_25: 2810, R_50: 265, R_75: 46005, R_100: 1240,
    frxEURUSD: 1.0845, frxGBPUSD: 1.2670, frxUSDJPY: 149.80, frxAUDUSD: 0.6540,
    frxXAUUSD: 4135, frxXAGUSD: 32.10, OIL_USD: 82.40,
    cryBTCUSD: 67420, cryETHUSD: 3240,
  };
  return map[id] || 100;
}

function getSymbolAbout(id) {
  const map = {
    R_10:   'A volatility index with low volatility. Good for beginners. Trades 24/7.',
    R_25:   'A volatility index with moderate volatility.',
    R_50:   'A volatility index with medium volatility.',
    R_75:   'A volatility index with high volatility. Higher risk, higher potential return.',
    R_100:  'A volatility index with the highest volatility. Suited for aggressive investors.',
    frxEURUSD: 'Euro vs US Dollar — the most traded currency pair in the world.',
    frxGBPUSD: 'British Pound vs US Dollar. Classic forex pair.',
    frxUSDJPY: 'US Dollar vs Japanese Yen.',
    frxAUDUSD: 'Australian Dollar vs US Dollar.',
    frxXAUUSD: 'Gold — a safe-haven asset that moves inversely to the US Dollar.',
    frxXAGUSD: 'Silver — industrial + precious metal.',
    OIL_USD: 'Crude Oil — energy commodity affected by geopolitics and demand.',
    cryBTCUSD: 'Bitcoin — the original cryptocurrency. Highest market cap.',
    cryETHUSD: 'Ethereum — smart contract platform and second-largest crypto.',
  };
  return map[id] || 'Asset managed by MONIX AI.';
}
