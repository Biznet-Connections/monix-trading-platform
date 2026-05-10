// Main Application
let currentUser = null;
let currentPage = 'dashboard';
let isReconnecting = false;

console.log('🔵 MONIX App Initializing...');

// DOM Elements
const authModal = document.getElementById('authModal');
const appContainer = document.getElementById('appContainer');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');
const logoutBtn = document.getElementById('logoutBtn');
const openApiKeys = document.getElementById('openApiKeys');
const openSettings = document.getElementById('openSettings');
const viewFullInsights = document.getElementById('viewFullInsights');

// Sidebar navigation
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page-content');

// Mobile Header Elements
const mobileHeader = document.getElementById('mobileHeader');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebarDrawer = document.getElementById('sidebarDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');

// ============ HELPER FUNCTIONS ============
function logToTerminal(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
}

// ============ TOAST NOTIFICATION ============
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = '';
    switch (type) {
        case 'success': icon = '✅'; break;
        case 'error': icon = '❌'; break;
        default: icon = 'ℹ️';
    }

    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <span class="text-lg">${icon}</span>
            <div class="flex-1">
                <p class="font-semibold text-sm">${title}</p>
                <p class="text-xs text-slate-400 mt-1">${message}</p>
            </div>
            <button class="text-slate-500 hover:text-white" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

window.showToast = showToast;

// ============ MOBILE DRAWER ============
function initMobileDrawer() {
    logToTerminal('📱 Initializing mobile drawer');

    function closeDrawer() {
        if (sidebarDrawer) sidebarDrawer.style.transform = 'translateX(-100%)';
        if (drawerOverlay) drawerOverlay.classList.add('hidden');
        document.body.style.overflow = '';
        if (mobileHeader) mobileHeader.style.display = 'flex';
    }

    function openDrawer() {
        if (sidebarDrawer) sidebarDrawer.style.transform = 'translateX(0)';
        if (drawerOverlay) drawerOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        if (mobileHeader) mobileHeader.style.display = 'none';
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openDrawer();
        });
    }

    if (closeDrawerBtn) {
        closeDrawerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeDrawer();
        });
    }

    if (drawerOverlay) {
        drawerOverlay.addEventListener('click', () => {
            closeDrawer();
        });
    }
}

// ============ PAGE CLOSE BUTTONS ============
function setupPageCloseButtons() {
    const pagesWithClose = ['insightsPage', 'performancePage', 'historyPage', 'leaderboardPage'];

    pagesWithClose.forEach(pageId => {
        const page = document.getElementById(pageId);
        if (page && !page.querySelector('.page-close-btn')) {
            const headerDiv = page.querySelector('.glass-card > div:first-child');
            if (headerDiv && !headerDiv.querySelector('.page-close-btn')) {
                const closeBtn = document.createElement('button');
                closeBtn.className = 'page-close-btn text-slate-400 hover:text-white text-2xl ml-auto';
                closeBtn.innerHTML = '&times;';
                closeBtn.style.background = 'none';
                closeBtn.style.border = 'none';
                closeBtn.style.cursor = 'pointer';
                closeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    logToTerminal(`❌ [UI] Closing ${pageId}, returning to dashboard`);
                    switchPage('dashboard');
                };
                headerDiv.appendChild(closeBtn);
                logToTerminal(`✅ [UI] Added close button to ${pageId}`);
            }
        }
    });
}

// ============ AUTH MODAL SETUP ============
function setupAuthModal() {
    logToTerminal('🔐 Setting up auth modal');

    if (loginTab && registerTab) {
        loginTab.addEventListener('click', () => {
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        });

        registerTab.addEventListener('click', () => {
            registerTab.classList.add('active');
            loginTab.classList.remove('active');
            registerForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
        });
    }

    const loginFormElement = document.getElementById('loginFormElement');
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            logToTerminal(`🔐 Login attempt for: ${email}`);

            try {
                const result = await window.api.login(email, password);
                if (result.success) {
                    logToTerminal(`✅ Login successful for ${email}`);
                    currentUser = result.user;
                    showApp();
                    await loadUserData();
                    showToast('Login Successful', `Welcome back ${result.user.username}!`, 'success');
                } else {
                    showToast('Login Failed', result.error || 'Invalid credentials', 'error');
                }
            } catch (error) {
                showToast('Login Failed', error.message, 'error');
            }
        });
    }

    const registerFormElement = document.getElementById('registerFormElement');
    if (registerFormElement) {
        registerFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const voucher = document.getElementById('regVoucher').value;
            logToTerminal(`📝 Registration attempt for: ${email} (${username})`);

            try {
                const result = await window.api.register(username, email, password, voucher);
                if (result.success) {
                    logToTerminal(`✅ Registration successful for ${email}`);
                    currentUser = result.user;
                    showApp();
                    await loadUserData();
                    showToast('Registration Successful', `Welcome to MONIX, ${username}!`, 'success');
                } else {
                    showToast('Registration Failed', result.error || 'Invalid voucher or data', 'error');
                }
            } catch (error) {
                showToast('Registration Failed', error.message, 'error');
            }
        });
    }
}

// ============ MODAL SETUP ============
function setupModals() {
    logToTerminal('🔧 Setting up modals');

    if (openApiKeys) {
        openApiKeys.addEventListener('click', async () => {
            const modal = document.getElementById('apiKeysModal');
            if (modal) modal.classList.remove('hidden');
            await loadApiKeysToForm();
        });
    }

    if (openSettings) {
        openSettings.addEventListener('click', async () => {
            const modal = document.getElementById('settingsModal');
            if (modal) modal.classList.remove('hidden');
            await loadSettingsToForm();
        });
    }

    if (viewFullInsights) {
        viewFullInsights.addEventListener('click', () => {
            switchPage('insights');
        });
    }

    const apiKeysForm = document.getElementById('apiKeysForm');
    if (apiKeysForm) {
        apiKeysForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const demoToken = document.getElementById('demoToken').value;
            const realToken = document.getElementById('realToken').value;

            try {
                const result = await window.api.updateApiKeys(demoToken, realToken);
                if (result.reconnect?.success && result.reconnect?.balance !== undefined) {
                    const balanceNum = typeof result.reconnect.balance === 'number' ? result.reconnect.balance : parseFloat(result.reconnect.balance);
                    showToast('API Keys Saved', `Connected! Balance: $${balanceNum}`, 'success');
                    const balanceEl = document.getElementById('balanceAmount');
                    if (balanceEl) balanceEl.innerHTML = `$${balanceNum.toFixed(2)}`;
                } else {
                    showToast('API Keys Saved', 'Keys saved but connection failed', 'warning');
                }
                document.getElementById('apiKeysModal').classList.add('hidden');
                await loadUserData();
            } catch (error) {
                showToast('Error', error.message, 'error');
            }
        });
    }

    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const defaultSymbol = document.getElementById('defaultSymbol').value;
            const defaultStake = parseFloat(document.getElementById('defaultStake').value);

            try {
                await window.api.updateUserSettings({
                    default_symbol: defaultSymbol,
                    base_stake: defaultStake
                });
                showToast('Settings Saved', 'Your preferences have been saved', 'success');
                document.getElementById('settingsModal').classList.add('hidden');

                const stakeSlider = document.getElementById('stakeSlider');
                const stakeValue = document.getElementById('stakeValue');
                if (stakeSlider) stakeSlider.value = defaultStake;
                if (stakeValue) stakeValue.innerText = `$${defaultStake.toFixed(2)}`;
            } catch (error) {
                showToast('Error', error.message, 'error');
            }
        });
    }

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.add('hidden');
        });
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });
}

async function loadApiKeysToForm() {
    try {
        const profile = await window.api.getUserProfile();
        if (profile && profile.user) {
            const demoTokens = document.getElementById('demoToken');
            const realTokens = document.getElementById('realToken');
            if (demoTokens) demoTokens.value = profile.user.demo_token || '';
            if (realTokens) realTokens.value = profile.user.real_token || '';
        }
    } catch (error) {
        console.error('Failed to load API keys:', error);
    }
}

async function loadSettingsToForm() {
    try {
        const profile = await window.api.getUserProfile();
        if (profile && profile.user) {
            document.getElementById('defaultSymbol').value = profile.user.default_symbol || 'R_75';
            document.getElementById('defaultStake').value = profile.user.base_stake || 0.10;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// ============ NAVIGATION ============
function setupNavigation() {
    logToTerminal('🧭 Setting up navigation');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const page = link.dataset.page;
            if (page) {
                switchPage(page);
            }
        });
    });
}

function switchPage(page) {
    currentPage = page;

    navLinks.forEach(link => {
        if (link.dataset.page === page) {
            link.classList.add('bg-indigo-600/20', 'text-indigo-400');
            link.classList.remove('text-slate-400');
        } else {
            link.classList.remove('bg-indigo-600/20', 'text-indigo-400');
            link.classList.add('text-slate-400');
        }
    });

    pages.forEach(p => p.classList.add('hidden'));
    const activePage = document.getElementById(`${page}Page`);
    if (activePage) activePage.classList.remove('hidden');

    if (page === 'performance') setTimeout(() => loadPerformanceStats(), 100);
    if (page === 'history') setTimeout(() => loadFullHistory(), 100);
    if (page === 'leaderboard') setTimeout(() => loadLeaderboard(), 100);
    if (page === 'insights') setTimeout(() => loadFullInsights(), 100);

    setTimeout(() => setupPageCloseButtons(), 200);
}

// ============ DATA LOADING ============
async function loadUserData() {
    try {
        logToTerminal('👤 Loading user data...');
        const profile = await window.api.getUserProfile();

        if (profile && profile.user) {
            currentUser = profile.user;

            document.getElementById('welcomeName').innerHTML = profile.user.username;
            document.getElementById('userName').innerHTML = profile.user.username;
            document.getElementById('userEmail').innerHTML = profile.user.email;

            const hasDemoToken = profile.user.demo_token && profile.user.demo_token.length > 0;
            const hasRealToken = profile.user.real_token && profile.user.real_token.length > 0;
            const hasAnyApiKey = hasDemoToken || hasRealToken;
            const currentMode = profile.user.is_demo ? 'DEMO' : 'REAL';

            const balanceEl = document.getElementById('balanceAmount');
            const connectionText = document.getElementById('connectionText');
            const marketStatus = document.getElementById('marketStatus');

            if (balanceEl) {
                if (profile.derivBalance && profile.derivBalance.authorized) {
                    const balanceNum = typeof profile.derivBalance.balance === 'number'
                        ? profile.derivBalance.balance
                        : parseFloat(profile.derivBalance.balance);
                    balanceEl.innerHTML = `$${balanceNum.toFixed(2)}`;
                    if (connectionText) connectionText.innerHTML = `${currentMode} Connected (${profile.derivBalance.currency})`;
                    if (marketStatus) marketStatus.innerHTML = `${currentMode} ACTIVE`;
                    logToTerminal(`💰 Balance from Deriv API: $${balanceNum} ${profile.derivBalance.currency} (${currentMode})`);
                }
                else if (profile.user.is_demo === 0 && hasRealToken && (!profile.derivBalance || profile.derivBalance.balance === 0)) {
                    balanceEl.innerHTML = `$0.00`;
                    if (connectionText) connectionText.innerHTML = 'Connecting to REAL...';
                    if (marketStatus) marketStatus.innerHTML = 'CONNECTING';
                    logToTerminal('⚠️ REAL mode but balance is 0 - forcing reconnect');
                    
                    try {
                        const reconnectResult = await window.api.reconnectDeriv();
                        if (reconnectResult.success && reconnectResult.balance !== undefined) {
                            balanceEl.innerHTML = `$${reconnectResult.balance.toFixed(2)}`;
                            if (connectionText) connectionText.innerHTML = `REAL Connected`;
                            if (marketStatus) marketStatus.innerHTML = `REAL ACTIVE`;
                            logToTerminal(`💰 REAL balance fetched: $${reconnectResult.balance}`);
                        }
                    } catch (reconnectError) {
                        logToTerminal(`❌ Force reconnect failed: ${reconnectError.message}`, 'error');
                    }
                }
                else if (!hasAnyApiKey) {
                    balanceEl.innerHTML = `$0.00`;
                    if (connectionText) connectionText.innerHTML = 'No API Keys';
                    if (marketStatus) marketStatus.innerHTML = 'READ-ONLY';
                    logToTerminal('⚠️ No API keys found - showing $0 balance');
                }
                else if (hasAnyApiKey && !profile.derivBalance?.authorized && !isReconnecting) {
                    balanceEl.innerHTML = `$0.00`;
                    if (connectionText) connectionText.innerHTML = 'Connecting...';
                    if (marketStatus) marketStatus.innerHTML = 'CONNECTING';
                    logToTerminal('⚠️ API keys present but Deriv not authorized - attempting reconnect');

                    isReconnecting = true;
                    try {
                        const reconnectResult = await window.api.reconnectDeriv();
                        if (reconnectResult.success && reconnectResult.balance !== undefined) {
                            const balanceNum = typeof reconnectResult.balance === 'number'
                                ? reconnectResult.balance
                                : parseFloat(reconnectResult.balance);
                            balanceEl.innerHTML = `$${balanceNum.toFixed(2)}`;
                            if (connectionText) connectionText.innerHTML = `${reconnectResult.mode || currentMode} Connected`;
                            if (marketStatus) marketStatus.innerHTML = `${reconnectResult.mode || currentMode} ACTIVE`;
                            logToTerminal(`💰 Reconnected! Balance: $${balanceNum}`);
                        }
                    } catch (reconnectError) {
                        logToTerminal(`❌ Auto-reconnect failed: ${reconnectError.message}`, 'error');
                    } finally {
                        isReconnecting = false;
                    }
                }
            }

            document.getElementById('winRateDisplay').innerHTML = `Win Rate: ${profile.stats?.win_rate || 0}%`;

            const todayProfit = profile.stats?.today_profit || 0;
            const todayProfitEl = document.getElementById('todayProfit');
            if (todayProfitEl) {
                todayProfitEl.innerHTML = `<i class="fas fa-arrow-${todayProfit >= 0 ? 'up' : 'down'}"></i> Today: ${todayProfit >= 0 ? '+' : ''}$${todayProfit.toFixed(2)}`;
                todayProfitEl.className = todayProfit >= 0 ? 'text-emerald-400' : 'text-red-400';
            }

            document.getElementById('voucherCode').innerHTML = profile.user.voucher_code || 'MONIX-XXXX';
            document.getElementById('tradesRemaining').innerHTML = `Trades Left: ${profile.user.trades_remaining || 0}`;
            if (profile.user.voucher_expiry) {
                document.getElementById('voucherExpiry').innerHTML = `Expires: ${new Date(profile.user.voucher_expiry).toLocaleDateString()}`;
            }

            const pushSignalsToggle = document.getElementById('pushSignalsToggle');
            const autoModeToggle = document.getElementById('autoModeToggle');
            const jackpotToggle = document.getElementById('jackpotToggle');
            const stakeSlider = document.getElementById('stakeSlider');
            const stakeValue = document.getElementById('stakeValue');
            
            if (pushSignalsToggle) pushSignalsToggle.checked = profile.user.push_signals === 1;
            if (autoModeToggle) autoModeToggle.checked = profile.user.auto_mode === 1;
            if (jackpotToggle) jackpotToggle.checked = profile.user.jackpot_mode === 1;
            if (stakeSlider && profile.user.base_stake) stakeSlider.value = Math.max(profile.user.base_stake, 0.35);
            if (stakeValue) stakeValue.innerText = `$${Math.max(profile.user.base_stake || 0.35, 0.35).toFixed(2)}`;

            const adminLink = document.getElementById('adminLink');
            if (adminLink && profile.user.is_admin) {
                adminLink.classList.remove('hidden');
                logToTerminal('👑 Admin access granted');
            }

            if (window.updateLockedBalance) await window.updateLockedBalance();
            logToTerminal('✅ User data loaded successfully');
        }
    } catch (error) {
        logToTerminal(`❌ Failed to load user data: ${error.message}`, 'error');
    }
}

async function loadPerformanceStats() {
    try {
        logToTerminal('📈 Loading performance stats...');
        const stats = await window.api.getTradeStats(30);
        document.getElementById('statWinRate').innerHTML = `${stats.overall?.win_rate || 0}%`;
        document.getElementById('statTotalTrades').innerHTML = stats.overall?.total_trades || 0;
        const profit = stats.overall?.net_profit || 0;
        document.getElementById('statNetProfit').innerHTML = `$${profit.toFixed(2)}`;
        document.getElementById('statBestStreak').innerHTML = stats.overall?.best_streak || 0;

        const symbolContainer = document.getElementById('symbolStatsContainer');
        if (symbolContainer) {
            if (stats.by_symbol && stats.by_symbol.length > 0) {
                symbolContainer.innerHTML = `<h3 class="font-semibold mb-2">Performance by Symbol</h3>${stats.by_symbol.map(s => `<div class="flex justify-between items-center py-2 border-b border-slate-700"><span class="font-medium">${s.symbol}</span><div class="flex gap-4"><span class="text-sm">${s.total} trades</span><span class="text-sm ${s.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400'}">${s.win_rate}% win</span><span class="text-sm ${s.total_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}">$${s.total_profit?.toFixed(2)}</span></div></div>`).join('')}`;
            } else {
                symbolContainer.innerHTML = '<p class="text-center text-slate-500">No trades yet</p>';
            }
        }
        logToTerminal('✅ Performance stats loaded');
    } catch (error) {
        logToTerminal(`❌ Failed to load performance stats: ${error.message}`, 'error');
    }
}

async function loadFullHistory() {
    try {
        logToTerminal('📜 Loading trade history...');
        const trades = await window.api.getTradeHistory(100);
        const tbody = document.getElementById('historyTradesBody');
        const symbolFilter = document.getElementById('historyFilterSymbol');
        const statusFilter = document.getElementById('historyFilterStatus');

        if (!tbody) return;

        function renderFiltered() {
            let filtered = [...trades];
            if (symbolFilter && symbolFilter.value) filtered = filtered.filter(t => t.symbol === symbolFilter.value);
            if (statusFilter && statusFilter.value) filtered = filtered.filter(t => t.status === statusFilter.value);

            if (filtered.length === 0) {
                                tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">No trades found</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(trade => `<tr class="border-b border-slate-700"><td class="p-3 text-xs">${new Date(trade.executed_at).toLocaleString()}</td><td class="p-3 font-medium">${trade.symbol}</td><td class="p-3 ${trade.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}">${trade.action}</td><td class="p-3">$${trade.entry_price?.toFixed(2)}</td><td class="p-3">$${trade.exit_price?.toFixed(2) || '--'}</td><td class="p-3 ${trade.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}">${trade.profit >= 0 ? '+' : ''}$${trade.profit?.toFixed(2)}</td><td class="p-3"><span class="px-2 py-1 rounded text-xs ${trade.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}">${trade.status || 'PENDING'}</span></td></tr>`).join('');
        }

        if (symbolFilter) symbolFilter.addEventListener('change', renderFiltered);
        if (statusFilter) statusFilter.addEventListener('change', renderFiltered);
        renderFiltered();
        logToTerminal(`✅ Loaded ${trades.length} trades`);
    } catch (error) {
        logToTerminal(`❌ Failed to load trade history: ${error.message}`, 'error');
    }
}

async function loadLeaderboard() {
    try {
        logToTerminal('🏆 Loading leaderboard...');
        const leaderboard = await window.api.getLeaderboard();
        const container = document.getElementById('leaderboardBody');

        if (!container) return;

        if (!leaderboard || leaderboard.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-500">No traders yet</p>';
            return;
        }

        function maskUsername(username) {
            if (!username) return '****';
            if (username.length <= 4) return username;
            return username.substring(0, 2) + '***' + username.substring(username.length - 2);
        }

        container.innerHTML = leaderboard.map((user, index) => `<div class="flex items-center justify-between bg-slate-800/30 p-3 rounded-lg"><div class="flex items-center gap-3"><span class="text-2xl ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-amber-600' : 'text-slate-500'}">${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}</span><div><p class="font-medium">${maskUsername(user.username)}</p><p class="text-xs text-slate-500">${user.total_trades || 0} trades | ${user.win_rate || 0}% win</p></div></div><div class="text-right"><p class="font-bold text-emerald-400">+$${user.net_profit?.toFixed(2)}</p><p class="text-xs text-slate-500">Best: ${user.best_streak || 0} streak</p></div></div>`).join('');
        logToTerminal(`✅ Leaderboard loaded with ${leaderboard.length} traders`);
    } catch (error) {
        logToTerminal(`❌ Failed to load leaderboard: ${error.message}`, 'error');
    }
}

async function loadFullInsights() {
    try {
        logToTerminal('🧠 Loading full insights page...');
        const insights = await window.api.getAIInsights();
        const container = document.getElementById('fullInsightsContent');

        if (!container) return;

        if (!insights.user_stats || insights.user_stats.total_trades === 0) {
            container.innerHTML = `
                <div class="bg-amber-500/20 p-6 rounded-lg text-center border border-amber-500/30">
                    <i class="fas fa-chart-line text-4xl text-amber-400 mb-3"></i>
                    <h3 class="text-xl font-bold mb-2">No Trades Yet</h3>
                    <p class="text-slate-400 mb-4">Execute a trade to generate AI insights!</p>
                    <div class="text-sm text-slate-500 mb-4">Go to Dashboard and click GET SIGNAL to start trading</div>
                    <button onclick="switchPage('dashboard')" class="bg-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-700 transition">Go to Dashboard</button>
                </div>
            `;
            logToTerminal('🧠 No trades yet - showing placeholder');
            return;
        }

        if (insights.user_stats.total_trades < 3) {
            const tradesNeeded = 3 - insights.user_stats.total_trades;
            container.innerHTML = `
                <div class="bg-blue-500/20 p-6 rounded-lg text-center border border-blue-500/30">
                    <i class="fas fa-spinner fa-pulse text-4xl text-blue-400 mb-3"></i>
                    <h3 class="text-xl font-bold mb-2">Gathering Trading Data...</h3>
                    <p class="text-slate-400 mb-4">AI needs more data. Complete ${tradesNeeded} more trade(s) for pattern analysis.</p>
                    <div class="text-sm text-slate-500 mb-4">Current trades: ${insights.user_stats.total_trades}/3 needed</div>
                    <button onclick="switchPage('dashboard')" class="bg-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-700 transition">Go to Dashboard</button>
                </div>
            `;
            logToTerminal(`🧠 Only ${insights.user_stats.total_trades} trades - need ${tradesNeeded} more for insights`);
            return;
        }

        container.innerHTML = `
            <div class="bg-slate-800/30 p-4 rounded-lg">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold"><i class="fas fa-chart-line text-emerald-400 mr-2"></i>Your Stats</h3>
                    <span class="text-xs px-2 py-1 rounded-full bg-indigo-600/20 text-indigo-400">${insights.user_stats.total_trades} trades</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="text-center p-2 bg-slate-700/30 rounded-lg">
                        <div class="text-2xl font-bold text-emerald-400">${insights.user_stats.win_rate || 0}%</div>
                        <div class="text-xs text-slate-500">Win Rate</div>
                    </div>
                    <div class="text-center p-2 bg-slate-700/30 rounded-lg">
                        <div class="text-2xl font-bold">${insights.user_stats.total_trades || 0}</div>
                        <div class="text-xs text-slate-500">Total Trades</div>
                    </div>
                    <div class="text-center p-2 bg-slate-700/30 rounded-lg">
                        <div class="text-2xl font-bold ${(insights.user_stats.net_profit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}">$${(insights.user_stats.net_profit || 0).toFixed(2)}</div>
                        <div class="text-xs text-slate-500">Net Profit</div>
                    </div>
                    <div class="text-center p-2 bg-slate-700/30 rounded-lg">
                        <div class="text-2xl font-bold">${insights.user_stats.avg_win_confidence || 0}%</div>
                        <div class="text-xs text-slate-500">Avg Confidence</div>
                    </div>
                </div>
            </div>

            <div class="bg-slate-800/30 p-4 rounded-lg">
                <h3 class="font-semibold mb-3"><i class="fas fa-trophy text-yellow-500 mr-2"></i>Top Winning Patterns</h3>
                ${insights.top_patterns?.length > 0 ? insights.top_patterns.map(p => `
                    <div class="flex justify-between items-center py-2 border-b border-slate-700">
                        <div>
                            <span class="font-medium">${p.pattern_name}</span>
                            <span class="text-xs text-slate-500 ml-2">on ${p.symbol}</span>
                        </div>
                        <div class="flex gap-3">
                            <span class="text-emerald-400 font-bold">${p.win_rate}%</span>
                            <span class="text-xs text-slate-500">(${p.times_used} trades)</span>
                        </div>
                    </div>
                `).join('') : '<p class="text-slate-500 text-center py-4">No winning patterns identified yet</p>'}
            </div>

            <div class="bg-slate-800/30 p-4 rounded-lg">
                <h3 class="font-semibold mb-3"><i class="fas fa-exclamation-triangle text-red-400 mr-2"></i>Patterns to Avoid</h3>
                ${insights.worst_patterns?.length > 0 ? insights.worst_patterns.map(p => `
                    <div class="flex justify-between items-center py-2 border-b border-slate-700">
                        <div>
                            <span class="font-medium">${p.pattern_name}</span>
                            <span class="text-xs text-slate-500 ml-2">on ${p.symbol}</span>
                        </div>
                        <div class="flex gap-3">
                            <span class="text-red-400 font-bold">${p.win_rate}%</span>
                            <span class="text-xs text-slate-500">(${p.times_used} trades)</span>
                        </div>
                    </div>
                `).join('') : '<p class="text-slate-500 text-center py-4">No losing patterns identified yet</p>'}
            </div>

            <div class="bg-indigo-600/20 p-4 rounded-lg border border-indigo-500/30">
                <h3 class="font-semibold mb-2"><i class="fas fa-brain text-indigo-400 mr-2"></i>AI Trading Advice</h3>
                <ul class="space-y-2">
                    ${insights.advice?.adjustments?.map(a => `<li class="text-sm flex items-start gap-2"><i class="fas fa-lightbulb text-yellow-500 text-xs mt-0.5"></i><span>${a}</span></li>`).join('') || '<li>Complete more trades for AI advice</li>'}
                </ul>
                ${insights.advice?.confidence_adjustment ? `<p class="text-xs text-slate-400 mt-3 pt-2 border-t border-indigo-500/30">Suggested confidence adjustment: ${insights.advice.confidence_adjustment > 0 ? '+' : ''}${insights.advice.confidence_adjustment}%</p>` : ''}
                ${insights.advice?.stake_adjustment ? `<p class="text-xs text-slate-400">Suggested stake adjustment: ${insights.advice.stake_adjustment > 0 ? '+' : ''}$${Math.abs(insights.advice.stake_adjustment).toFixed(2)}</p>` : ''}
            </div>
        `;

        logToTerminal('✅ Full insights displayed successfully');

    } catch (error) {
        logToTerminal(`❌ Failed to load full insights: ${error.message}`, 'error');
        const container = document.getElementById('fullInsightsContent');
        if (container) {
            container.innerHTML = `
                <div class="bg-red-500/20 p-6 rounded-lg text-center border border-red-500/30">
                    <i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-3"></i>
                    <h3 class="text-xl font-bold mb-2">Error Loading Insights</h3>
                    <p class="text-slate-400 mb-4">${error.message}</p>
                    <button onclick="switchPage('dashboard')" class="bg-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-700 transition">Go to Dashboard</button>
                </div>
            `;
        }
    }
}

// ============ THEME ============
function setupTheme() {
    const savedTheme = localStorage.getItem('monix_theme');
    const isDark = savedTheme !== 'light';
    if (!isDark) {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
        if (themeIcon) themeIcon.className = 'fas fa-sun';
        if (themeText) themeText.innerText = 'Light Mode';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.contains('light-theme');
            if (isLight) {
                document.body.classList.remove('light-theme');
                document.body.classList.add('dark-theme');
                localStorage.setItem('monix_theme', 'dark');
                if (themeIcon) themeIcon.className = 'fas fa-moon';
                if (themeText) themeText.innerText = 'Dark Mode';
                if (window.updateChartTheme) window.updateChartTheme(true);
                logToTerminal('🌙 Theme changed to Dark');
            } else {
                document.body.classList.remove('dark-theme');
                document.body.classList.add('light-theme');
                localStorage.setItem('monix_theme', 'light');
                if (themeIcon) themeIcon.className = 'fas fa-sun';
                if (themeText) themeText.innerText = 'Light Mode';
                if (window.updateChartTheme) window.updateChartTheme(false);
                logToTerminal('☀️ Theme changed to Light');
            }
        });
    }
}

function updateServerTime() {
    const serverTimeEl = document.getElementById('serverTime');
    if (serverTimeEl) {
        serverTimeEl.innerHTML = `Server: ${new Date().toLocaleTimeString()}`;
    }
}

// ============ MAIN INIT ============
function showApp() {
    logToTerminal('🚀 Showing main application');
    if (authModal) authModal.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');

    setTimeout(() => {
        if (window.initChart) window.initChart(document.body.classList.contains('light-theme'));
        if (window.initTrading) window.initTrading();
        if (window.initAdmin && currentUser?.is_admin) window.initAdmin();
        if (window.connectWebSocket) window.connectWebSocket();
    }, 100);

    loadUserData();
    if (window.loadRecentTrades) window.loadRecentTrades();
    loadLeaderboard();

    setupNavigation();
    setupModals();
    setupTheme();

    updateServerTime();
    setInterval(updateServerTime, 1000);
}

function showAuthModal() {
    logToTerminal('🔐 Showing auth modal (user not logged in)');
    if (authModal) authModal.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
}

async function initApp() {
    logToTerminal('🚀 MONIX Trading Platform v3.0 Initializing...');

    initMobileDrawer();
    setupAuthModal();

    const token = localStorage.getItem('monix_token');
    logToTerminal(`🔑 Token present: ${token ? 'Yes' : 'No'}`);

    if (token) {
        try {
            const result = await window.api.verifyToken();
            if (result.valid) {
                logToTerminal(`✅ Token valid - User: ${result.user.email}`);
                currentUser = result.user;
                showApp();
                await loadUserData();
                return;
            } else {
                logToTerminal('⚠️ Token invalid - showing login');
            }
        } catch (error) {
            logToTerminal(`❌ Token verification failed: ${error.message}`, 'error');
        }
    }

    showAuthModal();
}

// Global function for dashboard navigation from insights
window.switchPageToDashboard = function() {
    switchPage('dashboard');
};
window.switchPage = switchPage;
window.loadFullInsights = loadFullInsights;

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        logToTerminal('🚪 User logout');
        window.api.logout();
    });
}

initApp();
