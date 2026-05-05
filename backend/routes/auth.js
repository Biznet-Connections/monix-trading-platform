const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Voucher = require('../models/Voucher');
const emailService = require('../services/emailService');

// Validation middleware
const validateSignup = (req, res, next) => {
    const { email, username, password, voucher_code } = req.body;
    
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' });
    }
    if (!username || username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!voucher_code) {
        return res.status(400).json({ error: 'Voucher code required' });
    }
    next();
};

const validateLogin = (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    next();
};

// Register route
router.post('/register', validateSignup, async (req, res) => {
    try {
        const { email, username, password, voucher_code } = req.body;
        
        // Check if user exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Check username
        const existingUsername = await User.findByUsername(username);
        if (existingUsername) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        
        // Validate voucher
        const voucher = await Voucher.findByCode(voucher_code);
        if (!voucher) {
            return res.status(400).json({ error: 'Invalid voucher code' });
        }
        
        if (voucher.used_by) {
            return res.status(400).json({ error: 'Voucher already used' });
        }
        
        // Calculate expiry
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + voucher.days_valid);
        
        // Create user
        const userId = await User.create({ 
            email, 
            username, 
            password, 
            voucher_code,
            trades_limit: voucher.trades_limit,
            expiry_date: expiryDate.toISOString().split('T')[0]
        });
        
        // Mark voucher as used
        await Voucher.markUsed(voucher_code, userId);
        
        // Send welcome email
        await emailService.sendWelcome(email, username);
        
        // Generate token
        const user = await User.findById(userId);
        const token = User.generateToken(user);
        
        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                is_admin: user.is_admin,
                is_demo: user.is_demo,
                trades_remaining: user.trades_remaining,
                voucher_expiry: user.voucher_expiry
            }
        });
        
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login route
router.post('/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const isValid = await User.verifyPassword(user, password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check if account is active
        if (!user.is_active) {
            return res.status(401).json({ error: 'Account blocked. Contact admin.' });
        }
        
        // Check voucher expiry
        if (user.voucher_expiry && new Date(user.voucher_expiry) < new Date()) {
            return res.status(401).json({ error: 'Voucher expired. Please contact admin for new voucher.' });
        }
        
        // Update last login
        await User.update(user.id, { last_login: new Date().toISOString() });
        
        const token = User.generateToken(user);
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                is_admin: user.is_admin,
                is_demo: user.is_demo,
                trades_remaining: user.trades_remaining,
                voucher_expiry: user.voucher_expiry,
                auto_mode: user.auto_mode,
                push_signals: user.push_signals,
                jackpot_mode: user.jackpot_mode,
                default_symbol: user.default_symbol,
                base_stake: user.base_stake,
                demo_token: user.demo_token,
                real_token: user.real_token
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify token route
router.post('/verify', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = User.verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    const user = await User.findById(decoded.id);
    if (!user || !user.is_active) {
        return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    // Check voucher expiry
    if (user.voucher_expiry && new Date(user.voucher_expiry) < new Date()) {
        return res.status(401).json({ error: 'Voucher expired' });
    }
    
    res.json({
        valid: true,
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            is_admin: user.is_admin,
            trades_remaining: user.trades_remaining,
            voucher_expiry: user.voucher_expiry
        }
    });
});

// Change password route
router.post('/change-password', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    const decoded = User.verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });
    
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(decoded.id);
    
    const isValid = await User.verifyPassword(user, currentPassword);
    if (!isValid) {
        return res.status(401).json({ error: 'Current password incorrect' });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.update(user.id, { password: hashedPassword });
    
    res.json({ success: true, message: 'Password changed successfully' });
});

// Forgot password - send reset email
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    const user = await User.findByEmail(email);
    if (!user) {
        return res.status(404).json({ error: 'Email not found' });
    }
    
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    await User.update(user.id, { reset_token: resetToken, reset_expiry: new Date(Date.now() + 3600000).toISOString() });
    
    const resetLink = `${process.env.API_URL}/reset-password?token=${resetToken}`;
    
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4f46e5;">Reset Your Password</h1>
            <p>Click the link below to reset your password. This link expires in 1 hour.</p>
            <a href="${resetLink}" style="background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <p>If you didn't request this, ignore this email.</p>
        </div>
    `;
    
    await emailService.send(email, 'Reset Your MONIX Password', html);
    
    res.json({ success: true, message: 'Reset email sent' });
});

module.exports = router;
