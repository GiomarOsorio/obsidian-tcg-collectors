# Changelog

All notable changes to this project will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [0.2.0] — 2026-05-24

### Added
- **Card prices** — live USD prices fetched from Scryfall `/cards/collection` (batch, 75/req)
  - Price badge on each card tile in detail view
  - `$X.XX invested` and `$X.XX to complete` per collection card
  - Hero stats on dashboard: global invested + to-complete totals
  - Prices cached in memory per session (not stored in markdown)
  - Foil cards use `prices.usd_foil`, non-foil use `prices.usd`
- **Multi-provider price API** — Scryfall USD/EUR, TCGPlayer (API key), Cardmarket (OAuth 1.0a)
  - Fallback to Scryfall USD if provider credentials missing
  - Settings UI: dropdown + show/hide credential sections per provider
- **Price sort** — new sort options: Price ↓ / Price ↑ in detail view
- **Full-width dashboard** — opens as a tab instead of right side panel
- **New Collection modal — game tabs** — tab bar for MTG / Pokémon / One Piece / Yu-Gi-Oh!
  - MTG tab: full existing functionality
  - Pokémon, One Piece, Yu-Gi-Oh!: styled "Coming soon" screens with game branding
- **Mobile support** — all HTTP calls use Obsidian `requestUrl` (no CORS/Capacitor issues)
  - Touch-friendly button sizing via `@media (pointer: coarse)`
- **Dashboard hero stats** — 4-box summary row (collections, cards owned, invested, to complete)
- **Collection card thumbnails** — first card's artwork shown in collection list
- **Collection price row** — `$X.XX invested · $X.XX to complete` per collection
- **Responsive layout** — CSS container queries (`@container`) for panel-width-aware layout in Obsidian split-pane

### Changed
- Dashboard now opens as a full-width tab on both desktop and mobile
- Collection list redesigned: 2-column grid (desktop), 1-column (narrow panel)
- Card tiles slightly larger (`minmax(130px, 1fr)`)
- Rarity abbreviation to single letter in tiles
- Hero stats detail section in collection detail view

### Fixed
- `fetch()` replaced with `requestUrl` in `ScryfallService`, `CardSearchModal` (mobile fix)

---

## [0.1.0] — 2026-05-24

### Added
- Initial release
- Dashboard view showing all collections
- Collection list grouped by type: MTG Sets, Theme Collections, Custom
- Collection detail view: card grid with Scryfall artwork
- Toggle owned/missing — writes back to markdown instantly
- Progress bar per collection (owned / total / %)
- New Collection modal: name, type, set code, Scryfall query/URL, auto-fetch, auto-update
- Auto-fetch: populate collection from Scryfall on creation (by set code or query)
- Auto-update: re-check Scryfall for new cards on dashboard open
- Card search modal: autocomplete, browse all printings, add to collection
- Scryfall URL parser: paste full search URL, extracts `q` + `order`, strips web-only operators
- Sort options: Number / Name / Newest first / Oldest first
- Filter tabs: All / Owned / Missing
- Search bar in detail view
- Settings: collections folder, auto-detect toggle
- Deduplication by set + collector number + finish (foil/nonfoil)
- Support for both Spanish and English table headers
- Legacy ID inference (`(Foil)` / `(Normal)` in card name)
- `manifest.json` with `isDesktopOnly: false`
