let currentSignal = null;
let isProcessingTrade = false;
let autoModeInterval = null;
let liveMonitoringInterval = null;
let activeTradeInterval = null;
let currentActiveTrade = null;
let recentTradesRefreshInterval = null;

const getSignalBtn = document.getElementById('getSignalBtn');
const yesBtn = document.getElementById('yesBtn');
const noBtn = document.getElementById('noBtn');
const stakeSlider = document.getElementById('stakeSlider');
const stakeValue = document.getElementById('stakeValue');
const pushSignalsToggle = document.getElementById('pushSignalsToggle');
const autoModeToggle = document.getElementById('autoModeToggle');
const jackpotToggle = document.getElementById('jackpotToggle');
const demoBtn = document.getElementById('demoBtn');
const realBtn = document.getElementById('realBtn');
const switchModeBtn = document.getElementById('switchModeBtn');
const symbolSelect = document.getElementById('symbolSelect');
const refreshTradesBtn = document.getElementById('refreshTradesBtn');

// Debug log helper
function uiLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🖱️ [${timestamp}] ${message}`);
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `🖱️ ${message}`, type, timestamp: new Date().toISOString() })
    }).catch(() => {});
}

function playSound(type) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        switch(type) {
            case 'signal':
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
                }, 200);
                break;
            case 'win':
                oscillator.frequency.value = 880;
                gainNode.gain.value = 0.4;
                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.8);
                oscillator.stop(audioContext.currentTime + 0.8);
                break;
            case 'loss':
                oscillator.frequency.value = 220;
                gainNode.gain.value = 0.3;
                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.8);
                oscillator.stop(audioContext.currentTime + 0.8);
                break;
            case 'execute':
                oscillator.frequency.value = 523.25;
                gainNode.gain.value = 0.3;
                oscillator.start();
                gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
                oscillator.stop(audioContext.currentTime + 0.3);
                break;
        }
    } catch(e) { console.log('Audio not supported'); }
}

function sendNotification(title, body, tag = 'trade') {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, tag, icon: '/favicon.ico' });
    }
}

function showAIReasonModal(signal) {
    uiLog(`Opening AI Reason Modal: ${signal.symbol} action=${signal.action}`);
    const modal = document.getElementById('aiReasonModal');
    if (!modal) return;

    const isAutoMode = autoModeToggle && autoModeToggle.checked;
    const isWaiting = signal.is_waiting;

    const modalAction = document.getElementById('modalAction');
    const modalSymbol = document.getElementById('modalSymbol');
    const modalPrice = document.getElementById('modalPrice');
    const modalMarketFeeling = document.getElementById('modalMarketFeeling');
    const modalPattern = document.getElementById('modalPattern');
    const modalEntryTime = document.getElementById('modalEntryTime');
    const modalExitTime = document.getElementById('modalExitTime');
    const modalTakeProfit = document.getElementById('modalTakeProfit');
    const modalStopLoss = document.getElementById('modalStopLoss');
    const modalReason = document.getElementById('modalReason');
    const modalConfidence = document.getElementById('modalConfidence');
    const modalConfidenceBar = document.getElementById('modalConfidenceBar');
    const buttonsDiv = document.getElementById('modalButtons');
    const autoModeNote = document.getElementById('autoModeNote');

    if (modalAction) {
        modalAction.innerHTML = signal.action === 'BUY' ? '📈 BUY (Price will go UP)' : (signal.action === 'SELL' ? '📉 SELL (Price will go DOWN)' : '⏳ WAITING FOR SETUP');
        modalAction.className = `text-2xl font-bold ${signal.action === 'BUY' ? 'text-emerald-400' : signal.action === 'SELL' ? 'text-red-400' : 'text-yellow-400'}`;
    }

    if (modalSymbol) modalSymbol.innerHTML = signal.symbol || 'R_75';
    if (modalPrice) modalPrice.innerHTML = `$${signal.entry_price?.toFixed(2) || signal.support?.toFixed(2) || '0.00'}`;
    if (modalMarketFeeling) modalMarketFeeling.innerHTML = signal.market_feeling || (signal.rsi > 65 ? 'Price is high' : (signal.rsi < 35 ? 'Price is low' : 'Market is stable'));
    if (modalPattern) modalPattern.innerHTML = signal.pattern || 'Pattern detected';
    if (modalEntryTime) modalEntryTime.innerHTML = signal.entry_time || 'Waiting...';
    if (modalExitTime) modalExitTime.innerHTML = signal.exit_time || '5 minutes after entry';

    const defaultStake = parseFloat(stakeSlider ? stakeSlider.value : 0.50);
    const profitDollars = (defaultStake * (signal.confidence / 100) * 1.0).toFixed(2);
    const lossDollars = defaultStake.toFixed(2);

    if (modalTakeProfit) modalTakeProfit.innerHTML = signal.take_profit ? `$${signal.take_profit.toFixed(2)} (make +$${profitDollars})` : 'Calculating...';
    if (modalStopLoss) modalStopLoss.innerHTML = signal.stop_loss ? `$${signal.stop_loss.toFixed(2)} (lose -$${lossDollars})` : 'Calculating...';
    if (modalReason) modalReason.innerHTML = signal.simple_reason || signal.reasoning || 'AI analysis complete';
    if (modalConfidence) modalConfidence.innerHTML = `${signal.confidence}%`;
    if (modalConfidenceBar) modalConfidenceBar.style.width = `${signal.confidence}%`;

    if (isWaiting || signal.action === 'WAIT') {
        if (buttonsDiv) buttonsDiv.classList.add('hidden');
        if (autoModeNote) {
            autoModeNote.innerHTML = `⏳ No active setup. AI watching ${signal.symbol || 'R_75'}... Need ${signal.confidence_threshold || 55}%+ confidence.`;
            autoModeNote.classList.remove('hidden');
        }
    } else if (isAutoMode) {
        if (buttonsDiv) buttonsDiv.classList.add('hidden');
        if (autoModeNote) {
            autoModeNote.innerHTML = '🤖 AUTO MODE ACTIVE - Trade will execute automatically when conditions are met';
            autoModeNote.classList.remove('hidden');
        }
    } else {
        if (buttonsDiv) buttonsDiv.classList.remove('hidden');
        if (autoModeNote) autoModeNote.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    window.currentModalSignal = signal;
}

function closeAIReasonModal() {
    const modal = document.getElementById('aiReasonModal');
    if (modal) modal.classList.add('hidden');
    window.currentModalSignal = null;
    uiLog('AI Reason Modal closed');
}

function acceptTradeFromModal() {
    if (window.currentModalSignal && !isProcessingTrade && window.currentModalSignal.action !== 'WAIT') {
        uiLog(`Accept trade from modal: ${window.currentModalSignal.action}`);
        closeAIReasonModal();
        currentSignal = window.currentModalSignal;
        executeTrade();
    }
}

window.showAIReasonModal = showAIReasonModal;
window.closeAIReasonModal = closeAIReasonModal;
window.acceptTradeFromModal = acceptTradeFromModal;

async function updateLockedBalance() {
    try {
        const result = await window.api.getLockedBalance();
        const profile = await window.api.getUserProfile();
        const totalBalance = profile.derivBalance?.balance || 0;
        const locked = result.locked || 0;
        const available = totalBalance - locked;

        const panel = document.getElementById('lockedBalancePanel');
        if (panel) {
            panel.classList.remove('hidden');
            const totalEl = document.getElementById('totalBalance');
            const lockedEl = document.getElementById('lockedBalance');
            const availableEl = document.getElementById('availableBalance');
            if (totalEl) totalEl.innerText = `$${totalBalance.toFixed(2)}`;
            if (lockedEl) lockedEl.innerText = `$${locked.toFixed(2)}`;
            if (availableEl) availableEl.innerText = `$${available.toFixed(2)}`;
        }
    } catch(e) { console.log('Locked balance error:', e); }
}

function showActiveTradePanel(contractId, entryPrice, action, stake, exitTimestamp) {
    currentActiveTrade = { contractId, entryPrice, action, stake, exitTimestamp };

    let panel = document.getElementById('activeTradePanel');
    if (!panel) {
        const container = document.querySelector('.lg\\:col-span-4');
        if (container) {
            container.insertAdjacentHTML('beforeend', `
                <div id="activeTradePanel" class="glass-card p-4 rounded-xl mt-5">
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="font-bold text-sm"><i class="fas fa-hourglass-half text-yellow-400 mr-2"></i>ACTIVE TRADE</h4>
                        <span id="tradeActionBadge" class="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">BUY</span>
                    </div>
                    <div class="text-center mb-3">
                        <p class="text-2xl font-bold" id="currentPrice">$${entryPrice.toFixed(2)}</p>
                        <p class="text-xs" id="tradePandL">P&L: $0.00</p>
                    </div>
                    <div class="mb-3">
                        <div class="flex justify-between text-xs mb-1">
                            <span>Time remaining</span>
                            <span id="tradeTimer" class="font-mono">5:00</span>
                        </div>
                        <div class="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                            <div id="tradeProgress" class="bg-indigo-500 h-full w-0 rounded-full transition-all"></div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div><span class="text-slate-500">Entry:</span> <span class="font-mono">$${entryPrice.toFixed(2)}</span></div>
                        <div><span class="text-slate-500">Exit:</span> <span id="exitTime" class="font-mono">${new Date(exitTimestamp).toLocaleTimeString()}</span></div>
                    </div>
                </div>
            `);
            panel = document.getElementById('activeTradePanel');
        }
    }

    if (panel) {
        panel.classList.remove('hidden');
        const badge = document.getElementById('tradeActionBadge');
        if (badge) {
            badge.innerHTML = action === 'BUY' ? 'BUY 📈' : 'SELL 📉';
            badge.className = `text-xs px-2 py-1 rounded-full ${action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`;
        }
    }

    if (activeTradeInterval) clearInterval(activeTradeInterval);

    activeTradeInterval = setInterval(async () => {
        const now = Date.now();
        const timeLeft = exitTimestamp - now;

        if (timeLeft <= 0) {
            clearInterval(activeTradeInterval);
            activeTradeInterval = null;
            if (panel) panel.classList.add('hidden');
            currentActiveTrade = null;
            await updateLockedBalance();
            return;
        }

        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        const percent = ((5 * 60000 - timeLeft) / (5 * 60000)) * 100;

        const timerEl = document.getElementById('tradeTimer');
        const progressEl = document.getElementById('tradeProgress');
        if (timerEl) timerEl.innerHTML = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        if (progressEl) progressEl.style.width = `${percent}%`;

        const livePriceEl = document.getElementById('livePrice');
        if (livePriceEl && currentActiveTrade) {
            const currentPrice = parseFloat(livePriceEl.innerText.replace('$', ''));
            const pnl = action === 'BUY' ? currentPrice - entryPrice : entryPrice - currentPrice;
            const pnlAmount = pnl * stake;
            const pnlEl = document.getElementById('tradePandL');
            if (pnlEl) {
                pnlEl.innerHTML = `P&L: ${pnlAmount >= 0 ? '+' : ''}$${pnlAmount.toFixed(2)}`;
                pnlEl.className = `text-xs ${pnlAmount >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
            }
        }
    }, 1000);
}

function displaySignal(signal) {
    currentSignal = signal;
    uiLog(`Signal displayed: ${signal.action} ${signal.confidence}% on ${signal.symbol}`);

    const signalAction = document.getElementById('signalAction');
    const signalConfidence = document.getElementById('signalConfidence');
    const signalPattern = document.getElementById('signalPattern');
    const signalEntry = document.getElementById('signalEntry');
    const signalTP = document.getElementById('signalTP');
    const signalSL = document.getElementById('signalSL');
    const signalReasoning = document.getElementById('signalReasoning');
    const supportLevel = document.getElementById('supportLevel');
    const resistanceLevel = document.getElementById('resistanceLevel');
    const rsiValue = document.getElementById('rsiValue');
    const signalExit = document.getElementById('signalExit');

    if (signalAction) {
        signalAction.innerHTML = signal.action === 'BUY' ? '📈 BUY' : '🔻 SELL';
        signalAction.className = `text-4xl font-black ${signal.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`;
    }
    if (signalConfidence) signalConfidence.innerHTML = `${signal.confidence}%`;
    if (signalPattern) signalPattern.innerHTML = signal.pattern || '—';
    if (signalEntry) signalEntry.innerHTML = `$${signal.entry_price.toFixed(2)}`;
    if (signalTP) signalTP.innerHTML = `$${signal.take_profit?.toFixed(2) || '—'}`;
    if (signalSL) signalSL.innerHTML = `$${signal.stop_loss?.toFixed(2) || '—'}`;
    if (signalReasoning) {
        signalReasoning.innerHTML = signal.simple_reason || signal.reasoning || 'AI analysis complete';
        signalReasoning.style.cursor = 'pointer';
        signalReasoning.style.textDecoration = 'underline';
        signalReasoning.onclick = () => window.showAIReasonModal(signal);
    }
    if (supportLevel && signal.support) supportLevel.innerHTML = `$${signal.support.toFixed(2)}`;
    if (resistanceLevel && signal.resistance) resistanceLevel.innerHTML = `$${signal.resistance.toFixed(2)}`;
    if (rsiValue && signal.rsi) rsiValue.innerHTML = signal.rsi;
    if (signalExit && signal.exit_time) signalExit.innerHTML = signal.exit_time;

    if (window.updateConfidenceBars) window.updateConfidenceBars(signal.confidence);

    if (yesBtn) {
        yesBtn.disabled = false;
        yesBtn.classList.remove('cursor-not-allowed', 'bg-emerald-500/50');
        yesBtn.classList.add('bg-emerald-500', 'hover:bg-emerald-600');
        yesBtn.innerHTML = '💰 BUY';
    }
    if (noBtn) {
        noBtn.disabled = false;
        noBtn.classList.remove('cursor-not-allowed');
        noBtn.classList.add('cursor-pointer');
        noBtn.innerHTML = '🔻 SELL';
    }

    playSound('signal');
    sendNotification('New AI Signal', `${signal.action} ${signal.symbol || 'signal'} with ${signal.confidence}% confidence`);

    if (autoModeToggle && autoModeToggle.checked) {
        uiLog('Auto Mode: Auto-executing trade from signal');
        setTimeout(() => executeTrade(), 2000);
    }
}

function clearSignal() {
    currentSignal = null;
    uiLog('Signal cleared');

    const signalAction = document.getElementById('signalAction');
    const signalConfidence = document.getElementById('signalConfidence');
    const signalPattern = document.getElementById('signalPattern');
    const signalEntry = document.getElementById('signalEntry');
    const signalTP = document.getElementById('signalTP');
    const signalSL = document.getElementById('signalSL');
    const signalReasoning = document.getElementById('signalReasoning');
    const signalExit = document.getElementById('signalExit');

    if (signalAction) signalAction.innerHTML = '—';
    if (signalConfidence) signalConfidence.innerHTML = '0%';
    if (signalPattern) signalPattern.innerHTML = '—';
    if (signalEntry) signalEntry.innerHTML = '$0.00';
    if (signalTP) signalTP.innerHTML = '$0.00';
    if (signalSL) signalSL.innerHTML = '$0.00';
    if (signalReasoning) {
        signalReasoning.innerHTML = 'Click AI REASONING to view market analysis';
        signalReasoning.style.cursor = 'pointer';
        signalReasoning.style.textDecoration = 'underline';
    }
    if (signalExit) signalExit.innerHTML = '5 min';

    if (window.updateConfidenceBars) window.updateConfidenceBars(0);

    if (yesBtn) {
        yesBtn.disabled = false;
        yesBtn.classList.remove('cursor-not-allowed', 'bg-emerald-500/50');
        yesBtn.classList.add('bg-emerald-500', 'hover:bg-emerald-600');
        yesBtn.innerHTML = '💰 BUY';
    }
    if (noBtn) {
        noBtn.disabled = false;
        noBtn.classList.remove('cursor-not-allowed');
        noBtn.classList.add('bg-red-500/20', 'hover:bg-red-500/30', 'cursor-pointer');
        noBtn.innerHTML = '🔻 SELL';
    }
}

async function executeTrade() {
    if (!currentSignal || isProcessingTrade) return;

    if (currentSignal.action === 'WAIT') {
        if (window.showToast) window.showToast('No Setup', 'AI is waiting for market conditions. No active trade setup.', 'info');
        return;
    }

    uiLog(`Executing trade: ${currentSignal.action} on ${symbolSelect?.value || 'R_75'}`);
    isProcessingTrade = true;
    if (yesBtn) {
        yesBtn.disabled = true;
        yesBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>EXECUTING...';
    }

    let stake = stakeSlider ? parseFloat(stakeSlider.value) : 0.50;
    if (stake < 0.50) {
        stake = 0.50;
        if (stakeSlider) stakeSlider.value = 0.50;
        if (stakeValue) stakeValue.innerText = '$0.50';
    }

    try {
        const result = await window.api.executeTrade({
            symbol: symbolSelect ? symbolSelect.value : 'R_75',
            action: currentSignal.action,
            stake: stake,
            entry_price: currentSignal.entry_price,
            take_profit: currentSignal.take_profit,
            stop_loss: currentSignal.stop_loss,
            confidence: currentSignal.confidence,
            pattern: currentSignal.pattern,
            reasoning: currentSignal.reasoning,
            rsi: currentSignal.rsi,
            macd: currentSignal.macd,
            is_auto: autoModeToggle && autoModeToggle.checked ? 1 : 0
        });

        if (result.success) {
            uiLog(`Trade executed successfully: ${result.contract_id}`);
            playSound('execute');
            sendNotification('Trade Executed', `${currentSignal.action} on ${symbolSelect?.value}`);
            if (window.showToast) window.showToast('Trade Executed', `Contract ID: ${String(result.contract_id).substring(0, 8)}...`, 'success');

            const exitTime = Date.now() + (5 * 60 * 1000);
            showActiveTradePanel(result.contract_id, currentSignal.entry_price, currentSignal.action, stake, exitTime);

            clearSignal();
            await loadRecentTrades();
            await refreshUserData();
            await updateLockedBalance();
        } else {
            uiLog(`Trade failed: ${result.error}`, 'error');
            if (window.showToast) window.showToast('Trade Failed', result.error || 'Unknown error', 'error');
        }
    } catch (error) {
        uiLog(`Trade error: ${error.message}`, 'error');
        if (window.showToast) window.showToast('Trade Failed', error.message, 'error');
    } finally {
        isProcessingTrade = false;
        if (yesBtn) {
            yesBtn.disabled = false;
            yesBtn.innerHTML = '💰 BUY';
        }
    }
}

function saveSymbolPreference(symbol) {
    const token = localStorage.getItem('monix_token') || '';
    if (!token || !symbol) return;

    fetch('/api/user/symbol', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ symbol: symbol })
    }).catch(() => {});
}

async function loadSavedSymbol() {
    try {
        const token = localStorage.getItem('monix_token');
        if (!token) return;

        const response = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.user && data.user.default_symbol) {
            const savedSymbol = data.user.default_symbol;
            if (symbolSelect) {
                symbolSelect.value = savedSymbol;
                console.log('💾 Frontend loaded saved symbol:', savedSymbol);
            }
        }
    } catch (e) {
        console.error('Failed to load saved symbol:', e);
    }
}

async function changeSymbol(symbol) {
    uiLog(`Changing symbol to: ${symbol}`);
    try {
        const response = await fetch('/api/ai/symbol', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('monix_token')}`
            },
            body: JSON.stringify({ symbol: symbol })
        });
        const data = await response.json();
        if (data.success) {
            uiLog(`Symbol changed successfully: ${symbol}`);
            saveSymbolPreference(symbol);
            if (window.showToast) window.showToast('Symbol Changed', `AI now analyzing ${symbol}`, 'success');
            setTimeout(() => fetchAIAnalysis(), 1000);
        } else {
            uiLog(`Symbol change failed: ${data.error}`, 'error');
        }
    } catch (error) {
        uiLog(`Symbol change error: ${error.message}`, 'error');
    }
}

async function fetchAIAnalysis() {
    if (!getSignalBtn) return;

    const symbol = symbolSelect ? symbolSelect.value : 'R_75';
    uiLog(`Fetching AI analysis for: ${symbol}`);
    getSignalBtn.disabled = true;
    getSignalBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>FETCHING ANALYSIS...';

    try {
        const result = await window.api.generateSignal(symbol);
        if (result.success && result.signal) {
            uiLog(`AI analysis received for: ${result.signal.symbol}`);
            showAIReasonModal(result.signal);
        } else if (result.success === false) {
            uiLog(`AI analysis: ${result.message}`, 'info');
            if (window.showToast) window.showToast('AI Analysis', result.message, 'info');
        }
    } catch (error) {
        uiLog(`AI analysis error: ${error.message}`, 'error');
        if (window.showToast) window.showToast('Error', error.message, 'error');
    } finally {
        getSignalBtn.disabled = false;
        getSignalBtn.innerHTML = '🧠 AI REASONING';
    }
}

function startLiveMonitoring() {
    uiLog('Live monitoring started (30s interval)');
    if (liveMonitoringInterval) clearInterval(liveMonitoringInterval);
    liveMonitoringInterval = setInterval(() => {
        fetchAIAnalysis();
    }, 30000);
}

async function switchMode(mode) {
    uiLog(`Switching mode to: ${mode}`);
    try {
        const result = await window.api.switchMode(mode);
        if (result.success) {
            if (mode === 'demo') {
                if (demoBtn) demoBtn.className = 'px-3 py-1 rounded-lg text-xs bg-emerald-500 text-white shadow-lg';
                if (realBtn) realBtn.className = 'px-3 py-1 rounded-lg text-xs bg-slate-700 text-slate-400';
            } else {
                if (realBtn) realBtn.className = 'px-3 py-1 rounded-lg text-xs bg-emerald-500 text-white shadow-lg';
                if (demoBtn) demoBtn.className = 'px-3 py-1 rounded-lg text-xs bg-slate-700 text-slate-400';
            }
            await refreshUserData();
            await updateLockedBalance();
            if (window.showToast) window.showToast(`Switched to ${mode.toUpperCase()} mode`, result.message, 'success');
        }
    } catch (error) {
        uiLog(`Mode switch error: ${error.message}`, 'error');
        if (window.showToast) window.showToast('Error', error.message, 'error');
    }
}

async function updateSetting(setting, value) {
    uiLog(`Updating setting: ${setting} = ${value}`);
    try {
        await window.api.updateUserSettings({ [setting]: value });
        if (setting === 'auto_mode' && value) {
            startLiveMonitoring();
            setTimeout(() => fetchAIAnalysis(), 2000);
        } else if (setting === 'auto_mode' && !value) {
            if (liveMonitoringInterval) clearInterval(liveMonitoringInterval);
        }
    } catch (error) {
        uiLog(`Setting update error: ${error.message}`, 'error');
    }
}

// ============================================================
// PENDING ORDERS DISPLAY
// ============================================================
let pendingOrdersInterval = null;

function updatePendingOrdersDisplay(pendingOrders) {
    const container = document.getElementById('pendingOrdersContainer');
    const countBadge = document.getElementById('pendingOrdersCount');
    if (!container) return;

    if (!pendingOrders || pendingOrders.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 text-center py-3">No pending limit orders</p>';
        if (countBadge) countBadge.innerText = '(0)';
        return;
    }

    if (countBadge) countBadge.innerText = `(${pendingOrders.length})`;

    const currentPrice = parseFloat(document.getElementById('livePrice')?.innerText?.replace('$', '') || '0');

    container.innerHTML = pendingOrders.map(order => {
        const distance = currentPrice > 0 ? Math.abs(currentPrice - order.entryPrice) : 0;
        const distancePercent = currentPrice > 0 ? ((distance / order.entryPrice) * 100).toFixed(2) : '0';
        const timeLeft = order.expires ? Math.max(0, Math.floor((order.expires - Date.now()) / 60000)) : 45;
        const isApproaching = parseFloat(distancePercent) < 0.3;
        const borderColor = isApproaching ? 'border-yellow-500' : 'border-slate-600';
        const bgColor = isApproaching ? 'bg-yellow-500/10' : '';

        return `
            <div class="p-3 rounded-lg border ${borderColor} ${bgColor} mb-2 hover:border-indigo-400 transition">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-sm ${order.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}">${order.action} LIMIT</span>
                    <span class="text-xs text-slate-500">⏰ ${timeLeft}min left</span>
                </div>
                <div class="flex justify-between text-xs mb-1">
                    <span class="text-slate-400">Entry: <span class="text-white font-mono">$${order.entryPrice?.toFixed(2) || '0.00'}</span></span>
                    <span class="text-slate-400">Stake: <span class="text-white">$${order.stake?.toFixed(2) || '2.00'}</span></span>
                </div>
                <div class="flex justify-between text-xs mb-1">
                    <span class="text-slate-400">Current: <span class="text-white font-mono">$${currentPrice.toFixed(2)}</span></span>
                    <span class="${isApproaching ? 'text-yellow-400 font-bold' : 'text-slate-500'}">${distancePercent}% away</span>
                </div>
                <div class="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
                    <div class="bg-indigo-500 h-full rounded-full transition-all" style="width: ${Math.min(100, Math.max(0, 100 - (parseFloat(distancePercent) * 200)))}%"></div>
                </div>
                <p class="text-xs text-slate-500 mt-1">🎯 ${order.reason || 'Waiting for price level'}</p>
                <p class="text-xs text-slate-600 mt-1">Confidence: ${order.confidence || 0}% | Pattern: ${order.pattern || 'N/A'}</p>
            </div>
        `;
    }).join('');
}

function startPendingOrdersPolling() {
    if (pendingOrdersInterval) clearInterval(pendingOrdersInterval);
    pendingOrdersInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/ai/analysis', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('monix_token')}` }
            });
            const data = await response.json();
            if (data.watch_state?.pending_orders) {
                updatePendingOrdersDisplay(data.watch_state.pending_orders);
            }
            if (data.pending_orders) {
                updatePendingOrdersDisplay(data.pending_orders);
            }
        } catch(e) {}
    }, 5000);
}

// ============================================================
// COPY & DELETE FUNCTIONS
// ============================================================
function copyTradeToClipboard(trade) {
    const text = `${trade.action} ${trade.symbol} @ $${trade.entry_price?.toFixed(2)} | Exit: $${trade.exit_price?.toFixed(2) || 'PENDING'} | ${trade.profit >= 0 ? '+' : ''}$${trade.profit?.toFixed(2)} | ${trade.status} | Pattern: ${trade.pattern || 'N/A'} | RSI: ${trade.rsi || 'N/A'} | ${new Date(trade.executed_at).toLocaleString()}`;
    navigator.clipboard.writeText(text).then(() => {
        uiLog(`Copied trade: ${trade.action} ${trade.symbol}`);
        if (window.showToast) window.showToast('Copied!', 'Trade details copied to clipboard', 'success');
    }).catch(() => {
        if (window.showToast) window.showToast('Copy Failed', 'Could not copy to clipboard', 'error');
    });
}

async function copyAllTrades() {
    const trades = await window.api.getTradeHistory(100);
    if (!trades || trades.length === 0) {
        if (window.showToast) window.showToast('No Trades', 'No trades to copy', 'info');
        return;
    }
    let text = 'MONIX TRADING PLATFORM - TRADE HISTORY\n';
    text += '═'.repeat(80) + '\n';
    text += 'TIME'.padEnd(12) + 'SYMBOL'.padEnd(8) + 'ACTION'.padEnd(8) + 'ENTRY'.padEnd(14) + 'EXIT'.padEnd(14) + 'PROFIT'.padEnd(12) + 'STATUS'.padEnd(8) + 'PATTERN\n';
    text += '─'.repeat(80) + '\n';
    trades.forEach(t => {
        text += new Date(t.executed_at).toLocaleTimeString().padEnd(12);
        text += (t.symbol || '').padEnd(8);
        text += (t.action || '').padEnd(8);
        text += `$${t.entry_price?.toFixed(2) || '--'}`.padEnd(14);
        text += `$${t.exit_price?.toFixed(2) || '--'}`.padEnd(14);
        text += `${t.profit >= 0 ? '+' : ''}$${t.profit?.toFixed(2) || '0.00'}`.padEnd(12);
        text += (t.status || 'PENDING').padEnd(8);
        text += (t.pattern || 'N/A');
        text += '\n';
    });
    text += '─'.repeat(80) + '\n';
    const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const wins = trades.filter(t => t.status === 'WIN').length;
    text += `Total: ${trades.length} trades | ${wins} wins | Net: ${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}\n`;
    text += '═'.repeat(80) + '\n';
    navigator.clipboard.writeText(text).then(() => {
        uiLog(`Copied all ${trades.length} trades`);
        if (window.showToast) window.showToast('Copied!', `${trades.length} trades copied to clipboard`, 'success');
    }).catch(() => {
        if (window.showToast) window.showToast('Copy Failed', 'Could not copy to clipboard', 'error');
    });
}

// SOFT DELETE - Hide trades from UI only, keep for AI learning
async function deleteAllTrades() {
    if (!confirm('⚠️ This will REMOVE trades from YOUR VIEW only.\n\nYour trading history will still be used by AI for learning and pattern recognition.\n\nAre you sure you want to hide all trades from the UI?')) {
        return;
    }
    try {
        const result = await window.api.hideTradeHistory();
        if (result.success) {
            uiLog(`Hidden ${result.hiddenCount} trades from UI (kept for AI learning)`);
            if (window.showToast) window.showToast('History Hidden', `Trades hidden from view. AI can still learn from them.`, 'success');
            await loadRecentTrades();
            if (typeof loadFullHistory === 'function') await loadFullHistory();
            if (typeof loadPerformanceStats === 'function') await loadPerformanceStats();
            if (typeof refreshUserData === 'function') await refreshUserData();
        } else {
            throw new Error(result.error || 'Hide failed');
        }
    } catch (error) {
        uiLog(`Hide trades error: ${error.message}`, 'error');
        if (window.showToast) window.showToast('Hide Failed', error.message, 'error');
    }
}

window.copyTradeById = async function(tradeId) {
    const trades = await window.api.getTradeHistory(50);
    const trade = trades.find(t => t._id === tradeId);
    if (trade) copyTradeToClipboard(trade);
};

// ============================================================
// LOAD RECENT TRADES (with collapsible state preserved)
// ============================================================
async function loadRecentTrades() {
    try {
        const tbody = document.getElementById('recentTradesBody');
        const countBadge = document.getElementById('recentTradesCount');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500">Loading...</td></tr>';

        const trades = await window.api.getTradeHistory(20);

        if (!trades || trades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-500">No trades yet</td></tr>';
            if (countBadge) countBadge.innerText = '(0)';
            return;
        }

        if (countBadge) countBadge.innerText = `(${trades.length})`;

        tbody.innerHTML = trades.map(trade => `
            <tr class="hover:bg-slate-700/20">
                <td class="p-4 text-xs">${new Date(trade.executed_at).toLocaleTimeString()}</td>
                <td class="p-4 font-bold">${trade.symbol}</td>
                <td class="p-4 ${trade.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}">${trade.action}</td>
                <td class="p-4">$${trade.entry_price?.toFixed(2)}</td>
                <td class="p-4">$${trade.exit_price?.toFixed(2) || '--'}</td>
                <td class="p-4 text-right ${trade.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}">${trade.profit >= 0 ? '+' : ''}$${trade.profit?.toFixed(2)}</td>
                <td class="p-4 text-center"><span class="px-2 py-1 rounded-full text-[10px] ${trade.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-500' : trade.status === 'LOSS' ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-500'}">${trade.status || 'PENDING'}</span></td>
                <td class="p-4 text-center">
                    <button onclick="window.copyTradeById('${trade._id}')" class="text-slate-400 hover:text-white transition text-lg" title="Copy trade details">📋</button>
                </td>
            </tr>
        `).join('');
        uiLog(`Recent trades: Loaded ${trades.length} trades`);
        
        // Re-apply collapsible state after DOM update
        if (typeof initCollapsibles === 'function') initCollapsibles();
    } catch (error) {
        uiLog(`Recent trades error: ${error.message}`, 'error');
        const tbody = document.getElementById('recentTradesBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-red-400">Error loading trades</td></tr>';
    }
}

async function refreshUserData() {
    try {
        const profile = await window.api.getUserProfile();
        if (profile && profile.user) {
            const welcomeName = document.getElementById('welcomeName');
            const userName = document.getElementById('userName');
            const userEmail = document.getElementById('userEmail');
            if (welcomeName) welcomeName.innerHTML = profile.user.username;
            if (userName) userName.innerHTML = profile.user.username;
            if (userEmail) userEmail.innerHTML = profile.user.email;

            const balanceEl = document.getElementById('balanceAmount');
            if (balanceEl && profile.derivBalance?.authorized) {
                balanceEl.innerHTML = `$${profile.derivBalance.balance.toFixed(2)}`;
            }

            const winRateEl = document.getElementById('winRateDisplay');
            if (winRateEl && profile.stats) winRateEl.innerHTML = `Win Rate: ${profile.stats.win_rate || 0}%`;

            const voucherCode = document.getElementById('voucherCode');
            const tradesRemaining = document.getElementById('tradesRemaining');
            if (voucherCode && profile.user.voucher_code) voucherCode.innerHTML = profile.user.voucher_code;
            if (tradesRemaining) tradesRemaining.innerHTML = `Trades Left: ${profile.user.trades_remaining || 0}`;

            if (pushSignalsToggle) pushSignalsToggle.checked = profile.user.push_signals === 1;
            if (autoModeToggle) autoModeToggle.checked = profile.user.auto_mode === 1;
            if (jackpotToggle) jackpotToggle.checked = profile.user.jackpot_mode === 1;
            if (stakeSlider && profile.user.base_stake) stakeSlider.value = Math.max(profile.user.base_stake, 0.50);
            if (stakeValue) stakeValue.innerText = `$${Math.max(profile.user.base_stake || 0.50, 0.50).toFixed(2)}`;

            const adminLink = document.getElementById('adminLink');
            if (adminLink && profile.user.is_admin) adminLink.classList.remove('hidden');

            // Fix DEMO/REAL button styling based on actual mode
            if (profile.user.is_demo === true || profile.user.is_demo === 1) {
                if (demoBtn) demoBtn.className = 'px-3 py-1 rounded-lg text-xs bg-emerald-500 text-white shadow-lg';
                if (realBtn) realBtn.className = 'px-3 py-1 rounded-lg text-xs bg-slate-700 text-slate-400';
                if (window.marketStatus) {
                    const marketStatus = document.getElementById('marketStatus');
                    if (marketStatus) marketStatus.innerHTML = 'DEMO ACTIVE';
                }
            } else {
                if (realBtn) realBtn.className = 'px-3 py-1 rounded-lg text-xs bg-emerald-500 text-white shadow-lg';
                if (demoBtn) demoBtn.className = 'px-3 py-1 rounded-lg text-xs bg-slate-700 text-slate-400';
                if (window.marketStatus) {
                    const marketStatus = document.getElementById('marketStatus');
                    if (marketStatus) marketStatus.innerHTML = 'REAL ACTIVE';
                }
            }

            await updateLockedBalance();
        }
    } catch (error) {
        uiLog(`Refresh user data error: ${error.message}`, 'error');
    }
}

function addTradeToTable(trade) {
    const tbody = document.getElementById('recentTradesBody');
    if (!tbody) return;

    const newRow = document.createElement('tr');
    newRow.className = 'hover:bg-slate-700/20';
    newRow.innerHTML = `
        <td class="p-4 text-xs">${new Date().toLocaleTimeString()}</td>
        <td class="p-4 font-bold">${trade.symbol}</td>
        <td class="p-4 ${trade.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}">${trade.action}</td>
        <td class="p-4">$${trade.entry_price?.toFixed(2)}</td>
        <td class="p-4">${trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '--'}</td>
        <td class="p-4 text-right ${trade.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}">${trade.profit ? (trade.profit >= 0 ? '+' : '') + trade.profit.toFixed(2) : '--'}</td>
        <td class="p-4 text-center"><span class="px-2 py-1 rounded-full text-[10px] ${trade.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-500' : trade.status === 'LOSS' ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-500'}">${trade.status || 'PENDING'}</span></td>
        <td class="p-4 text-center"><button onclick="window.copyTradeById('${trade._id || trade.id}')" class="text-slate-400 hover:text-white transition text-lg" title="Copy trade details">📋</button></td>
    `;

    tbody.insertBefore(newRow, tbody.firstChild);
    if (tbody.children.length > 20) tbody.removeChild(tbody.lastChild);

    uiLog(`Trade added to table: ${trade.action} ${trade.status}`);

    if (trade.status === 'WIN') {
        playSound('win');
        sendNotification('Trade WIN!', `${trade.action} on ${trade.symbol}: +$${trade.profit?.toFixed(2)}`);
    } else if (trade.status === 'LOSS') {
        playSound('loss');
        sendNotification('Trade LOSS', `${trade.action} on ${trade.symbol}: -$${Math.abs(trade.profit || 0).toFixed(2)}`);
    }
}

function updateBalanceInUI(balance) {
    const balanceEl = document.getElementById('balanceAmount');
    if (balanceEl) balanceEl.innerHTML = `$${balance.toFixed(2)}`;
}

// ============================================================
// FIXED: updateAIDisplay - Live AI Signal Panel Updates
// ============================================================
function updateAIDisplay(aiData) {
    console.log('🖥️ [UI] updateAIDisplay called with:', aiData);

    const watchState = aiData.watch_state || aiData;
    if (!watchState) {
        console.warn('⚠️ [UI] No watch_state in aiData');
        return;
    }

    console.log(`🖥️ [UI] Updating: action=${watchState.action}, confidence=${watchState.confidence}, rsi=${watchState.market_rsi}, symbol=${watchState.symbol}`);

    // Update Signal Action
    const signalAction = document.getElementById('signalAction');
    if (signalAction) {
        if (watchState.action === 'BUY') {
            signalAction.innerHTML = '📈 BUY';
            signalAction.className = 'text-4xl font-black text-emerald-400';
        } else if (watchState.action === 'SELL') {
            signalAction.innerHTML = '🔻 SELL';
            signalAction.className = 'text-4xl font-black text-red-400';
        } else {
            signalAction.innerHTML = '⏳ WAITING';
            signalAction.className = 'text-2xl font-bold text-yellow-400';
        }
    }

    // Update Confidence
    const signalConfidence = document.getElementById('signalConfidence');
    if (signalConfidence && watchState.confidence !== undefined) {
        signalConfidence.innerHTML = `${watchState.confidence}%`;
    }

    // Update Pattern
    const signalPattern = document.getElementById('signalPattern');
    if (signalPattern && watchState.pattern) {
        signalPattern.innerHTML = watchState.pattern;
    } else if (signalPattern) {
        signalPattern.innerHTML = '—';
    }

    // Update Entry Price
    const signalEntry = document.getElementById('signalEntry');
    if (signalEntry && watchState.entry_price) {
        signalEntry.innerHTML = `$${watchState.entry_price.toFixed(2)}`;
    } else if (signalEntry && watchState.market_price) {
        signalEntry.innerHTML = `$${watchState.market_price.toFixed(2)}`;
    }

    // Update Take Profit
    const signalTP = document.getElementById('signalTP');
    if (signalTP && watchState.take_profit) {
        signalTP.innerHTML = `$${watchState.take_profit.toFixed(2)}`;
    }

    // Update Stop Loss
    const signalSL = document.getElementById('signalSL');
    if (signalSL && watchState.stop_loss) {
        signalSL.innerHTML = `$${watchState.stop_loss.toFixed(2)}`;
    }

    // Update RSI
    const rsiValue = document.getElementById('rsiValue');
    if (rsiValue && watchState.market_rsi !== undefined) {
        rsiValue.innerHTML = watchState.market_rsi;
    }

    // Update Support
    const supportLevel = document.getElementById('supportLevel');
    if (supportLevel && watchState.market_support !== undefined) {
        supportLevel.innerHTML = `$${watchState.market_support.toFixed(2)}`;
    } else if (supportLevel) {
        supportLevel.innerHTML = '$0.00';
    }

    // Update Resistance
    const resistanceLevel = document.getElementById('resistanceLevel');
    if (resistanceLevel && watchState.market_resistance !== undefined) {
        resistanceLevel.innerHTML = `$${watchState.market_resistance.toFixed(2)}`;
    } else if (resistanceLevel) {
        resistanceLevel.innerHTML = '$0.00';
    }

    // Update AI Reason text
    const signalReasoning = document.getElementById('signalReasoning');
    if (signalReasoning && watchState.reason) {
        signalReasoning.innerHTML = watchState.reason;
        signalReasoning.style.cursor = 'pointer';
        signalReasoning.style.textDecoration = 'underline';
        signalReasoning.onclick = () => {
            if (window.showAIReasonModal) {
                window.showAIReasonModal({
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
                    exit_time: '5 min after entry'
                });
            }
        };
    }

    // Update Exit Time
    const signalExit = document.getElementById('signalExit');
    if (signalExit && watchState.estimated_entry_time === 'Now') {
        signalExit.innerHTML = new Date(Date.now() + 5*60000).toLocaleTimeString();
    } else if (signalExit && watchState.exit_time) {
        signalExit.innerHTML = watchState.exit_time;
    }

    // Store current signal for modal
    window.currentDisplaySignal = watchState;

    // Update confidence bars
    if (window.updateConfidenceBars && watchState.confidence) {
        window.updateConfidenceBars(watchState.confidence);
    }

    // Update pending orders count and display (from root or watch_state)
    const pendingCount = document.getElementById('pendingOrdersCount');
    const pendingOrders = aiData.pending_orders || watchState.pending_orders;
    if (pendingCount && pendingOrders) {
        pendingCount.innerText = `(${pendingOrders.length})`;
        if (window.updatePendingOrdersDisplay) {
            window.updatePendingOrdersDisplay(pendingOrders);
        }
    }

    console.log(`✅ [UI] Display updated for ${watchState.symbol}`);
}

// ============================================================
// Collapsible Drawer - Stays Open
// ============================================================
function initCollapsibles() {
    const pendingState = localStorage.getItem('pendingOrdersOpen');
    const recentState = localStorage.getItem('recentTradesOpen');

    const pendingContent = document.getElementById('pendingOrdersContent');
    const recentContent = document.getElementById('recentTradesContent');
    const pendingIcon = document.getElementById('pendingOrdersIcon');
    const recentIcon = document.getElementById('recentTradesIcon');

    if (pendingContent && pendingIcon) {
        if (pendingState === 'closed') {
            pendingContent.style.display = 'none';
            pendingIcon.style.transform = 'rotate(0deg)';
        } else {
            pendingContent.style.display = 'block';
            pendingIcon.style.transform = 'rotate(180deg)';
        }
    }

    if (recentContent && recentIcon) {
        if (recentState === 'closed') {
            recentContent.style.display = 'none';
            recentIcon.style.transform = 'rotate(0deg)';
        } else {
            recentContent.style.display = 'block';
            recentIcon.style.transform = 'rotate(180deg)';
        }
    }
}

window.toggleCollapsible = function(contentId, iconId) {
    const content = document.getElementById(contentId);
    const icon = document.getElementById(iconId);
    if (!content || !icon) return;

    const isHidden = content.style.display === 'none' || !content.style.display;
    content.style.display = isHidden ? 'block' : 'none';
    icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';

    if (contentId === 'pendingOrdersContent') {
        localStorage.setItem('pendingOrdersOpen', isHidden ? 'open' : 'closed');
    }
    if (contentId === 'recentTradesContent') {
        localStorage.setItem('recentTradesOpen', isHidden ? 'open' : 'closed');
    }
};

// ============================================================
// INIT TRADING
// ============================================================
function initTrading() {
    uiLog('Initializing trading module v6.0 Professional...');

    loadSavedSymbol();
    initCollapsibles();

    if (stakeSlider) {
        stakeSlider.min = 0.50;
        stakeSlider.max = 20;
        stakeSlider.step = 0.50;
        stakeSlider.value = 2.00;
        if (stakeValue) stakeValue.innerText = '$2.00';
        stakeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value).toFixed(2);
            if (stakeValue) stakeValue.innerText = `$${val}`;
        });
    }

    if (getSignalBtn) {
        getSignalBtn.innerHTML = '🧠 AI REASONING';
        getSignalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            uiLog('Button clicked: AI REASONING');
            fetchAIAnalysis();
        });
    }

    if (yesBtn) {
        yesBtn.innerHTML = '💰 BUY';
        yesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            uiLog('Button clicked: BUY');
            if (currentSignal && !isProcessingTrade && currentSignal.action !== 'WAIT') {
                executeTrade();
            } else if (currentSignal && currentSignal.action === 'WAIT') {
                if (window.showToast) window.showToast('No Setup', 'AI is waiting for market conditions. No active trade setup.', 'info');
            }
        });
    }
    if (noBtn) {
        noBtn.innerHTML = '🔻 SELL';
        noBtn.addEventListener('click', (e) => {
            e.preventDefault();
            uiLog('Button clicked: DECLINE/SELL');
            clearSignal();
            if (window.showToast) window.showToast('Signal Declined', 'You declined this trade', 'info');
        });
    }

    if (demoBtn) demoBtn.addEventListener('click', (e) => { e.preventDefault(); uiLog('Button clicked: DEMO'); switchMode('demo'); });
    if (realBtn) realBtn.addEventListener('click', (e) => { e.preventDefault(); uiLog('Button clicked: REAL'); switchMode('real'); });
    if (switchModeBtn) switchModeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        uiLog('Button clicked: SWITCH MODE');
        const isDemo = demoBtn && demoBtn.classList.contains('bg-emerald-500');
        switchMode(isDemo ? 'real' : 'demo');
    });

    // Refresh button removed - no event listener needed
    if (refreshTradesBtn) refreshTradesBtn.addEventListener('click', (e) => { e.preventDefault(); uiLog('Button clicked: REFRESH TRADES'); loadRecentTrades(); });

    if (symbolSelect) {
        symbolSelect.addEventListener('change', () => {
            const newSymbol = symbolSelect.value;
            uiLog(`Symbol select changed: ${newSymbol}`);
            clearSignal();
            saveSymbolPreference(newSymbol);
            if (window.showToast) window.showToast('Symbol Changed', `AI analyzing ${newSymbol}...`, 'info');
            changeSymbol(newSymbol);
        });
    }

    if (pushSignalsToggle) pushSignalsToggle.addEventListener('change', (e) => { uiLog(`Toggle: push_signals = ${e.target.checked}`); updateSetting('push_signals', e.target.checked); });
    if (autoModeToggle) autoModeToggle.addEventListener('change', (e) => { uiLog(`Toggle: auto_mode = ${e.target.checked}`); updateSetting('auto_mode', e.target.checked); });
    if (jackpotToggle) jackpotToggle.addEventListener('change', (e) => { uiLog(`Toggle: jackpot_mode = ${e.target.checked}`); updateSetting('jackpot_mode', e.target.checked); });

    if (Notification.permission === 'default') Notification.requestPermission();

    refreshUserData();
    loadRecentTrades();
    startPendingOrdersPolling();

    if (recentTradesRefreshInterval) clearInterval(recentTradesRefreshInterval);
    recentTradesRefreshInterval = setInterval(() => {
        loadRecentTrades();
    }, 10000);

    setInterval(() => { if (currentActiveTrade) updateLockedBalance(); }, 10000);
    uiLog('Trading module v6.0 Professional initialized');
}

// Make all functions globally available
window.initTrading = initTrading;
window.loadRecentTrades = loadRecentTrades;
window.refreshUserData = refreshUserData;
window.executeTrade = executeTrade;
window.fetchAIAnalysis = fetchAIAnalysis;
window.addTradeToTable = addTradeToTable;
window.updateBalanceInUI = updateBalanceInUI;
window.clearSignal = clearSignal;
window.showAIReasonModal = showAIReasonModal;
window.closeAIReasonModal = closeAIReasonModal;
window.acceptTradeFromModal = acceptTradeFromModal;
window.changeSymbol = changeSymbol;
window.copyAllTrades = copyAllTrades;
window.copyTradeToClipboard = copyTradeToClipboard;
window.updatePendingOrdersDisplay = updatePendingOrdersDisplay;
window.saveSymbolPreference = saveSymbolPreference;
window.loadSavedSymbol = loadSavedSymbol;
window.toggleCollapsible = toggleCollapsible;
window.updateAIDisplay = updateAIDisplay;
window.deleteAllTrades = deleteAllTrades;
