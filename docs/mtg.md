# Magic: The Gathering — Collectors Plugin

Data source: [Scryfall API](https://scryfall.com/docs/api) (free, no API key required).

---

## Collection Types

### MTG Set

Tracks all cards in a single Scryfall set. Create with a **set code** (e.g. `blb`, `mh3`, `tblb`).

- Imports foil + nonfoil rows per card (or filtered by finish)
- Deduplication: set code + collector number + finish suffix
- Refreshable: click ⟳ to append newly printed cards (existing rows untouched)

### MTG Theme Collection

Tracks any group of cards defined by a **Scryfall query** or search URL.

- Supports full Scryfall syntax: `t:turtle game:paper`, `e:blb is:promo`, etc.
- Paste a Scryfall search URL directly — the plugin extracts `q` and `order` automatically
- Auto-update: re-checks Scryfall on every dashboard open (toggle per collection)

---

## Print Finishes

When creating a set collection, choose which finish to import:

| Option | Rows created |
|--------|-------------|
| All (default) | One nonfoil row + one foil row per card |
| Non-foil only | Only `_n` rows |
| Foil only | Only `_f` rows |

Card ID suffix: `_n` = nonfoil · `_f` = foil.

---

## Frontmatter Keys

```yaml
collection-type: mtg-set         # or mtg-theme
collection-name: My MTG Set
set-code: BLB                    # set collections
scryfall-query: t:turtle         # theme collections
scryfall-order: released         # sort order passed to Scryfall
finish-import: all               # all | foil | nonfoil
all-prints: true                 # include showcase, borderless, extended art, etc.
auto-update: false               # re-fetch on dashboard open (theme collections)
collection-format: paper         # paper | arena
last-fetched: 2025-01-01
plugin-version: 0.1.5-beta
```

---

## Price Sources

Configure in **Settings → Collectors → Magic: The Gathering**.

| Source | Currency | Requires |
|--------|----------|---------|
| Scryfall — USD (default) | $ | Nothing |
| Scryfall — EUR | € | Nothing |
| TCGPlayer | $ | Public API key from [developer.tcgplayer.com](https://developer.tcgplayer.com) |
| Cardmarket | € | OAuth 1.0a credentials from [cardmarket.com](https://www.cardmarket.com/en/Magic/Account/API) |

Prices are fetched via `POST /cards/collection` (up to 75 cards per request, 500ms between batches). They are **session-cached** — not persisted to disk.

---

## Scryfall API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /cards/search?q=e:{set}&unique=prints` | Set card list |
| `GET /cards/search?q={query}&unique=prints` | Theme collection |
| `GET /cards/search?q=!"{name}"&unique=prints` | All printings of a card |
| `GET /cards/autocomplete?q={query}` | Card name suggestions |
| `GET /sets/{code}` | Set release date (for sort) |
| `POST /cards/collection` | Batch price + external ID lookup |

Rate limit: 2 req/s. The plugin waits 500ms between paginated requests and handles 429 with retry-after.

---

## Card Row Format

```
| <input type="checkbox" unchecked id="{id8}_{n|f}"> | ![{name}]({img_url}) | {name} | {type_line} | {rarity} | {SET} | {collector_number} |  |
```

`{id8}` = first 8 characters of the Scryfall UUID.
