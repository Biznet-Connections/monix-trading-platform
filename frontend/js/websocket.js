let ws = null;
let wsReconnectAttempts = 0;
let wsReconnectInterval = null;

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        wsReconnectAttempts = 0;
        if (wsReconnectInterval) {
            clearInterval(wsReconnectInterval);
            wsReconnectInterval = null;
        }
        updateConnectionStatus(true);

        setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('WebSocket parse error:', error);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        reconnectWebSocket();
    };
}

function reconnectWebSocket() {
    if (wsReconnectInterval) return;

    wsReconnectInterval = setInterval(() => {
        if (wsReconnectAttempts >= 10) {
            console.error('Max reconnection attempts reached');
            clearInterval(wsReconnectInterval);
            wsReconnectInterval = null;
            return;
        }

        wsReconnectAttempts++;
        console.log(`Reconnecting WebSocket... Attempt ${wsReconnectAttempts}`);
        connectWebSocket();
    }, 3000);
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'price':
            const livePriceEl = document.getElementById('livePrice');
            if (livePriceEl && data.price) {
                livePriceEl.innerHTML = `$${data.price.toFixed(2)}`;
                if (window.updateChartPrice) {
                    window.updateChartPrice(data.price);
                }
            }
            break;

        case 'signal':
            if (data.signal && window.displaySignal) {
                window.displaySignal(data.signal);
                showToast('New AI Signal!', `${data.signal.action} ${data.signal.symbol} with ${data.signal.confidence}% confidence`, 'info');
                playSound('signal');
            }
            break;

        case 'notification':
            showToast(data.title, data.message, data.notificationType);
            break;

        case 'trade_result':
            if (data.trade) {
                if (window.addTradeToTable) {
                    window.addTradeToTable(data.trade);
                }
                if (window.refreshUserData) {
                    window.refreshUserData();
                }
                if (window.updateLockedBalance) {
                    window.updateLockedBalance();
                }
                playSound(data.trade.status === 'WIN' ? 'win' : 'loss');
                showToast(
                    `Trade ${data.trade.status}`,
                    `${data.trade.action} on ${data.trade.symbol}: ${data.trade.status === 'WIN' ? '+' : ''}$${data.trade.profit?.toFixed(2)}`,
                    data.trade.status === 'WIN' ? 'success' : 'error'
                );
            }
            break;

        case 'balance':
            if (data.balance !== undefined && window.updateBalanceInUI) {
                window.updateBalanceInUI(data.balance);
            } else if (data.balance !== undefined) {
                const balanceEl = document.getElementById('balanceAmount');
                if (balanceEl) balanceEl.innerHTML = `$${data.balance.toFixed(2)}`;
            }
            break;

        case 'trade_update':
            if (data.trade && window.loadRecentTrades) {
                window.loadRecentTrades();
            }
            break;

        case 'pong':
            break;

        default:
            console.log('Unknown WebSocket message:', data);
    }
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        if (connected) {
            statusEl.innerHTML = '🟢';
            statusEl.title = 'Connected';
        } else {
            statusEl.innerHTML = '🔴';
            statusEl.title = 'Disconnected - Reconnecting...';
        }
    }
}

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

function playSound(type) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        if (type === 'win') {
            oscillator.frequency.value = 880;
            gainNode.gain.value = 0.3;
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
            oscillator.stop(audioContext.currentTime + 0.5);
        } else if (type === 'loss') {
            oscillator.frequency.value = 220;
            gainNode.gain.value = 0.3;
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.8);
            oscillator.stop(audioContext.currentTime + 0.8);
        } else if (type === 'signal') {
            oscillator.frequency.value = 440;
            gainNode.gain.value = 0.2;
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
            oscillator.stop(audioContext.currentTime + 0.3);

            setTimeout(() => {
                const osc2 = audioContext.createOscillator();
                const gain2 = audioContext.createGain();
                osc2.connect(gain2);
                gain2.connect(audioContext.destination);
                osc2.frequency.value = 660;
                gain2.gain.value = 0.2;
                osc2.start();
                gain2.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
                osc2.stop(audioContext.currentTime + 0.3);
            }, 200);
        }
    } catch (e) {
        console.log('Audio not supported');
    }
}

window.connectWebSocket = connectWebSocket;
window.wsConnected = () => ws && ws.readyState === WebSocket.OPEN;
window.showToast = showToast;
window.playSound = playSound;
