function getCurrentSession() {
    const hour = new Date().getUTCHours();
    if (hour >= 0 && hour < 9) return 'ASIAN';
    if (hour >= 8 && hour < 17) return 'LONDON';
    return 'NEWYORK';
}

function generateVoucherCode() {
    return 'MONIX-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
        const change = prices[prices.length - i] - prices[prices.length - i - 1];
        if (change >= 0) {
            gains += change;
        } else {
            losses -= change;
        }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function maskEmail(email) {
    const [username, domain] = email.split('@');
    if (username.length <= 3) return email;
    return username.substring(0, 3) + '***@' + domain;
}

function maskUsername(username) {
    if (username.length <= 4) return username;
    return username.substring(0, 2) + '***' + username.substring(username.length - 2);
}

module.exports = {
    getCurrentSession,
    generateVoucherCode,
    formatCurrency,
    calculateRSI,
    sleep,
    maskEmail,
    maskUsername
};
