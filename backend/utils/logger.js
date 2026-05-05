const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFileName() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `${date}.log`);
}

function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data })
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(getLogFileName(), logLine);
    
    if (level === 'ERROR') {
        console.error(`[${timestamp}] ERROR: ${message}`, data || '');
    } else if (level === 'WARN') {
        console.warn(`[${timestamp}] WARN: ${message}`);
    } else {
        console.log(`[${timestamp}] INFO: ${message}`);
    }
}

module.exports = {
    info: (message, data) => log('INFO', message, data),
    warn: (message, data) => log('WARN', message, data),
    error: (message, data) => log('ERROR', message, data),
    debug: (message, data) => {
        if (process.env.NODE_ENV === 'development') {
            log('DEBUG', message, data);
        }
    }
};
