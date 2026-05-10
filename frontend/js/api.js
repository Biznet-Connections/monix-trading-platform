// API Configuration
const API_BASE = window.location.origin;
let authToken = localStorage.getItem('monix_token');

// API Request wrapper
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'same-origin'
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401 && endpoint !== '/api/auth/verify') {
                localStorage.removeItem('monix_token');
                authToken = null;
                window.location.reload();
            }
            throw new Error(data.error || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Auth endpoints
async function login(email, password) {
    const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    if (data.token) {
        authToken = data.token;
        localStorage.setItem('monix_token', data.token);
    }

    return data;
}

async function register(username, email, password, voucher_code) {
    const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, voucher_code })
    });

    if (data.token) {
        authToken = data.token;
        localStorage.setItem('monix_token', data.token);
    }

    return data;
}

async function verifyToken() {
    try {
        return await apiRequest('/api/auth/verify', { method: 'POST' });
    } catch (error) {
        return { valid: false };
    }
}

// User endpoints
async function getUserProfile() {
    return apiRequest('/api/user/profile');
}

async function updateUserSettings(settings) {
    return apiRequest('/api/user/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
    });
}

async function updateApiKeys(demo_token, real_token) {
    return apiRequest('/api/user/api-keys', {
        method: 'PUT',
        body: JSON.stringify({ demo_token, real_token })
    });
}

async function switchMode(mode) {
    return apiRequest('/api/user/switch-mode', {
        method: 'POST',
        body: JSON.stringify({ mode })
    });
}

async function reconnectDeriv() {
    return apiRequest('/api/user/reconnect', { method: 'POST' });
}

// Trade endpoints
async function getTradeHistory(limit = 50, offset = 0, status = '', symbol = '') {
    let url = `/api/trades/history?limit=${limit}&offset=${offset}`;
    if (status) url += `&status=${status}`;
    if (symbol) url += `&symbol=${symbol}`;
    return apiRequest(url);
}

async function getTradeStats(days = 30) {
    return apiRequest(`/api/trades/stats?days=${days}`);
}

async function executeTrade(tradeData) {
    return apiRequest('/api/trades/execute', {
        method: 'POST',
        body: JSON.stringify(tradeData)
    });
}

async function getLockedBalance() {
    return apiRequest('/api/trades/locked-balance');
}

// Signal endpoints
async function generateSignal(symbol) {
    return apiRequest('/api/signals/generate', {
        method: 'POST',
        body: JSON.stringify({ symbol })
    });
}

async function getSignalHistory() {
    return apiRequest('/api/signals/history');
}

async function getAIInsights() {
    return apiRequest('/api/signals/insights');
}

// AI Trader endpoints (NEW)
async function changeAISymbol(symbol) {
    return apiRequest('/api/ai/symbol', {
        method: 'POST',
        body: JSON.stringify({ symbol })
    });
}

async function getAISymbol() {
    return apiRequest('/api/ai/symbol');
}

async function getAIAnalysis() {
    return apiRequest('/api/ai/analysis');
}

async function setAIMode(mode) {
    return apiRequest('/api/ai/mode', {
        method: 'POST',
        body: JSON.stringify({ mode })
    });
}

async function setConfidenceThreshold(threshold) {
    return apiRequest('/api/ai/threshold', {
        method: 'POST',
        body: JSON.stringify({ threshold })
    });
}

async function startAITrader(symbol = 'R_75', mode = 'AUTO') {
    return apiRequest('/api/ai/start', {
        method: 'POST',
        body: JSON.stringify({ symbol, mode })
    });
}

async function stopAITrader() {
    return apiRequest('/api/ai/stop', { method: 'POST' });
}

// Leaderboard
async function getLeaderboard() {
    return apiRequest('/api/user/leaderboard');
}

// Admin endpoints
async function adminGenerateVoucher(days, trades) {
    return apiRequest('/api/admin/vouchers/generate', {
        method: 'POST',
        body: JSON.stringify({ days, trades })
    });
}

async function adminGetVouchers() {
    return apiRequest('/api/admin/vouchers');
}

async function adminGetUsers() {
    return apiRequest('/api/admin/users');
}

async function adminBlockUser(userId) {
    return apiRequest(`/api/admin/users/${userId}/block`, { method: 'POST' });
}

async function adminUnblockUser(userId) {
    return apiRequest(`/api/admin/users/${userId}/unblock`, { method: 'POST' });
}

async function adminResetTrades(userId, trades) {
    return apiRequest(`/api/admin/users/${userId}/reset-trades`, {
        method: 'POST',
        body: JSON.stringify({ trades })
    });
}

async function adminAddAdmin(userId) {
    return apiRequest(`/api/admin/users/${userId}/add-admin`, { method: 'POST' });
}

async function adminSendBroadcast(subject, message) {
    return apiRequest('/api/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify({ subject, message })
    });
}

async function adminGetStats() {
    return apiRequest('/api/admin/stats');
}

async function adminRevokeVoucher(code) {
    return apiRequest(`/api/admin/vouchers/${code}`, { method: 'DELETE' });
}

// Logout
function logout() {
    localStorage.removeItem('monix_token');
    authToken = null;
    window.location.reload();
}

// Export for use in other files
window.api = {
    login,
    register,
    verifyToken,
    getUserProfile,
    updateUserSettings,
    updateApiKeys,
    switchMode,
    reconnectDeriv,
    getTradeHistory,
    getTradeStats,
    executeTrade,
    getLockedBalance,
    generateSignal,
    getSignalHistory,
    getAIInsights,
    getLeaderboard,
    changeAISymbol,
    getAISymbol,
    getAIAnalysis,
    setAIMode,
    setConfidenceThreshold,
    startAITrader,
    stopAITrader,
    adminGenerateVoucher,
    adminGetVouchers,
    adminGetUsers,
    adminBlockUser,
    adminUnblockUser,
    adminResetTrades,
    adminAddAdmin,
    adminSendBroadcast,
    adminGetStats,
    adminRevokeVoucher,
    logout
};
