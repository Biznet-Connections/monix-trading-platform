const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.init();
    }
    
    init() {
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_PASS !== 'your_app_password_here') {
            this.transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT),
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });
            console.log('✅ Email service initialized');
        } else {
            console.log('⚠️ Email not configured - set EMAIL_PASS in .env');
        }
    }
    
    async send(to, subject, html) {
        if (!this.transporter) {
            console.log(`Email not sent (no config): ${subject} to ${to}`);
            return false;
        }
        
        try {
            await this.transporter.sendMail({
                from: process.env.EMAIL_FROM,
                to: to,
                subject: subject,
                html: html
            });
            return true;
        } catch (error) {
            console.error('Email send error:', error);
            return false;
        }
    }
    
    async sendWelcome(email, username) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #4f46e5;">Welcome to MONIX Trading, ${username}!</h1>
                <p>Your account has been successfully created.</p>
                <p>You can now start trading with AI-powered signals from DeepSeek.</p>
                <hr>
                <h3>Quick Start:</h3>
                <ul>
                    <li>Go to API Keys page and add your Deriv tokens</li>
                    <li>Switch between DEMO and REAL mode</li>
                    <li>Click GET SIGNAL for AI analysis</li>
                    <li>Click YES to execute trades</li>
                </ul>
                <p>Need help? Contact: ${process.env.ADMIN_EMAIL}</p>
                <p style="color: #666; font-size: 12px;">MONIX Trading Platform v3.0</p>
            </div>
        `;
        return this.send(email, 'Welcome to MONIX Trading', html);
    }
    
    async sendTradeResult(email, username, trade, result) {
        const emoji = result === 'WIN' ? '🎉 WINNER!' : '💔 LOSS';
        const color = result === 'WIN' ? '#22c55e' : '#ef4444';
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: ${color};">${emoji}</h1>
                <h2>Trade Result for ${username}</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px;"><strong>Symbol:</strong></td><td>${trade.symbol}</td></tr>
                    <tr><td style="padding: 8px;"><strong>Action:</strong></td><td>${trade.action}</td></tr>
                    <tr><td style="padding: 8px;"><strong>Entry:</strong></td><td>$${trade.entry_price}</td></tr>
                    <tr><td style="padding: 8px;"><strong>Exit:</strong></td><td>$${trade.exit_price}</td></tr>
                    <tr><td style="padding: 8px;"><strong>Stake:</strong></td><td>$${trade.stake}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;"><strong>Profit:</strong></td><td style="color: ${color}; font-weight: bold;">$${trade.profit}</td></tr>
                    <tr><td style="padding: 8px;"><strong>Confidence:</strong></td><td>${trade.confidence}%</td></tr>
                    <tr><td style="padding: 8px;"><strong>Pattern:</strong></td><td>${trade.pattern}</td></tr>
                </table>
                <hr>
                <p>View full history in your MONIX dashboard.</p>
            </div>
        `;
        return this.send(email, `MONIX Trade Result: ${result}`, html);
    }
    
    async sendSignal(email, username, signal) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #4f46e5;">📊 New AI Signal</h1>
                <h2>${signal.action} ${signal.symbol}</h2>
                <p>Confidence: <strong style="color: #22c55e;">${signal.confidence}%</strong></p>
                <p>Pattern: ${signal.pattern}</p>
                <p>Entry: $${signal.entry_price}</p>
                <p>TP: $${signal.take_profit} | SL: $${signal.stop_loss}</p>
                <p>Reasoning: ${signal.reasoning}</p>
                <hr>
                <p>Log in to MONIX to execute this trade.</p>
            </div>
        `;
        return this.send(email, `MONIX Signal: ${signal.action} ${signal.symbol}`, html);
    }
    
    async sendDailyReport(email, username, stats, topPatterns) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #4f46e5;">📈 MONIX Daily Report</h1>
                <h2>Hello ${username}!</h2>
                <h3>Today's Performance:</h3>
                <table style="width: 100%;">
                    <tr><td>Trades:</td><td><strong>${stats.today_trades || 0}</strong></td></tr>
                    <tr><td>Wins/Losses:</td><td><strong>${stats.today_wins || 0}/${stats.today_losses || 0}</strong></td></tr>
                    <tr><td>Today's Profit:</td><td style="color: ${(stats.today_profit || 0) >= 0 ? '#22c55e' : '#ef4444'}"><strong>$${stats.today_profit || 0}</strong></td></tr>
                </table>
                <h3>Overall Stats:</h3>
                <table style="width: 100%;">
                    <tr><td>Win Rate:</td><td><strong>${stats.win_rate}%</strong></td></tr>
                    <tr><td>Total Profit:</td><td><strong>$${stats.net_profit}</strong></td></tr>
                    <tr><td>Best Streak:</td><td><strong>${stats.best_streak}</strong></td></tr>
                </table>
                <h3>💰 Top Patterns for Tomorrow:</h3>
                <ul>
                    ${topPatterns.map(p => `<li>${p.pattern_name} on ${p.symbol}: ${p.win_rate}% win rate</li>`).join('')}
                </ul>
                <hr>
                <p>Keep trading! Visit MONIX dashboard for live signals.</p>
            </div>
        `;
        return this.send(email, `MONIX Daily Report - ${new Date().toLocaleDateString()}`, html);
    }
    
    async sendAccountBlocked(email, username) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #ef4444;">Account Blocked</h1>
                <p>Hello ${username},</p>
                <p>Your MONIX trading account has been blocked.</p>
                <p>Please contact support: ${process.env.ADMIN_EMAIL}</p>
            </div>
        `;
        return this.send(email, 'MONIX Account Status', html);
    }
    
    async sendAdminGranted(email, username) {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #4f46e5;">Admin Access Granted</h1>
                <p>Hello ${username},</p>
                <p>You have been granted admin access to MONIX Trading Platform.</p>
                <p>You can now:</p>
                <ul>
                    <li>Generate vouchers</li>
                    <li>View all users</li>
                    <li>Send broadcasts</li>
                    <li>View system stats</li>
                </ul>
            </div>
        `;
        return this.send(email, 'MONIX Admin Access Granted', html);
    }
    
    async sendBroadcast(email, username, message, subject = 'MONIX Announcement') {
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #4f46e5;">${subject}</h1>
                <p>Hello ${username},</p>
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                    ${message.replace(/\n/g, '<br>')}
                </div>
                <hr>
                <p>MONIX Trading Platform</p>
            </div>
        `;
        return this.send(email, subject, html);
    }
}

module.exports = new EmailService();
