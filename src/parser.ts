import { TFile, Vault } from 'obsidian';
import { Collection, CollectionCard, CollectionType } from './types';

const CHECKBOX_PATTERN = /<input type="checkbox"/;

export async function parseCollectionFile(
  file: TFile,
  vault: Vault
): Promise<Collection | null> {
  const content = await vault.read(file);

  let collectionType: CollectionType = 'custom';
  let setCode: string | undefined;
  let scryfallQuery: string | undefined;
  let scryfallOrder: string | undefined;
  let autoUpdate = false;
  let collectionName = file.basename;

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fmLines = fmMatch[1].split('\n');
    for (const line of fmLines) {
      const [key, ...rest] = line.split(':');
      const val = rest.join(':').trim();
      switch (key.trim()) {
        case 'collection-type':
          collectionType = val as CollectionType;
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
    setCode,
    scryfallQuery,
    scryfallOrder,
    autoUpdate,
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

    const imageMatch = cells[1].match(/!\[.*?\]\((.*?)\)/);
    const imageUrl = imageMatch ? imageMatch[1] : '';

    cards.push({
      id,
      owned,
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
