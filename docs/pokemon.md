# Pokémon TCG — Collectors Plugin

Data source: [TCGdex API](https://tcgdex.dev) (free, open source, no API key required).

Prices via TCGdex — choose TCGPlayer (USD) or Cardmarket (EUR) in settings.

> ❤ TCGdex is community-maintained and free. Consider sponsoring:
> https://github.com/tcgdex/cards-database#sponsors-

---

## Collection Type: Pokémon Set

Each collection maps to one TCGdex set ID (e.g. `swsh1`, `sv10`, `base1`).

Cards are fetched 10 at a time with a 50ms delay between batches. Each card is fetched individually to retrieve variant and price data (TCGdex has no bulk endpoint).

---

## Variants

Unlike MTG where all cards share the same finish options, Pokémon variants are **card-intrinsic** — each card declares which variants it exists in via a `variants` object in the TCGdex response.

| Variant | Suffix | Description |
|---------|--------|-------------|
| Normal | `_n` | Standard print |
| Reverse Holo | `_r` | Full-card holographic background |
| Holo | `_h` | Holographic illustration area |
| 1st Edition | `_fe` | First edition print run (vintage sets) |

If a card has zero variants flagged `true`, one `_n` row is created as fallback.

### Variant filter at import

When creating a collection, choose which variants to import:

| Option | Rows created |
|--------|-------------|
| All (default) | All variants reported by TCGdex |
| Normal only | Only `_n` rows |
| Reverse Holo only | Only `_r` rows |
| Holo only | Only `_h` rows |
| 1st Edition only | Only `_fe` rows |

The choice is stored in frontmatter (`pokemon-variant-import`) and restored when editing.

---

## Creating a Collection

In the New Collection modal → **Pokémon** tab:

1. **Collection name** — display name (auto-filled when selecting from catalog)
2. **Set catalog** — searchable dropdown of all TCGdex sets, sorted newest first, filterable by name / ID / series. Selecting a set auto-fills the set ID and collection name.
3. **Custom** — enter the TCGdex set ID manually (e.g. `swsh1`)
4. **Print finish** — variant filter (see above)

---

## Price Sources

Configure in **Settings → Collectors → Pokémon**.

| Source | Currency | Notes |
|--------|----------|-------|
| TCGPlayer · USD (default) | $ | Market price per variant |
| Cardmarket · EUR | € | Trend price; holo variants use holo-specific price |

Price mapping per variant:

**TCGPlayer:**
- `_n` → `normal.marketPrice`
- `_r` → `reverse-holofoil.marketPrice`
- `_h` → `holofoil.marketPrice`
- `_fe` → `1st-edition-holofoil.marketPrice` (falls back to `holofoil`)

**Cardmarket:**
- `_n`, `_r`, `_fe` → `trend ?? avg`
- `_h` → `trend-holo ?? avg-holo ?? trend`

Prices are **persisted to disk** (`pokemon-price-cache.json` in the plugin folder) with a 24-hour TTL. Switching price source invalidates the cache automatically.

---

## Frontmatter Keys

```yaml
collection-type: pokemon-set
collection-name: Sword & Shield
tcgdex-set-id: swsh1
pokemon-variant-import: all      # all | normal | reverse | holo | firstEdition
last-fetched: 2025-01-01
plugin-version: 0.1.5-beta
```

---

## Card Row Format

```
| <input type="checkbox" unchecked id="{setId}-{localId}_{suffix}"> | ![{name} ({label})]({img}/high.webp) | {name} ({label}) | {type/category} | {rarity} | {setId} | {localId} |  |
```

Example: `swsh1-1_r` → Caterpie (Reverse Holo) from Sword & Shield, card #1.

---

## TCGdex API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v2/en/sets` | All sets (set catalog) |
| `GET /v2/en/sets/{id}` | Card briefs for a set |
| `GET /v2/en/cards/{setId}-{localId}` | Full card data (variants + prices) |

---

## Planned / Not Yet Implemented

### Holographic card effect

The zoom view for Pokémon cards does not yet render the 3D holographic effect.

The intended implementation uses **[pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)** by [@simeydotme](https://github.com/simeydotme) — a pure CSS + vanilla JS library that renders authentic per-rarity holographic effects (cosmos holo, rainbow rare, reverse holo, etc.) with pointer-tracking 3D tilt.

When implemented, clicking a Pokémon card in the collection view will open a zoom modal with the full interactive holographic effect, using `data-rarity`, `data-supertype`, and `data-subtypes` attributes mapped from TCGdex card data.

**Tracking issue:** see `CardZoomModal.ts` — the `openCardZoom` function will branch on `coll.type === 'pokemon-set'` to render the Pokémon-specific zoom.

### Theme collections

Pokémon theme collections (filtering by type, rarity, etc.) are deferred to a future version. TCGdex is a set-first API with no query language equivalent to Scryfall.

### Auto-update

`auto-update` is not supported for Pokémon sets — Pokémon sets don't receive new cards after release.

### Individual card search

The card search modal (`+ Card` button) is MTG-only. Pokémon card search is planned.
