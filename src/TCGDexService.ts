import { requestUrl } from 'obsidian';

const API = 'https://api.tcgdex.net/v2/en';

export interface TCGDexCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TCGDexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  category: string;
  types?: string[];
  rarity?: string;
  set: { id: string; name: string };
  variants?: {
    normal: boolean;
    reverse: boolean;
    holo: boolean;
    firstEdition: boolean;
  };
  tcgplayer?: {
    normal?:                    { marketPrice?: number | null };
    'reverse-holofoil'?:        { marketPrice?: number | null };
    holofoil?:                  { marketPrice?: number | null };
    '1st-edition-holofoil'?:   { marketPrice?: number | null };
  };
  cardmarket?: {
    trend?:        number | null;
    avg?:          number | null;
    'trend-holo'?: number | null;
    'avg-holo'?:   number | null;
  };
}

interface TCGDexSetResponse {
  id: string;
  name: string;
  cards: TCGDexCardBrief[];
}

const VARIANT_DEFS: Array<{
  key: keyof NonNullable<TCGDexCard['variants']>;
  suffix: string;
  label: string;
}> = [
  { key: 'normal',       suffix: '_n',  label: 'Normal' },
  { key: 'reverse',      suffix: '_r',  label: 'Reverse Holo' },
  { key: 'holo',         suffix: '_h',  label: 'Holo' },
  { key: 'firstEdition', suffix: '_fe', label: '1st Edition' },
];

// Session cache keyed by full card ID (e.g. "swsh1-1")
const cardCache = new Map<string, TCGDexCard>();

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchPokemonCard(cardId: string): Promise<TCGDexCard | null> {
  return fetchCardById(cardId);
}

async function fetchCardById(cardId: string): Promise<TCGDexCard | null> {
  if (cardCache.has(cardId)) return cardCache.get(cardId)!;
  try {
    const res = await requestUrl({
      url: `${API}/cards/${cardId}`,
      headers: { Accept: 'application/json' },
    });
    if (res.status < 200 || res.status >= 300) return null;
    const card: TCGDexCard = res.json;
    cardCache.set(cardId, card);
    return card;
  } catch {
    return null;
  }
}

export async function fetchPokemonSetCards(
  setId: string,
  onProgress?: (fetched: number, total: number) => void
): Promise<TCGDexCard[]> {
  const setRes = await requestUrl({
    url: `${API}/sets/${setId}`,
    headers: { Accept: 'application/json' },
  });
  if (setRes.status < 200 || setRes.status >= 300) {
    throw new Error(`TCGdex set "${setId}" not found (${setRes.status})`);
  }

  const setData: TCGDexSetResponse = setRes.json;
  const briefs = setData.cards ?? [];
  const total = briefs.length;
  const results: TCGDexCard[] = [];

  const BATCH = 10;
  for (let i = 0; i < briefs.length; i += BATCH) {
    if (i > 0) await delay(50);
    const batch = briefs.slice(i, i + BATCH);
    const cards = await Promise.all(batch.map(b => fetchCardById(b.id)));
    for (const card of cards) {
      if (card) results.push(card);
    }
    onProgress?.(Math.min(i + BATCH, total), total);
  }

  return results;
}

export function pokemonCardToMarkdownRows(card: TCGDexCard): string[] {
  const variants = card.variants;
  const enabled = VARIANT_DEFS.filter(v => variants?.[v.key]);
  const toRender = enabled.length > 0 ? enabled : [VARIANT_DEFS[0]];

  const imageBase = card.image ?? '';
  const setId = card.set.id.toLowerCase();
  const typeStr = card.types && card.types.length > 0
    ? card.types.join('/')
    : card.category;

  return toRender.map(({ suffix, label }) => {
    const rowId = `${card.id}${suffix}`;
    const name = `${card.name} (${label})`;
    const imageCell = imageBase ? `![${name}](${imageBase}/high.webp)` : '';
    return `| <input type="checkbox" unchecked id="${rowId}"> | ${imageCell} | ${name} | ${typeStr} | ${card.rarity ?? ''} | ${setId} | ${card.localId} |  |`;
  });
}

export function getTCGPlayerPrice(card: TCGDexCard, suffix: string): number | null {
  const t = card.tcgplayer;
  if (!t) return null;
  switch (suffix) {
    case '_n':  return t.normal?.marketPrice ?? null;
    case '_r':  return t['reverse-holofoil']?.marketPrice ?? null;
    case '_h':  return t.holofoil?.marketPrice ?? null;
    case '_fe': return t['1st-edition-holofoil']?.marketPrice ?? t.holofoil?.marketPrice ?? null;
    default:    return null;
  }
}

export function getCardmarketPrice(card: TCGDexCard, suffix: string): number | null {
  const cm = card.cardmarket;
  if (!cm) return null;
  if (suffix === '_h') {
    return cm['trend-holo'] ?? cm['avg-holo'] ?? cm.trend ?? null;
  }
  return cm.trend ?? cm.avg ?? null;
}
