import { TFile, Vault } from 'obsidian';
import { patchFrontmatter } from './parser';

interface Migration {
  toVersion: string;
  run: (file: TFile, content: string, vault: Vault) => Promise<void>;
}

function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

const MIGRATIONS: Migration[] = [
  {
    // Introduced: cssclasses, finish-import, all-prints
    toVersion: '0.2.0',
    run: async (file, content, vault) => {
      if (!/cssclasses:/.test(content)) {
        await patchFrontmatter(file, 'cssclasses', 'collectors-file', vault);
        content = await vault.read(file);
      }
      if (/collection-type:\s*mtg-set/.test(content) && !/finish-import:/.test(content)) {
        await patchFrontmatter(file, 'finish-import', 'all', vault);
        await patchFrontmatter(file, 'all-prints', 'true', vault);
      }
    },
  },
];

/**
 * Run any pending migrations on a collection file.
 * Returns true if any migration was applied.
 */
export async function migrateCollection(
  file: TFile,
  fileVersion: string | undefined,
  currentVersion: string,
  vault: Vault
): Promise<boolean> {
  // Already at current version — nothing to do, no writes
  if (fileVersion === currentVersion) return false;
  if (fileVersion && !semverGt(currentVersion, fileVersion)) return false;

  const pending = fileVersion
    ? MIGRATIONS.filter(m => semverGt(m.toVersion, fileVersion))
    : [...MIGRATIONS];

  if (pending.length === 0) {
    // No schema migrations needed but version stamp is missing/outdated — write once
    await patchFrontmatter(file, 'plugin-version', currentVersion, vault);
    return true;
  }

  let content = await vault.read(file);
  for (const m of pending) {
    await m.run(file, content, vault);
    content = await vault.read(file);
  }

  await patchFrontmatter(file, 'plugin-version', currentVersion, vault);
  return true;
}
