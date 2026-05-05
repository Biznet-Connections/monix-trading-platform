let globalWss = null;
let globalClients = new Set();

function setWebSocketServer(wss) {
    globalWss = wss;
}

function setClients(clients) {
    globalClients = clients;
}

function broadcastToAll(message) {
    if (!globalWss) return;

    const data = typeof message === 'string' ? message : JSON.stringify(message);
    globalClients.forEach(client => {
        if (client.readyState === 1) {
            client.send(data);
        }
    });
}

function broadcastPrice(tick) {
    broadcastToAll({
        type: 'price',
        symbol: tick.symbol,
        price: tick.quote,
        timestamp: tick.epoch
    });
}

function broadcastSignal(signal) {
    broadcastToAll({
        type: 'signal',
        signal: signal
    });
}

function broadcastNotification(title, message, type = 'info') {
    broadcastToAll({
        type: 'notification',
        title: title,
        message: message,
        notificationType: type,
        timestamp: Date.now()
    });
}

function broadcastTradeResult(trade) {
    broadcastToAll({
        type: 'trade_result',
        trade: trade
    });
}

function broadcastBalance(userId, balance) {
    broadcastToAll({
        type: 'balance',
        userId: userId,
        balance: balance,
        timestamp: Date.now()
    });
}

function broadcastTradeUpdate(trade) {
    broadcastToAll({
        type: 'trade_update',
        trade: trade
    });
}

module.exports = {
    setWebSocketServer,
    setClients,
    broadcastToAll,
    broadcastPrice,
    broadcastSignal,
    broadcastNotification,
    broadcastTradeResult,
    broadcastBalance,
    broadcastTradeUpdate
};
