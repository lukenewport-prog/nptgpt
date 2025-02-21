import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'change-this-password';

export function generateToken(username) {
    return jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

export function authenticate(username, password) {
    return username === AUTH_USERNAME && password === AUTH_PASSWORD;
}

export function authMiddleware(req, res, next) {
    // Skip auth for login endpoint
    if (req.path === '/api/login') {
        return next();
    }

    // Allow public assets
    if (req.path.startsWith('/styles.css') || 
        req.path === '/script.js' || 
        req.path === '/favicon.ico') {
        return next();
    }

    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        if (req.path === '/') {
            return res.redirect('/login.html');
        }
        return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        if (req.path === '/') {
            return res.redirect('/login.html');
        }
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
}
