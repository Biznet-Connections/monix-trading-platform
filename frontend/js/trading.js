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
const refreshBtn = document.getElementById('refreshBtn');

// Debug log helper - sends to console AND backend
function uiLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`🖱️ [${timestamp}] ${message}`);
    fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `🖱️ ${message}`, type, timestamp: new Date().toISOString() })
    }).catch(() => {});
}

if (getSignalBtn) {
    getSignalBtn.innerHTML = '🧠 AI REASONING';
    getSignalBtn.title = 'View current AI market analysis (No automatic trade)';
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
    if (!modal) {
        console.error('Modal element not found!');
        return;
    }

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

    if (modalSymbol) {
        const displaySymbol = signal.symbol || 'R_75';
        modalSymbol.innerHTML = displaySymbol;
    }

    if (modalPrice) modalPrice.innerHTML = `$${signal.entry_price?.toFixed(2) || signal.support?.toFixed(2) || '0.00'}`;
    if (modalMarketFeeling) modalMarketFeeling.innerHTML = signal.market_feeling || (signal.rsi > 65 ? 'Price is high' : (signal.rsi < 35 ? 'Price is low' : 'Market is stable'));
    if (modalPattern) modalPattern.innerHTML = signal.pattern || 'Pattern detected';
    if (modalEntryTime) modalEntryTime.innerHTML = signal.entry_time || 'Waiting...';
    if (modalExitTime) modalExitTime.innerHTML = signal.exit_time || '5 minutes after entry';

    const defaultStake = parseFloat(stakeSlider ? stakeSlider.value : 0.35);
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
            const watchSymbol = signal.symbol || 'R_75';
            autoModeNote.innerHTML = `⏳ No active setup. AI watching ${watchSymbol}... Need ${signal.confidence_threshold || 55}%+ confidence.`;
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
        signalAction.innerHTML = signal.action === 'BUY' ? '📈 BUY (Price will go UP)' : '🔻 SELL (Price will go DOWN)';
        signalAction.className = `text-4xl font-black ${signal.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`;
    }
    if (signalConfidence) signalConfidence.innerHTML = `${signal.confidence}%`;
    if (signalPattern) signalPattern.innerHTML = signal.pattern || '—';
    if (signalEntry) signalEntry.innerHTML = `$${signal.entry_price.toFixed(2)}`;
    if (signalTP) signalTP.innerHTML = `$${signal.take_profit?.toFixed(2) || '—'}`;
    if (signalSL) signalSL.innerHTML = `$${signal.stop_loss?.toFixed(2) || '—'}`;

    if (signalReasoning) {
        const reasonText = signal.simple_reason || signal.reasoning || 'AI analysis complete';
        signalReasoning.innerHTML = reasonText;
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
        signalReasoning.style.color = '';
        signalReasoning.style.fontWeight = 'normal';
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

    let stake = stakeSlider ? parseFloat(stakeSlider.value) : 0.35;
    if (stake < 0.35) {
        stake = 0.35;
        if (stakeSlider) stakeSlider.value = 0.35;
        if (stakeValue) stakeValue.innerText = '$0.35';
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

async function loadRecentTrades() {
    try {
        const trades = await window.api.getTradeHistory(20);
        const tbody = document.getElementById('recentTradesBody');
        if (!tbody) return;

        if (!trades || trades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">No trades yet</td></tr>';
            uiLog('Recent trades: No trades found');
            return;
        }

        tbody.innerHTML = trades.map(trade => `
            <tr class="hover:bg-slate-700/20">
                <td class="p-4 text-xs">${new Date(trade.executed_at).toLocaleTimeString()}</td>
                <td class="p-4 font-bold">${trade.symbol}</td>
                <td class="p-4 ${trade.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}">${trade.action}</td>
                <td class="p-4">$${trade.entry_price?.toFixed(2)}</td>
                <td class="p-4">$${trade.exit_price?.toFixed(2) || '--'}</td>
                <td class="p-4 text-right ${trade.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}">${trade.profit >= 0 ? '+' : ''}$${trade.profit?.toFixed(2)}</td>
                <td class="p-4 text-center"><span class="px-2 py-1 rounded-full text-[10px] ${trade.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-500' : trade.status === 'LOSS' ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-500'}">${trade.status || 'PENDING'}</span></td>
            </tr>
        `).join('');
        uiLog(`Recent trades: Loaded ${trades.length} trades`);
    } catch (error) {
        uiLog(`Recent trades error: ${error.message}`, 'error');
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
            } else if (balanceEl && profile.derivBalance?.balance !== undefined) {
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
            if (stakeSlider && profile.user.base_stake) stakeSlider.value = Math.max(profile.user.base_stake, 0.35);
            if (stakeValue) stakeValue.innerText = `$${Math.max(profile.user.base_stake || 0.35, 0.35).toFixed(2)}`;

            const adminLink = document.getElementById('adminLink');
            if (adminLink && profile.user.is_admin) adminLink.classList.remove('hidden');

            if (profile.user.is_demo === 1) {
                if (demoBtn) demoBtn.className = 'px-3 py-1 rounded-lg text-xs bg-emerald-500 text-white shadow-lg';
                if (realBtn) realBtn.className = 'px-3 py-1 rounded-lg text-xs bg-slate-700 text-slate-400';
            } else {
                if (realBtn) realBtn.className = 'px-3 py-1 rounded-lg text-xs bg-emerald-500 text-white shadow-lg';
                if (demoBtn) demoBtn.className = 'px-3 py-1 rounded-lg text-xs bg-slate-700 text-slate-400';
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
    `;

    tbody.insertBefore(newRow, tbody.firstChild);
    if (tbody.children.length > 20) {
        tbody.removeChild(tbody.lastChild);
    }

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
    if (balanceEl) {
        balanceEl.innerHTML = `$${balance.toFixed(2)}`;
    }
}

function initTrading() {
    uiLog('Initializing trading module...');
    if (stakeSlider) {
        stakeSlider.min = 0.35;
        stakeSlider.value = 0.35;
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

    if (refreshBtn) refreshBtn.addEventListener('click', (e) => { e.preventDefault(); uiLog('Button clicked: REFRESH'); refreshUserData(); loadRecentTrades(); });
    if (refreshTradesBtn) refreshTradesBtn.addEventListener('click', (e) => { e.preventDefault(); uiLog('Button clicked: REFRESH TRADES'); loadRecentTrades(); });

    if (symbolSelect) {
        symbolSelect.addEventListener('change', () => {
            const newSymbol = symbolSelect.value;
            uiLog(`Symbol select changed: ${newSymbol}`);
            clearSignal();
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

    if (recentTradesRefreshInterval) clearInterval(recentTradesRefreshInterval);
    recentTradesRefreshInterval = setInterval(() => {
        loadRecentTrades();
    }, 10000);

    setInterval(() => { if (currentActiveTrade) updateLockedBalance(); }, 10000);
    uiLog('Trading module initialized');
}

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
