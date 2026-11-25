(() => {
  'use strict';

  const BADGE_CLASS = 'tcg-seller-loc';
  const CALIFORNIA_CLASS = 'tcg-seller-loc--ca';
  const MARKER_ATTR = 'data-tcg-seller-loc-done';
  const MAX_TEXT_LENGTH = 80;
  const SCAN_DEBOUNCE_MS = 250;
  const SELLER_FETCH_CONCURRENCY = 3;

  const TCG = window.TCG_SELLER_LOC;
  if (!TCG) return;

  let listings = null;
  let fetchInFlight = null;
  let enabled = true;
  let scanScheduled = false;
  let failedAt = 0;

  // Fallback addresses for sellers whose listings have none, keyed by sellerKey.
  // null means the seller has no address (or the lookup failed); not retried until reload.
  const sellerAddresses = new Map();
  const requestedSellers = new Set();
  const sellerQueue = [];
  let sellerFetchesActive = 0;

  const normalize = text => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

  function getProductId() {
    const match = window.location.pathname.match(/\/product\/(\d+)/);
    return match ? match[1] : null;
  }

  function locationLabel(listing) {
    const parts = [listing.city, listing.state].filter(Boolean);
    return parts.length ? parts.join(', ') : '';
  }

  async function loadListings() {
    if (listings) return listings;
    if (fetchInFlight) return fetchInFlight;
    const productId = getProductId();
    if (!productId) return null;
    // Back off for a bit after a failure so repeated scans don't re-hit the API.
    if (failedAt && Date.now() - failedAt < 15000) return null;
    fetchInFlight = TCG.fetchListings(productId)
      .then(result => {
        // Drop results for a product the tab has already navigated away from.
        if (getProductId() !== productId) return null;
        listings = result;
        return listings;
      })
      .catch(error => {
        if (getProductId() !== productId) return null;
        listings = null;
        failedAt = Date.now();
        console.warn('[tcg-seller-location]', error.message ?? error);
        return null;
      })
      .finally(() => { fetchInFlight = null; });
    return fetchInFlight;
  }

  function buildLookup() {
    const sellersByName = new Map();
    for (const listing of listings ?? []) {
      const key = normalize(listing.sellerName);
      if (!key) continue;
      // Prefer the first listing that has an address for this seller.
      if (sellersByName.get(key)?.label) continue;
      const address = listing.city || listing.state ? listing : sellerAddresses.get(listing.sellerKey);
      sellersByName.set(key, {
        sellerKey: listing.sellerKey,
        label: address ? locationLabel(address) : '',
        california: address ? TCG.isCalifornia(address.state) : false,
      });
    }
    return sellersByName;
  }

  function requestSellerAddress(sellerKey) {
    if (!sellerKey || requestedSellers.has(sellerKey)) return;
    requestedSellers.add(sellerKey);
    sellerQueue.push(sellerKey);
    pumpSellerQueue();
  }

  function pumpSellerQueue() {
    while (sellerFetchesActive < SELLER_FETCH_CONCURRENCY && sellerQueue.length) {
      const sellerKey = sellerQueue.shift();
      sellerFetchesActive++;
      TCG.fetchSellerAddress(sellerKey)
        .then(address => {
          sellerAddresses.set(sellerKey, address);
          if (address) scheduleScan(0);
        })
        .catch(error => {
          sellerAddresses.set(sellerKey, null);
          console.warn('[tcg-seller-location]', error.message ?? error);
        })
        .finally(() => {
          sellerFetchesActive--;
          pumpSellerQueue();
        });
    }
  }

  function makeBadge({ label, california }) {
    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    if (california) badge.classList.add(CALIFORNIA_CLASS);
    badge.textContent = `📍 ${label}`;
    badge.title = `Seller location: ${label}`;
    badge.setAttribute('aria-label', `Seller location: ${label}`);
    return badge;
  }

  function scan() {
    if (!enabled || !listings) return;
    const lookup = buildLookup();
    if (!lookup.size) return;

    const candidates = document.querySelectorAll('a, span, h1, h2, h3, h4, p, strong, td, li');
    for (const el of candidates) {
      if (!(el instanceof Element)) continue;
      if (el.classList.contains(BADGE_CLASS)) continue;
      if (el.getAttribute(MARKER_ATTR)) continue;
      // An ancestor already got a badge for this name (e.g. <a><span>Name</span></a>).
      if (el.parentElement?.closest(`[${MARKER_ATTR}]`)) continue;
      const text = normalize(el.textContent);
      if (!text || text.length > MAX_TEXT_LENGTH) continue;
      // Skip large containers: a seller name element has few or no children.
      if (el.children.length > 3) continue;
      const seller = lookup.get(text);
      if (!seller) continue;
      if (!seller.label) {
        // Only look up sellers actually shown on the page; the next scan adds the badge.
        requestSellerAddress(seller.sellerKey);
        continue;
      }
      el.insertAdjacentElement('afterend', makeBadge(seller));
      el.setAttribute(MARKER_ATTR, '1');
    }
  }

  function removeBadges() {
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach(badge => badge.remove());
    document.querySelectorAll(`[${MARKER_ATTR}]`).forEach(el => el.removeAttribute(MARKER_ATTR));
  }

  function scheduleScan(delay = SCAN_DEBOUNCE_MS) {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(() => {
      scanScheduled = false;
      loadListings().then(scan).catch(() => {});
    }, delay);
  }

  function applyEnabled(value) {
    enabled = value !== false;
    if (!enabled) {
      removeBadges();
      return;
    }
    scheduleScan(0);
  }

  const observer = new MutationObserver(() => scheduleScan());
  const observe = () => {
    try { observer.observe(document.body, { childList: true, subtree: true }); } catch { /* noop */ }
  };
  if (document.body) observe();
  else window.addEventListener('DOMContentLoaded', observe, { once: true });

  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      listings = null;
      failedAt = 0;
      removeBadges();
      scheduleScan(0);
      return;
    }
    scheduleScan(SCAN_DEBOUNCE_MS);
  }, 3000);

  chrome.storage.sync.get('enabled')
    .then(data => applyEnabled(data.enabled !== false))
    .catch(() => applyEnabled(true));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.enabled) return;
    applyEnabled(changes.enabled.newValue !== false);
  });
})();
