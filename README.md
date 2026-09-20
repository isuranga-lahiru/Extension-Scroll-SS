# AuraTech Full Page Capture – Chrome Extension

> Capture full-page scrolling screenshots and export them locally as **PNG**, **JPG**, or (Pro) **multi-page PDF**. No uploads. No analytics. No tracking.

---

## Features

| Feature                              | Free        | Pro                |
| ------------------------------------ | ----------- | ------------------ |
| Export as PNG                        | ✅          | ✅                 |
| Export as JPG (configurable quality) | ✅          | ✅                 |
| Export as PDF (multi-page)           | ❌          | ✅                 |
| Frames per capture                   | Up to **7** | Up to memory limit |
| Dynamic memory safety (250 MB)       | –           | ✅                 |
| In-page overlay with counter & Stop  | ✅          | ✅                 |
| Hide fixed/sticky nav bars           | ✅          | ✅                 |
| Custom scroll delay                  | ✅          | ✅                 |

---

## Installation

1. **Clone / download** this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project root folder  
   (`Extension Scroll SS/`).
5. The **AuraTech Full Page Capture** icon will appear in your toolbar.

---

## Usage

1. Navigate to any web page you want to capture.
2. Click the extension icon to open the popup.
3. **Select format**: PNG, JPG, or PDF (Pro).
4. Optionally open **Settings** to adjust:
   - Scroll delay (100–800 ms)
   - JPG quality (60–100%)
   - Hide fixed/sticky elements (default: on)
5. Click **Capture Full Page**.
6. The page scrolls automatically. Watch the overlay pill for progress.
7. To stop early: click **Stop** on the overlay or press **Esc**.
8. The file downloads automatically:  
   `FullPageCapture_YYYY-MM-DD_HH-mm-ss.<png|jpg|pdf>`

### Testing Pro features (Developer)

1. Open the popup → expand **Settings**.
2. Enable **⚙ Mock Pro (Dev only)**.
3. Select **PDF** format and capture.
4. Disable the toggle to revert to Free tier.

---

## Permissions Justification

| Permission  | Why it's needed                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `activeTab` | Access the currently focused tab to scroll and capture it                                         |
| `scripting` | Inject the content script (overlay + scroll control) into the page                                |
| `offscreen` | Create a hidden document to stitch image frames and run jsPDF without blocking the service worker |
| `downloads` | Save the final PNG/JPG/PDF to the user's Downloads folder                                         |
| `storage`   | Persist user tier and settings locally across sessions                                            |

No `host_permissions` or `tabs` permission is requested.

---

## Privacy

> **All processing happens locally; no page content leaves your device.**

- No analytics, telemetry, or network requests to external servers.
- No data is stored beyond local extension settings (format choice, quality preference, etc.).
- The `offscreen` document and all frame data are fully disposed after each capture.
- Object URLs are revoked within 10 seconds of download dispatch.

---

## Project Structure

```
Extension Scroll SS/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   ├── content.js
│   └── overlay.css
├── background/
│   └── service-worker.js
├── offscreen/
│   ├── offscreen.html
│   ├── offscreen.js
│   └── jspdf.umd.min.js
├── assets/
│   └── icons/
│       ├── 16.png
│       ├── 48.png
│       └── 128.png
└── README.md
```

---

## Known Limitations

1. **Cannot capture** `chrome://`, `chrome-extension://`, or `about:` pages (Chrome restriction).
2. **Very large pages** in PNG/JPG mode may hit the 250 MB memory ceiling — use PDF instead.
3. **Dynamic/animated content** (e.g., carousels, videos) is captured at the moment of each scroll stop.
4. **Cross-origin iframes** are not captured (browser security restriction).
5. Pages that block `scrollTo()` via JavaScript may not scroll correctly.

---

## Third-Party Libraries

- **[jsPDF](https://github.com/parallax/jsPDF)** v2.5.1 – MIT License  
  Bundled locally at `offscreen/jspdf.umd.min.js`. No CDN, no remote fetch.
