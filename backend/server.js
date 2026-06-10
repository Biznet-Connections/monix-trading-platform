const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { init: initDatabase } = require('./config/database');
const derivService = require('./services/derivService');
const marketData = require('./services/marketData');
const knowledgeBase = require('./services/knowledgeBase');
const { broadcastPrice, broadcastSignal, broadcastNotification, broadcastAIUpdate } = require('./utils/websocket');
const aiTrader = require('./services/aiTrader');
const User = require('./models/User');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const tradeRoutes = require('./routes/trades');
const signalRoutes = require('./routes/signals');
const adminRoutes = require('./routes/admin');
const marketRoutes = require('./routes/market');
const aiStatusRoutes = require('./routes/aiStatus');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let lastTickTime = 0;
let tickCount = 0;
let wsClients = 0;
let forceReconnecting = false;
let lastReconnectAttempt = 0;
const RECONNECT_COOLDOWN = 120000;

global.clients = new Set();
global.wss = wss;

wss.on('connection', (ws) => {
    global.clients.add(ws);
    wsClients = global.clients.size;
    console.log(`🔌 WebSocket client connected. Total: ${wsClients}`);
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
            if (data.type === 'get_balance') {
                (async () => {
                    try {
                        const balance = await derivService.getBalance();
                        ws.send(JSON.stringify({ type: 'balance_update', balance: balance.balance, currency: balance.currency }));
                    } catch (e) {}
                })();
            }
        } catch (error) {}
    });
    ws.on('close', () => {
        global.clients.delete(ws);
        wsClients = global.clients.size;
        console.log(`🔌 WebSocket client disconnected. Total: ${wsClients}`);
    });
    ws.send(JSON.stringify({ type: 'connected', message: 'Connected to MONIX WebSocket' }));
});

// Broadcast balance update to all clients
global.broadcastBalance = async () => {
    try {
        const balance = await derivService.getBalance();
        const message = JSON.stringify({ type: 'balance_update', balance: balance.balance, currency: balance.currency, timestamp: Date.now() });
        global.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    } catch (e) {}
};

app.get('/health', (req, res) => {
    const tickAge = lastTickTime ? Math.floor((Date.now() - lastTickTime) / 1000) : 999;
    const session = knowledgeBase.getSessionRules();
    res.json({
        status: 'ok',
        version: '6.0.0',
        edition: 'Professional Trader',
        session: session.name,
        sessionStrategy: session.bestStrategy,
        ticksReceived: tickCount,
        lastTickAge: tickAge,
        aiTraderRunning: aiTrader.isRunning,
        derivConnected: derivService.isConnected,
        derivAuthorized: derivService.authorized,
        memory: process.memoryUsage().heapUsed / 1024 / 1024
    });
});

app.use(helmet({ contentSecurityPolicy: false }));
// 🚨 EMERGENCY FIX: Trust proxy for rate limiting behind Render
app.set('trust proxy', 1);
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.post('/api/log', express.json(), (req, res) => {
    const { message, type } = req.body;
    const logMethod = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log;
    logMethod(`[CLIENT] ${message}`);
    res.json({ success: true });
});

const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500,
    message: { error: 'Too many requests, please try again later' },
    // 🚨 FIX: Skip rate limiting for trusted proxy
    skip: (req) => {
        return req.path === '/health' || req.path === '/api/log';
    }
});
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/ai', aiStatusRoutes);

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

let selfPingInterval = null;
function startSelfPing() {
    if (selfPingInterval) clearInterval(selfPingInterval);
    const port = process.env.PORT || 3000;
    selfPingInterval = setInterval(() => {
        http.request({ hostname: 'localhost', port, path: '/health', method: 'GET', timeout: 5000 }, () => {})
            .on('error', () => {})
            .on('timeout', function() { this.destroy(); })
            .end();
    }, 300000);
}

async function startServer() {
    try {
        await initDatabase();
        console.log('✅ MongoDB connected');

        const session = knowledgeBase.getSessionRules();
        console.log(`🧬 Trading DNA loaded successfully`);
        console.log(`📚 Session: ${session.name} | ${session.personality} | ${session.bestStrategy}`);
        console.log(`🛡️ Risk: ${knowledgeBase.TRADING_KNOWLEDGE.riskManagement.maxRiskPerTrade * 100}% per trade | 1:2 RR | Pause after ${knowledgeBase.TRADING_KNOWLEDGE.riskManagement.maxConsecutiveLosses} losses`);

        // Start Deriv connection without token first (will be reconnected when user logs in)
        try {
            console.log('🔌 Initializing Deriv connection (will wait for user token)...');
            derivService.isConnected = false;
            derivService.authorized = false;
        } catch (error) {
            console.error('❌ Deriv service init error:', error.message);
        }

        server.listen(process.env.PORT || 3000, () => {
            const port = process.env.PORT || 3000;
            console.log(`✅ MONIX Trading Platform v6.0 PROFESSIONAL TRADER running on port ${port}`);
            console.log(`🧬 Trading DNA: ACTIVE | ${session.name} session optimized`);
            startSelfPing();

            // Start AI Trader for the first active user found
            setTimeout(async () => {
                try {
                    const users = await User.getAll();
                    if (users && users.length > 0) {
                        // Find first user that has API keys (demo or real)
                        const activeUser = users.find(u => 
                            u.is_active === true || u.is_active === 1 || u.is_active === 'true'
                        );
                        
                        if (activeUser) {
                            const hasDemoToken = activeUser.demo_token && activeUser.demo_token.trim().length > 10;
                            const hasRealToken = activeUser.real_token && activeUser.real_token.trim().length > 10;
                            
                            if (hasDemoToken || hasRealToken) {
                                const tokenToUse = activeUser.is_demo ? activeUser.demo_token : activeUser.real_token;
                                if (tokenToUse && tokenToUse.trim().length > 10) {
                                    console.log(`🚀 Starting AI Professional Trader for: ${activeUser.username || activeUser.email}`);
                                    console.log(`📊 Mode: ${activeUser.is_demo ? 'DEMO' : 'REAL'} | Symbol: ${activeUser.default_symbol || 'R_75'}`);
                                    await aiTrader.start(activeUser._id, activeUser.default_symbol || 'R_75', activeUser.auto_mode ? 'AUTO' : 'MANUAL');
                                } else {
                                    console.log(`⚠️ User ${activeUser.email} has API keys but they appear invalid. Please re-enter tokens.`);
                                }
                            } else {
                                console.log(`⚠️ User ${activeUser.email} has no API tokens configured. AI Trader will start when user adds tokens.`);
                            }
                        } else {
                            console.log('⚠️ No active user found with API tokens. AI Trader waiting for user login.');
                        }
                    } else {
                        console.log('⚠️ No users found in database. AI Trader waiting for user registration.');
                    }
                } catch (error) {
                    console.error('❌ Failed to start AI Trader:', error.message);
                }
            }, 5000);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

process.on('SIGINT', () => {
    if (selfPingInterval) clearInterval(selfPingInterval);
    aiTrader.stop();
    derivService.disconnect();
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    if (selfPingInterval) clearInterval(selfPingInterval);
    aiTrader.stop();
    derivService.disconnect();
    server.close(() => process.exit(0));
});
