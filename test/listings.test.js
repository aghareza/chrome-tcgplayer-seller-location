const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRequestBody, fetchListings, fetchSellerAddress, isHighlightedState, parseStateList } = require('../src/lib/listings.js');

function listing(i, address) {
  return { sellerName: `Seller ${i}`, sellerKey: `k${i}`, listingId: i, sellerAddress: address };
}

// Fake endpoint serving `total` listings, paged by the request body's from/size.
function fakeApi(total) {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    const end = Math.min(body.from + body.size, total);
    const results = [];
    for (let i = body.from; i < end; i++) results.push(listing(i, { city: 'Raleigh', territory: 'NC', country: 'US' }));
    return { ok: true, status: 200, json: async () => ({ results: [{ totalResults: total, results }] }) };
  };
  return { fetchImpl, bodies };
}

test('request body sorts like the product page', () => {
  const body = buildRequestBody({ from: 50, size: 25 });
  assert.deepEqual(body.sort, { field: 'price+shipping', order: 'asc' });
  assert.equal(body.from, 50);
  assert.equal(body.size, 25);
});

test('pages through results until the total is reached', async () => {
  const api = fakeApi(120);
  const result = await fetchListings('1', { fetchImpl: api.fetchImpl, cache: new Map() });
  assert.equal(result.length, 120);
  assert.deepEqual(api.bodies.map(b => [b.from, b.size]), [[0, 50], [50, 50], [100, 50]]);
});

test('stops at maxResults', async () => {
  const api = fakeApi(1000);
  const result = await fetchListings('1', { fetchImpl: api.fetchImpl, cache: new Map(), maxResults: 120 });
  assert.equal(result.length, 120);
  assert.deepEqual(api.bodies.map(b => [b.from, b.size]), [[0, 50], [50, 50], [100, 20]]);
});

test('maps territory to state', async () => {
  const api = fakeApi(1);
  const [first] = await fetchListings('1', { fetchImpl: api.fetchImpl, cache: new Map() });
  assert.equal(first.city, 'Raleigh');
  assert.equal(first.state, 'NC');
});

test('reuses the shared cache across calls', async () => {
  const api = fakeApi(3);
  await fetchListings('987654', { fetchImpl: api.fetchImpl });
  await fetchListings('987654', { fetchImpl: api.fetchImpl });
  assert.equal(api.bodies.length, 1);
});

test('rejects non-OK responses', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403 });
  await assert.rejects(fetchListings('1', { fetchImpl, cache: new Map() }), /HTTP 403/);
});

test('matches highlighted states by code or name', () => {
  assert.equal(isHighlightedState('CA', ['CA']), true);
  assert.equal(isHighlightedState(' california ', ['CA']), true);
  assert.equal(isHighlightedState('New York', ['NY', 'NJ']), true);
  assert.equal(isHighlightedState('NC', ['CA']), false);
  assert.equal(isHighlightedState('CA', []), false);
  assert.equal(isHighlightedState(undefined, ['CA']), false);
});

test('parses state lists from codes and names', () => {
  assert.deepEqual(parseStateList('CA'), { codes: ['CA'], invalid: [] });
  assert.deepEqual(parseStateList('NY,NJ,CT'), { codes: ['NY', 'NJ', 'CT'], invalid: [] });
  assert.deepEqual(parseStateList(' ny , nj ;ct '), { codes: ['NY', 'NJ', 'CT'], invalid: [] });
  assert.deepEqual(parseStateList('NY NJ CT'), { codes: ['NY', 'NJ', 'CT'], invalid: [] });
  assert.deepEqual(parseStateList('New York, new jersey'), { codes: ['NY', 'NJ'], invalid: [] });
  assert.deepEqual(parseStateList('CA, ca, California'), { codes: ['CA'], invalid: [] });
  assert.deepEqual(parseStateList('CA, XX, Cali'), { codes: ['CA'], invalid: ['XX', 'Cali'] });
  assert.deepEqual(parseStateList(''), { codes: [], invalid: [] });
});

function fakeSellerApi(profile) {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push([init.method, url]);
    return { ok: true, status: 200, json: async () => profile };
  };
  return { fetchImpl, urls };
}

test('fetchSellerAddress reads the seller profile address', async () => {
  const api = fakeSellerApi({ sellerKey: '2f92b232', addressCity: 'Coralville', addressTerritory: 'IA', addressCountryCode: 'US' });
  const address = await fetchSellerAddress('2f92b232', { fetchImpl: api.fetchImpl, cache: new Map() });
  assert.deepEqual(address, { city: 'Coralville', state: 'IA', country: 'US' });
  // Read-only GET on the profile, without the page's updateLifetimeSales side effect.
  assert.deepEqual(api.urls, [['GET', 'https://infinite-api.tcgplayer.com/sm/seller/2f92b232']]);
});

test('fetchSellerAddress returns null when the profile has no address', async () => {
  const api = fakeSellerApi({ sellerKey: 'abc', addressCity: '', addressTerritory: '' });
  assert.equal(await fetchSellerAddress('abc', { fetchImpl: api.fetchImpl, cache: new Map() }), null);
});

test('fetchSellerAddress caches per seller, including null results', async () => {
  const api = fakeSellerApi({});
  const cache = new Map();
  await fetchSellerAddress('abc', { fetchImpl: api.fetchImpl, cache });
  await fetchSellerAddress('abc', { fetchImpl: api.fetchImpl, cache });
  assert.equal(api.urls.length, 1);
});

test('fetchSellerAddress rejects bad keys and failed responses', async () => {
  await assert.rejects(fetchSellerAddress('../x', { fetchImpl: async () => assert.fail('no fetch') }), /Invalid seller key/);
  const fetchImpl = async () => ({ ok: false, status: 500 });
  await assert.rejects(fetchSellerAddress('abc', { fetchImpl, cache: new Map() }), /HTTP 500/);
});
