'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'boards.json');

// 5 MB max per request (board data is typically < 200 KB)
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

// Allow letters, digits, hyphens and underscores, 1–64 chars
const ROOM_CODE_RE = /^[A-Z0-9_-]{1,64}$/i;
const API_KEY = String(process.env.API_KEY || '').trim();
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

function isAllowedOrigin(origin) {
    if (!origin) {
        return false;
    }
    if (!ALLOWED_ORIGINS.length) {
        return false;
    }
    return ALLOWED_ORIGINS.includes(origin);
}

function safeEqualStrings(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function extractApiKey(req) {
    const explicitHeader = req.header('x-api-key');
    if (explicitHeader) {
        return explicitHeader.trim();
    }

    const authHeader = req.header('authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    return '';
}

function requireApiKey(req, res, next) {
    if (!API_KEY) {
        return next();
    }

    const providedApiKey = extractApiKey(req);
    if (!providedApiKey || !safeEqualStrings(providedApiKey, API_KEY)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

// ── Persistent in-memory store ───────────────────────────────────────────────
// Shape: { [ROOM_CODE]: { data: object, lastUpdate: ISOString } }
let store = {};

function loadStore() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                store = parsed;
                console.log(`Loaded ${Object.keys(store).length} room(s) from disk.`);
            }
        }
    } catch (err) {
        console.warn('Could not load persisted data:', err.message);
        store = {};
    }
}

let saveTimer = null;

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(DATA_FILE, JSON.stringify(store), 'utf8');
        } catch (err) {
            console.error('Could not persist data:', err.message);
        }
    }, 2000);
}

loadStore();

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();

// Basic security headers
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
});

// CORS – deny by default, allow only configured origins
app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
        res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
        if (!origin || !isAllowedOrigin(origin)) {
            return res.sendStatus(403);
        }
        return res.sendStatus(204);
    }

    next();
});

// Body parser with size limit (must be before routes that read req.body)
app.use(express.json({ limit: MAX_PAYLOAD_BYTES }));

// Block direct access to server internals
app.use(['/data', '/server.js', '/package.json', '/package-lock.json'], (_req, res) => {
    res.status(403).end();
});

app.use('/api', requireApiKey);

// ── API routes ───────────────────────────────────────────────────────────────

function validateRoomCode(req, res, next) {
    if (!ROOM_CODE_RE.test(req.params.roomCode)) {
        return res.status(400).json({ error: 'Invalid room code. Use 1–64 alphanumeric characters.' });
    }
    next();
}

/**
 * GET /api/board/:roomCode
 * Returns the current board snapshot for the room.
 * Response: { data: object|null, lastUpdate: string }
 */
app.get('/api/board/:roomCode', validateRoomCode, (req, res) => {
    const key = req.params.roomCode.toUpperCase();
    const entry = store[key] || null;
    res.json({
        data: entry ? entry.data : null,
        lastUpdate: entry ? entry.lastUpdate : ''
    });
});

/**
 * PUT /api/board/:roomCode
 * Saves a new board snapshot. Last-write-wins strategy.
 * Body: { data: object, lastKnownUpdate?: string }
 * Response: { lastUpdate: string }
 */
app.put('/api/board/:roomCode', validateRoomCode, (req, res) => {
    const key = req.params.roomCode.toUpperCase();
    const { data } = req.body || {};

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return res.status(400).json({ error: 'Request body must contain a "data" object.' });
    }

    const lastUpdate = new Date().toISOString();
    store[key] = { data, lastUpdate };
    scheduleSave();

    res.json({ lastUpdate });
});

// ── Static frontend ──────────────────────────────────────────────────────────
app.use(express.static(__dirname, {
    index: 'index.html',
    dotfiles: 'deny',
    extensions: ['html']
}));

// SPA fallback – serve index.html for any unmatched GET
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
    console.log(`\nSmart Board server running at http://localhost:${PORT}`);
    if (API_KEY) {
        console.log('API auth: enabled');
    } else {
        console.log('API auth: disabled (set API_KEY to enable)');
    }
    if (ALLOWED_ORIGINS.length) {
        console.log(`CORS allowlist: ${ALLOWED_ORIGINS.join(', ')}`);
    } else {
        console.log('CORS allowlist: empty (cross-origin browser requests denied)');
    }
    console.log(`Default room: http://localhost:${PORT}?room=SMART-BOARD\n`);
});

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other process or set PORT to a different value.`);
        process.exit(1);
    }

    throw err;
});
