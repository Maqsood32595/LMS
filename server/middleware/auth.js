/**
 * Shared JWT authentication middleware for Fractal cells.
 * Usage in any routes.js:
 *   const { requireAuth, requireRole } = require('../../middleware/auth');
 */
const jwt = require('jsonwebtoken');

function signToken(user) {
    return jwt.sign(
        { sub: user.id, email: user.email, role: user.role || 'student' },
        process.env.JWT_SECRET || 'dev-insecure-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

function verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET || 'dev-insecure-secret');
}

/** Extracts Bearer token → attaches req.user or responds 401. */
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
        req.user = verifyToken(token);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/** Attaches req.user when a token is present; never blocks. */
function optionalAuth(req, _res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
        try { req.user = verifyToken(token); } catch (_e) { /* anonymous */ }
    }
    next();
}

/** Restrict to roles, e.g. requireRole('instructor', 'admin'). */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = { signToken, verifyToken, requireAuth, optionalAuth, requireRole };
