# TCGPlayer Seller Location

A Chrome extension that shows the **city and state** of every seller next to their name in the
listings on any [TCGPlayer](https://www.tcgplayer.com) product page.

## How it works

TCGPlayer loads its listings from its own internal API,
`POST https://mp-search-api.tcgplayer.com/v1/product/{productId}/listings`.
That endpoint returns each listing with a `sellerAddress` (city, territory/state, country).
On `/product/*` pages, a content script reads the product id from the URL, calls that endpoint
with the same filters the site uses (live sellers, quantity ≥ 1), and matches each seller name
already present in the page (the spotlight seller and every listing row) with a small
`📍 City, State` badge.

The fetch happens from the page itself (same origin, same user-agent as the site), so it behaves
like the site's own requests; `host_permissions` for the API host lets the content script issue the
cross-origin request.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Visit any product page with live listings, e.g.
   `https://www.tcgplayer.com/product/84188/pokemon-ex-power-keepers-charizard`

Click the extension icon to turn the badges on or off.

## Notes

- Some listings in the API response have no `sellerAddress` — those sellers simply get no badge.
- The API shape is an internal (undocumented) contract. If TCGPlayer changes it, the badge may
  stop appearing; the extension fails quietly (no badges, no errors in the page).
- The extension reads no personal data; it only queries the same listings endpoint the page
  itself uses, and only for the product loaded in the tab.

## Development

```sh
npm run check   # syntax + manifest validation
```
