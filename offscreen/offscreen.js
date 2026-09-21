/**
 * offscreen.js – AuraTech Full Page Capture
 * Runs in the hidden offscreen document.
 * - Receives frames from the service worker
 * - Stitches them into a full-height image using overlap-aware crop
 * - For PDF: creates a single page exactly matching the full canvas dimensions (no margins, no gaps)
 * - Returns blob URL to service worker for download
 */

"use strict";

const MEMORY_CEILING_BYTES = 250 * 1024 * 1024; // 250 MB

// ──────────────────────────────────────────────
// Sessions store
// ──────────────────────────────────────────────
const sessions = new Map();
// Each session: { captureId, format, jpgQuality, viewport, dpr, frames[], totalH, viewportH }

// ──────────────────────────────────────────────
// Message listener
// ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg._target !== "offscreen") return;

  switch (msg.type) {
    case "INIT_SESSION": {
      const { captureId, format, jpgQuality, viewport, dpr } = msg;
      if (!captureId) {
        sendResponse({ ok: false, error: "Missing captureId" });
        return;
      }
      sessions.set(captureId, {
        captureId,
        format: format || "png",
        jpgQuality: jpgQuality || 0.92,
        viewport: viewport || { width: 1280, height: 720 },
        dpr: dpr || 1,
        frames: [],
        totalH: 0,
        viewportH: viewport ? viewport.height : 720,
      });
      sendResponse({ ok: true });
      break;
    }

    case "ADD_FRAME": {
      const { captureId, frameIndex, dataUrl, scrollY, viewportH, totalH } =
        msg;
      const session = sessions.get(captureId);
      if (!session) {
        sendResponse({ ok: false, error: "No session" });
        return;
      }
      session.frames.push({ frameIndex, dataUrl, scrollY });
      session.totalH = Math.max(session.totalH, totalH || 0);
      session.viewportH = viewportH || session.viewportH;
      sendResponse({ ok: true });
      break;
    }

    case "FINALIZE_SESSION": {
      const { captureId } = msg;
      const session = sessions.get(captureId);
      if (!session) {
        sendResponse({ ok: false, error: "No session to finalize" });
        return;
      }

      finalizeSession(session)
        .then((result) => {
          sessions.delete(captureId);
          sendResponse(result);
        })
        .catch((err) => {
          sessions.delete(captureId);
          sendResponse({ ok: false, error: err.message });
        });
      return true; // async
    }

    case "ABORT_SESSION": {
      const { captureId } = msg;
      sessions.delete(captureId);
      sendResponse({ ok: true });
      break;
    }

    default:
      break;
  }
});

// ──────────────────────────────────────────────
// Finalize: stitch, then export
// ──────────────────────────────────────────────
async function finalizeSession(session) {
  const { format, frames, viewport, dpr, jpgQuality, totalH, viewportH } =
    session;

  if (!frames.length) throw new Error("No frames captured");

  // Sort frames by scrollY position
  frames.sort((a, b) => a.frameIndex - b.frameIndex);

  // Stitch all frames into one full-height canvas
  const canvas = await stitchFrames(frames, viewport, dpr, totalH, viewportH);

  if (format === "pdf") {
    return await exportPDF(canvas, dpr);
  } else {
    return await exportImage(canvas, format, jpgQuality);
  }
}

// ──────────────────────────────────────────────
// STITCH: overlap-aware frame composition
// Draws only the new (non-duplicate) rows from each frame,
// eliminating gaps caused by overlapping scroll positions.
// ──────────────────────────────────────────────
async function stitchFrames(frames, viewport, dpr, totalH, viewportH) {
  const physWidth = Math.round(viewport.width * dpr);
  // Derive actual canvas height from the frames we captured
  // (accounts for pages shorter than estimated totalH)
  const lastFrame = frames[frames.length - 1];
  const physHeight = Math.round((lastFrame.scrollY + viewportH) * dpr);

  // Memory guard
  const estBytes = physWidth * physHeight * 4;
  if (estBytes > MEMORY_CEILING_BYTES) {
    throw new Error(
      `Too large to export as a single image (est. ${Math.round(estBytes / 1024 / 1024)} MB). ` +
        `Use PDF format or capture fewer frames.`,
    );
  }

  const canvas = new OffscreenCanvas(physWidth, physHeight);
  const ctx = canvas.getContext("2d");

  const physViewportH = Math.round(viewportH * dpr);

  // Track how many physical pixels we have already painted into the canvas.
  // Each frame only contributes pixels ABOVE this watermark (new content).
  let paintedUpTo = 0;

  for (const frame of frames) {
    const bitmap = await decodeBitmap(frame.dataUrl);

    const frameTopPx = Math.round(frame.scrollY * dpr); // where in the full page this frame starts
    const frameBottomPx = frameTopPx + physViewportH; // where it ends (physical px)

    // The bitmap may extend below the actual page bottom — clamp
    const drawTo = Math.min(frameBottomPx, physHeight);

    // How many source rows to skip (overlap from the previous frame)
    const srcSkip = Math.max(0, paintedUpTo - frameTopPx);

    // How many new rows does this frame contribute?
    const newRows = drawTo - paintedUpTo;

    if (newRows > 0) {
      // drawImage(bitmap, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      ctx.drawImage(
        bitmap,
        0,
        srcSkip, // source: start at srcSkip rows into the frame
        physWidth,
        newRows, // source: take newRows rows
        0,
        paintedUpTo, // dest: place at current watermark
        physWidth,
        newRows, // dest: same height (1:1 pixel mapping)
      );
      paintedUpTo += newRows;
    }

    bitmap.close();
    frame.dataUrl = null; // release memory immediately
  }

  return canvas;
}

// ──────────────────────────────────────────────
// IMAGE EXPORT (PNG / JPG) from a stitched canvas
// ──────────────────────────────────────────────
async function exportImage(canvas, format, jpgQuality) {
  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const quality = format === "jpg" ? jpgQuality : undefined;
  const blob = await canvas.convertToBlob({ type: mimeType, quality });
  // Use FileReader to get a base64 data URL — no URL.createObjectURL needed
  const dataUrl = await blobToDataUrl(blob);
  return { ok: true, dataUrl, mimeType, ext: format === "jpg" ? "jpg" : "png" };
}

// ──────────────────────────────────────────────
// PDF EXPORT – single page sized EXACTLY to the canvas
// No A4 page sizes, no margins, no blank space.
// Uses jsPDF with unit:'px' and format:[canvas.width, canvas.height].
// ──────────────────────────────────────────────
async function exportPDF(canvas, dpr) {
  if (
    typeof window.jspdf === "undefined" &&
    typeof window.jsPDF === "undefined"
  ) {
    throw new Error("jsPDF not loaded");
  }

  const { jsPDF } = window.jspdf || window;

  const W = canvas.width;
  const H = canvas.height;

  // Convert the full stitched canvas to a JPEG data URL
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.92,
  });
  const imgDataUrl = await blobToDataUrl(blob);

  // Create a PDF page that is EXACTLY the size of the canvas in pixels
  // so there are zero margins, zero blank areas.
  const pdf = new jsPDF({
    orientation: W >= H ? "landscape" : "portrait",
    unit: "px",
    format: [W, H], // <-- exact canvas dimensions, no standard paper size
    compress: true,
  });

  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  // Draw the image at (0, 0) filling the entire page — no margins, perfect fit
  pdf.addImage(imgDataUrl, "JPEG", 0, 0, pdfW, pdfH, undefined, "FAST");

  // Use jsPDF's built-in datauristring output — no Blob or URL.createObjectURL needed
  const dataUrl = pdf.output("datauristring");

  return { ok: true, dataUrl, mimeType: "application/pdf", ext: "pdf" };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
async function decodeBitmap(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}
