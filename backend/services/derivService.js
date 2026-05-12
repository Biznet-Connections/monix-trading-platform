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
        this.currentUrlIndex = 0;
        this.currentBalance = 0;
        this.currentCurrency = 'USD';
        this.reconnectInProgress = false;
        this.isClosing = false;
        this.heartbeatInterval = null;
        this.keepAliveInterval = null;
        this.lastSubscribedSymbol = null;

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

        this.wsUrls = [process.env.DERIV_WS_URL || 'wss://ws.derivws.com/websockets/v3'];
    }

    convertSymbol(uiSymbol) {
        const derivSymbol = this.symbolMap[uiSymbol];
        if (derivSymbol) {
            return derivSymbol;
        }
        console.log(`⚠️ [Deriv] Unknown symbol: ${uiSymbol}, using as-is`);
        return uiSymbol;
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        // Aggressive heartbeat for Render free tier - every 25 seconds
        this.heartbeatInterval = setInterval(async () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    if (this.authorized) {
                        await this.sendRequest({ ping: 1 });
                    } else {
                        // Keep connection alive even without auth
                        this.ws.send(JSON.stringify({ ping: 1 }));
                    }
                } catch (e) {
                    console.log('⚠️ [Deriv] Keepalive failed:', e.message);
                }
            }
        }, 25000);
    }

    startKeepAlive() {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        // Secondary keepalive: raw ping every 55 seconds for Render stability
        this.keepAliveInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ ping: 1 }));
                } catch (e) {}
            }
        }, 55000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    connect(token = null, forceNew = false) {
        if (this.isConnecting) {
            console.log('⚠️ [Deriv] Already connecting');
            return Promise.reject(new Error('Connection already in progress'));
        }

        this.isConnecting = true;
        this.isClosing = false;
        this.currentToken = token;

        if (forceNew) {
            this.currentUrlIndex = 0;
            this.safeClose();
        }

        const url = `${this.wsUrls[this.currentUrlIndex]}?app_id=${process.env.DERIV_APP_ID || '1089'}`;
        console.log(`🔌 [Deriv] Connecting: ${url}`);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!this.isConnected) {
                    console.error(`❌ [Deriv] Connection timeout`);
                    this.isConnecting = false;
                    reject(new Error('Connection timeout'));
                }
            }, 20000);

            try {
                this.ws = new WebSocket(url, { handshakeTimeout: 15000, timeout: 60000 });

                this.ws.on('error', (error) => {
                    if (!this.isClosing) {
                        console.error(`❌ [Deriv] WebSocket error:`, error.message);
                    }
                    if (!this.isConnected) {
                        clearTimeout(timeout);
                        this.isConnecting = false;
                        reject(error);
                    }
                });

                this.ws.on('open', () => {
                    clearTimeout(timeout);
                    console.log(`✅ [Deriv] WebSocket connected`);
                    this.isConnected = true;
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    if (this.reconnectInterval) {
                        clearInterval(this.reconnectInterval);
                        this.reconnectInterval = null;
                    }
                    this.startHeartbeat();
                    this.startKeepAlive();

                    if (this.currentToken && this.currentToken.trim().length > 0) {
                        this.authorize(this.currentToken).then(() => {
                            // Resubscribe to last symbol if we had one
                            if (this.lastSubscribedSymbol) {
                                console.log(`📡 [Deriv] Re-subscribing to ${this.lastSubscribedSymbol} after auth`);
                                this.subscribeToTicks(this.lastSubscribedSymbol).catch(() => {});
                            }
                            this.emit('connected');
                            resolve();
                        }).catch(reject);
                    } else {
                        this.emit('connected');
                        resolve();
                    }
                });

                this.ws.on('message', (data) => {
                    try {
                        const response = JSON.parse(data);
                        this.handleMessage(response);
                    } catch (err) {}
                });

                this.ws.on('close', (code) => {
                    console.log(`🔌 [Deriv] WebSocket disconnected: ${code}`);
                    this.isConnected = false;
                    this.isConnecting = false;
                    this.authorized = false;
                    this.stopHeartbeat();
                    if (!this.isClosing) {
                        this.emit('disconnected');
                        this.reconnect();
                    }
                });

            } catch (error) {
                clearTimeout(timeout);
                this.isConnecting = false;
                reject(error);
            }
        });
    }

    safeClose() {
        this.isClosing = true;
        this.stopHeartbeat();
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close();
                } else if (this.ws.readyState === WebSocket.CONNECTING) {
                    setTimeout(() => {
                        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                            try { this.ws.terminate(); } catch(e) {}
                        }
                    }, 1000);
                }
            } catch (e) {}
            this.ws = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        this.authorized = false;
        this.subscriptions.clear();
        setTimeout(() => { this.isClosing = false; }, 500);
    }

    async reconnectWithToken(newToken) {
        if (this.reconnectInProgress) {
            return { success: false, error: 'Reconnect already in progress' };
        }

        this.reconnectInProgress = true;
        console.log('🔄 [Deriv] Reconnecting with new token...');

        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }

        this.safeClose();

        for (const [reqId, { reject }] of this.pendingRequests) {
            reject(new Error('Connection closed'));
            this.pendingRequests.delete(reqId);
        }

        this.currentToken = newToken;
        this.currentUrlIndex = 0;
        this.reconnectAttempts = 0;

        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            await this.connect(newToken, true);

            if (this.authorized) {
                const balanceResult = await this.getBalance();
                this.currentBalance = balanceResult?.balance || 0;
                this.currentCurrency = balanceResult?.currency || 'USD';
                this.reconnectInProgress = false;
                return { success: true, balance: this.currentBalance, currency: this.currentCurrency };
            }

            this.reconnectInProgress = false;
            return { success: false, error: 'Authorization failed' };
        } catch (error) {
            this.reconnectInProgress = false;
            return { success: false, error: error.message };
        }
    }

    async forceReconnectForTicks(symbol) {
        const derivSymbol = this.convertSymbol(symbol);
        console.log(`🔄 [Deriv] FORCE RECONNECT for ${derivSymbol}...`);
        
        const savedToken = this.currentToken;
        
        this.isClosing = true;
        this.stopHeartbeat();
        
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
                else if (this.ws.readyState === WebSocket.CONNECTING) {
                    try { this.ws.terminate(); } catch(e) {}
                }
            } catch (e) {}
            this.ws = null;
        }
        
        this.isConnected = false;
        this.isConnecting = false;
        this.authorized = false;
        this.subscriptions.clear();
        
        for (const [reqId, { reject }] of this.pendingRequests) {
            reject(new Error('Force reconnect'));
            this.pendingRequests.delete(reqId);
        }
        
        await new Promise(r => setTimeout(r, 2000));
        this.isClosing = false;
        
        await this.connect(savedToken, true);
        
        if (savedToken) {
            await this.authorize(savedToken);
            console.log(`🔐 [Deriv] Re-authorized`);
        }
        
        await this.subscribeToTicks(symbol);
        console.log(`✅ [Deriv] Force reconnect complete`);
        return true;
    }

    reconnect() {
        if (this.reconnectInterval || this.isClosing) return;
        
        const savedSymbol = this.lastSubscribedSymbol;
        let delay = 5000;
        
        this.reconnectInterval = setInterval(() => {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
                return;
            }
            
            this.reconnectAttempts++;
            const currentDelay = Math.min(delay * Math.pow(2, this.reconnectAttempts - 1), 120000);
            console.log(`🔄 [Deriv] Reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${currentDelay/1000}s`);
            
            setTimeout(async () => {
                this.currentUrlIndex = (this.currentUrlIndex + 1) % this.wsUrls.length;
                this.safeClose();
                try {
                    await this.connect(this.currentToken, true);
                    if (this.authorized && savedSymbol) {
                        console.log(`📡 [Deriv] Resubscribing to ${savedSymbol} after reconnect`);
                        await this.subscribeToTicks(savedSymbol);
                    }
                    if (this.reconnectInterval) {
                        clearInterval(this.reconnectInterval);
                        this.reconnectInterval = null;
                    }
                } catch (error) {
                    console.error(`❌ [Deriv] Reconnect failed:`, error.message);
                }
            }, currentDelay);
        }, delay);
    }

    handleMessage(response) {
        const msgType = response.msg_type;

        if (msgType === 'authorize') {
            if (response.error) {
                this.authorized = false;
            } else {
                this.authorized = true;
                this.currentBalance = response.authorize.balance;
                this.currentCurrency = response.authorize.currency;
                this.emit('authorized', response.authorize);
                this.emit('balance', { balance: response.authorize.balance, currency: response.authorize.currency });
            }
        }

        if (msgType === 'tick') {
            this.emit('tick', response.tick);
        }

        if (msgType === 'balance') {
            this.currentBalance = response.balance.balance;
            this.currentCurrency = response.balance.currency;
            this.emit('balance', { balance: response.balance.balance, currency: response.balance.currency });
        }

        if (msgType === 'buy') {
            if (response.error) {
                this.emit('trade_error', response.error);
            } else {
                this.emit('trade_executed', response.buy);
            }
        }

        if (msgType === 'proposal_open_contract') {
            this.emit('contract_update', response.proposal_open_contract);
        }

        if (response.req_id && this.pendingRequests.has(response.req_id)) {
            const { resolve, reject } = this.pendingRequests.get(response.req_id);
            this.pendingRequests.delete(response.req_id);
            if (response.error) {
                reject(new Error(response.error.message));
            } else {
                resolve(response);
            }
        }
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

            setTimeout(() => {
                if (this.pendingRequests.has(req_id)) {
                    this.pendingRequests.delete(req_id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }

    async authorize(token) {
        if (!token || token.trim().length === 0) throw new Error('No token provided');
        return this.sendRequest({ authorize: token });
    }

    async getTickHistory(symbol, end = 'latest', count = 100) {
        const derivSymbol = this.convertSymbol(symbol);
        return this.sendRequest({ ticks_history: derivSymbol, end, count, style: 'ticks' });
    }

    async getCandles(symbol, granularity = 60, count = 100) {
        const derivSymbol = this.convertSymbol(symbol);
        return this.sendRequest({ ticks_history: derivSymbol, adjust_start_time: 1, count, end: 'latest', granularity, style: 'candles' });
    }

    async subscribeToTicks(symbol) {
        const derivSymbol = this.convertSymbol(symbol);
        this.lastSubscribedSymbol = symbol;
        this.subscriptions.delete(derivSymbol);
        
        try {
            const result = await this.sendRequest({ ticks: derivSymbol, subscribe: 1 });
            this.subscriptions.add(derivSymbol);
            console.log(`📡 [Deriv] Subscribed to ${derivSymbol}`);
            return result;
        } catch (error) {
            console.error(`❌ [Deriv] Subscribe failed for ${derivSymbol}:`, error.message);
            throw error;
        }
    }

    async unsubscribeFromTicks(symbol) {
        const derivSymbol = this.convertSymbol(symbol);
        if (!this.subscriptions.has(derivSymbol)) return;
        this.subscriptions.delete(derivSymbol);
        try {
            await this.sendRequest({ forget: derivSymbol });
            console.log(`📡 [Deriv] Unsubscribed from ${derivSymbol}`);
        } catch (error) {}
    }

    async placeTrade(symbol, action, stake, duration = 5, durationUnit = 'm') {
        if (!this.authorized) throw new Error('Not authorized');
        if (stake < 0.35) throw new Error('Minimum stake is $0.35');
        const derivSymbol = this.convertSymbol(symbol);
        const contractType = action === 'BUY' ? 'CALL' : 'PUT';
        console.log(`📊 [Deriv] Trade: ${action} ${derivSymbol} $${stake}`);
        return this.sendRequest({
            buy: 1, price: stake,
            parameters: { amount: stake, basis: 'stake', contract_type: contractType, currency: 'USD', duration, duration_unit: durationUnit, symbol: derivSymbol }
        });
    }

    async getBalance() {
        if (!this.authorized) throw new Error('Not authorized');
        const result = await this.sendRequest({ balance: 1 });
        return { balance: result.balance?.balance || 0, currency: result.balance?.currency || 'USD' };
    }

    async getBalanceWithToken(token) {
        const needNewConnection = !this.authorized || this.currentToken !== token;
        if (needNewConnection) {
            const tempResult = await this.reconnectWithToken(token);
            if (tempResult.success) return { balance: tempResult.balance, currency: tempResult.currency };
            throw new Error('Failed to connect');
        }
        return this.getBalance();
    }

    async getContractInfo(contractId) {
        return this.sendRequest({ proposal_open_contract: contractId });
    }

    async getPortfolio() {
        if (!this.authorized) throw new Error('Not authorized');
        try { return await this.sendRequest({ portfolio: 1 }); } catch (e) { return null; }
    }

    async getProfitTable(limit = 50) {
        if (!this.authorized) throw new Error('Not authorized');
        try { return await this.sendRequest({ profit_table: 1, limit }); } catch (e) { return await this.getPortfolio(); }
    }

    async getClosedContract(contractId) {
        try {
            const portfolio = await this.getPortfolio();
            if (portfolio?.portfolio?.contracts) {
                const contract = portfolio.portfolio.contracts.find(
                    c => c.contract_id === parseInt(contractId) || c.contract_id === contractId
                );
                if (contract && (contract.status === 'closed' || contract.is_sold === 1)) return contract;
            }
        } catch (e) {}
        try {
            const profit = await this.getProfitTable(100);
            if (profit?.profit_table?.transactions) {
                const tx = profit.profit_table.transactions.find(t => t.contract_id === parseInt(contractId));
                if (tx) return tx;
            }
        } catch (e) {}
        return null;
    }

    getCurrentBalance() {
        return { balance: this.currentBalance, currency: this.currentCurrency, authorized: this.authorized };
    }

    disconnect() {
        this.isClosing = true;
        this.stopHeartbeat();
        this.safeClose();
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
    }
}

module.exports = new DerivService();
