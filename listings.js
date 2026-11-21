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

  const DEFAULTS = {
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 15000,
    maxResults: 25,
  };

  function buildRequestBody(maxResults = DEFAULTS.maxResults) {
    // Mirrors the request the site itself makes to the listings endpoint,
    // except with real results fetched (size > 0) instead of aggregation-only.
    return {
      filters: {
        term: { sellerStatus: 'Live', channelId: 0 },
        range: { quantity: { gte: 1 } },
        exclude: { channelExclusion: 0 },
      },
      context: { shippingCountry: 'US', cart: {} },
      aggregations: [],
      size: maxResults,
    };
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
      maxResults = DEFAULTS.maxResults,
      fetchImpl,
      cache,
    } = options;

    if (!/^\d+$/.test(String(productId))) {
      throw new Error('Invalid product id');
    }

    const fetcher = fetchImpl || fetch;
    const cacheMap = cache || new Map();

    const cached = cacheMap.get(productId);
    if (cached && Date.now() - cached.ts < cacheTtlMs) {
      return cached.data;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = LISTINGS_ENDPOINT.replace('{id}', encodeURIComponent(productId));
      const response = await fetcher(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
        },
        body: JSON.stringify(buildRequestBody(maxResults)),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Listings request failed (HTTP ${response.status})`);
      }
      const data = await response.json();
      const results = data?.results?.[0]?.results;
      if (!Array.isArray(results)) {
        throw new Error('Unexpected listings response shape');
      }
      const listings = results.map(normalizeListing).filter(Boolean);
      cacheMap.set(productId, { ts: Date.now(), data: listings });
      return listings;
    } finally {
      clearTimeout(timer);
    }
  }

  return { buildRequestBody, normalizeListing, fetchListings, LISTINGS_ENDPOINT };
});
