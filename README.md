# TCGPlayer Seller Location

A Chrome extension that shows where each seller is located, as a small `📍 City, State` badge next
to their name on [TCGPlayer](https://www.tcgplayer.com) product pages. Sellers in states you pick
(California by default) get an amber badge so they stand out.

> Unofficial personal project, not affiliated with TCGPlayer. It relies on how TCGPlayer's site
> works today, so it may stop working if they change things.

## Install

1. On this GitHub page, click **Code → Download ZIP**, then unzip it somewhere you'll keep it.
   Chrome loads the extension from that folder, so don't delete it afterward.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (switch in the top right).
4. Click **Load unpacked** and pick the unzipped folder (the one with `manifest.json` inside).
5. Open any TCGPlayer product page, e.g.
   [this Charizard](https://www.tcgplayer.com/product/84188/pokemon-ex-power-keepers-charizard).
   Badges appear next to seller names after a second or two.

Tip: click the puzzle-piece icon in Chrome's toolbar and pin the extension so it's easy to reach.

## Use

Click the extension's icon to open its settings:

- **Show seller locations** turns the badges on or off.
- **Highlight states** picks which states get the amber badge. Type state codes or names separated
  by commas, like `CA` or `NY, NJ, CT`, then press Enter. Leave it empty to highlight none.

## Update

Download the ZIP again and replace the old folder's contents (or run `git pull` if you cloned it).
Then go to `chrome://extensions` and click the reload icon on the extension's card.

## Good to know

- Some sellers don't share their location, so they won't get a badge.
- Only the cheapest ~200 listings on a product get badges.
- The extension only talks to TCGPlayer, only on TCGPlayer pages, and collects no data about you.

## License

[MIT](LICENSE)
