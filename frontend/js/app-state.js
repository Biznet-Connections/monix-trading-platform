// ================================================================
// MONIX v7.0 — Global state
// ================================================================

window.MONIX_STATE = window.MONIX_STATE || {
  activeTab: 'home',
  user: null,
  isConnected: false,      // has valid Deriv API key
  balance: 0,
  locked: 0,
  todayProfit: 0,
  winRate: 0,
  totalTrades: 0,
  voucher: { code: '', remaining: 0, limit: 1000000 },
  positions: [],           // open trades
  waitlistCount: 0,
  strategy: 'balanced',
  autoTrade: true,
};

window.MONIX_IS_CONNECTED = function() {
  return !!(MONIX_STATE.user && MONIX_STATE.isConnected);
};

window.monixUpdateUser = function(profile) {
  if (!profile) return;
  MONIX_STATE.user = profile.user || null;

  const hasDerivBalance = profile.derivBalance && profile.derivBalance.authorized;
  const hasDemoToken = profile.user?.demo_token && profile.user.demo_token.length > 0;
  const hasRealToken = profile.user?.real_token && profile.user.real_token.length > 0;

  MONIX_STATE.isConnected = !!(hasDerivBalance || hasDemoToken || hasRealToken);
  MONIX_STATE.balance = (profile.derivBalance && profile.derivBalance.balance) || 0;
  MONIX_STATE.todayProfit = profile.stats?.today_profit || 0;
  MONIX_STATE.winRate = profile.stats?.win_rate || 0;
  MONIX_STATE.totalTrades = profile.stats?.total_trades || 0;
  MONIX_STATE.strategy = profile.user?.strategy || 'balanced';
  MONIX_STATE.autoTrade = profile.user?.auto_mode !== 0;
  MONIX_STATE.voucher = {
    code: profile.user?.voucher_code || 'MONIX-XXXX',
    remaining: profile.user?.trades_remaining || 0,
    limit: 1000000,
  };

  // Refresh whatever tab is active
  const tab = MONIX_STATE.activeTab;
  const fn = window['renderShellTab_' + tab];
  if (typeof fn === 'function') fn();

  if (typeof window.renderSidebar === 'function') window.renderSidebar();
  if (typeof window.renderTopbar === 'function') window.renderTopbar();
};

// Positions updater
window.monixUpdatePositions = function(positions) {
  MONIX_STATE.positions = positions || [];
  if (MONIX_STATE.activeTab === 'home') {
    const fn = window.renderShellTab_home;
    if (typeof fn === 'function') fn();
  }
};

// ================================================================
// Auto-wire any element with data-shell-tab (delegation)
// ================================================================
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-shell-tab]');
  if (el) {
    e.preventDefault();
    const tab = el.getAttribute('data-shell-tab');
    if (typeof window.monixSwitchTab === 'function') window.monixSwitchTab(tab);
  }
}, true);
