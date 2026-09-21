# Build & Obfuscation Guide

## AuraTech Full Page Capture — Webpack + Terser

This guide explains how to minify and obfuscate `background/service-worker.js`
and `content/content.js` so that the `isPro` gate is not trivially bypassable
via DevTools.

---

## Why Obfuscation Matters

Free users can open `chrome://extensions` → Inspect service worker → modify
`isPro` in memory. Obfuscation raises the bar by:

- Mangling variable names (`isPro` → `_0x3a1b`)
- Removing comments and whitespace
- Inlining constants
- Splitting string literals

> **Note:** Obfuscation is not encryption. A motivated attacker can still
> reverse-engineer it. For strong enforcement, validate the license on your
> own server and return a signed token.

---

## Setup

```bash
# From the project root
npm init -y
npm install --save-dev webpack webpack-cli terser-webpack-plugin webpack-obfuscator javascript-obfuscator
```

---

## webpack.config.js

Create this file at the project root:

```js
const path = require("path");
const Terser = require("terser-webpack-plugin");
const { WebpackObfuscator } = require("webpack-obfuscator");

module.exports = {
  mode: "production",
  devtool: false,

  entry: {
    "background/service-worker": "./background/service-worker.js",
    "content/content": "./content/content.js",
    "popup/popup": "./popup/popup.js",
    "offscreen/offscreen": "./offscreen/offscreen.js",
  },

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },

  optimization: {
    minimize: true,
    minimizer: [
      new Terser({
        terserOptions: {
          compress: {
            drop_console: true, // strip all console.log
            passes: 2,
            pure_funcs: ["console.log", "console.warn"],
          },
          mangle: {
            toplevel: true, // mangle top-level names
          },
          format: { comments: false },
        },
        extractComments: false,
      }),
    ],
  },

  plugins: [
    new WebpackObfuscator(
      {
        rotateStringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.85,
        splitStrings: true,
        splitStringsChunkLength: 5,
        identifierNamesGenerator: "hexadecimal",
        renameGlobals: false, // keep chrome.* intact
        selfDefending: true, // detect devtools tampering
        disableConsoleOutput: true,
        debugProtection: false, // enable only in final build
      },
      [],
    ),
  ],

  // Don't bundle chrome.* — they are globals provided by the browser
  externals: {
    chrome: "chrome",
  },
};
```

---

## dist/ Folder Structure

After `npm run build`, copy these files into your extension:

```
dist/
  background/service-worker.js   ← replace original
  content/content.js             ← replace original
  popup/popup.js                 ← replace original
  offscreen/offscreen.js         ← replace original
```

Keep all non-JS files (HTML, CSS, images, jsPDF) from the `src/` originals.

---

## package.json Scripts

```json
{
  "scripts": {
    "build": "webpack --config webpack.config.js",
    "watch": "webpack --config webpack.config.js --watch"
  }
}
```

Run:

```bash
npm run build
```

---

## Important: Service Worker Module Mode

The current `manifest.json` uses `"type": "module"` for the service worker.
Webpack bundles to CommonJS by default. Either:

**Option A** — Remove `"type": "module"` from manifest and let Webpack bundle everything.

**Option B** — Add to webpack config:

```js
experiments: { outputModule: true },
output: { module: true, library: { type: 'module' } },
```

---

## Additional Server-Side Enforcement (Recommended)

For stronger protection, replace the client-side `VALID_KEYS` set with a server call:

```js
// In popup.js verifyLicenseKey()
async function verifyLicenseKey(key) {
  try {
    const res = await fetch("https://api.auratech.lk/license/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim().toUpperCase() }),
    });
    const data = await res.json();
    return { valid: data.valid === true };
  } catch {
    return { valid: false, reason: "Network error — check your connection." };
  }
}
```

The server signs a JWT or returns a short-lived token stored in
`chrome.storage.local`. On every popup open `reVerifyStoredLicense()`
re-checks the token expiry. Even if a user edits storage manually,
the expired/invalid token causes a downgrade on the next open.
