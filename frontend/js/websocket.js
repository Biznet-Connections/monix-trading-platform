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

function playBellSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.3;
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
        oscillator.stop(audioContext.currentTime + 0.5);
        
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
        }, 150);
    } catch(e) {
        console.log('Bell sound not supported');
    }
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

        case 'new_setup':
            console.log('🔔 New setup detected!', data.setup);
            
            playBellSound();
            
            if (Notification.permission === 'granted') {
                new Notification('🔔 New Trading Setup!', {
                    body: `${data.setup.action_display} on ${data.setup.symbol} at $${data.setup.entry_price?.toFixed(2)} with ${data.setup.confidence}% confidence`,
                    icon: '/favicon.ico',
                    tag: 'new_setup',
                    requireInteraction: true
                });
            }
            
            if (window.showToast) {
                window.showToast(
                    '🔔 New Setup Detected!',
                    `${data.setup.action_display} on ${data.setup.symbol} at $${data.setup.entry_price?.toFixed(2)} | Confidence: ${data.setup.confidence}%`,
                    'info'
                );
            }
            
            const signalReasoning = document.getElementById('signalReasoning');
            if (signalReasoning) {
                signalReasoning.innerHTML = `🔔 SETUP READY! ${data.setup.action_display} on ${data.setup.symbol} at $${data.setup.entry_price?.toFixed(2)}. Click for details.`;
                signalReasoning.style.cursor = 'pointer';
                signalReasoning.style.textDecoration = 'underline';
                signalReasoning.style.fontWeight = 'bold';
                signalReasoning.style.color = '#fbbf24';
                
                setTimeout(() => {
                    if (signalReasoning) signalReasoning.style.color = '';
                }, 3000);
            }
            
            window.currentDisplaySignal = {
                symbol: data.setup.symbol,
                action: data.setup.action,
                confidence: data.setup.confidence,
                pattern: data.setup.pattern,
                entry_price: data.setup.entry_price,
                take_profit: data.setup.take_profit,
                stop_loss: data.setup.stop_loss,
                reasoning: data.setup.reason,
                simple_reason: data.setup.reason,
                rsi: data.setup.market_rsi,
                support: data.setup.market_support,
                resistance: data.setup.market_resistance,
                market_feeling: data.setup.market_feeling,
                entry_time: data.setup.estimated_time === 'Now' ? new Date().toLocaleTimeString() : data.setup.estimated_time,
                exit_time: data.setup.estimated_time === 'Now' ? new Date(Date.now() + 5*60000).toLocaleTimeString() : '5 min after entry',
                is_waiting: false,
                entry_condition: data.setup.entry_condition
            };
            break;

        case 'signal':
            if (data.signal && window.displaySignal) {
                window.displaySignal(data.signal);
                if (window.showToast) window.showToast('AI Signal', `${data.signal.action} ${data.signal.symbol} with ${data.signal.confidence}% confidence`, 'info');
                if (window.playSound) window.playSound('signal');
            }
            break;

        case 'notification':
            if (window.showToast) window.showToast(data.title, data.message, data.notificationType);
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
                if (data.trade.status === 'WIN') {
                    if (window.playSound) window.playSound('win');
                    if (window.sendNotification) window.sendNotification('Trade WIN!', `${data.trade.action} on ${data.trade.symbol}: +$${data.trade.profit?.toFixed(2)}`);
                } else if (data.trade.status === 'LOSS') {
                    if (window.playSound) window.playSound('loss');
                    if (window.sendNotification) window.sendNotification('Trade LOSS', `${data.trade.action} on ${data.trade.symbol}: -$${Math.abs(data.trade.profit || 0).toFixed(2)}`);
                }
                if (window.showToast) window.showToast(
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

        case 'ai_update':
            if (data.data && window.updateAIDisplay) {
                window.updateAIDisplay(data.data);
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
        } else if (type === 'execute') {
            oscillator.frequency.value = 523.25;
            gainNode.gain.value = 0.3;
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
            oscillator.stop(audioContext.currentTime + 0.3);
        }
    } catch (e) {
        console.log('Audio not supported');
    }
}

function sendNotification(title, body, tag = 'trade') {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, tag, icon: '/favicon.ico' });
    }
}

function updateAIDisplay(aiData) {
    const watchState = aiData.watch_state;
    if (!watchState) return;
    
    console.log(`🖥️ [Frontend] Updating display for symbol: ${watchState.symbol}, action: ${watchState.action}, confidence: ${watchState.confidence}`);
    
    const signalReasoning = document.getElementById('signalReasoning');
    if (signalReasoning && watchState.reason) {
        let displayText = '';
        if (watchState.status === 'ANALYZING_NEW_SYMBOL') {
            displayText = `🤖 AI: ${watchState.reason}`;
            signalReasoning.style.color = '#fbbf24';
        } else if (watchState.action === 'WAIT' || watchState.action === 'WAIT_BUY' || watchState.action === 'WAIT_SELL') {
            displayText = `🤖 AI on ${watchState.symbol}: ${watchState.reason} ${watchState.entry_condition ? `Entry when: ${watchState.entry_condition}` : ''}`;
            signalReasoning.style.color = '';
        } else if (watchState.is_new_setup) {
            displayText = `🔔 SETUP READY! ${watchState.action_display} on ${watchState.symbol} at $${watchState.entry_price?.toFixed(2)}. Click for details.`;
            signalReasoning.style.color = '#fbbf24';
            signalReasoning.style.fontWeight = 'bold';
        } else {
            displayText = `🤖 AI on ${watchState.symbol}: ${watchState.action_display} - ${watchState.reason}`;
            signalReasoning.style.color = '';
            signalReasoning.style.fontWeight = 'normal';
        }
        signalReasoning.innerHTML = displayText;
        signalReasoning.style.cursor = 'pointer';
        signalReasoning.style.textDecoration = 'underline';
        signalReasoning.onclick = () => {
            if (window.showAIReasonModal && window.currentDisplaySignal) {
                window.showAIReasonModal(window.currentDisplaySignal);
            }
        };
    }
    
    const signalAction = document.getElementById('signalAction');
    if (signalAction) {
        if (watchState.status === 'ANALYZING_NEW_SYMBOL') {
            signalAction.innerHTML = '⏳ ANALYZING';
            signalAction.className = 'text-2xl font-bold text-yellow-400';
        } else if (watchState.action === 'WAIT' || watchState.action === 'WAIT_BUY' || watchState.action === 'WAIT_SELL') {
            signalAction.innerHTML = '⏳ WAITING';
            signalAction.className = 'text-2xl font-bold text-yellow-400';
        } else if (watchState.action === 'BUY') {
            signalAction.innerHTML = '📈 BUY';
            signalAction.className = 'text-4xl font-black text-emerald-400';
        } else if (watchState.action === 'SELL') {
            signalAction.innerHTML = '🔻 SELL';
            signalAction.className = 'text-4xl font-black text-red-400';
        }
    }
    
    const signalConfidence = document.getElementById('signalConfidence');
    if (signalConfidence && watchState.confidence) {
        signalConfidence.innerHTML = `${watchState.confidence}%`;
    }
    
    const signalPattern = document.getElementById('signalPattern');
    if (signalPattern && watchState.pattern) {
        signalPattern.innerHTML = watchState.pattern;
    }
    
    const signalEntry = document.getElementById('signalEntry');
    if (signalEntry && watchState.entry_price) {
        signalEntry.innerHTML = `$${watchState.entry_price.toFixed(2)}`;
    }
    
    const signalTP = document.getElementById('signalTP');
    if (signalTP && watchState.take_profit) {
        signalTP.innerHTML = `$${watchState.take_profit.toFixed(2)}`;
    }
    
    const signalSL = document.getElementById('signalSL');
    if (signalSL && watchState.stop_loss) {
        signalSL.innerHTML = `$${watchState.stop_loss.toFixed(2)}`;
    }
    
    const rsiValue = document.getElementById('rsiValue');
    if (rsiValue && watchState.market_rsi) {
        rsiValue.innerHTML = watchState.market_rsi;
    }
    
    const supportLevel = document.getElementById('supportLevel');
    if (supportLevel && watchState.market_support) {
        supportLevel.innerHTML = `$${watchState.market_support.toFixed(2)}`;
    }
    
    const resistanceLevel = document.getElementById('resistanceLevel');
    if (resistanceLevel && watchState.market_resistance) {
        resistanceLevel.innerHTML = `$${watchState.market_resistance.toFixed(2)}`;
    }
    
    // CRITICAL FIX: Use watchState.symbol directly
    const displaySignal = {
        symbol: watchState.symbol || 'R_75',
        action: watchState.action === 'BUY' ? 'BUY' : (watchState.action === 'SELL' ? 'SELL' : 'WAIT'),
        confidence: watchState.confidence,
        pattern: watchState.pattern,
        entry_price: watchState.entry_price || watchState.market_price,
        take_profit: watchState.take_profit,
        stop_loss: watchState.stop_loss,
        reasoning: watchState.reason,
        simple_reason: watchState.reason,
        rsi: watchState.market_rsi,
        support: watchState.market_support,
        resistance: watchState.market_resistance,
        market_feeling: watchState.market_feeling,
        entry_time: watchState.estimated_entry_time === 'Now' ? new Date().toLocaleTimeString() : watchState.estimated_entry_time,
        exit_time: watchState.estimated_entry_time === 'Now' ? new Date(Date.now() + 5*60000).toLocaleTimeString() : '5 min after entry',
        is_waiting: watchState.action === 'WAIT' || watchState.action === 'WAIT_BUY' || watchState.action === 'WAIT_SELL',
        entry_condition: watchState.entry_condition,
        confidence_threshold: watchState.confidence_threshold || 55
    };
    
    console.log(`🖥️ [Frontend] Display signal created for symbol: ${displaySignal.symbol}`);
    
    window.currentDisplaySignal = displaySignal;
}

if (Notification.permission === 'default') {
    Notification.requestPermission();
}

window.connectWebSocket = connectWebSocket;
window.wsConnected = () => ws && ws.readyState === WebSocket.OPEN;
window.showToast = showToast;
window.playSound = playSound;
window.sendNotification = sendNotification;
window.updateAIDisplay = updateAIDisplay;
window.playBellSound = playBellSound;
