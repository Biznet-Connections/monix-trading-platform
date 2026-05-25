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

        this.symbolMap = {
            "R_10": "R_10", "R_25": "R_25", "R_50": "R_50", "R_75": "R_75", "R_100": "R_100",
            "R_10_2S": "R_10_2S", "R_25_2S": "R_25_2S", "R_50_2S": "R_50_2S", "R_75_2S": "R_75_2S", "R_100_2S": "R_100_2S",
            "Boom 300": "BOOM300", "Boom 500": "BOOM500", "Boom 1000": "BOOM1000",
            "Crash 300": "CRASH300", "Crash 500": "CRASH500", "Crash 1000": "CRASH1000",
        };
    }

    convertSymbol(uiSymbol) {
        const derivSymbol = this.symbolMap[uiSymbol];
        if (derivSymbol) return derivSymbol;
        return uiSymbol;
    }

    async getCandles(symbol, granularity = 60, count = 20) {
        const derivSymbol = this.convertSymbol(symbol);
        const endEpoch = Math.floor(Date.now() / 1000);
        const startEpoch = endEpoch - (granularity * count);
        
        try {
            const result = await this.sendRequest({
                candles: derivSymbol,
                end: endEpoch,
                start: startEpoch,
                granularity: granularity,
                style: 'candles'
            });
            if (result && result.candles) return { candles: result.candles };
            return { candles: [] };
        } catch (error) {
            return { candles: [] };
        }
    }

    connect(token = null, forceNew = false, preferDemo = true) {
        if (this.isConnecting) {
            return Promise.resolve();
        }

        this.isConnecting = true;
        this.isClosing = false;
        this.currentToken = token;

        if (forceNew) this.safeClose();

        return new Promise(async (resolve, reject) => {
            try {
                if (!token) throw new Error('Cannot connect without valid PAT token');

                const wsUrl = process.env.DERIV_WS_URL || 'wss://ws.derivws.com/websockets/v3';
                
                console.log(`🔌 [Deriv WS] Connecting to ${wsUrl}...`);
                
                this.ws = new WebSocket(wsUrl, { handshakeTimeout: 15000, timeout: 60000 });

                this.ws.on('error', (error) => {
                    if (!this.isClosing) console.error(`❌ [Deriv WS] Error:`, error.message);
                    if (!this.isConnected) {
                        this.isConnecting = false;
                        reject(error);
                    }
                });

                this.ws.on('open', async () => {
                    console.log(`✅ [Deriv WS] Connected! Authorizing...`);
                    
                    try {
                        const authResult = await this.sendRequest({ authorize: token });
                        
                        if (authResult.authorize) {
                            this.authorized = true;
                            this.currentBalance = parseFloat(authResult.authorize.balance);
                            this.currentCurrency = authResult.authorize.currency;
                            this.activeAccountId = authResult.authorize.account_id;
                            
                            console.log(`✅ [Deriv WS] Authorized! Account: ${this.activeAccountId}, Balance: $${this.currentBalance.toFixed(2)}`);
                            this.isConnected = true;
                            this.isConnecting = false;
                            this.reconnectAttempts = 0;
                            
                            if (this.reconnectInterval) {
                                clearInterval(this.reconnectInterval);
                                this.reconnectInterval = null;
                            }
                            
                            this.startHeartbeat();
                            
                            if (this.lastSubscribedSymbol) {
                                this.subscribeToTicks(this.lastSubscribedSymbol).catch(() => {});
                            }
                            
                            this.emit('connected');
                            this.emit('authorized', { balance: this.currentBalance, currency: this.currentCurrency });
                            resolve();
                        } else {
                            throw new Error('Authorization failed');
                        }
                    } catch (err) {
                        console.error(`❌ [Deriv WS] Auth failed:`, err.message);
                        this.isConnecting = false;
                        reject(err);
                    }
                });

                this.ws.on('message', (data) => {
                    try {
                        const response = JSON.parse(data);
                        this.handleMessage(response);
                    } catch (err) {}
                });

                this.ws.on('close', (code) => {
                    console.log(`🔌 [Deriv WS] Session closed: ${code}`);
                    this.isConnected = false;
                    this.isConnecting = false;
                    this.authorized = false;
                    this.stopHeartbeat();
                    if (!this.isClosing) {
                        this.emit('disconnected');
                        this.reconnect();
                    }
                });

            } catch (err) {
                console.error('❌ [Deriv Init Failed]:', err.message);
                this.isConnecting = false;
                reject(err);
            }
        });
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ ping: 1 }));
            }
        }, 25000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    }

    safeClose() {
        this.isClosing = true;
        this.stopHeartbeat();
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
            } catch (e) {}
            this.ws = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        this.authorized = false;
        this.subscriptions.clear();
        setTimeout(() => { this.isClosing = false; }, 500);
    }

    async reconnectWithToken(newToken, isDemo = true) {
        if (this.reconnectInProgress) return { success: false, error: 'Reconnect already in progress' };
        this.reconnectInProgress = true;
        this.safeClose();

        for (const [reqId, { reject }] of this.pendingRequests) {
            reject(new Error('Connection closed for reset'));
            this.pendingRequests.delete(reqId);
        }

        this.currentToken = newToken;
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            await this.connect(newToken, true, isDemo);
            this.reconnectInProgress = false;
            return { success: true, balance: this.currentBalance, currency: this.currentCurrency };
        } catch (error) {
            this.reconnectInProgress = false;
            return { success: false, error: error.message };
        }
    }

    async forceReconnectForTicks(symbol) {
        try {
            for (const existingSymbol of this.subscriptions) {
                try {
                    await this.sendRequest({ forget: existingSymbol });
                } catch (e) {}
            }
            this.subscriptions.clear();
        } catch (e) {}

        await this.connect(this.currentToken, true, true);
        await this.subscribeToTicks(symbol);
        return true;
    }

    reconnect() {
        if (this.reconnectInterval || this.isClosing) return;
        this.reconnectInterval = setInterval(async () => {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                clearInterval(this.reconnectInterval);
                return;
            }
            this.reconnectAttempts++;
            try {
                await this.connect(this.currentToken, true, true);
                if (this.isConnected && this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                }
            } catch (error) {
                console.error(`🔄 [Deriv] Reconnect failed:`, error.message);
            }
        }, 10000);
    }

    handleMessage(response) {
        const msgType = response.msg_type;
        if (msgType === 'tick') {
            this.emit('tick', response.tick);
        }
        if (msgType === 'balance') {
            this.currentBalance = response.balance.balance;
            this.currentCurrency = response.balance.currency;
            this.emit('balance', { balance: response.balance.balance, currency: response.balance.currency });
        }
        if (msgType === 'buy') {
            if (response.error) this.emit('trade_error', response.error);
            else this.emit('trade_executed', response.buy);
        }
        if (msgType === 'proposal_open_contract') this.emit('contract_update', response.proposal_open_contract);

        if (response.req_id && this.pendingRequests.has(response.req_id)) {
            const { resolve, reject } = this.pendingRequests.get(response.req_id);
            this.pendingRequests.delete(response.req_id);
            if (response.error) reject(new Error(response.error.message));
            else resolve(response);
        }
    }

    sendRequest(request) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return reject(new Error('WebSocket not connected'));
            }
            const req_id = ++this.requestId;
            this.pendingRequests.set(req_id, { resolve, reject });
            this.ws.send(JSON.stringify({ ...request, req_id }));
        });
    }

    async subscribeToTicks(symbol) {
        const derivSymbol = this.convertSymbol(symbol);

        for (const existingSymbol of this.subscriptions) {
            try {
                await this.sendRequest({ forget: existingSymbol });
            } catch (e) {}
        }
        this.subscriptions.clear();

        this.lastSubscribedSymbol = symbol;

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

    async placeTrade(symbol, action, stake, duration = 5, durationUnit = 'm') {
        if (!this.authorized) throw new Error('Not authorized');
        if (stake < 0.35) throw new Error('Minimum stake is $0.35');
        const derivSymbol = this.convertSymbol(symbol);
        const contractType = action === 'BUY' ? 'CALL' : 'PUT';
        console.log(`📊 [Deriv] Trade: ${action} ${derivSymbol} $${stake}`);
        return this.sendRequest({
            buy: 1,
            price: stake,
            parameters: {
                amount: stake,
                basis: 'stake',
                contract_type: contractType,
                currency: this.currentCurrency,
                duration,
                duration_unit: durationUnit,
                symbol: derivSymbol
            }
        });
    }

    async getBalance() {
        return { balance: this.currentBalance, currency: this.currentCurrency };
    }

    async getClosedContract(contractId) {
        try {
            return await this.sendRequest({ proposal_open_contract: contractId });
        } catch (e) {
            return null;
        }
    }

    getCurrentBalance() {
        return { balance: this.currentBalance, currency: this.currentCurrency, authorized: this.authorized };
    }

    disconnect() {
        this.isClosing = true;
        this.safeClose();
    }
}

module.exports = new DerivService();
