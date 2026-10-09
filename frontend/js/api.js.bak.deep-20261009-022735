const API_BASE = window.location.origin;
let authToken = localStorage.getItem('monix_token');

// Send debug log to backend
function sendDebugLog(message, type = 'info') {
    console.log(`[UI] ${message}`);
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, type, timestamp: new Date().toISOString() })
    }).catch(() => {});
}

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const method = options.method || 'GET';
    const startTime = Date.now();
    sendDebugLog(`🔄 ${method} ${endpoint}`);

    try {
        const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
        const data = await response.json();
        const duration = Date.now() - startTime;

        if (!response.ok) {
            sendDebugLog(`❌ ${method} ${endpoint} → ${response.status}: ${data.error || 'Failed'}`, 'error');
            if (response.status === 401 && endpoint !== '/api/auth/verify') {
                localStorage.removeItem('monix_token');
                authToken = null;
                window.location.reload();
            }
            throw new Error(data.error || 'Request failed');
        }

        sendDebugLog(`✅ ${method} ${endpoint} → ${response.status} (${duration}ms)`);
        return data;
    } catch (error) {
        sendDebugLog(`❌ ${method} ${endpoint}: ${error.message}`, 'error');
        throw error;
    }
}

async function login(email, password) {
    sendDebugLog(`🔐 Login attempt: ${email}`);
    const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.token) { authToken = data.token; localStorage.setItem('monix_token', data.token); }
    sendDebugLog(data.success ? `✅ Login: ${email}` : `❌ Login failed: ${email}`, data.success ? 'info' : 'error');
    return data;
}

async function register(username, email, password, voucher_code) {
    sendDebugLog(`📝 Register: ${email} (${username})`);
    const data = await apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password, voucher_code }) });
    if (data.token) { authToken = data.token; localStorage.setItem('monix_token', data.token); }
    sendDebugLog(data.success ? `✅ Registered: ${email}` : `❌ Register failed: ${email}`, data.success ? 'info' : 'error');
    return data;
}

async function verifyToken() {
    try { return await apiRequest('/api/auth/verify', { method: 'POST' }); }
    catch (error) { return { valid: false }; }
}

async function getUserProfile() { return apiRequest('/api/user/profile'); }
async function updateUserSettings(settings) {
    sendDebugLog(`⚙️ Settings updated`);
    return apiRequest('/api/user/settings', { method: 'PUT', body: JSON.stringify(settings) });
}
async function updateApiKeys(demo_token, real_token) {
    sendDebugLog(`🔑 API keys updated`);
    return apiRequest('/api/user/api-keys', { method: 'PUT', body: JSON.stringify({ demo_token, real_token }) });
}
async function switchMode(mode) {
    sendDebugLog(`🔄 Switch mode: ${mode}`);
    return apiRequest('/api/user/switch-mode', { method: 'POST', body: JSON.stringify({ mode }) });
}
async function reconnectDeriv() { return apiRequest('/api/user/reconnect', { method: 'POST' }); }
async function getTradeHistory(limit = 50, offset = 0, status = '', symbol = '') {
    let url = `/api/trades/history?limit=${limit}&offset=${offset}`;
    if (status) url += `&status=${status}`;
    if (symbol) url += `&symbol=${symbol}`;
    return apiRequest(url);
}
async function getTradeStats(days = 30) { return apiRequest(`/api/trades/stats?days=${days}`); }
async function executeTrade(tradeData) {
    sendDebugLog(`💸 Trade: ${tradeData.action} ${tradeData.symbol} @ $${tradeData.stake}`);
    return apiRequest('/api/trades/execute', { method: 'POST', body: JSON.stringify(tradeData) });
}
async function getLockedBalance() { return apiRequest('/api/trades/locked-balance'); }
async function generateSignal(symbol) {
    sendDebugLog(`🧠 Generate signal: ${symbol}`);
    return apiRequest('/api/signals/generate', { method: 'POST', body: JSON.stringify({ symbol }) });
}
async function getSignalHistory() { return apiRequest('/api/signals/history'); }
async function getAIInsights(symbol = null) {
    const url = symbol ? `/api/signals/insights?symbol=${encodeURIComponent(symbol)}` : '/api/signals/insights';
    return apiRequest(url);
}
async function changeAISymbol(symbol) {
    sendDebugLog(`🔄 AI symbol → ${symbol}`);
    return apiRequest('/api/ai/symbol', { method: 'POST', body: JSON.stringify({ symbol }) });
}
async function getAISymbol() { return apiRequest('/api/ai/symbol'); }
async function getAIAnalysis() { return apiRequest('/api/ai/analysis'); }
async function setAIMode(mode) { return apiRequest('/api/ai/mode', { method: 'POST', body: JSON.stringify({ mode }) }); }
async function setConfidenceThreshold(threshold) { return apiRequest('/api/ai/threshold', { method: 'POST', body: JSON.stringify({ threshold }) }); }
async function startAITrader(symbol = 'R_75', mode = 'AUTO') { return apiRequest('/api/ai/start', { method: 'POST', body: JSON.stringify({ symbol, mode }) }); }
async function stopAITrader() { return apiRequest('/api/ai/stop', { method: 'POST' }); }
async function getLeaderboard() { return apiRequest('/api/user/leaderboard'); }
async function adminGenerateVoucher(days, trades) { return apiRequest('/api/admin/vouchers/generate', { method: 'POST', body: JSON.stringify({ days, trades }) }); }
async function adminGetVouchers() { return apiRequest('/api/admin/vouchers'); }
async function adminGetUsers() { return apiRequest('/api/admin/users'); }
async function adminBlockUser(userId) { return apiRequest(`/api/admin/users/${userId}/block`, { method: 'POST' }); }
async function adminUnblockUser(userId) { return apiRequest(`/api/admin/users/${userId}/unblock`, { method: 'POST' }); }
async function adminResetTrades(userId, trades) { return apiRequest(`/api/admin/users/${userId}/reset-trades`, { method: 'POST', body: JSON.stringify({ trades }) }); }
async function adminAddAdmin(userId) { return apiRequest(`/api/admin/users/${userId}/add-admin`, { method: 'POST' }); }
async function adminSendBroadcast(subject, message) { return apiRequest('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ subject, message }) }); }
async function adminGetStats() { return apiRequest('/api/admin/stats'); }
async function adminRevokeVoucher(code) { return apiRequest(`/api/admin/vouchers/${code}`, { method: 'DELETE' }); }

// ✅ UPDATED: Soft delete - hide trades from UI, keep in DB
async function hideTradeHistory() {
    sendDebugLog(`👁️ Hiding all trade history from UI (kept for AI learning)`);
    return apiRequest('/api/trades/history/hide-all', { method: 'DELETE' });
}

function logout() {
    sendDebugLog('🚪 Logout');
    localStorage.removeItem('monix_token');
    authToken = null;
    window.location.reload();
}

window.api = {
    login, register, verifyToken, getUserProfile, updateUserSettings, updateApiKeys,
    switchMode, reconnectDeriv, getTradeHistory, getTradeStats, executeTrade,
    getLockedBalance, generateSignal, getSignalHistory, getAIInsights, getLeaderboard,
    changeAISymbol, getAISymbol, getAIAnalysis, setAIMode, setConfidenceThreshold,
    startAITrader, stopAITrader, adminGenerateVoucher, adminGetVouchers, adminGetUsers,
    adminBlockUser, adminUnblockUser, adminResetTrades, adminAddAdmin,
    adminSendBroadcast, adminGetStats, adminRevokeVoucher, logout,
    hideTradeHistory  // ✅ updated
};
