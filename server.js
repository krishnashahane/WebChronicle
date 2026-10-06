const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const WAYBACK_TIMEOUT_MS = 15000;
const MAX_URL_LENGTH = 2048;
const MAX_CDX_ROWS = 100;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const requestLog = new Map();

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "frame-src https://web.archive.org",
    "connect-src 'self'"
  ].join('; '));
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '10kb' }));

function rateLimit(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();

  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const existing = requestLog.get(key);

  if (!existing || now - existing.windowStart >= RATE_WINDOW_MS) {
    requestLog.set(key, { windowStart: now, count: 1 });
    return next();
  }

  if (existing.count >= RATE_LIMIT) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  existing.count += 1;
  return next();
}

app.use(rateLimit);

app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  dotfiles: 'deny',
  maxAge: '1h'
}));

function normalizeUrl(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) {
    return null;
  }

  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;

  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';

  return parsed.toString().replace(/\/+$/, '');
}

function isValidTimestamp(timestamp) {
  return /^\d{14}$/.test(timestamp);
}

function buildSnapshotUrl(timestamp, originalUrl) {
  return `https://web.archive.org/web/${timestamp}/${originalUrl}`;
}

app.get('/api/snapshots', async (req, res) => {
  const normalizedUrl = normalizeUrl(req.query.url);

  if (!normalizedUrl) {
    return res.status(400).json({ error: 'Enter a valid http:// or https:// website URL.' });
  }

  const cdxUrl = new URL('https://web.archive.org/cdx/search/cdx');
  cdxUrl.searchParams.set('url', normalizedUrl);
  cdxUrl.searchParams.set('output', 'json');
  cdxUrl.searchParams.set('fl', 'timestamp,original');
  cdxUrl.searchParams.set('filter', 'statuscode:200');
  cdxUrl.searchParams.set('collapse', 'timestamp:4');
  cdxUrl.searchParams.set('limit', String(MAX_CDX_ROWS));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAYBACK_TIMEOUT_MS);

  try {
    const response = await fetch(cdxUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'WebChronicle/1.1 (+https://github.com/krishnashahane/WebChronicle)',
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'The Wayback Machine could not be queried right now.' });
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length <= 1) {
      return res.json({ snapshots: [], total: 0, message: 'No snapshots found for this URL.' });
    }

    const rows = data.slice(1).filter(
      row => Array.isArray(row) && isValidTimestamp(String(row[0])) && typeof row[1] === 'string'
    );

    const byYear = new Map();

    for (const [timestamp, originalUrl] of rows) {
      const year = String(timestamp).slice(0, 4);
      const entries = byYear.get(year) || [];
      entries.push({ timestamp: String(timestamp), originalUrl });
      byYear.set(year, entries);
    }

    const snapshots = [];

    for (const [year, entries] of byYear) {
      entries.sort((a, b) => {
        const monthA = Number(a.timestamp.slice(4, 6));
        const monthB = Number(b.timestamp.slice(4, 6));
        return Math.abs(monthA - 6) - Math.abs(monthB - 6);
      });

      const best = entries[0];
      snapshots.push({
        year: Number(year),
        timestamp: best.timestamp,
        date: `${best.timestamp.slice(0, 4)}-${best.timestamp.slice(4, 6)}-${best.timestamp.slice(6, 8)}`,
        url: buildSnapshotUrl(best.timestamp, best.originalUrl),
        thumbnailUrl: `https://web.archive.org/web/${best.timestamp}im_/${best.originalUrl}`,
        originalUrl: best.originalUrl
      });
    }

    snapshots.sort((a, b) => a.year - b.year);
    return res.json({ snapshots, total: rows.length });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'The Wayback Machine request timed out. Please try again.' });
    }

    console.error('Wayback request failed:', error);
    return res.status(502).json({ error: 'Unable to retrieve archived snapshots right now.' });
  } finally {
    clearTimeout(timeout);
  }
});

app.get('/api/screenshot', (req, res) => {
  const timestamp = String(req.query.timestamp || '');
  const normalizedUrl = normalizeUrl(req.query.url);

  if (!isValidTimestamp(timestamp) || !normalizedUrl) {
    return res.status(400).json({ error: 'Invalid timestamp or website URL.' });
  }

  return res.json({
    screenshotUrl: `https://web.archive.org/web/${timestamp}im_/${normalizedUrl}`
  });
});

app.listen(PORT, HOST, () => {
  console.log(`WebChronicle server running on http://localhost:${PORT}`);
});