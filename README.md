# MONIX AI Trading Platform

## Complete Professional Forex Trading Platform

### Features
- Real-time Deriv WebSocket Integration
- DeepSeek AI Market Analysis
- Candlestick Charts with ApexCharts
- Auto Trading Mode
- Signal Push Notifications
- Email Alerts
- Admin Dashboard
- Voucher System
- Demo/Real Mode Switching

### Installation on Termux

```bash
# Update packages
pkg update && pkg upgrade

# Install Node.js
pkg install nodejs git

# Clone repository
git clone https://github.com/yourusername/monix-trading-platform.git
cd monix-trading-platform

# Install dependencies
npm install

# Run setup
npm run setup

# Edit .env file with your email password
nano .env

# Start the platform
npm start
