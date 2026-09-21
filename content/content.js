/**
 * content.js – AuraTech Full Page Capture
 * Injected into the active tab to:
 *   - Inject the overlay pill UI
 *   - Hide fixed/sticky elements non-destructively
 *   - Scroll the page and report metrics
 *   - Handle Stop/Esc
 */

'use strict';

(function () {
  // ──────────────────────────────────────────────
  // Guard: prevent double-injection
  // ──────────────────────────────────────────────
  if (window.__auraCaptureActive) {
    chrome.runtime.sendMessage({ type: 'CONTENT_READY', captureId: window.__auraCaptureId });
    return;
  }

  window.__auraCaptureActive = true;

  // ──────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────
  let captureId       = null;
  let frameCount      = 0;
  let maxFrames       = 7;
  let isPro           = false;
  let stopped         = false;
  let overlayEl       = null;
  let counterEl       = null;
  let hiddenElements  = [];
  let cssLink         = null;
  let escListener     = null;

  // ──────────────────────────────────────────────
  // Overlay injection
  // ──────────────────────────────────────────────
  function injectOverlay(id, max, pro) {
    captureId = id;
    maxFrames = max;
    isPro     = pro;

    // Inject overlay CSS via web_accessible_resource
    if (!document.getElementById('aura-overlay-css')) {
      cssLink = document.createElement('link');
      cssLink.id   = 'aura-overlay-css';
      cssLink.rel  = 'stylesheet';
      cssLink.href = chrome.runtime.getURL('content/overlay.css');
      document.head.appendChild(cssLink);
    }

    // Build pill
    overlayEl = document.createElement('div');
    overlayEl.id = 'aura-capture-overlay';
    overlayEl.innerHTML = `
      <span class="aura-rec-dot"></span>
      <span class="aura-label">Recording…</span>
      <span class="aura-divider"></span>
      <span class="aura-counter" id="aura-counter">${isPro ? '0 captured' : '0 / ' + maxFrames}</span>
      <span class="aura-divider"></span>
      <button class="aura-stop-btn" id="aura-stop-btn">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
        Stop
      </button>`;

    document.documentElement.appendChild(overlayEl);

    counterEl = document.getElementById('aura-counter');

    // Stop button
    document.getElementById('aura-stop-btn').addEventListener('click', () => requestStop());

    // Esc key
    escListener = (e) => { if (e.key === 'Escape') requestStop(); };
    document.addEventListener('keydown', escListener, { capture: true });
  }

  function updateCounter(n) {
    frameCount = n;
    if (!counterEl) return;
    counterEl.textContent = isPro ? `${n} captured` : `${n} / ${maxFrames}`;
  }

  // ──────────────────────────────────────────────
  // Fixed/sticky hiding
  // ──────────────────────────────────────────────
  const AURA_HIDDEN_CLASS = 'aura-hidden-fixed';

  function hideFixedElements() {
    hiddenElements = [];
    const all = document.querySelectorAll('*');
    all.forEach(el => {
      if (el.id === 'aura-capture-overlay') return;
      const pos = window.getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        el.classList.add(AURA_HIDDEN_CLASS);
        hiddenElements.push(el);
      }
    });
  }

  function restoreFixedElements() {
    hiddenElements.forEach(el => el.classList.remove(AURA_HIDDEN_CLASS));
    hiddenElements = [];
  }

  // ──────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────
  function cleanup() {
    restoreFixedElements();
    if (overlayEl)   { overlayEl.remove();  overlayEl = null; }
    if (cssLink)     { cssLink.remove();    cssLink   = null; }
    if (escListener) {
      document.removeEventListener('keydown', escListener, { capture: true });
      escListener = null;
    }
    window.__auraCaptureActive = false;
    window.__auraCaptureId     = null;
  }

  // ──────────────────────────────────────────────
  // Stop request
  // ──────────────────────────────────────────────
  function requestStop() {
    if (stopped) return;
    stopped = true;
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE', captureId });
  }

  // ──────────────────────────────────────────────
  // Metrics
  // ──────────────────────────────────────────────
  function getMetrics() {
    return {
      viewportWidth:  window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollHeight:   Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      ),
      scrollY:     window.scrollY,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }

  // ──────────────────────────────────────────────
  // Message listener
  // ──────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Validate sender
    if (sender.id !== chrome.runtime.id) return;

    switch (msg.type) {
      case 'INIT_CAPTURE': {
        const { captureId: id, maxFrames: mf, isPro: pro, hideFixedSticky } = msg;
        window.__auraCaptureId = id;
        stopped = false;

        // Scroll to top
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

        injectOverlay(id, mf, pro);

        if (hideFixedSticky) hideFixedElements();

        // Reply with metrics after a brief settle
        setTimeout(() => {
          sendResponse({ ok: true, metrics: getMetrics() });
        }, 80);
        return true; // async response
      }

      case 'SCROLL_AND_CAPTURE': {
        const { scrollY, scrollDelayMs } = msg;
        window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });

        setTimeout(() => {
          // DEFINITIVE FIX: remove overlay from DOM entirely.
          // An element not in the DOM cannot appear in any screenshot — no timing races.
          if (overlayEl && overlayEl.parentNode) {
            overlayEl.parentNode.removeChild(overlayEl);
          }
          // 60ms micro-settle (for compositor to flush the removal)
          setTimeout(() => {
            sendResponse({ ok: true, metrics: getMetrics() });
          }, 60);
        }, Math.max(100, Math.min(800, scrollDelayMs || 200)));
        return true;
      }

      case 'PREPARE_FRAME': {
        // Frame 0 (no scroll): remove overlay from DOM, then respond after micro-settle.
        if (overlayEl && overlayEl.parentNode) {
          overlayEl.parentNode.removeChild(overlayEl);
        }
        setTimeout(() => sendResponse({ ok: true }), 60);
        return true;
      }

      case 'UPDATE_COUNTER': {
        updateCounter(msg.frameIndex);
        sendResponse({ ok: true });
        break;
      }

      case 'CAPTURE_DONE':
      case 'CAPTURE_STOPPED':
      case 'CAPTURE_ERROR': {
        cleanup();
        sendResponse({ ok: true });
        break;
      }

      case 'GET_METRICS': {
        sendResponse({ ok: true, metrics: getMetrics() });
        break;
      }

      case 'HIDE_OVERLAY': {
        // Remove from DOM — guaranteed not in any screenshot
        if (overlayEl && overlayEl.parentNode) {
          overlayEl.parentNode.removeChild(overlayEl);
        }
        setTimeout(() => sendResponse({ ok: true }), 60);
        return true;
      }

      case 'SHOW_OVERLAY': {
        // Re-attach overlay so user can see/use the Stop button between frames
        if (overlayEl && !overlayEl.parentNode) {
          document.documentElement.appendChild(overlayEl);
        }
        sendResponse({ ok: true });
        break;
      }
    }
  });

  // Notify service worker that content script is ready
  chrome.runtime.sendMessage({ type: 'CONTENT_READY', captureId: null });
})();
