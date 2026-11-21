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
    // Listings are fetched in pages of `pageSize` until `maxResults` or the end of the results.
    pageSize: 50,
    maxResults: 200,
  };

  // Shared across calls so revisiting a product within the TTL skips the network.
  const defaultCache = new Map();

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

  return { buildRequestBody, normalizeListing, fetchListings, LISTINGS_ENDPOINT };
});
