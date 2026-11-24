# TCGPlayer Seller Location

A Chrome extension that shows the **city and state** of every seller next to their name in the
listings on any [TCGPlayer](https://www.tcgplayer.com) product page. Sellers in California get
an amber badge so they stand out.

> This is an unofficial, personal project. It is not affiliated with or endorsed by TCGPlayer, and
> it relies on TCGPlayer's undocumented internal APIs, so it may stop working at any time.

## How it works

TCGPlayer loads its listings from its own internal API,
`POST https://mp-search-api.tcgplayer.com/v1/product/{productId}/listings`.
That endpoint returns each listing with a `sellerAddress` (city, territory/state, country).
On `/product/*` pages, a content script reads the product id from the URL, calls that endpoint
with the same filters and sort the site uses (live sellers, quantity ≥ 1, cheapest price + shipping
first), pages through up to 200 listings, and matches each seller name
already present in the page (the spotlight seller and every listing row) with a small
`📍 City, State` badge.

The content script is injected on every `www.tcgplayer.com` page, because the site is a
single-page app: clicking into a product from search changes the URL without a page load, so a
`/product/*`-only match would never run. It does nothing until the URL is a product page.

The fetch happens from the page itself (same origin, same user-agent as the site), so it behaves
like the site's own requests. It works because the API allows CORS from `www.tcgplayer.com`;
in Manifest V3, `host_permissions` does not lift CORS for content scripts.

## Install (unpacked)

1. Get the code: on GitHub click **Code → Download ZIP** and unzip it, or
   `git clone https://github.com/aghareza/chrome-tcgplayer-seller-location.git`
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select the folder you downloaded (the one containing `manifest.json`)
5. Visit any product page with live listings, e.g.
   `https://www.tcgplayer.com/product/84188/pokemon-ex-power-keepers-charizard`

Click the extension icon to turn the badges on or off.

To update, download the ZIP again (or `git pull`), then click the reload icon on the extension's
card in `chrome://extensions`.

## Notes

- Many listings in the API response have no `sellerAddress`. For those sellers, if their name is
  shown on the page, the extension looks up the address from the seller profile the seller page
  uses, `GET https://infinite-api.tcgplayer.com/sm/seller/{sellerKey}` (`addressCity`,
  `addressTerritory`), at most 3 at a time and once per seller per page load. Sellers whose
  profile has no address get no badge.
- Only the first 200 listings (by price + shipping) are fetched; sellers beyond that get no badge.
- The API shape is an internal (undocumented) contract. If TCGPlayer changes it, the badge may
  stop appearing; the extension fails quietly (no badges, no errors in the page).
- The extension reads no personal data; it only queries the listings and seller profile endpoints
  the site itself uses, and only for the product loaded in the tab.

## Development

```sh
npm run check   # syntax + manifest validation
npm test        # data-layer tests (node:test)
```

## License

[MIT](LICENSE)
