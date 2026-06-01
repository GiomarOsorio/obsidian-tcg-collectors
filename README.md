# Collectors — Obsidian Plugin

Track your TCG card collections (Magic: The Gathering and more) directly in Obsidian. Powered by the [Scryfall API](https://scryfall.com/docs/api). Works on desktop and mobile.

![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7c3aed?logo=obsidian&logoColor=white)
![License](https://img.shields.io/badge/license-AGPL--v3-green)
![Mobile](https://img.shields.io/badge/mobile-supported-blue)

---

## Features

- **Full-width dashboard** — all collections at a glance with hero stats: cards owned, total invested, and cost to complete
- **Card prices** — live USD prices fetched from Scryfall, shown per card and rolled up per collection
- **Detail view** — card grid with Scryfall artwork, filter by owned/missing, sort by name, number, price, or release date
- **Toggle ownership** — click ✓/+ on any card; writes back to the markdown file instantly
- **Auto-fetch** — create a collection and auto-populate it from Scryfall (by set code or search query)
- **Auto-update** — theme collections (e.g. all turtle cards) update automatically when new cards are printed
- **Card search** — search any card by name, browse all printings, add individual copies to a collection
- **Multiple collection types** — MTG sets, theme collections, fully custom
- **Mobile support** — works on Obsidian for iOS and Android

---

## Installation

> This plugin is not yet in the Obsidian community registry. Install manually.

### Desktop

1. Clone or download this repo:
   ```bash
   git clone https://github.com/giosorio30/obsidian-tcg-collectors
   ```
2. Build:
   ```bash
   cd obsidian-tcg-collectors
   npm install
   npm run build
   ```
3. Copy (or symlink) the folder into your vault's plugin directory:
   ```bash
   ln -s /path/to/obsidian-tcg-collectors \
     "/path/to/Your Vault/.obsidian/plugins/collectors-plugin"
   ```
4. In Obsidian → **Settings → Community Plugins** → disable Safe Mode → enable **Collectors**.

### Mobile (iOS / Android)

Obsidian mobile can't install plugins from a terminal, but it can load any plugin files placed in the vault. Only three files are needed: `main.js`, `manifest.json`, and `styles.css`.

**Option A — Cloud sync (recommended if you already use iCloud / Obsidian Sync / Dropbox)**

1. Build the plugin on your desktop (see above).
2. Copy the three files into your vault's plugin folder on the synced drive:
   ```
   <Your Vault>/.obsidian/plugins/collectors-plugin/main.js
   <Your Vault>/.obsidian/plugins/collectors-plugin/manifest.json
   <Your Vault>/.obsidian/plugins/collectors-plugin/styles.css
   ```
3. Wait for sync to complete on the mobile device.
4. In Obsidian mobile → **Settings → Community Plugins** → enable **Collectors**.

**Option B — Direct file transfer (no cloud sync)**

*iOS:*
1. Build on desktop and locate the three plugin files.
2. Open the **Files** app on your iPhone/iPad.
3. Navigate to your vault folder → `.obsidian` → `plugins` → create a folder named `collectors-plugin`.
4. AirDrop or copy the three files into that folder.
5. Enable the plugin in Obsidian settings.

*Android:*
1. Build on desktop and transfer the three files via USB, Google Drive, or any file manager.
2. Place them at:
   ```
   <Your Vault>/.obsidian/plugins/collectors-plugin/
   ```
3. Enable the plugin in Obsidian settings.

> **Note:** Every time you update the plugin (new build), repeat the file copy step and reload the plugin in Obsidian (toggle off → on, or restart the app).

---

## Usage

### Opening the Dashboard

- Click the **grid icon** (⊞) in the left ribbon, or
- Run command: `Collectors: Open Dashboard`

The dashboard opens as a full-width tab with hero stats at the top.

### Hero Stats

The top of the dashboard shows four summary boxes:

| Stat | Description |
|------|-------------|
| Collections | Total number of tracked collections |
| Cards owned | Owned count vs. total cards across all collections |
| Invested | Total USD value of cards you own |
| To complete | Total USD cost of cards you're still missing |

Prices are fetched from Scryfall in the background on load and cached for the session.

### Creating a Collection

Click **+ New** in the dashboard header. Fill in:

| Field | Description |
|-------|-------------|
| Collection name | Display name (e.g. "Bloomburrow Token Boosters") |
| Type | MTG Set / MTG Theme / Custom |
| Set code | For MTG sets: Scryfall set code (e.g. `blb`, `tblb`, `mh3`) |
| Scryfall query or URL | Paste a full Scryfall search URL **or** type a query directly. The plugin strips web-only operators (`prefer:*`) and extracts `q` and `order` from URLs automatically. |
| Auto-fetch | Populate the file with cards from Scryfall on creation |
| Auto-update | Re-check Scryfall for new cards every time the dashboard opens (ideal for theme collections) |

### Adding Individual Cards

In the detail view of any collection, click **+ Card**:

1. Type a card name → Scryfall autocomplete suggests matches
2. Select a card name → all printings appear (set, number, rarity, finish, release date)
3. Click to select one or more printings
4. Click **Add to Collection**

### Updating a Collection

Click **⟳** next to any collection to fetch new cards from Scryfall.

- Only **new cards are added** — existing rows and their owned/missing state are never touched.
- Deduplication is based on set code + collector number + finish (foil/nonfoil).

### Sorting Cards (Detail View)

| Sort | Behavior |
|------|----------|
| Number | Set code alphabetical, then collector number numeric |
| Name | Alphabetical A → Z |
| Price ↓ | Most expensive first |
| Price ↑ | Cheapest first |
| Newest first | By set release date descending |
| Oldest first | By set release date ascending |

---

## Card Prices

Prices are fetched from Scryfall's `/cards/collection` endpoint (up to 75 cards per request, batched automatically). They are **not stored** in your markdown files — prices change daily, so they are fetched fresh each session.

- Foil cards use `prices.usd_foil`
- Non-foil cards use `prices.usd`
- Cards with no listed price show `—`
- While loading, the dashboard shows `…`

---

## Collection File Format

Each collection is a standard Obsidian markdown file — fully human-editable.

### Frontmatter

```yaml
---
collection-type: mtg-set          # mtg-set | mtg-theme | custom
collection-name: My Collection
set-code: TBLB                    # for MTG sets
scryfall-query: t:turtle          # for theme/custom collections
auto-update: true                 # optional: re-fetch on every dashboard open
---
```

### Card Table

```markdown
| ¿La tengo? | Imagen | Nombre | Tipo | Rareza | Set | Número | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <input type="checkbox" checked id="abc123_n"> | ![Card (Normal)](https://cards.scryfall.io/...) | Card (Normal) | Creature | common | BLB | 188 |  |
| <input type="checkbox" unchecked id="abc123_f"> | ![Card (Foil)](https://cards.scryfall.io/...) | Card (Foil) | Creature | common | BLB | 188 |  |
```

- `checked` → you own this card
- `unchecked` → you don't have it yet
- Card ID format: `{scryfall_id_first8}_{n|f}` (`_n` = nonfoil, `_f` = foil)

---

## Settings

**Settings → Collectors:**

| Setting | Default | Description |
|---------|---------|-------------|
| Collections folder | (empty) | Folder to scan. Leave empty to scan the whole vault. Example: `004 MTG` |
| Auto-detect collections | On | Detect collection files by their checkbox table format |

---

## Scryfall API

This plugin uses the [Scryfall API](https://scryfall.com/docs/api). Key endpoints used:

| Endpoint | Used for |
|----------|----------|
| `GET /cards/search?q=e:{set}&unique=prints` | Fetch all cards in a set |
| `GET /cards/search?q={query}&unique=prints` | Fetch cards by query (theme collections) |
| `GET /cards/search?q=!"{name}"&unique=prints` | All printings of a specific card |
| `GET /cards/autocomplete?q={query}` | Card name suggestions |
| `GET /sets/{code}` | Set release date (cached per session) |
| `POST /cards/collection` | Batch price lookup (up to 75 cards/request) |

Scryfall rate limit: 2 requests/second. The plugin waits 500ms between paginated requests.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (comes with Node.js)
- An Obsidian vault for testing

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/giosorio30/obsidian-tcg-collectors
cd obsidian-tcg-collectors

# 2. Install dependencies
npm install

# 3. Symlink the repo into your vault's plugin folder
#    so Obsidian picks up the built files automatically
ln -s "$(pwd)" "/path/to/Your Vault/.obsidian/plugins/collectors-plugin"
```

Replace `/path/to/Your Vault` with the actual path to your Obsidian vault.  
On macOS the vault is usually inside `~/Documents` or `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/`.

### Development workflow

```bash
npm run dev    # watch mode — rebuilds main.js on every file save
```

After each rebuild, reload the plugin in Obsidian without restarting the app:

1. Open **Settings → Community Plugins**
2. Toggle **Collectors** off, then back on

Or use the Obsidian command palette (`Cmd/Ctrl + P`) → **Reload app without saving**.

### Production build

```bash
npm run build   # type-check + minified bundle
```

Output files (copy these three to deploy anywhere):
- `main.js` — compiled plugin bundle
- `manifest.json` — plugin metadata
- `styles.css` — all styles

### Branching

| Branch | Purpose |
|--------|---------|
| `main` | Stable releases |
| `dev`  | Integration branch — merge feature branches here first |
| `feature/*` | New features |
| `fix/*` | Bug fixes |

Open PRs against `dev`, not `main`.

### Project Structure

```
src/
  main.ts               # Plugin entry, commands, ribbon, MarkdownPostProcessor
  types.ts              # TypeScript interfaces and default settings
  parser.ts             # .collection file parser, appendCards, toggleCardOwned
  ScryfallService.ts    # Scryfall API client, price/set cache, pagination
  PriceService.ts       # Multi-provider price layer (Scryfall, TCGPlayer, Cardmarket)
  DashboardView.ts      # Main view: list + detail screens, hero stats, prices
  NewCollectionModal.ts # Create collection wizard + Scryfall auto-fetch
  CardSearchModal.ts    # Search cards by name, browse printings, add to collection
  CardZoomModal.ts      # Full-screen card zoom with holographic foil effect
  migrations.ts         # Schema migration helpers (run on dashboard open)
  settings.ts           # Settings tab
styles.css              # All CSS (adapts to Obsidian light/dark theme)
manifest.json           # Plugin manifest (id, version, minAppVersion)
versions.json           # Version compatibility map
```

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE)

---

---

# Collectors — Plugin para Obsidian

Rastrea tus colecciones de TCG (Magic: The Gathering y más) directamente en Obsidian. Impulsado por la [API de Scryfall](https://scryfall.com/docs/api). Funciona en escritorio y móvil.

---

## Características

- **Dashboard de pantalla completa** — todas las colecciones de un vistazo con estadísticas: cartas en posesión, total invertido y costo para completar
- **Precios de cartas** — precios en USD obtenidos de Scryfall en tiempo real, mostrados por carta y por colección
- **Vista detallada** — cuadrícula de cartas con artwork de Scryfall, filtro por poseída/faltante, orden por nombre, número, precio o fecha de lanzamiento
- **Toggle de posesión** — clic en ✓/+ en cualquier carta; escribe de vuelta al archivo markdown al instante
- **Auto-obtener** — crea una colección y la llena automáticamente desde Scryfall (por código de set o búsqueda)
- **Auto-actualizar** — colecciones temáticas (ej. todas las tortugas) se actualizan solas cuando salen nuevas cartas
- **Buscar cartas** — busca por nombre, ve todas las ediciones, agrega copias individuales a una colección
- **Soporte móvil** — funciona en Obsidian para iOS y Android

---

## Instalación

### Escritorio

1. Clona o descarga este repositorio:
   ```bash
   git clone https://github.com/giosorio30/obsidian-tcg-collectors
   ```
2. Compila:
   ```bash
   cd obsidian-tcg-collectors
   npm install
   npm run build
   ```
3. Crea un symlink en la carpeta de plugins del vault:
   ```bash
   ln -s /ruta/al/obsidian-tcg-collectors \
     "/ruta/a/Tu Vault/.obsidian/plugins/collectors-plugin"
   ```
4. En Obsidian → **Ajustes → Plugins de la comunidad** → desactiva Modo seguro → activa **Collectors**.

### Móvil (iOS / Android)

Solo necesitas tres archivos: `main.js`, `manifest.json` y `styles.css`.

**Opción A — Sincronización en la nube (iCloud / Obsidian Sync / Dropbox)**

1. Compila en tu computador.
2. Copia los tres archivos a la carpeta de plugins del vault sincronizado:
   ```
   <Tu Vault>/.obsidian/plugins/collectors-plugin/main.js
   <Tu Vault>/.obsidian/plugins/collectors-plugin/manifest.json
   <Tu Vault>/.obsidian/plugins/collectors-plugin/styles.css
   ```
3. Espera a que sincronice en el celular.
4. En Obsidian móvil → **Ajustes → Plugins de la comunidad** → activa **Collectors**.

**Opción B — Transferencia directa (sin nube)**

*iOS:*
1. Abre la app **Archivos** en el iPhone/iPad.
2. Navega a tu vault → `.obsidian` → `plugins` → crea la carpeta `collectors-plugin`.
3. Copia los tres archivos vía AirDrop o la app Archivos.
4. Activa el plugin en Obsidian.

*Android:*
1. Transfiere los archivos por USB, Google Drive o cualquier gestor de archivos.
2. Colócalos en `<Tu Vault>/.obsidian/plugins/collectors-plugin/`.
3. Activa el plugin en Obsidian.

> **Nota:** Cada vez que actualices el plugin (nueva compilación), repite la copia de archivos y recarga el plugin en Obsidian (apagar → encender, o reiniciar la app).

### Desarrollo local

```bash
npm install     # instalar dependencias
npm run dev     # modo watch — recompila al guardar
npm run build   # build de producción
```

Después de cada build, recarga el plugin en Obsidian: **Ajustes → Plugins de la comunidad** → apaga y enciende **Collectors**.

---

## Uso

### Abrir el Dashboard

- Clic en el **ícono de cuadrícula** (⊞) en la barra lateral izquierda, o
- Ejecuta el comando: `Collectors: Open Dashboard`

### Estadísticas principales

| Estadística | Descripción |
|-------------|-------------|
| Collections | Número total de colecciones |
| Cards owned | Cartas poseídas vs. total |
| Invested | Valor total en USD de las cartas que tienes |
| To complete | Costo en USD de las cartas que te faltan |

### Crear una colección

Clic en **+ New** y completa:

| Campo | Descripción |
|-------|-------------|
| Collection name | Nombre de la colección |
| Type | MTG Set / MTG Theme / Custom |
| Set code | Código de Scryfall (ej. `blb`, `tblb`, `mh3`) |
| Scryfall query o URL | URL de búsqueda de Scryfall o consulta directa |
| Auto-fetch | Llena el archivo con cartas de Scryfall al crear |
| Auto-update | Re-verifica Scryfall al abrir el dashboard |

---

## Formato de archivos de colección

Cada colección es un archivo markdown estándar de Obsidian, editable a mano.

### Frontmatter

```yaml
---
collection-type: mtg-set
collection-name: Mi Colección
set-code: TBLB
scryfall-query: t:turtle
auto-update: true
---
```

---

## Licencia

GNU Affero General Public License v3.0
