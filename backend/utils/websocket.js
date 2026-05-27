const WebSocket = require('ws');

let wss = null;
let clients = new Set();
let debugMode = true;

function logDebug(message, data = null) {
    if (debugMode) {
        console.log(`🔌 [WS] ${message}`);
        if (data) console.log(`   Data:`, JSON.stringify(data).substring(0, 200));
    }
}

function initWebSocket(server) {
    wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        clients.add(ws);
        console.log(`🔌 WebSocket client connected from ${clientIp}. Total: ${clients.size}`);
        
        // Send welcome message
        ws.send(JSON.stringify({ type: 'connected', message: 'Connected to MONIX WebSocket', clientId: Date.now() }));
        
        ws.on('close', () => {
            clients.delete(ws);
            console.log(`🔌 WebSocket client disconnected. Total: ${clients.size}`);
        });
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                logDebug(`Received: ${data.type}`, data);
                if (data.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                }
            } catch (e) {}
        });
        
        ws.on('error', (err) => {
            console.error(`🔌 WebSocket error:`, err.message);
        });
    });
    
    return wss;
}

function broadcastAIUpdate(aiData) {
    const clientCount = clients.size;
    logDebug(`Broadcasting AI update to ${clientCount} clients`);
    
    const message = JSON.stringify({ 
        type: 'ai_update', 
        data: {
            watch_state: aiData.watch_state || aiData,
            timestamp: Date.now()
        }
    });
    
    let sent = 0;
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
            sent++;
        }
    });
    logDebug(`AI update sent to ${sent}/${clientCount} clients`);
}

function broadcastPrice(tick) {
    const message = JSON.stringify({ 
        type: 'price', 
        price: tick.quote, 
        symbol: tick.symbol, 
        epoch: tick.epoch,
        timestamp: Date.now()
    });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastTradeResult(trade) {
    const message = JSON.stringify({ type: 'trade_result', trade, timestamp: Date.now() });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    logDebug(`Trade result broadcast: ${trade.status} $${trade.profit}`);
}

function broadcastNotification(title, message, notificationType = 'info') {
    const msg = JSON.stringify({ type: 'notification', title, message, notificationType, timestamp: Date.now() });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

function broadcastNewSetup(setup) {
    const message = JSON.stringify({ type: 'new_setup', setup, timestamp: Date.now() });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    logDebug(`New setup broadcast: ${setup.action} ${setup.symbol}`);
}

function broadcastBalance(balance, currency = 'USD') {
    const message = JSON.stringify({ type: 'balance', balance, currency, timestamp: Date.now() });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    logDebug(`Balance broadcast: $${balance}`);
}

function getClientCount() {
    return clients.size;
}

module.exports = {
    initWebSocket,
    broadcastAIUpdate,
    broadcastPrice,
    broadcastTradeResult,
    broadcastNotification,
    broadcastNewSetup,
    broadcastBalance,
    getClientCount
};
