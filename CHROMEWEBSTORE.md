# Chrome Web Store — Listing Metadata

# AuraTech Full Page Capture

---

## 1. Basic Listing Info

| Field                 | Value                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| **Extension Name**    | AuraTech Full Page Capture                                                                        |
| **Short Description** | Capture full-page scrolling screenshots. Export as PNG, JPG, or PDF — 100% locally, zero uploads. |
| **Version**           | 1.0.0                                                                                             |
| **Category**          | Productivity                                                                                      |
| **Language**          | English                                                                                           |
| **Website URL**       | https://auratech.lk _(update before publishing)_                                                  |
| **Support URL**       | https://auratech.lk/support                                                                       |

---

## 2. Full Description (max 16,000 chars)

```
AuraTech Full Page Capture — Scroll. Screenshot. Save.

Capture any entire web page — no matter how long — with a single click. The extension
automatically scrolls through the page, stitches every frame together, and exports the
final image directly to your device.

✅ FEATURES
• Full-page scrolling screenshots in PNG and JPG (Free)
• Multi-page PDF export with exact page sizing — no margins (Pro)
• All processing happens 100% locally — nothing ever leaves your device
• Premium dark-mode popup with live recording overlay
• Floating "Recording" pill with real-time frame counter and Stop button
• Hides fixed/sticky navbars during capture for a clean output
• Configurable scroll delay (100–800ms) for lazy-loaded pages
• JPG quality slider (60–100%)
• License key activation for Pro features

🆓 FREE TIER
• Up to 7 scroll frames per capture
• Export as PNG or JPG

⭐ PRO TIER (License Key)
• Unlimited scroll frames (dynamic 250MB safety ceiling)
• PDF export — single page sized exactly to the full page height
• Unlock with your Pro license key in Settings

🔒 PRIVACY
All screenshot processing uses local browser APIs only.
No page content, screenshots, or personal data are ever transmitted to any server.
Permissions used: activeTab, scripting, offscreen, downloads, storage.

📦 TECHNICAL
• Manifest V3
• OffscreenCanvas + createImageBitmap for efficient stitching
• Locally bundled jsPDF (no remote scripts)
• Strict CSP — no eval, no remote resources
```

---

## 3. Store Graphics Required

| Asset            | Size                | Status                             |
| ---------------- | ------------------- | ---------------------------------- |
| Icon 128×128     | 128×128 PNG         | ✅ `assets/icons/128.png`          |
| Icon 48×48       | 48×48 PNG           | ✅ `assets/icons/48.png`           |
| Icon 16×16       | 16×16 PNG           | ✅ `assets/icons/16.png`           |
| Small Promo Tile | 440×280 PNG/JPG     | ⬜ _Create before publishing_      |
| Large Promo Tile | 920×680 PNG/JPG     | ⬜ _Optional but recommended_      |
| Marquee Promo    | 1400×560 PNG/JPG    | ⬜ _Optional — featured placement_ |
| Screenshot 1     | 1280×800 or 640×400 | ⬜ Popup UI                        |
| Screenshot 2     | 1280×800 or 640×400 | ⬜ Overlay pill during capture     |
| Screenshot 3     | 1280×800 or 640×400 | ⬜ Downloaded PNG preview          |
| Screenshot 4     | 1280×800 or 640×400 | ⬜ PDF preview                     |

---

## 4. Permissions Justification

| Permission  | Justification                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `activeTab` | Required to capture the currently active tab's viewport using `captureVisibleTab`              |
| `scripting` | Required to inject the content script (overlay UI, scroll control, fixed-element hiding)       |
| `offscreen` | Required to run the OffscreenCanvas stitching and jsPDF operations in a hidden document        |
| `downloads` | Required to save the final PNG/JPG/PDF file to the user's local device                         |
| `storage`   | Required to persist user tier and settings (format, scroll delay, JPG quality) across sessions |

---

## 5. Privacy Policy Summary

- **No data collection.** The extension does not collect, store, or transmit any user data.
- **No analytics.** No tracking libraries or analytics SDKs are included.
- **Local processing only.** All screenshot stitching, PDF generation, and file saving happens entirely within the user's browser.
- **License key.** The Pro license key is stored only in `chrome.storage.local` on the user's device. It is verified locally against a hardcoded/server-side check.
- **Permissions.** All requested permissions are used solely for the core capture functionality described above.

> Full privacy policy URL: https://auratech.lk/privacy _(update before publishing)_

---

## 6. Pricing / Distribution

| Field            | Value                                            |
| ---------------- | ------------------------------------------------ |
| **Visibility**   | Public                                           |
| **Distribution** | All regions                                      |
| **Pricing**      | Free (with in-extension Pro license key upgrade) |
| **CWS Payments** | Not used — license keys managed externally       |

---

## 7. Pre-Publish Checklist

- [ ] Test on Chrome stable, Chrome Beta
- [ ] Verify all permissions are actively used (remove any unused)
- [ ] Screenshots captured at correct dimensions (1280×800)
- [ ] Promo tile (440×280) designed and exported
- [ ] Privacy policy page live at listed URL
- [ ] Support email/URL live and monitored
- [ ] Version bumped in `manifest.json` for any update submissions
- [ ] Remove or disable the **"Mock Pro (Dev only)"** toggle before publishing
- [ ] Final QA: Free capture, Pro capture, PDF, Stop, Esc, fixed-element restore

---

## 8. Update / Release Notes Template

```
v1.0.0 — Initial Release
• Full-page scrolling screenshots (PNG, JPG)
• Pro PDF export with exact page dimensions
• Dark-mode premium popup
• License key activation system
• 100% local processing — zero uploads
```

---

## 9. Developer Notes

- **Load unpacked path:** `d:\My project\AuraTech LK\Extension Scroll SS`
- **Service worker inspect:** `chrome://extensions` → Inspect views → service worker
- **Offscreen debug:** Not directly inspectable; add `chrome.runtime.sendMessage` debug logs to offscreen.js temporarily
- **jsPDF version:** 2.5.1 (bundled at `offscreen/jspdf.umd.min.js`)
