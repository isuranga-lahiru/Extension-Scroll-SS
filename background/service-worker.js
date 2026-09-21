/**
 * service-worker.js – AuraTech Full Page Capture
 * Orchestrates the capture loop.
 * - Injects content script
 * - Manages the scroll/captureVisibleTab loop
 * - Enforces tier frame limits
 * - Sends frames to offscreen for stitching
 * - Triggers download
 */

'use strict';

const FREE_MAX_FRAMES      = 7;
const MEMORY_CEILING_BYTES  = 250 * 1024 * 1024; // 250 MB
// Chrome quota: ~2 captureVisibleTab calls/sec → enforce ≥600ms between calls
const MIN_CAPTURE_INTERVAL_MS = 600;

// ──────────────────────────────────────────────
// Active sessions map
// ──────────────────────────────────────────────
const sessions = new Map(); // captureId → { stopped: bool }

// ──────────────────────────────────────────────
// Helper: ensure offscreen document exists
// ──────────────────────────────────────────────
async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument().catch(() => false);
  if (!existing) {
    await chrome.offscreen.createDocument({
      url:    chrome.runtime.getURL('offscreen/offscreen.html'),
      reasons: ['BLOBS'],
      justification: 'Stitch screenshot frames and export PNG/JPG/PDF',
    });
  }
}

async function closeOffscreen() {
  await chrome.offscreen.closeDocument().catch(() => {});
}

// ──────────────────────────────────────────────
// Helper: message to offscreen with schema
// ──────────────────────────────────────────────
function sendToOffscreen(payload) {
  return chrome.runtime.sendMessage({ ...payload, _target: 'offscreen' });
}

// ──────────────────────────────────────────────
// Helper: message to tab content script
// ──────────────────────────────────────────────
function sendToTab(tabId, payload) {
  return chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

// ──────────────────────────────────────────────
// Helper: inject content script (idempotent)
// ──────────────────────────────────────────────
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files:  ['content/content.js'],
    });
  } catch (_) {
    // Script may already be injected; ignore error
  }
  // Also inject the CSS (we rely on web_accessible_resource + link tag in content.js)
}

// ──────────────────────────────────────────────
// Helper: wait for async tab message response
// ──────────────────────────────────────────────
function tabMsg(tabId, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tab message timeout')), timeoutMs);
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ──────────────────────────────────────────────
// Main capture orchestrator
// ──────────────────────────────────────────────
async function runCapture({ captureId, tabId, user, settings }) {
  const isPro    = user.tier === 'pro';
  const format   = settings.format   || 'png';
  const hideFixed = settings.hideFixedSticky !== false;
  const scrollDelay = Math.max(100, Math.min(800, settings.scrollDelayMs || 200));
  const jpgQuality  = settings.jpgQuality || 0.92;
  const maxFrames   = isPro ? Infinity : FREE_MAX_FRAMES;

  sessions.set(captureId, { stopped: false });

  try {
    // 1. Inject content script
    await injectContentScript(tabId);
    await new Promise(r => setTimeout(r, 100)); // brief settle

    // 2. Init content script & get first metrics
    const initResp = await tabMsg(tabId, {
      type:           'INIT_CAPTURE',
      captureId,
      maxFrames:      isPro ? null : maxFrames,
      isPro,
      hideFixedSticky: hideFixed,
    }, 8000);

    if (!initResp || !initResp.ok) throw new Error('Content script init failed');

    let metrics = initResp.metrics;

    // 3. Ensure offscreen
    await ensureOffscreen();
    await sendToOffscreen({
      type:      'INIT_SESSION',
      captureId,
      format,
      jpgQuality,
      viewport:  { width: metrics.viewportWidth, height: metrics.viewportHeight },
      dpr:       metrics.devicePixelRatio,
    });

    // 4. Capture loop
    let frameIndex   = 0;
    let currentScrollY = 0;
    const viewportH  = metrics.viewportHeight;
    const totalH     = metrics.scrollHeight;
    let lastCaptureAt = 0; // timestamp of last captureVisibleTab call

    while (true) {
      const session = sessions.get(captureId);
      if (!session || session.stopped) break;

      // Frame limit (free)
      if (!isPro && frameIndex >= FREE_MAX_FRAMES) break;

      // Reached bottom
      if (frameIndex > 0 && currentScrollY + viewportH >= totalH) break;

      // Scroll (skip for first frame — already at top)
      if (frameIndex > 0) {
        currentScrollY = Math.min(currentScrollY + viewportH, totalH - viewportH);
        const scrollResp = await tabMsg(tabId, {
          type:         'SCROLL_AND_CAPTURE',
          captureId,
          scrollY:      currentScrollY,
          scrollDelayMs: scrollDelay,
        }, 6000);
        if (!scrollResp || !scrollResp.ok) break;
        metrics = scrollResp.metrics;
      }

      // Update counter in overlay
      await sendToTab(tabId, { type: 'UPDATE_COUNTER', captureId, frameIndex: frameIndex + 1 });

      // For frame 0 (no scroll step ran), ask content script to hide overlay and
      // wait for 2 rAF frames so the compositor commits before we capture.
      // For frames >0, SCROLL_AND_CAPTURE already hid the overlay as its last step.
      if (frameIndex === 0) {
        await tabMsg(tabId, { type: 'PREPARE_FRAME', captureId }, 3000).catch(() => {});
      }

      // Rate-limit guard: Chrome allows ~2 captureVisibleTab/sec
      const elapsed = Date.now() - lastCaptureAt;
      if (elapsed < MIN_CAPTURE_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, MIN_CAPTURE_INTERVAL_MS - elapsed));
      }

      // Capture visible tab (use tab's windowId, not null)
      let dataUrl;
      try {
        const tabInfo = await chrome.tabs.get(tabId);
        lastCaptureAt = Date.now();
        dataUrl = await chrome.tabs.captureVisibleTab(tabInfo.windowId, { format: 'png' });
      } catch (e) {
        await sendToTab(tabId, { type: 'SHOW_OVERLAY', captureId });
        throw new Error('captureVisibleTab failed: ' + e.message);
      }

      // Restore overlay immediately after capture
      await sendToTab(tabId, { type: 'SHOW_OVERLAY', captureId });

      // Send frame to offscreen (no storing in SW memory)
      await sendToOffscreen({
        type:       'ADD_FRAME',
        captureId,
        frameIndex,
        dataUrl,
        scrollY:    currentScrollY,
        viewportH,
        totalH:     metrics.scrollHeight,
      });

      // Null out immediately to avoid lingering in SW memory
      dataUrl = null;

      frameIndex++;

      // Pro memory guard
      if (isPro) {
        const estBytes = (metrics.viewportWidth * metrics.devicePixelRatio) *
                         (metrics.scrollHeight  * metrics.devicePixelRatio) * 4;
        if (estBytes > MEMORY_CEILING_BYTES && format !== 'pdf') {
          // Close capture loop, will throw error during finalize
          break;
        }
      }
    }

    // 5. Check stopped
    const session = sessions.get(captureId);
    if (session && session.stopped) {
      await sendToOffscreen({ type: 'ABORT_SESSION', captureId });
      await sendToTab(tabId, { type: 'CAPTURE_STOPPED', captureId });
      sessions.delete(captureId);
      await closeOffscreen();
      return { success: false, error: 'Capture stopped by user' };
    }

    // 6. Finalize
    const finalResp = await sendToOffscreen({ type: 'FINALIZE_SESSION', captureId });

    if (!finalResp || !finalResp.ok) {
      throw new Error(finalResp && finalResp.error ? finalResp.error : 'Export failed');
    }

    // 7. Download
    // dataUrl is a base64 data URL returned by the offscreen doc
    // (avoids URL.createObjectURL / URL.revokeObjectURL which don't exist in SW)
    const { dataUrl, mimeType, ext } = finalResp;
    const now = new Date();
    const ts  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `FullPageCapture_${ts}.${ext}`;

    await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
    // No URL.revokeObjectURL needed — data URLs are self-contained strings

    await sendToTab(tabId, { type: 'CAPTURE_DONE', captureId });
    sessions.delete(captureId);
    await closeOffscreen();

    return { success: true, filename };

  } catch (err) {
    // Cleanup on error
    try { await sendToTab(tabId, { type: 'CAPTURE_ERROR', captureId }); } catch (_) {}
    try { await sendToOffscreen({ type: 'ABORT_SESSION', captureId }); } catch (_) {}
    sessions.delete(captureId);
    await closeOffscreen();
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────────
// Message router
// ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Validate sender (popup or content)
  if (sender.id !== chrome.runtime.id) return;

  // Skip offscreen-targeted messages (return false = no async response)
  if (msg._target === 'offscreen') return false;

  switch (msg.type) {
    case 'START_CAPTURE': {
      const { captureId, tabId, user, settings } = msg;
      if (!captureId || !tabId) {
        sendResponse({ success: false, error: 'Invalid capture request' });
        return;
      }
      runCapture({ captureId, tabId, user, settings })
        .then(result => sendResponse(result))
        .catch(err  => sendResponse({ success: false, error: err.message }));
      return true; // async
    }

    case 'STOP_CAPTURE': {
      const { captureId } = msg;
      const session = sessions.get(captureId);
      if (session) session.stopped = true;
      sendResponse({ ok: true });
      break;
    }

    case 'CONTENT_READY': {
      sendResponse({ ok: true });
      break;
    }
  }
});

// ──────────────────────────────────────────────
// Utils
// ──────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
