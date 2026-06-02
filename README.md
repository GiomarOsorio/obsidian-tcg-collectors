# Collectors — Obsidian Plugin

Track your TCG card collections directly in Obsidian. Supports **Magic: The Gathering** (via Scryfall) and **Pokémon TCG** (via TCGdex). Works on desktop and mobile.

![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7c3aed?logo=obsidian&logoColor=white)
![License](https://img.shields.io/badge/license-AGPL--v3-green)
![Mobile](https://img.shields.io/badge/mobile-supported-blue)

---

## Supported Games

| Game | Status | Data source | Prices |
|------|--------|-------------|--------|
| Magic: The Gathering | ✅ Full support | Scryfall | Scryfall USD/EUR · TCGPlayer · Cardmarket |
| Pokémon TCG | ✅ Full support | TCGdex (free, no key) | TCGPlayer USD · Cardmarket EUR |
| One Piece TCG | 🚧 Planned | — | — |
| Yu-Gi-Oh! | 🚧 Planned | — | — |

Game-specific documentation:

- [Magic: The Gathering](docs/mtg.md)
- [Pokémon TCG](docs/pokemon.md)
- [One Piece TCG](docs/onepiece.md) *(coming soon)*
- [Yu-Gi-Oh!](docs/yugioh.md) *(coming soon)*

---

## Features

- **Dashboard** — all collections at a glance: cards owned, total invested, cost to complete
- **Live prices** — fetched per session, cached in memory (MTG) or on disk (Pokémon 24h)
- **Card grid** — artwork, filter owned/missing, sort by name / number / price / release
- **Toggle ownership** — click ✓/+ on any card; writes instantly to the markdown file
- **Variant-aware rows** — MTG: foil / nonfoil · Pokémon: Normal / Reverse Holo / Holo / 1st Edition
- **Auto-fetch** — populate a collection from an API on creation (set code or search query)
- **Card search** — search by name, browse all printings, add individual copies
- **Multiple price sources** — per-game price provider selection in settings
- **i18n** — UI available in EN · ES · FR · DE · PT · JA · ZH · ZH-TW
- **Mobile** — works on iOS and Android via BRAT or manual install

---

## Installation

> This plugin is not yet in the Obsidian community registry. Install manually.

### Desktop

1. Clone or download this repo:
   ```bash
   git clone https://github.com/GiomarOsorio/obsidian-tcg-collectors
   ```
2. Build:
   ```bash
   cd obsidian-tcg-collectors
   npm install && npm run build
   ```
3. Symlink into your vault:
   ```bash
   ln -s "$(pwd)" "/path/to/Your Vault/.obsidian/plugins/collectors-plugin"
   ```
4. In Obsidian → **Settings → Community Plugins** → enable **Collectors**.

### Mobile (iOS / Android) via BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Community Plugins.
2. BRAT settings → **Add Beta Plugin** → paste:
   ```
   https://github.com/GiomarOsorio/obsidian-tcg-collectors
   ```
3. Enable **Collectors** in Community Plugins.

On updates: BRAT → **Check for updates** → plugin reloads automatically.

### Mobile (manual)

Copy `main.js`, `manifest.json`, and `styles.css` into:
```
<Your Vault>/.obsidian/plugins/collectors-plugin/
```

---

## Quick Start

1. Open the dashboard: click the **card icon** in the ribbon, or run `Collectors: Open Dashboard`.
2. Click **+ New Collection** → choose a game → fill in the set / query.
3. Cards are auto-fetched and appear in the grid. Click ✓ to mark cards as owned.

---

## Collection File Format

Collections are plain Obsidian markdown files (`.collection` extension), fully human-editable.

### MTG example

```yaml
---
cssclasses: collectors-file
collection-type: mtg-set
collection-name: Bloomburrow Token Boosters
set-code: TBLB
finish-import: all
all-prints: true
---

| Owned | Image | Name | Type | Rarity | Set | Number | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <input type="checkbox" checked id="abc123_n"> | ![Card (Normal)](https://...) | Card (Normal) | Creature | common | TBLB | 5 |  |
| <input type="checkbox" unchecked id="abc123_f"> | ![Card (Foil)](https://...)  | Card (Foil)   | Creature | common | TBLB | 5 |  |
```

### Pokémon example

```yaml
---
cssclasses: collectors-file
collection-type: pokemon-set
collection-name: Sword & Shield
tcgdex-set-id: swsh1
pokemon-variant-import: all
---

| Owned | Image | Name | Type | Rarity | Set | Number | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <input type="checkbox" unchecked id="swsh1-1_n"> | ![Caterpie (Normal)](https://...) | Caterpie (Normal) | Grass | Common | swsh1 | 1 |  |
| <input type="checkbox" unchecked id="swsh1-1_r"> | ![Caterpie (Reverse Holo)](https://...) | Caterpie (Reverse Holo) | Grass | Common | swsh1 | 1 |  |
```

Card ID format:
- MTG: `{scryfall_id_first8}_{n|f}` — `_n` nonfoil · `_f` foil
- Pokémon: `{setId}-{localId}_{suffix}` — `_n` normal · `_r` reverse · `_h` holo · `_fe` 1st edition

---

## Settings

Open **Settings → Collectors** to configure:

| Tab | Options |
|-----|---------|
| General | Collections folder, auto-detect |
| Magic: The Gathering | Price source (Scryfall USD/EUR, TCGPlayer, Cardmarket), API keys |
| Pokémon | Price source (TCGPlayer USD · Cardmarket EUR) |
| One Piece | *(coming soon)* |
| Yu-Gi-Oh! | *(coming soon)* |

---

## Development

### Prerequisites

- Node.js 18+, npm

### Setup

```bash
git clone https://github.com/GiomarOsorio/obsidian-tcg-collectors
cd obsidian-tcg-collectors
npm install
ln -s "$(pwd)" "/path/to/Your Vault/.obsidian/plugins/collectors-plugin"
```

### Workflow

```bash
npm run dev    # watch mode
npm run build  # type-check + production bundle
```

After a rebuild: **Settings → Community Plugins** → toggle Collectors off/on.

### Project Structure

```
src/
  main.ts               # Plugin entry, commands, ribbon, view registration
  types.ts              # TypeScript interfaces, CollectionType, DEFAULT_SETTINGS
  parser.ts             # .collection file parser, appendCards, owned-state helpers
  migrations.ts         # Schema migration helpers
  ScryfallService.ts    # Scryfall API client (set fetch, search, prices, pagination)
  TCGDexService.ts      # TCGdex API client (Pokémon sets, cards, prices)
  PriceService.ts       # Multi-provider price layer (MTG + Pokémon, persistent cache)
  DashboardView.ts      # Dashboard: hero stats, collection groups, prefetch
  CollectionView.ts     # FileView: card grid, filters, sort, variant badges
  NewCollectionModal.ts # Create/edit wizard: MTG + Pokémon forms, set catalog
  CardSearchModal.ts    # Card name search, printings browser, add to collection
  CardZoomModal.ts      # Full-screen card zoom
  settings.ts           # Settings tab (per-game tabs)
  i18n/                 # Translations: en · es · fr · de · pt · ja · zh · zh-TW
styles.css              # All CSS (light/dark theme)
manifest.json
```

### Releasing

```bash
npm run build
git add main.js manifest.json styles.css && git commit -m "chore: bump vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin dev && git push origin vX.Y.Z
gh release create vX.Y.Z --prerelease --title "vX.Y.Z" --notes "…" \
  main.js manifest.json styles.css
```

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE)
