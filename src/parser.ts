import { TFile, Vault } from 'obsidian';
import { Collection, CollectionCard, CollectionFormat, CollectionType } from './types';

const CHECKBOX_PATTERN = /<input type="checkbox"/;

export function yamlStr(s: string): string {
  if (/[:#\[\]{},]/.test(s) || s.startsWith('"') || s.startsWith("'")) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

function unquoteYaml(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
}

export async function parseCollectionFile(
  file: TFile,
  vault: Vault
): Promise<Collection | null> {
  const content = await vault.read(file);

  let collectionType: CollectionType = 'mtg-theme';
  let setCode: string | undefined;
  let scryfallQuery: string | undefined;
  let scryfallOrder: string | undefined;
  let autoUpdate = false;
  let finishImport: 'all' | 'foil' | 'nonfoil' | undefined;
  let allPrints: boolean | undefined;
  let collectionFormat: CollectionFormat = 'paper';
  let lastFetched: string | undefined;
  let pluginVersion: string | undefined;
  let collectionName = file.basename;

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fmLines = fmMatch[1].split('\n');
    for (const line of fmLines) {
      const [key, ...rest] = line.split(':');
      const val = unquoteYaml(rest.join(':').trim());
      switch (key.trim()) {
        case 'collection-type':
          collectionType = (val === 'custom' ? 'mtg-theme' : val) as CollectionType;
          break;
        case 'collection-name':
          collectionName = val;
          break;
        case 'set-code':
          setCode = val;
          break;
        case 'scryfall-query':
          scryfallQuery = val;
          break;
        case 'scryfall-order':
          scryfallOrder = val;
          break;
        case 'auto-update':
          autoUpdate = val === 'true';
          break;
        case 'finish-import':
          finishImport = val as 'all' | 'foil' | 'nonfoil';
          break;
        case 'all-prints':
          allPrints = val === 'true';
          break;
        case 'last-fetched':
          lastFetched = val;
          break;
        case 'plugin-version':
          pluginVersion = val;
          break;
        case 'collection-format':
          collectionFormat = val as CollectionFormat;
          break;
      }
    }
  }

  if (!CHECKBOX_PATTERN.test(content)) return null;

  const cards = parseCards(content);
  if (cards.length === 0) return null;

  return {
    name: collectionName,
    path: file.path,
    type: collectionType,
    format: collectionFormat,
    setCode,
    scryfallQuery,
    scryfallOrder,
    autoUpdate,
    finishImport,
    allPrints,
    lastFetched,
    pluginVersion,
    cards,
    owned: cards.filter(c => c.owned).length,
    total: cards.length,
  };
}

function parseCards(content: string): CollectionCard[] {
  const cards: CollectionCard[] = [];

  for (const line of content.split('\n')) {
    if (!CHECKBOX_PATTERN.test(line)) continue;

    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 7) continue;

    const checkboxCell = cells[0];
    const idMatch = checkboxCell.match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : Math.random().toString(36).slice(2);
    const owned = checkboxCell.includes('checked') && !checkboxCell.includes('unchecked');
    const countMatch = checkboxCell.match(/data-count="(\d+)"/);
    const count = countMatch ? parseInt(countMatch[1]) : (owned ? 1 : 0);

    const imageMatch = cells[1].match(/!\[.*?\]\((.*?)\)/);
    const imageUrl = imageMatch ? imageMatch[1] : '';

    cards.push({
      id,
      owned,
      count,
      name: cells[2] || '',
      type: cells[3] || '',
      rarity: cells[4] || '',
      set: cells[5] || '',
      number: cells[6] || '',
      imageUrl,
      notes: cells[7] || '',
    });
  }

  return cards;
}

function finishSuffix(name: string, id: string): string {
  // New-style IDs have explicit suffix
  if (id.endsWith('_f')) return '_f';
  if (id.endsWith('_n')) return '_n';
  // Infer from card name for legacy cards
  if (name.includes('(Foil)')) return '_f';
  if (name.includes('(Normal)')) return '_n';
  return ''; // unknown — treat as "any finish"
}

export function getExistingCardKeys(content: string): Set<string> {
  const keys = new Set<string>();
  for (const line of content.split('\n')) {
    if (!CHECKBOX_PATTERN.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 7) continue;
    const set = cells[5].trim();
    const number = cells[6].trim();
    const idMatch = cells[0].match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : '';
    const name = cells[2].trim();
    const suffix = finishSuffix(name, id);
    // Add both the specific key and the bare key so legacy entries block all variants
    keys.add(`${set}#${number}${suffix}`);
    if (suffix === '') {
      keys.add(`${set}#${number}_f`);
      keys.add(`${set}#${number}_n`);
    }
  }
  return keys;
}

export async function appendCards(
  file: TFile,
  rows: string[],
  vault: Vault
): Promise<number> {
  if (rows.length === 0) return 0;

  const content = await vault.read(file);
  const existing = getExistingCardKeys(content);

  const newRows = rows.filter(row => {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 7) return false;
    const set = cells[5].trim();
    const number = cells[6].trim();
    const idMatch = cells[0].match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : '';
    const name = cells[2].trim();
    const suffix = finishSuffix(name, id);
    return !existing.has(`${set}#${number}${suffix}`);
  });

  if (newRows.length === 0) return 0;

  const lines = content.split('\n');
  let lastTableLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith('|')) {
      lastTableLine = i;
      break;
    }
  }

  if (lastTableLine === -1) {
    await vault.modify(file, content + '\n' + newRows.join('\n'));
  } else {
    lines.splice(lastTableLine + 1, 0, ...newRows);
    await vault.modify(file, lines.join('\n'));
  }

  return newRows.length;
}

export async function toggleCardOwned(
  file: TFile,
  cardId: string,
  owned: boolean,
  vault: Vault
): Promise<void> {
  const content = await vault.read(file);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(`id="${cardId}"`)) continue;

    if (owned) {
      lines[i] = lines[i].replace(
        `<input type="checkbox" unchecked id="${cardId}">`,
        `<input type="checkbox" checked id="${cardId}">`
      );
    } else {
      lines[i] = lines[i].replace(
        `<input type="checkbox" checked id="${cardId}">`,
        `<input type="checkbox" unchecked id="${cardId}">`
      );
    }
    break;
  }

  await vault.modify(file, lines.join('\n'));
}

export async function setCardCount(
  file: TFile,
  cardId: string,
  count: number,
  vault: Vault
): Promise<void> {
  const content = await vault.read(file);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(`id="${cardId}"`)) continue;

    let line = lines[i];
    const owned = count > 0;

    // Sync checked/unchecked
    if (owned) {
      line = line.replace(`unchecked id="${cardId}"`, `checked id="${cardId}"`);
    } else {
      line = line.replace(`checked id="${cardId}"`, `unchecked id="${cardId}"`);
    }

    // Store count only when > 1 (1 is implied by checked)
    if (count > 1) {
      if (line.includes('data-count="')) {
        line = line.replace(/data-count="\d+"/, `data-count="${count}"`);
      } else {
        line = line.replace(`id="${cardId}"`, `id="${cardId}" data-count="${count}"`);
      }
    } else {
      line = line.replace(/\s*data-count="\d+"/, '');
    }

    lines[i] = line;
    break;
  }

  await vault.modify(file, lines.join('\n'));
}

/**
 * Replace the entire frontmatter block with new lines, preserving the body (card table).
 */
export async function replaceFrontmatter(
  file: TFile,
  fmLines: string[],
  vault: Vault
): Promise<void> {
  const content = await vault.read(file);
  const fmEnd = content.indexOf('\n---', 4);
  if (content.startsWith('---\n') && fmEnd !== -1) {
    const body = content.slice(fmEnd + 4); // skip '\n---'
    // Normalize leading newlines to exactly one blank line (prevents accumulation on repeated saves)
    await vault.modify(file, fmLines.join('\n') + body.replace(/^\n*/, '\n\n'));
  } else {
    await vault.modify(file, fmLines.join('\n') + '\n\n' + content);
  }
}

export function extractOwnedMap(content: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of content.split('\n')) {
    if (!CHECKBOX_PATTERN.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 7) continue;
    const checkboxCell = cells[0];
    const isOwned = checkboxCell.includes('checked') && !checkboxCell.includes('unchecked');
    if (!isOwned) continue;
    const countMatch = checkboxCell.match(/data-count="(\d+)"/);
    const count = countMatch ? parseInt(countMatch[1]) : 1;
    const set = cells[5].trim().toLowerCase();
    const number = cells[6].trim();
    const idMatch = checkboxCell.match(/id="([^"]+)"/);
    const id = idMatch?.[1] ?? '';
    const suffix = id.endsWith('_f') ? '_f' : '_n';
    map.set(`${set}#${number}${suffix}`, count);
  }
  return map;
}

export async function clearCardRows(file: TFile, vault: Vault): Promise<void> {
  const content = await vault.read(file);
  const lines = content.split('\n');
  const filtered = lines.filter(line => !CHECKBOX_PATTERN.test(line));
  await vault.modify(file, filtered.join('\n').trimEnd() + '\n');
}

export function applyOwnedStates(rows: string[], ownedMap: Map<string, number>): string[] {
  return rows.map(row => {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 7) return row;
    const set = cells[5].trim().toLowerCase();
    const number = cells[6].trim();
    const idMatch = cells[0].match(/id="([^"]+)"/);
    const id = idMatch?.[1] ?? '';
    const suffix = id.endsWith('_f') ? '_f' : '_n';
    const prevCount = ownedMap.get(`${set}#${number}${suffix}`);
    if (prevCount && prevCount > 0) {
      return row.replace(
        `unchecked id="${id}"`,
        prevCount > 1 ? `checked id="${id}" data-count="${prevCount}"` : `checked id="${id}"`
      );
    }
    return row;
  });
}

/**
 * Update or insert a single key-value pair in the YAML frontmatter of a file.
 * If the key exists, its line is replaced. If not, it is inserted before the closing ---.
 */
export async function patchFrontmatter(
  file: TFile,
  key: string,
  value: string,
  vault: Vault
): Promise<void> {
  const content = await vault.read(file);
  const fmEnd = content.indexOf('\n---', 4);
  if (!content.startsWith('---\n') || fmEnd === -1) return;

  const lines = content.split('\n');
  const endIdx = lines.findIndex((l, i) => i > 0 && l === '---');
  if (endIdx === -1) return;

  const existing = lines.findIndex(l => l.trimStart().startsWith(`${key}:`));
  const serialized = `${key}: ${yamlStr(value)}`;
  if (existing !== -1 && existing < endIdx) {
    lines[existing] = serialized;
  } else {
    lines.splice(endIdx, 0, serialized);
  }

  await vault.modify(file, lines.join('\n'));
}
