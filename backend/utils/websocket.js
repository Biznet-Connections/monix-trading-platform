const WebSocket = require('ws');

let wss = null;
let clients = new Set();

function initWebSocket(server) {
    wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws) => {
        clients.add(ws);
        console.log(`🔌 WebSocket client connected. Total: ${clients.size}`);
        
        ws.on('close', () => {
            clients.delete(ws);
            console.log(`🔌 WebSocket client disconnected. Total: ${clients.size}`);
        });
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                }
            } catch (e) {}
        });
    });
    
    return wss;
}

function broadcastAIUpdate(aiData) {
    const message = JSON.stringify({ type: 'ai_update', data: aiData, timestamp: Date.now() });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastPrice(tick) {
    const message = JSON.stringify({ type: 'price', price: tick.quote, symbol: tick.symbol, epoch: tick.epoch });
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
}

function broadcastBalance(balance, currency = 'USD') {
    const message = JSON.stringify({ type: 'balance', balance, currency, timestamp: Date.now() });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

module.exports = {
    initWebSocket,
    broadcastAIUpdate,
    broadcastPrice,
    broadcastTradeResult,
    broadcastNotification,
    broadcastNewSetup,
    broadcastBalance
};
