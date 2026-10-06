# ⏳🌐 WebChronicle

Explore how websites changed over time through the **Internet Archive Wayback Machine**.

WebChronicle turns a website URL into a year-by-year timeline of archived captures. Browse representative snapshots, open them in a larger preview, and jump through a site's history without manually searching the archive.

## Features

- **Historical timeline** — one representative capture per available year.
- **Wayback snapshots** — opens archived pages directly from the Internet Archive.
- **Lazy-loaded previews** — avoids loading every archived page at once.
- **Full-screen viewer** — use Previous/Next or the keyboard arrow keys.
- **Quick examples** — Google, Apple, Amazon, The New York Times, and Wikipedia.
- **No database required** — snapshot metadata comes directly from the Wayback CDX API.

## Requirements

- Node.js **18+**
- Network access to `web.archive.org`

## Run locally

```bash
git clone https://github.com/krishnashahane/WebChronicle.git
cd WebChronicle
npm ci
npm start
```

Open `http://localhost:3000`.

Development mode:

```bash
npm run dev
```

Syntax checks:

```bash
npm run check
```

## How it works

```text
Browser
   |
   | GET /api/snapshots?url=...
   v
Express server
   |
   | validated request
   v
Wayback CDX API
   |
   v
Yearly snapshot metadata
   |
   v
Timeline + archived-page previews
```

WebChronicle queries successful captures and groups them by year. When multiple captures are available in a year, it selects the one whose month is closest to June.

The application does **not** permanently store archived website contents.

## API

### `GET /api/snapshots?url=<website>`

Returns representative Wayback captures grouped by year.

Example:

```text
/api/snapshots?url=https%3A%2F%2Fexample.com
```

### `GET /api/screenshot?timestamp=<14-digit timestamp>&url=<website>`

Returns the corresponding Wayback screenshot URL for a validated timestamp and URL.

## Security

The server:

- validates and normalizes user-supplied URLs;
- accepts only HTTP(S) targets;
- removes URL credentials and fragments before archive queries;
- uses a bounded upstream timeout;
- applies a small in-memory API rate limit;
- limits JSON request-body size;
- applies a restrictive Content Security Policy and standard security headers;
- disables Express's `X-Powered-By` header;
- returns generic upstream errors instead of leaking internal error details.

Archived pages are displayed in sandboxed iframes. The frontend constructs dynamic DOM nodes with `textContent` and DOM properties instead of injecting archive-controlled strings as HTML.

## Limitations

Some archived websites may not render correctly in an iframe because captures can have missing assets, redirects, or archive/browser restrictions. Use **Open in Wayback Machine** for the most complete archive view.

The current UI intentionally shows one representative capture per year rather than every capture.

## License

MIT

## Author

**Krishna Shahane**

GitHub: https://github.com/krishnashahane
