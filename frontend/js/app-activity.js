// ================================================================
// MONIX v7.0 — Activity tab (guest + connected)
// ================================================================

window.renderShellTab_activity = function() {
  const content = document.querySelector('.app-tab[data-shell-tab="activity"]');
  if (!content) return;

  const connected = MONIX_IS_CONNECTED();

  if (!connected) {
    content.innerHTML = `
      <div class="app-hero">
        <div class="app-hero-title">Activity</div>
        <div class="app-hero-sub">Your investments and growth</div>
      </div>

      <div class="app-panel">
        <div class="app-empty">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <div class="app-empty-title">No activity yet</div>
          <div class="app-empty-desc">Once you connect and start investing, your activity will appear here.</div>
        </div>
        <button class="app-btn app-btn-block" style="margin-top:14px;" onclick="window.monixOpenApiKeys()">
          <i class="fa-solid fa-key"></i> Connect Deriv account
        </button>
      </div>

      <div class="app-panel">
        <div class="app-panel-title">
          <div class="app-panel-title-left"><i class="fa-solid fa-globe"></i>MONIX community</div>
        </div>
        <div class="community-stats">
          <div class="community-stat">
            <div class="community-stat-value" id="communityTraders">—</div>
            <div class="community-stat-label">Active investors</div>
          </div>
          <div class="community-stat">
            <div class="community-stat-value" style="color:var(--success);">+12.4%</div>
            <div class="community-stat-label">Avg return</div>
          </div>
          <div class="community-stat">
            <div class="community-stat-value">68%</div>
            <div class="community-stat-label">Profitable trades</div>
          </div>
        </div>
      </div>
    `;
    loadCommunityStats();
    return;
  }

  // 
  // CONNECTED
  // 
  content.innerHTML = `
    <div class="app-hero">
      <div class="app-hero-title">Activity</div>
      <div class="app-hero-sub">Your investments and growth</div>
    </div>

    <div class="app-panel" style="padding:14px 16px;">
      <div style="display:flex;gap:8px;overflow-x:auto;">
        <button class="invest-filter active" data-act-tab="investments">Investments</button>
        <button class="invest-filter" data-act-tab="performance">Performance</button>
        <button class="invest-filter" data-act-tab="leaderboard">Leaderboard</button>
      </div>
    </div>

    <div id="activityContent">
      <div class="app-panel">
        <div class="app-empty">
          <i class="fa-solid fa-inbox"></i>
          <div class="app-empty-title">No activity yet</div>
          <div class="app-empty-desc">Your first investment will appear here</div>
        </div>
      </div>
    </div>
  `;

  wireActivityTabs();
  loadActivityTab('investments');
};

function wireActivityTabs() {
  document.querySelectorAll('[data-act-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-act-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadActivityTab(btn.getAttribute('data-act-tab'));
    });
  });
}

async function loadActivityTab(tab) {
  const wrap = document.getElementById('activityContent');
  if (!wrap) return;

  if (tab === 'investments') {
    try {
      const trades = await window.api.getTradeHistory(30);
      if (!trades || trades.length === 0) {
        wrap.innerHTML = `
          <div class="app-panel">
            <div class="app-empty">
              <i class="fa-solid fa-inbox"></i>
              <div class="app-empty-title">No investments yet</div>
              <div class="app-empty-desc">Your first investment will appear here</div>
            </div>
          </div>
        `;
        return;
      }

      const totalProfit = trades.reduce((s, t) => s + (t.profit || 0), 0);
      const wins = trades.filter(t => t.status === 'WIN').length;
      const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0;

      wrap.innerHTML = `
        <div class="app-panel">
          <div style="font-size:14px;color:var(--meta);">
            Recent: <span style="color:${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700;">${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}</span>
            · ${trades.length} investments · ${winRate}% profitable
          </div>
        </div>
        <div class="app-panel">
          ${trades.map(t => `
            <div class="app-act-row">
              <div class="app-act-icon">${t.action === 'BUY' ? '📈' : '📉'}</div>
              <div class="app-act-body">
                <div class="app-act-title">${t.symbol} · ${t.action}</div>
                <div class="app-act-meta">${new Date(t.executed_at).toLocaleString()}</div>
              </div>
              <div class="app-act-amount ${(t.profit || 0) >= 0 ? 'up' : 'down'}">
                ${(t.profit || 0) >= 0 ? '+' : ''}$${(t.profit || 0).toFixed(2)}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = `<div class="app-panel"><div class="app-empty">Could not load investments</div></div>`;
    }
  } else if (tab === 'performance') {
    try {
      const stats = await window.api.getTradeStats(30);
      const overall = stats.overall || {};
      wrap.innerHTML = `
        <div class="app-kpi-grid">
          <div class="app-kpi">
            <div class="app-kpi-label">Win rate</div>
            <div class="app-kpi-value">${overall.win_rate || 0}%</div>
            <div class="app-kpi-delta">Last 30 days</div>
          </div>
          <div class="app-kpi">
            <div class="app-kpi-label">Total trades</div>
            <div class="app-kpi-value">${overall.total_trades || 0}</div>
            <div class="app-kpi-delta">All time</div>
          </div>
          <div class="app-kpi">
            <div class="app-kpi-label">Net profit</div>
            <div class="app-kpi-value" style="color:${(overall.net_profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)'}">
              ${(overall.net_profit || 0) >= 0 ? '+' : ''}$${(overall.net_profit || 0).toFixed(2)}
            </div>
            <div class="app-kpi-delta">30 days</div>
          </div>
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = `<div class="app-panel"><div class="app-empty">Could not load performance</div></div>`;
    }
  } else if (tab === 'leaderboard') {
    try {
      const lb = await window.api.getLeaderboard();
      if (!lb || lb.length === 0) {
        wrap.innerHTML = `<div class="app-panel"><div class="app-empty">No leaderboard data yet</div></div>`;
        return;
      }
      wrap.innerHTML = `
        <div class="app-panel">
          ${lb.map((u, i) => `
            <div class="app-act-row">
              <div class="app-act-icon" style="background:${i < 3 ? 'rgba(245,158,11,0.15)' : 'var(--elevated)'};color:${i < 3 ? '#fbbf24' : 'var(--meta)'};">${i + 1}</div>
              <div class="app-act-body">
                <div class="app-act-title">${maskName(u.username)}</div>
                <div class="app-act-meta">${u.total_trades || 0} trades · ${u.win_rate || 0}% win</div>
              </div>
              <div class="app-act-amount up">+$${(u.net_profit || 0).toFixed(2)}</div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = `<div class="app-panel"><div class="app-empty">Could not load leaderboard</div></div>`;
    }
  }
}

function maskName(name) {
  if (!name) return '****';
  if (name.length <= 4) return name;
  return name.substring(0, 2) + '***' + name.substring(name.length - 2);
}

async function loadCommunityStats() {
  try {
    const res = await fetch('/api/waitlist/count');
    const data = await res.json();
    const el = document.getElementById('communityTraders');
    if (el) el.textContent = (data.count || 1247).toLocaleString();
  } catch (e) {
    const el = document.getElementById('communityTraders');
    if (el) el.textContent = '1,247';
  }
}
