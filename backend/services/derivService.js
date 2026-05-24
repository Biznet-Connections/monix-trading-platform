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
        this.keepAliveInterval = null;
        this.lastSubscribedSymbol = null;
        this.activeAccountId = null;

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
        console.log(`⚠️ [Deriv] Unknown symbol: ${uiSymbol}, using as-is`);
        return uiSymbol;
    }

    async fetchAccountsViaRest(token) {
        const response = await fetch(`${process.env.DERIV_API_BASE}/accounts`, {
            method: 'GET',
            headers: {
                'Deriv-App-ID': process.env.DERIV_APP_ID,
                'Deriv-Client-ID': process.env.DERIV_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error(`REST Account Fetch Failed: ${response.status}`);
        return await response.json();
    }

    async fetchWebSocketOtpUrl(token, accountId) {
        console.log(`🔑 [Deriv REST] Requesting session OTP for account: ${accountId}`);
        const response = await fetch(`${process.env.DERIV_API_BASE}/accounts/${accountId}/otp`, {
            method: 'POST',
            headers: {
                'Deriv-App-ID': process.env.DERIV_APP_ID,
                'Deriv-Client-ID': process.env.DERIV_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OTP Generation Failed: ${errText}`);
        }
        const payload = await response.json();
        return payload.data?.url;
    }

    connect(token = null, forceNew = false, preferDemo = true) {
        if (this.isConnecting) {
            console.log('⚠️ [Deriv] Connection setup already in progress');
            return Promise.resolve();
        }

        this.isConnecting = true;
        this.isClosing = false;
        this.currentToken = token;

        if (forceNew) this.safeClose();

        return new Promise(async (resolve, reject) => {
            try {
                if (!token) throw new Error('Cannot connect without valid PAT token');

                const accountData = await this.fetchAccountsViaRest(token);
                const targetType = preferDemo ? 'demo' : 'real';
                const selectedAccount = accountData.data?.find(acc => acc.account_type === targetType);

                if (!selectedAccount) throw new Error(`No ${targetType} account found on profile.`);

                this.activeAccountId = selectedAccount.account_id;
                this.currentBalance = parseFloat(selectedAccount.balance);
                this.currentCurrency = selectedAccount.currency || 'USD';

                const secureWsUrl = await this.fetchWebSocketOtpUrl(token, this.activeAccountId);
                console.log(`🔌 [Deriv WS] Connecting to pre-authenticated session...`);

                this.ws = new WebSocket(secureWsUrl, { handshakeTimeout: 15000, timeout: 60000 });

                this.ws.on('error', (error) => {
                    if (!this.isClosing) console.error(`❌ [Deriv WS] Error:`, error.message);
                    if (!this.isConnected) {
                        this.isConnecting = false;
                        reject(error);
                    }
                });

                this.ws.on('open', () => {
                    console.log(`✅ [Deriv WS] Session active and pre-authenticated!`);
                    this.isConnected = true;
                    this.isConnecting = false;
                    this.authorized = true;
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
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
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
        const isDemoMode = this.activeAccountId ? this.activeAccountId.startsWith('D') : true;
        await this.connect(this.currentToken, true, isDemoMode);
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
                const isDemoMode = this.activeAccountId ? this.activeAccountId.startsWith('D') : true;
                await this.connect(this.currentToken, true, isDemoMode);
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
        if (msgType === 'tick') this.emit('tick', response.tick);
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

    async authorize(token) {
        return { authorize: { balance: this.currentBalance, currency: this.currentCurrency } };
    }

    async subscribeToTicks(symbol) {
        const derivSymbol = this.convertSymbol(symbol);
        this.lastSubscribedSymbol = symbol;
        try {
            return await this.sendRequest({ ticks: derivSymbol, subscribe: 1 });
        } catch (error) {
            console.error(`❌ Subscribe failed for ${derivSymbol}:`, error.message);
            throw error;
        }
    }

    async placeTrade(symbol, action, stake, duration = 5, durationUnit = 'm') {
        if (!this.authorized) throw new Error('Not authorized');
        if (stake < 0.35) throw new Error('Minimum stake is $0.35');
        
        const derivSymbol = this.convertSymbol(symbol);
        const contractType = action === 'BUY' ? 'CALL' : 'PUT';
        
        // R_10, R_25, R_50 require seconds ('s') instead of minutes ('m')
        let unit = durationUnit;
        if (['R_10', 'R_25', 'R_50'].includes(symbol)) {
            unit = 's';
        }

        console.log(`📊 [Deriv] Trade: ${action} ${derivSymbol} $${stake} (${duration}${unit})`);
        
        return this.sendRequest({
            buy: 1,
            price: stake,
            parameters: {
                amount: stake,
                basis: 'stake',
                contract_type: contractType,
                currency: 'USD',
                duration: duration,
                duration_unit: unit,
                symbol: derivSymbol
            }
        });
    }

    async getBalance() {
        return { balance: this.currentBalance, currency: this.currentCurrency };
    }

    async getBalanceWithToken(token) {
        return this.getBalance();
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
