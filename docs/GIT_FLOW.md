# Git Flow — obsidian-tcg-collectors

## Branch strategy

```
main          ← stable releases only (tagged)
dev           ← integration branch, always ahead of main
feature/*     ← new features, branch off dev
fix/*         ← bug fixes, branch off dev
hotfix/*      ← critical fixes on main, merge back to dev
release/*     ← release prep (version bump, changelog), branch off dev
```

## Rules

- **Never commit directly to `main`** — only merge via PR from `release/*` or `hotfix/*`
- **Never commit directly to `dev`** — branch off for every feature or fix
- All PRs require a passing build (`npm run build`)
- `main` is always tagged with a version after merge

---

## Day-to-day workflow

### Starting a new feature

```bash
git checkout dev
git pull origin dev
git checkout -b feature/my-feature
# ... work ...
git push origin feature/my-feature
# open PR → dev
```

### Starting a bug fix

```bash
git checkout dev
git pull origin dev
git checkout -b fix/bug-description
# ... work ...
git push origin fix/bug-description
# open PR → dev
```

### Creating a release

```bash
git checkout dev
git pull origin dev
git checkout -b release/v1.1.0

# 1. Bump version in manifest.json, package.json, versions.json
# 2. Update docs/CHANGELOG.md
# 3. Run npm run build

git add .
git commit -m "chore: bump version to v1.1.0"
git push origin release/v1.1.0

# open PR → main
# after merge:
git checkout main && git pull
git tag v1.1.0
git push origin v1.1.0

# merge back into dev
git checkout dev
git merge main
git push origin dev
```

### Hotfix (critical bug on main)

```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix

# ... fix ...
git push origin hotfix/critical-fix
# open PR → main, then merge back to dev
```

---

## Versioning (SemVer)

`MAJOR.MINOR.PATCH`

| Change type | Version bump |
|-------------|-------------|
| New TCG game support | MINOR |
| New feature within existing game | MINOR |
| Bug fix | PATCH |
| Breaking change to file format | MAJOR |

Files to update on every release:
- `manifest.json` → `"version"`
- `package.json` → `"version"`
- `versions.json` → add new entry
- `docs/CHANGELOG.md` → add section

---

## Commit message format (Conventional Commits)

```
type(scope): short description

feat(mtg): add price sort options
fix(parser): handle missing id suffix in legacy files
chore: bump version to v1.1.0
docs: update git flow guide
style(modal): improve coming soon screen layout
refactor(scryfall): extract price cache to separate module
```

Types: `feat` `fix` `chore` `docs` `style` `refactor` `test` `perf`
