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
const { broadcastPrice, broadcastSignal, broadcastNotification } = require('./utils/websocket');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const tradeRoutes = require('./routes/trades');
const signalRoutes = require('./routes/signals');
const adminRoutes = require('./routes/admin');
const marketRoutes = require('./routes/market');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store all connected clients
global.clients = new Set();
global.wss = wss;

// WebSocket connection handling
wss.on('connection', (ws) => {
    global.clients.add(ws);
    console.log(`🔌 WebSocket client connected. Total clients: ${global.clients.size}`);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        global.clients.delete(ws);
        console.log(`🔌 WebSocket client disconnected. Total clients: ${global.clients.size}`);
    });
    
    ws.send(JSON.stringify({ type: 'connected', message: 'Connected to MONIX WebSocket' }));
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Terminal logging endpoint for client-side logs
app.post('/api/log', express.json(), (req, res) => {
    const { message, type, timestamp } = req.body;
    const logMethod = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log;
    logMethod(`[CLIENT] ${message}`);
    res.json({ success: true });
});

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/market', marketRoutes);

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Initialize database and start server
async function startServer() {
    try {
        await initDatabase();
        console.log('✅ Database initialized');
        
        // Connect to Deriv
        try {
            await derivService.connect();
            console.log('✅ Deriv WebSocket connected');
            
            // Subscribe to default symbol
            derivService.subscribeToTicks(process.env.DEFAULT_SYMBOL || 'R_75');
            
            // Handle Deriv price updates
            derivService.on('tick', (tick) => {
                broadcastPrice(tick);
            });
            
            derivService.on('trade_executed', (result) => {
                console.log(`📊 Trade executed: ${result.contract_id}`);
                broadcastNotification('Trade Executed', `Contract ${result.contract_id} opened`, 'success');
            });
            
            derivService.on('trade_error', (error) => {
                console.error('Trade error:', error);
                broadcastNotification('Trade Failed', error.message, 'error');
            });
            
            derivService.on('authorized', (data) => {
                console.log(`🔐 Authorized: ${data.loginid} | Balance: ${data.balance} ${data.currency}`);
            });
        } catch (error) {
            console.error('❌ Deriv connection failed:', error.message);
        }
        
        server.listen(process.env.PORT || 3000, () => {
            console.log(`✅ MONIX Trading Platform running on port ${process.env.PORT || 3000}`);
            console.log(`📍 Local: http://localhost:${process.env.PORT || 3000}`);
            console.log(`📧 Admin email: ${process.env.ADMIN_EMAIL}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    derivService.disconnect();
    server.close(() => {
        process.exit(0);
    });
});
