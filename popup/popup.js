/**
 * popup.js – AuraTech Full Page Capture
 * Handles UI state, settings persistence, and triggering captures.
 */

"use strict";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const FREE_MAX_FRAMES = 7;

// ──────────────────────────────────────────────
// DOM refs
// ──────────────────────────────────────────────
const tierPill = document.getElementById("tierPill");
const statusBar = document.getElementById("statusBar");
const statusIcon = document.getElementById("statusIcon");
const statusText = document.getElementById("statusText");
const formatGroup = document.getElementById("formatGroup");
const formatBtns = [...document.querySelectorAll(".format-btn")];
const pdfBtn = document.getElementById("pdfBtn");
const pdfTooltip = document.getElementById("pdfTooltip");
const captureBtn = document.getElementById("captureBtn");
const settingsToggle = document.getElementById("settingsToggle");
const settingsPanel = document.getElementById("settingsPanel");
const settingsChevron = document.getElementById("settingsChevron");
const hideFixedToggle = document.getElementById("hideFixedToggle");
const scrollDelaySlider = document.getElementById("scrollDelaySlider");
const scrollDelayVal = document.getElementById("scrollDelayVal");
const jpgQualitySlider = document.getElementById("jpgQualitySlider");
const jpgQualityVal = document.getElementById("jpgQualityVal");
const jpgQualityRow = document.getElementById("jpgQualityRow");
const mockProToggle = document.getElementById("mockProToggle");

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────
let currentFormat = "png";
let isCapturing = false;

// ──────────────────────────────────────────────
// Load stored settings & user tier
// ──────────────────────────────────────────────
async function loadState() {
  const data = await chrome.storage.local.get(["user", "settings"]);

  const user = data.user || { tier: "free" };
  const settings = data.settings || {
    format: "png",
    hideFixedSticky: true,
    scrollDelayMs: 200,
    jpgQuality: 0.92,
  };

  // Apply tier
  applyTier(user.tier);

  // Apply settings UI
  currentFormat = settings.format || "png";
  hideFixedToggle.checked = settings.hideFixedSticky !== false;
  scrollDelaySlider.value = settings.scrollDelayMs || 200;
  scrollDelayVal.textContent = `${scrollDelaySlider.value}ms`;
  jpgQualitySlider.value = Math.round((settings.jpgQuality || 0.92) * 100);
  jpgQualityVal.textContent = `${jpgQualitySlider.value}%`;

  // Apply format button highlight
  selectFormat(currentFormat, user.tier);

  // Mock Pro toggle state (dev)
  mockProToggle.checked = user.tier === "pro";
}

function applyTier(tier) {
  tierPill.textContent = tier === "pro" ? "PRO" : "FREE";
  tierPill.className = `tier-pill tier-${tier}`;

  // Lock/unlock PDF button
  if (tier === "free") {
    pdfBtn.classList.add("locked");
    pdfBtn.disabled = false; // keep clickable to show tooltip
  } else {
    pdfBtn.classList.remove("locked");
    pdfBtn.disabled = false;
  }
}

function selectFormat(fmt, tier) {
  tier = tier || (tierPill.classList.contains("tier-pro") ? "pro" : "free");

  // Guard: free can't choose PDF
  if (fmt === "pdf" && tier === "free") {
    showPdfTooltip();
    return;
  }

  pdfTooltip.classList.add("hidden");
  currentFormat = fmt;

  formatBtns.forEach((btn) => {
    const isSelected = btn.dataset.format === fmt;
    btn.classList.toggle("active", isSelected);
  });

  // Show JPG quality slider only for jpg
  jpgQualityRow.classList.toggle("hidden", fmt !== "jpg");

  // Persist
  saveSettings();
}

function showPdfTooltip() {
  pdfTooltip.classList.remove("hidden");
  setTimeout(() => pdfTooltip.classList.add("hidden"), 3500);
}

// ──────────────────────────────────────────────
// Settings persistence
// ──────────────────────────────────────────────
async function saveSettings() {
  const jpgQuality = Math.round(jpgQualitySlider.value) / 100;
  const settings = {
    format: currentFormat,
    hideFixedSticky: hideFixedToggle.checked,
    scrollDelayMs: parseInt(scrollDelaySlider.value, 10),
    jpgQuality,
  };
  await chrome.storage.local.set({ settings });
}

// ──────────────────────────────────────────────
// Status helpers
// ──────────────────────────────────────────────
function showStatus(type, icon, text) {
  statusBar.className = `status-bar ${type}`;
  statusIcon.textContent = icon;
  statusText.textContent = text;
  statusBar.classList.remove("hidden");
}

function hideStatus() {
  statusBar.classList.add("hidden");
}

// ──────────────────────────────────────────────
// Capture trigger
// ──────────────────────────────────────────────
async function startCapture() {
  if (isCapturing) return;

  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showStatus("error", "✕", "No active tab found.");
    return;
  }

  // Guard: can't capture chrome:// or extension pages
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:")
  ) {
    showStatus("error", "✕", "Cannot capture this page type.");
    return;
  }

  // Read settings
  const settingsData = await chrome.storage.local.get(["user", "settings"]);
  const user = settingsData.user || { tier: "free" };
  const settings = settingsData.settings || {
    format: "png",
    hideFixedSticky: true,
    scrollDelayMs: 200,
    jpgQuality: 0.92,
  };

  const captureId = `cap_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Fire the capture message — do NOT await the response.
  // The capture is long-running; we close the popup immediately so the user
  // sees only the injected overlay pill. The SW handles everything in the background.
  chrome.runtime.sendMessage({
    type: "START_CAPTURE",
    captureId,
    tabId: tab.id,
    user,
    settings: { ...settings, format: currentFormat },
  });

  // Close popup immediately — leaves only the in-page recording overlay visible.
  window.close();
}


// ──────────────────────────────────────────────
// Event listeners
// ──────────────────────────────────────────────

// Format buttons
formatBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const fmt = btn.dataset.format;
    const tier = tierPill.classList.contains("tier-pro") ? "pro" : "free";
    selectFormat(fmt, tier);
  });
});

// Settings toggle
settingsToggle.addEventListener("click", () => {
  const isOpen = !settingsPanel.classList.contains("hidden");
  settingsPanel.classList.toggle("hidden", isOpen);
  settingsChevron.classList.toggle("open", !isOpen);
});

// Sliders
scrollDelaySlider.addEventListener("input", () => {
  scrollDelayVal.textContent = `${scrollDelaySlider.value}ms`;
  saveSettings();
});

jpgQualitySlider.addEventListener("input", () => {
  jpgQualityVal.textContent = `${jpgQualitySlider.value}%`;
  saveSettings();
});

hideFixedToggle.addEventListener("change", saveSettings);

// Mock Pro toggle (dev)
mockProToggle.addEventListener("change", async () => {
  const tier = mockProToggle.checked ? "pro" : "free";
  await chrome.storage.local.set({ user: { tier } });
  applyTier(tier);

  // If PDF was selected and we switched to free, revert to PNG
  if (tier === "free" && currentFormat === "pdf") {
    selectFormat("png", "free");
  }
});

// Capture button
captureBtn.addEventListener("click", startCapture);

// Init
loadState();
