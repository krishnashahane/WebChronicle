const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch available snapshots from Wayback Machine CDX API
app.get('/api/snapshots', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Normalize URL - strip protocol for CDX query
    const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    // Use collapse=timestamp:4 for ~1 result per year (fast, no filters)
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(cleanUrl)}&output=json&fl=timestamp,original&collapse=timestamp:4&limit=100`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const response = await fetch(cdxUrl, {
      headers: { 'User-Agent': 'WebChronicle/1.0' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Wayback Machine API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length <= 1) {
      return res.json({ snapshots: [], message: 'No snapshots found for this URL' });
    }

    // First row is header, skip it
    const rows = data.slice(1);

    // Group by year, pick one representative snapshot per year (prefer mid-year)
    const byYear = {};
    for (const row of rows) {
      const timestamp = row[0];
      const originalUrl = row[1];
      const year = timestamp.substring(0, 4);

      if (!byYear[year]) {
        byYear[year] = [];
      }
      byYear[year].push({ timestamp, originalUrl });
    }

    // Select best snapshot per year (closest to June)
    const snapshots = [];
    for (const [year, entries] of Object.entries(byYear)) {
      entries.sort((a, b) => {
        const monthA = parseInt(a.timestamp.substring(4, 6), 10);
        const monthB = parseInt(b.timestamp.substring(4, 6), 10);
        return Math.abs(monthA - 6) - Math.abs(monthB - 6);
      });

      const best = entries[0];
      const ts = best.timestamp;
      const dateStr = `${ts.substring(0, 4)}-${ts.substring(4, 6)}-${ts.substring(6, 8)}`;

      snapshots.push({
        year: parseInt(year, 10),
        timestamp: ts,
        date: dateStr,
        url: `https://web.archive.org/web/${ts}/${best.originalUrl}`,
        thumbnailUrl: `https://web.archive.org/web/${ts}im_/${best.originalUrl}`,
        originalUrl: best.originalUrl,
      });
    }

    // Sort by year ascending
    snapshots.sort((a, b) => a.year - b.year);

    res.json({ snapshots, total: rows.length });
  } catch (err) {
    console.error('Error fetching snapshots:', err.message);
    res.status(500).json({ error: `Failed to fetch snapshots: ${err.message}` });
  }
});

// Proxy endpoint to check if a snapshot screenshot is available
app.get('/api/screenshot', async (req, res) => {
  const { timestamp, url } = req.query;
  if (!timestamp || !url) {
    return res.status(400).json({ error: 'timestamp and url are required' });
  }

  const screenshotUrl = `https://web.archive.org/web/${timestamp}im_/${url}`;
  res.json({ screenshotUrl });
});

app.listen(PORT, () => {
  console.log(`WebChronicle server running at http://localhost:${PORT}`);
});
