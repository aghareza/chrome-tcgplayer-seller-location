// Data layer for the TCGPlayer listings endpoint.
// UMD-style: attaches to window in a content script, exports in Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TCG_SELLER_LOC = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const LISTINGS_ENDPOINT = 'https://mp-search-api.tcgplayer.com/v1/product/{id}/listings?mpfev=5762';
  // Seller profile used by the seller page; has the address many listings leave out.
  const SELLER_ENDPOINT = 'https://infinite-api.tcgplayer.com/sm/seller/{key}';

  const DEFAULTS = {
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 15000,
    // Listings are fetched in pages of `pageSize` until `maxResults` or the end of the results.
    pageSize: 50,
    maxResults: 200,
    sellerCacheTtlMs: 60 * 60 * 1000,
  };

  // Shared across calls so revisiting a product within the TTL skips the network.
  const defaultCache = new Map();
  const defaultSellerCache = new Map();

  function buildRequestBody({ from = 0, size = DEFAULTS.pageSize } = {}) {
    // Mirrors the request the site itself makes to the listings endpoint, including its
    // default sort (cheapest price + shipping first), so the sellers we fetch are the
    // same ones the page displays first.
    return {
      filters: {
        term: { sellerStatus: 'Live', channelId: 0 },
        range: { quantity: { gte: 1 } },
        exclude: { channelExclusion: 0 },
      },
      from,
      size,
      sort: { field: 'price+shipping', order: 'asc' },
      context: { shippingCountry: 'US', cart: {} },
      aggregations: [],
    };
  }

  // US state (and DC) codes to names, for the highlight setting.
  const US_STATES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
    PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  };
  const DEFAULT_HIGHLIGHT_STATES = ['CA'];

  // Returns the two-letter code for a state code or full name ("ny", "New York"), or null.
  function stateCode(value) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!text) return null;
    const upper = text.toUpperCase();
    if (US_STATES[upper]) return upper;
    const lower = text.toLowerCase();
    return Object.keys(US_STATES).find(code => US_STATES[code].toLowerCase() === lower) ?? null;
  }

  // Parses user input like "NY, NJ, CT" (or "NY NJ CT", or full names) into codes.
  // Returns { codes, invalid } with codes deduplicated in input order.
  function parseStateList(text) {
    const codes = [];
    const invalid = [];
    const add = code => { if (!codes.includes(code)) codes.push(code); };
    for (const token of String(text ?? '').split(/[,;]/)) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      const code = stateCode(trimmed);
      if (code) { add(code); continue; }
      // Not a code or name as a whole: try space-separated codes ("NY NJ CT").
      const words = trimmed.split(/\s+/);
      const wordCodes = words.map(stateCode);
      if (words.length > 1 && wordCodes.every(Boolean)) wordCodes.forEach(add);
      else invalid.push(trimmed);
    }
    return { codes, invalid };
  }

  function isHighlightedState(state, codes) {
    const code = stateCode(state);
    return Boolean(code) && Array.isArray(codes) && codes.includes(code);
  }

  function normalizeListing(listing) {
    if (!listing || !listing.sellerName) return null;
    return {
      sellerName: listing.sellerName,
      sellerKey: listing.sellerKey,
      listingId: listing.listingId,
      city: listing?.sellerAddress?.city ?? undefined,
      state: listing?.sellerAddress?.state ?? listing?.sellerAddress?.territory ?? undefined,
      country: listing?.sellerAddress?.country ?? undefined,
    };
  }

  async function fetchListings(productId, options = {}) {
    const {
      cacheTtlMs = DEFAULTS.cacheTtlMs,
      timeoutMs = DEFAULTS.timeoutMs,
      pageSize = DEFAULTS.pageSize,
      maxResults = DEFAULTS.maxResults,
      fetchImpl,
      cache = defaultCache,
    } = options;

    if (!/^\d+$/.test(String(productId))) {
      throw new Error('Invalid product id');
    }

    const fetcher = fetchImpl || fetch;

    const cached = cache.get(productId);
    if (cached && Date.now() - cached.ts < cacheTtlMs) {
      return cached.data;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = LISTINGS_ENDPOINT.replace('{id}', encodeURIComponent(productId));
      const results = [];
      for (let from = 0; from < maxResults; from += pageSize) {
        const size = Math.min(pageSize, maxResults - from);
        const page = await fetchPage(fetcher, url, { from, size }, controller.signal);
        results.push(...page.results);
        const reachedEnd = page.results.length < size
          || (typeof page.totalResults === 'number' && from + size >= page.totalResults);
        if (reachedEnd) break;
      }
      const listings = results.map(normalizeListing).filter(Boolean);
      cache.set(productId, { ts: Date.now(), data: listings });
      return listings;
    } finally {
      clearTimeout(timer);
    }
  }

  // Returns { city, state, country } from the seller's profile, or null if it has no address.
  async function fetchSellerAddress(sellerKey, options = {}) {
    const {
      cacheTtlMs = DEFAULTS.sellerCacheTtlMs,
      timeoutMs = DEFAULTS.timeoutMs,
      fetchImpl,
      cache = defaultSellerCache,
    } = options;

    if (!/^[a-z0-9]+$/i.test(String(sellerKey))) {
      throw new Error('Invalid seller key');
    }

    const cached = cache.get(sellerKey);
    if (cached && Date.now() - cached.ts < cacheTtlMs) {
      return cached.data;
    }

    const fetcher = fetchImpl || fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = SELLER_ENDPOINT.replace('{key}', encodeURIComponent(sellerKey));
      const response = await fetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain, */*' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Seller request failed (HTTP ${response.status})`);
      }
      const address = normalizeSellerAddress(await response.json());
      cache.set(sellerKey, { ts: Date.now(), data: address });
      return address;
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeSellerAddress(seller) {
    const city = seller?.addressCity || undefined;
    const state = seller?.addressTerritory || undefined;
    const country = seller?.addressCountryCode || undefined;
    return city || state ? { city, state, country } : null;
  }

  async function fetchPage(fetcher, url, { from, size }, signal) {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(buildRequestBody({ from, size })),
      signal,
    });
    if (!response.ok) {
      throw new Error(`Listings request failed (HTTP ${response.status})`);
    }
    const data = await response.json();
    const block = data?.results?.[0];
    if (!Array.isArray(block?.results)) {
      throw new Error('Unexpected listings response shape');
    }
    return { results: block.results, totalResults: block.totalResults };
  }

  return {
    buildRequestBody,
    normalizeListing,
    fetchListings,
    fetchSellerAddress,
    isHighlightedState,
    parseStateList,
    stateCode,
    US_STATES,
    DEFAULT_HIGHLIGHT_STATES,
    LISTINGS_ENDPOINT,
    SELLER_ENDPOINT,
  };
});
