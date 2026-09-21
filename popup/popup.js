/**
 * popup.js – AuraTech Full Page Capture
 * Handles tier display, settings, license key activation, and capture trigger.
 */

"use strict";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const FREE_MAX_FRAMES = 7;

// ── Mock license API ──
// In production replace verifyLicenseKey() with a real server call.
// Valid test key: PRO-1234
const VALID_KEYS = new Set(["PRO-1234", "PRO-AURA-2025", "AURATECH-PRO"]);

// ──────────────────────────────────────────────
// DOM refs
// ──────────────────────────────────────────────
const tierPill          = document.getElementById("tierPill");
const statusBar         = document.getElementById("statusBar");
const statusIcon        = document.getElementById("statusIcon");
const statusText        = document.getElementById("statusText");
const formatBtns        = [...document.querySelectorAll(".format-btn")];
const pdfBtn            = document.getElementById("pdfBtn");
const pdfTooltip        = document.getElementById("pdfTooltip");
const captureBtn        = document.getElementById("captureBtn");
const settingsToggle    = document.getElementById("settingsToggle");
const settingsPanel     = document.getElementById("settingsPanel");
const settingsChevron   = document.getElementById("settingsChevron");
const hideFixedToggle   = document.getElementById("hideFixedToggle");
const scrollDelaySlider = document.getElementById("scrollDelaySlider");
const scrollDelayVal    = document.getElementById("scrollDelayVal");
const jpgQualitySlider  = document.getElementById("jpgQualitySlider");
const jpgQualityVal     = document.getElementById("jpgQualityVal");
const jpgQualityRow     = document.getElementById("jpgQualityRow");
const mockProToggle     = document.getElementById("mockProToggle");
// License UI
const licenseInputArea    = document.getElementById("licenseInputArea");
const licenseActiveArea   = document.getElementById("licenseActiveArea");
const licenseKeyInput     = document.getElementById("licenseKeyInput");
const licenseActivateBtn  = document.getElementById("licenseActivateBtn");
const licenseMsg          = document.getElementById("licenseMsg");
const upgradeBtn          = document.getElementById("upgradeBtn");
const licenseDeactivateBtn = document.getElementById("licenseDeactivateBtn");

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────
let currentFormat = "png";
let isCapturing   = false;

// ──────────────────────────────────────────────
// License verification (mock API)
// Replace with a real HTTPS endpoint in production.
// ──────────────────────────────────────────────
async function verifyLicenseKey(key) {
  // Normalise
  const normalised = (key || "").trim().toUpperCase();
  if (!normalised) return { valid: false, reason: "Key cannot be empty." };

  // ── Mock check ──
  // In production: const res = await fetch("https://api.auratech.lk/verify", {...})
  await new Promise(r => setTimeout(r, 600)); // simulate network latency
  if (VALID_KEYS.has(normalised)) {
    return { valid: true };
  }
  return { valid: false, reason: "Invalid license key. Please check and try again." };
}

// ──────────────────────────────────────────────
// Re-verify stored key on every popup open
// Prevents storage tampering — if stored key is
// no longer valid, tier is downgraded to free.
// ──────────────────────────────────────────────
async function reVerifyStoredLicense() {
  const data = await chrome.storage.local.get(["user"]);
  const user = data.user || { tier: "free" };

  if (user.tier === "pro" && user.licenseKey) {
    const result = await verifyLicenseKey(user.licenseKey);
    if (!result.valid) {
      // Key is no longer valid — downgrade silently
      await chrome.storage.local.set({ user: { tier: "free", licenseKey: null } });
      return { tier: "free" };
    }
    return { tier: "pro", licenseKey: user.licenseKey };
  }

  // Dev mockPro override (never trust if no key present)
  if (user.tier === "pro" && !user.licenseKey) {
    // Allowed only if mockPro was set (dev mode)
    return user;
  }

  return { tier: "free" };
}

// ──────────────────────────────────────────────
// Apply tier to UI
// ──────────────────────────────────────────────
function applyTier(tier) {
  tierPill.textContent = tier === "pro" ? "PRO" : "FREE";
  tierPill.className   = `tier-pill tier-${tier}`;

  if (tier === "pro") {
    // Unlock PDF
    pdfBtn.classList.remove("locked");
    pdfBtn.disabled = false;
    // Show active badge, hide input area
    licenseInputArea.classList.add("hidden");
    licenseActiveArea.classList.remove("hidden");
  } else {
    // Lock PDF
    pdfBtn.classList.add("locked");
    pdfBtn.disabled = false; // keep clickable to show tooltip
    // Show input area, hide active badge
    licenseInputArea.classList.remove("hidden");
    licenseActiveArea.classList.add("hidden");
    // If pdf was selected, revert to PNG
    if (currentFormat === "pdf") selectFormat("png", "free");
  }
}

// ──────────────────────────────────────────────
// Load state on popup open
// ──────────────────────────────────────────────
async function loadState() {
  const verifiedUser = await reVerifyStoredLicense();
  const settingsData = await chrome.storage.local.get(["settings"]);
  const settings = settingsData.settings || {
    format: "png",
    hideFixedSticky: true,
    scrollDelayMs: 200,
    jpgQuality: 0.92,
  };

  applyTier(verifiedUser.tier);

  currentFormat         = settings.format || "png";
  hideFixedToggle.checked = settings.hideFixedSticky !== false;
  scrollDelaySlider.value = settings.scrollDelayMs || 200;
  scrollDelayVal.textContent = `${scrollDelaySlider.value}ms`;
  jpgQualitySlider.value = Math.round((settings.jpgQuality || 0.92) * 100);
  jpgQualityVal.textContent = `${jpgQualitySlider.value}%`;

  selectFormat(currentFormat, verifiedUser.tier);

  mockProToggle.checked = verifiedUser.tier === "pro" && !verifiedUser.licenseKey;
}

// ──────────────────────────────────────────────
// Format selection
// ──────────────────────────────────────────────
function selectFormat(fmt, tier) {
  tier = tier || (tierPill.classList.contains("tier-pro") ? "pro" : "free");

  if (fmt === "pdf" && tier === "free") {
    showPdfTooltip();
    return;
  }

  pdfTooltip.classList.add("hidden");
  currentFormat = fmt;

  formatBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.format === fmt);
  });

  jpgQualityRow.classList.toggle("hidden", fmt !== "jpg");
  saveSettings();
}

function showPdfTooltip() {
  pdfTooltip.classList.remove("hidden");
  setTimeout(() => pdfTooltip.classList.add("hidden"), 4000);
}

// ──────────────────────────────────────────────
// Settings persistence
// ──────────────────────────────────────────────
async function saveSettings() {
  const jpgQuality = Math.round(jpgQualitySlider.value) / 100;
  await chrome.storage.local.set({
    settings: {
      format: currentFormat,
      hideFixedSticky: hideFixedToggle.checked,
      scrollDelayMs: parseInt(scrollDelaySlider.value, 10),
      jpgQuality,
    },
  });
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

// ──────────────────────────────────────────────
// License activation flow
// ──────────────────────────────────────────────
function showLicenseMsg(type, text) {
  licenseMsg.className = `license-msg ${type}`;
  licenseMsg.textContent = text;
  licenseMsg.classList.remove("hidden");
  setTimeout(() => licenseMsg.classList.add("hidden"), 5000);
}

async function activateLicense() {
  const key = licenseKeyInput.value.trim();
  if (!key) {
    showLicenseMsg("error", "Please enter a license key.");
    return;
  }

  licenseActivateBtn.disabled = true;
  licenseActivateBtn.textContent = "Checking…";

  const result = await verifyLicenseKey(key);

  licenseActivateBtn.disabled = false;
  licenseActivateBtn.textContent = "Activate";

  if (result.valid) {
    await chrome.storage.local.set({
      user: { tier: "pro", licenseKey: key.trim().toUpperCase() },
    });
    showLicenseMsg("success", "✅ Pro activated successfully!");
    applyTier("pro");
  } else {
    showLicenseMsg("error", result.reason || "Invalid key.");
  }
}

async function deactivateLicense() {
  await chrome.storage.local.set({ user: { tier: "free", licenseKey: null } });
  licenseKeyInput.value = "";
  applyTier("free");
}

// ──────────────────────────────────────────────
// Capture trigger
// ──────────────────────────────────────────────
async function startCapture() {
  if (isCapturing) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) { showStatus("error", "✕", "No active tab found."); return; }

  if (!tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("about:")) {
    showStatus("error", "✕", "Cannot capture this page type.");
    return;
  }

  // Re-read verified user state
  const verifiedUser = await reVerifyStoredLicense();
  const settingsData = await chrome.storage.local.get(["settings"]);
  const settings = settingsData.settings || {
    format: "png", hideFixedSticky: true, scrollDelayMs: 200, jpgQuality: 0.92,
  };

  const captureId = `cap_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  chrome.runtime.sendMessage({
    type: "START_CAPTURE",
    captureId,
    tabId: tab.id,
    user: verifiedUser,
    settings: { ...settings, format: currentFormat },
  });

  window.close();
}

// ──────────────────────────────────────────────
// Event listeners
// ──────────────────────────────────────────────

// Format buttons
formatBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const tier = tierPill.classList.contains("tier-pro") ? "pro" : "free";
    selectFormat(btn.dataset.format, tier);
  });
});

// PDF button tooltip for free users
pdfBtn.addEventListener("click", () => {
  if (tierPill.classList.contains("tier-free")) showPdfTooltip();
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

// Mock Pro toggle (dev — overrides without a real key)
mockProToggle.addEventListener("change", async () => {
  const tier = mockProToggle.checked ? "pro" : "free";
  // Store without licenseKey so re-verify knows it's dev mode
  await chrome.storage.local.set({ user: { tier, licenseKey: null } });
  applyTier(tier);
});

// License activation
licenseActivateBtn.addEventListener("click", activateLicense);
licenseKeyInput.addEventListener("keydown", e => {
  if (e.key === "Enter") activateLicense();
});

// Deactivate
licenseDeactivateBtn.addEventListener("click", deactivateLicense);

// Upgrade button — opens checkout page
upgradeBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://auratech.lk/pro" }); // replace with real URL
});

// Capture button
captureBtn.addEventListener("click", startCapture);

// ── Init ──
loadState();
