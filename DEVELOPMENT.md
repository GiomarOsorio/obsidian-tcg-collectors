# Development Guide

## Branch strategy

| Branch | Purpose | Release type |
|--------|---------|-------------|
| `dev`  | Active development, features, fixes | Pre-release (dev build) |
| `main` | Stable, production-ready | Public release |

---

## Dev build flow

Every push to `dev` automatically creates (or replaces) a **pre-release** tagged `x.y.z-dev`.

```
feature work → commit → push to dev → GitHub Action builds → pre-release updated
```

Tag format: `0.1.5-dev`  
Release title: `v0.1.5-dev (abc1234)`

### Install dev builds via BRAT (mobile + desktop)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. BRAT → **Add Beta Plugin** → `GiomarOsorio/obsidian-tcg-collectors`
3. Enable **"Enable beta testing for all plugins"** in BRAT settings

BRAT will install the latest pre-release. Use **Check for updates** to get new dev builds.

---

## Prod release flow

Production releases are triggered by pushing a version tag to `main`.

```
dev → PR → merge to main → npm version → git tag → push tag → GitHub Action → release
```

### Step-by-step

```bash
# 1. Merge dev into main (via PR or directly)
git checkout main && git merge dev

# 2. Bump version (updates package.json, manifest.json, versions.json)
npm version patch    # 0.1.5 → 0.1.6   (bug fixes)
npm version minor    # 0.1.5 → 0.2.0   (new features)
npm version major    # 0.1.5 → 1.0.0   (breaking changes)

# 3. Push main + the new tag
git push origin main --follow-tags
```

`npm version` runs `version-bump.mjs` automatically (via the `version` script in package.json),
which keeps `manifest.json` and `versions.json` in sync.

GitHub Actions picks up the tag, builds, and publishes the release with `main.js`,
`manifest.json`, and `styles.css` attached.

### Version format

We use **semantic versioning** with an optional 4th digit for hotfixes:

| Format | When |
|--------|------|
| `0.1.6` | Normal patch/minor/major |
| `0.1.6.1` | Hotfix on top of a release |

---

## Local development

```bash
npm install       # install dependencies
npm run dev       # watch mode (rebuilds on file change)
npm run build     # production build
```

### Install locally in Obsidian

Symlink (or copy) the repo into your vault's plugins folder:

```bash
# macOS/Linux
ln -s /path/to/CollectorsObsidianPlugin \
  "/path/to/vault/.obsidian/plugins/collectors-plugin"
```

Then enable the plugin in Obsidian → Settings → Community Plugins.

---

## File structure

```
CollectorsObsidianPlugin/
├── src/                    # TypeScript source
│   ├── main.ts             # Plugin entry point
│   ├── CollectionView.ts   # File view for .collection files
│   ├── DashboardView.ts    # Dashboard panel
│   ├── NewCollectionModal.ts
│   ├── PokemonCardZoomModal.ts
│   ├── CardZoomModal.ts
│   ├── CardSearchModal.ts
│   ├── PriceService.ts
│   ├── ScryfallService.ts
│   ├── TCGDexService.ts
│   ├── parser.ts
│   ├── settings.ts
│   ├── types.ts
│   ├── migrations.ts
│   └── i18n/               # Translations (en, es, fr, de, pt, ja, zh, zh-TW)
├── .github/
│   └── workflows/
│       ├── release.yml     # Prod: triggered by version tag on main
│       └── dev-release.yml # Dev: triggered by push to dev branch
├── main.js                 # Bundled output (committed for BRAT)
├── styles.css              # Plugin styles
├── manifest.json           # Obsidian plugin manifest
├── versions.json           # Version compatibility map
├── version-bump.mjs        # Syncs manifest.json + versions.json on npm version
├── esbuild.config.mjs      # Build config
├── tsconfig.json
└── package.json
```

---

## Release checklist

### Dev release (automatic)
- [ ] Push to `dev` → GitHub Action handles everything

### Prod release
- [ ] All fixes/features merged into `dev` and tested
- [ ] PR from `dev` → `main` reviewed and merged
- [ ] `npm version patch/minor/major` on `main`
- [ ] `git push origin main --follow-tags`
- [ ] Verify release on GitHub with correct assets attached
