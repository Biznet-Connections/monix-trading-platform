const express = require('express');
const http = require('http');
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
const { initWebSocket, broadcastPrice, broadcastNotification, broadcastAIUpdate, broadcastBalance } = require('./utils/websocket');
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

// Initialize WebSocket
initWebSocket(server);

let lastTickTime = 0;
let tickCount = 0;

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
        derivAuthorized: derivService.authorized
    });
});

app.use(helmet({ contentSecurityPolicy: false }));
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
    message: { error: 'Too many requests, please try again later' }
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

async function startServer() {
    try {
        await initDatabase();
        console.log('✅ MongoDB connected');

        const session = knowledgeBase.getSessionRules();
        console.log(`🧬 Trading DNA loaded successfully`);
        console.log(`📚 Session: ${session.name} | ${session.personality} | ${session.bestStrategy}`);
        console.log(`🛡️ Risk: ${knowledgeBase.TRADING_KNOWLEDGE.riskManagement.maxRiskPerTrade * 100}% per trade | 1:2 RR | Pause after ${knowledgeBase.TRADING_KNOWLEDGE.riskManagement.maxConsecutiveLosses} losses`);

        try {
            // Try to connect with token from env or user later
            console.log('⚠️ Deriv connection requires API token in database');
        } catch (error) {
            console.error('❌ Deriv connection failed:', error.message);
        }

        server.listen(process.env.PORT || 3000, () => {
            const port = process.env.PORT || 3000;
            console.log(`✅ MONIX Trading Platform v6.0 PROFESSIONAL TRADER running on port ${port}`);
            console.log(`🧬 Trading DNA: ACTIVE | ${session.name} session optimized`);

            // Try to start AI Trader with admin user
            setTimeout(async () => {
                try {
                    const adminUser = await User.findOne({ is_admin: true });
                    if (adminUser) {
                        const token = adminUser.is_demo ? adminUser.demo_token : adminUser.real_token;
                        if (token) {
                            console.log(`🚀 Starting AI Professional Trader for: ${adminUser.username}`);
                            await aiTrader.start(adminUser._id, adminUser.default_symbol || 'R_75', adminUser.auto_mode ? 'AUTO' : 'MANUAL');
                        }
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
    aiTrader.stop();
    derivService.disconnect();
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    aiTrader.stop();
    derivService.disconnect();
    server.close(() => process.exit(0));
});
