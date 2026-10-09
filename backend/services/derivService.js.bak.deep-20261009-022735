const WebSocket = require('ws');
const EventEmitter = require('events');

class DerivService extends EventEmitter {
    constructor() {
        super();
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.subscriptions = new Set();
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.reconnectInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 20;
        this.authorized = false;
        this.currentToken = null;
        this.currentBalance = 0;
        this.currentCurrency = 'USD';
        this.reconnectInProgress = false;
        this.isClosing = false;
        this.heartbeatInterval = null;
        this.lastSubscribedSymbol = null;
        this.activeAccountId = null;
        this.activeContractId = null;
        this.contractMonitorInterval = null;

        this.symbolMap = {
            "R_10": "R_10", "R_25": "R_25", "R_50": "R_50", "R_75": "R_75", "R_100": "R_100",
            "R_10_2S": "R_10_2S", "R_25_2S": "R_25_2S", "R_50_2S": "R_50_2S", "R_75_2S": "R_75_2S", "R_100_2S": "R_100_2S",
            "Boom 300": "BOOM300", "Boom 500": "BOOM500", "Boom 1000": "BOOM1000",
            "Crash 300": "CRASH300", "Crash 500": "CRASH500", "Crash 1000": "CRASH1000",
            "Step 200": "STEP200", "Step 300": "STEP300", "Step 400": "STEP400", "Step 500": "STEP500",
            "1HZ10": "1HZ10", "1HZ25": "1HZ25", "1HZ50": "1HZ50", "1HZ75": "1HZ75", "1HZ100": "1HZ100",
            "EUR/USD": "frxEURUSD", "GBP/USD": "frxGBPUSD", "USD/JPY": "frxUSDJPY",
            "AUD/USD": "frxAUDUSD", "USD/CAD": "frxUSDCAD", "NZD/USD": "frxNZDUSD", "USD/CHF": "frxUSDCHF",
            "EUR/GBP": "frxEURGBP", "EUR/JPY": "frxEURJPY", "GBP/JPY": "frxGBPJPY",
            "AUD/JPY": "frxAUDJPY", "CAD/JPY": "frxCADJPY", "CHF/JPY": "frxCHFJPY",
            "EUR/AUD": "frxEURAUD", "GBP/AUD": "frxGBPAUD",
            "XAU/USD (Gold)": "frxXAUUSD", "XAG/USD (Silver)": "frxXAGUSD",
            "XPT/USD (Platinum)": "frxXPTUSD", "XPD/USD (Palladium)": "frxXPDUSD",
            "WTI (Oil)": "frxWTI", "Brent (Oil)": "frxBrent",
            "BTC/USD (Bitcoin)": "frxBTCUSD", "ETH/USD (Ethereum)": "frxETHUSD",
            "LTC/USD (Litecoin)": "frxLTCUSD", "XRP/USD (Ripple)": "frxXRPUSD",
            "ADA/USD (Cardano)": "frxADAUSD", "DOT/USD (Polkadot)": "frxDOTUSD",
            "SOL/USD (Solana)": "frxSOLUSD", "DOGE/USD (Dogecoin)": "frxDOGEUSD",
            "US500 (S&P 500)": "US500", "USTEC (Nasdaq)": "USTEC", "US30 (Dow Jones)": "US30",
            "GER40 (DAX)": "GER40", "UK100 (FTSE)": "UK100", "FRA40 (CAC 40)": "FRA40",
            "ESP35 (IBEX 35)": "ESP35", "NETH25 (AEX)": "NETH25",
            "HK50 (Hang Seng)": "HK50", "JP225 (Nikkei)": "JP225", "AUS200 (ASX 200)": "AUS200"
        };
    }

    convertSymbol(uiSymbol) {
        const derivSymbol = this.symbolMap[uiSymbol];
        if (derivSymbol) return derivSymbol;
        return uiSymbol;
    }

    async fetchAccounts(token) {
        const response = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Deriv-App-ID': process.env.DERIV_APP_ID || '33lnQKOehbu49p53dxDCt',
                'Deriv-Client-ID': process.env.DERIV_CLIENT_ID || '019e4abc-cec8-7c8f-a120-d33a725f1e8a',
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error(`Fetch accounts failed: ${response.status}`);
        return response.json();
    }

    async getOtpUrl(token, accountId) {
        const response = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Deriv-App-ID': process.env.DERIV_APP_ID || '33lnQKOehbu49p53dxDCt',
                'Deriv-Client-ID': process.env.DERIV_CLIENT_ID || '019e4abc-cec8-7c8f-a120-d33a725f1e8a',
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error(`OTP request failed: ${response.status}`);
        const data = await response.json();
        if (!data.data?.url) throw new Error('No OTP URL in response');
        return data.data.url;
    }

    async connect(token, forceNew = false, preferDemo = true) {
        if (this.isConnecting) return;
        this.isConnecting = true;
        this.currentToken = token;
        if (forceNew) this.safeClose();

        try {
            const accounts = await this.fetchAccounts(token);
            const targetType = preferDemo ? 'demo' : 'real';
            const account = accounts.data.find(a => a.account_type === targetType);
            if (!account) throw new Error(`No ${targetType} account found`);

            this.activeAccountId = account.account_id;
            this.currentBalance = parseFloat(account.balance);
            this.currentCurrency = account.currency || 'USD';

            console.log(`💰 Account: ${this.activeAccountId} | Balance: $${this.currentBalance.toFixed(2)}`);

            const wsUrl = await this.getOtpUrl(token, this.activeAccountId);
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                console.log('✅ Deriv WebSocket connected');
                this.isConnected = true;
                this.authorized = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
                this.startHeartbeat();

                if (this.lastSubscribedSymbol) {
                    setTimeout(() => {
                        this.subscribeToTicks(this.lastSubscribedSymbol).catch(() => {});
                    }, 2000);
                }

                this.emit('connected');
                this.emit('authorized', { balance: this.currentBalance, currency: this.currentCurrency });
            });

            this.ws.on('message', (data) => {
                try {
                    this.handleMessage(JSON.parse(data));
                } catch (err) {}
            });

            this.ws.on('close', () => {
                console.log('🔌 Deriv WebSocket disconnected');
                this.isConnected = false;
                this.authorized = false;
                this.stopHeartbeat();
                if (!this.isClosing) this.reconnect();
            });

            this.ws.on('error', (err) => {
                console.error('❌ WebSocket error:', err.message);
            });

        } catch (err) {
            console.error('❌ Connection failed:', err.message);
            this.isConnecting = false;
            throw err;
        }
    }

    async subscribeToTicksWithRetry(symbol, retries = 5, delay = 3000) {
        for (let i = 0; i < retries; i++) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN && this.authorized) {
                try {
                    await this.subscribeToTicks(symbol);
                    console.log(`✅ Successfully subscribed to ${symbol} after ${i + 1} attempt(s)`);
                    return true;
                } catch (err) {
                    console.log(`⚠️ Subscribe attempt ${i + 1}/${retries} failed: ${err.message}`);
                }
            } else {
                console.log(`⚠️ WebSocket not ready for subscription (attempt ${i + 1}/${retries})`);
            }
            if (i < retries - 1) {
                await new Promise(r => setTimeout(r, delay));
            }
        }
        console.error(`❌ Failed to subscribe to ${symbol} after ${retries} attempts`);
        return false;
    }

    async reconnectWithToken(token, isDemo = true) {
        console.log('🔄 [Deriv] Reconnecting with new token...');
        this.currentToken = token;
        await this.connect(token, true, isDemo);
        return {
            success: this.isConnected,
            balance: this.currentBalance,
            currency: this.currentCurrency
        };
    }

    async getCandles(symbol, granularity = 60, count = 100) {
        if (!this.authorized || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return { success: false, candles: [] };
        }

        const derivSymbol = this.convertSymbol(symbol);

        try {
            const result = await this.sendRequest({
                ticks_history: derivSymbol,
                adjust_start_time: 1,
                count: count,
                end: 'latest',
                granularity: granularity,
                style: 'candles'
            });

            if (result && result.candles && result.candles.length > 0) {
                const candles = result.candles.map(c => ({
                    epoch: c.epoch,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    x: c.epoch * 1000,
                    y: [c.open, c.high, c.low, c.close]
                }));
                console.log(`📊 [Deriv] Got ${candles.length} candles for ${derivSymbol}`);
                return { success: true, candles: candles };
            }

            return { success: false, candles: [] };
        } catch (error) {
            console.error(`❌ [Deriv] Get candles failed:`, error.message);
            return { success: false, candles: [] };
        }
    }

    async getTickHistory(symbol, end = 'latest', count = 1) {
        if (!this.authorized || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return { success: false, history: { prices: [] } };
        }

        const derivSymbol = this.convertSymbol(symbol);

        try {
            const result = await this.sendRequest({
                ticks_history: derivSymbol,
                adjust_start_time: 1,
                count: count,
                end: end,
                style: 'ticks'
            });

            if (result && result.history && result.history.prices) {
                return { success: true, history: result.history };
            }
            return { success: false, history: { prices: [] } };
        } catch (error) {
            console.error(`❌ [Deriv] Get tick history failed:`, error.message);
            return { success: false, history: { prices: [] } };
        }
    }

    async forceReconnectForTicks(symbol) {
        console.log(`🔄 [Deriv] Force reconnecting for ${symbol}...`);
        if (this.ws) {
            try {
                await this.sendRequest({ forget_all: 'ticks' });
            } catch (e) {}
        }
        
        this.subscriptions.clear();
        
        try {
            await this.subscribeToTicksWithRetry(symbol, 3, 2000);
            console.log(`✅ [Deriv] Reconnected and subscribed to ${symbol}`);
            return true;
        } catch (error) {
            console.error(`❌ [Deriv] Force reconnect failed:`, error.message);
            return false;
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ ping: 1 }));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    safeClose() {
        this.isClosing = true;
        this.stopHeartbeat();
        if (this.contractMonitorInterval) {
            clearInterval(this.contractMonitorInterval);
            this.contractMonitorInterval = null;
        }
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                this.ws.close();
            } catch (e) {}
            this.ws = null;
        }
        this.isConnected = false;
        this.authorized = false;
        this.subscriptions.clear();
        setTimeout(() => { this.isClosing = false; }, 500);
    }

    reconnect() {
        if (this.reconnectInterval || this.isClosing) return;
        this.reconnectInterval = setInterval(async () => {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                clearInterval(this.reconnectInterval);
                return;
            }
            this.reconnectAttempts++;
            console.log(`🔄 Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            try {
                await this.connect(this.currentToken, true, true);
                if (this.isConnected && this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            } catch (err) {
                console.error(`Reconnect failed:`, err.message);
            }
        }, 10000);
    }

    handleMessage(msg) {
        const type = msg.msg_type;

        if (type === 'tick') {
            this.emit('tick', msg.tick);
        }

        if (type === 'balance') {
            this.currentBalance = msg.balance.balance;
            console.log(`💰 [Deriv] Balance updated: $${this.currentBalance.toFixed(2)}`);
            this.emit('balance', msg.balance);
        }

        if (type === 'buy') {
            if (msg.error) {
                console.error('❌ Trade error:', msg.error.message);
                this.emit('trade_error', msg.error);
            } else {
                console.log(`✅ Trade executed! Contract: ${msg.buy.contract_id}`);
                this.activeContractId = msg.buy.contract_id;
                this.emit('trade_executed', msg.buy);
                
                // Start monitoring this contract
                this.startContractMonitoring(msg.buy.contract_id);
            }
        }

        if (type === 'proposal_open_contract') {
            const contract = msg.proposal_open_contract;
            if (contract) {
                console.log(`📄 Contract ${contract.contract_id} update: is_sold=${contract.is_sold}, profit=${contract.profit}`);
                this.emit('contract_update', contract);
            }
        }

        if (msg.req_id && this.pendingRequests.has(msg.req_id)) {
            const { resolve, reject } = this.pendingRequests.get(msg.req_id);
            this.pendingRequests.delete(msg.req_id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg);
        }
    }

    startContractMonitoring(contractId) {
        if (this.contractMonitorInterval) {
            clearInterval(this.contractMonitorInterval);
        }
        
        this.contractMonitorInterval = setInterval(async () => {
            if (!this.activeContractId) return;
            
            try {
                const result = await this.getClosedContract(this.activeContractId);
                if (result && result.proposal_open_contract) {
                    const contract = result.proposal_open_contract;
                    if (contract.is_sold === 1 || contract.status === 'sold') {
                        console.log(`🎯 Contract ${contractId} closed! Profit: ${contract.profit}`);
                        this.emit('contract_update', contract);
                        clearInterval(this.contractMonitorInterval);
                        this.contractMonitorInterval = null;
                        this.activeContractId = null;
                    }
                }
            } catch (err) {
                // Silent fail
            }
        }, 5000);
    }

    sendRequest(request) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }
            const req_id = ++this.requestId;
            this.pendingRequests.set(req_id, { resolve, reject });
            this.ws.send(JSON.stringify({ ...request, req_id }));
        });
    }

    async subscribeToTicks(symbol) {
        const derivSymbol = this.convertSymbol(symbol);

        for (const s of this.subscriptions) {
            try { await this.sendRequest({ forget: s }); } catch(e) {}
        }
        this.subscriptions.clear();

        this.lastSubscribedSymbol = symbol;

        try {
            await this.sendRequest({ ticks: derivSymbol, subscribe: 1 });
            this.subscriptions.add(derivSymbol);
            console.log(`📡 Subscribed to ${derivSymbol}`);
            return true;
        } catch (err) {
            console.error(`❌ Subscribe failed:`, err.message);
            throw err;
        }
    }

    async placeTrade(symbol, action, stake, duration = 2, durationUnit = 'm') {
        if (!this.authorized) throw new Error('Not authorized');
        if (stake < 0.35) throw new Error('Minimum stake is $0.35');

        const derivSymbol = this.convertSymbol(symbol);
        const contractType = action === 'BUY' ? 'CALL' : 'PUT';

        console.log(`📊 Trade: ${action} ${derivSymbol} $${stake}`);

        const proposal = await this.sendRequest({
            proposal: 1,
            amount: stake,
            basis: 'stake',
            contract_type: contractType,
            currency: this.currentCurrency,
            duration: duration,
            duration_unit: durationUnit,
            underlying_symbol: derivSymbol
        });

        if (!proposal.proposal?.id) {
            throw new Error('No proposal ID received');
        }

        const proposalId = proposal.proposal.id;
        console.log(`📝 Got proposal: ${proposalId.substring(0, 8)}...`);

        const trade = await this.sendRequest({
            buy: proposalId,
            price: stake
        });

        // Subscribe to contract updates
        setTimeout(() => {
            this.sendRequest({ 
                subscribe: 1, 
                proposal_open_contract: 1,
                contract_id: parseInt(trade.buy.contract_id)
            }).catch(() => {});
        }, 1000);

        return trade;
    }

    async getBalance() {
        if (!this.authorized || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return { balance: this.currentBalance, currency: this.currentCurrency, authorized: this.authorized };
        }

        try {
            const result = await this.sendRequest({ balance: 1, subscribe: 0 });
            if (result && result.balance) {
                this.currentBalance = result.balance.balance;
                this.currentCurrency = result.balance.currency || 'USD';
                console.log(`💰 [Deriv] Fresh balance: $${this.currentBalance.toFixed(2)}`);
                return { balance: this.currentBalance, currency: this.currentCurrency, authorized: true };
            }
        } catch (error) {
            console.error(`❌ [Deriv] Get balance failed:`, error.message);
        }

        return { balance: this.currentBalance, currency: this.currentCurrency, authorized: this.authorized };
    }

    async getClosedContract(contractId) {
        try {
            const result = await this.sendRequest({ 
                proposal_open_contract: 1,
                contract_id: parseInt(contractId)
            });
            
            if (result && result.proposal_open_contract) {
                const contract = result.proposal_open_contract;
                return result;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    getCurrentBalance() {
        return { balance: this.currentBalance, currency: this.currentCurrency, authorized: this.authorized };
    }

    disconnect() {
        console.log('🔌 Disconnecting...');
        this.isClosing = true;
        this.safeClose();
    }
}

module.exports = new DerivService();
