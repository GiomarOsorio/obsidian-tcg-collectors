import { requestUrl } from 'obsidian';

const API = 'https://api.tcgdex.net/v2/en';

export interface TCGDexSetBrief {
  id: string;
  name: string;
  serie?: { id: string; name: string };
  cardCount?: { total: number; official?: number };
  releaseDate?: string;
}

let setsCache: TCGDexSetBrief[] | null = null;

export async function fetchAllSets(): Promise<TCGDexSetBrief[]> {
  if (setsCache) return setsCache;
  const res = await requestUrl({ url: `${API}/sets`, headers: { Accept: 'application/json' } });
  if (res.status < 200 || res.status >= 300) return [];
  setsCache = (res.json as TCGDexSetBrief[]) ?? [];
  return setsCache;
}

export interface TCGDexCardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface TCGDexPriceVariant {
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  marketPrice?: number | null;
  directLowPrice?: number | null;
}

export interface TCGDexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  category: string;
  types?: string[];
  rarity?: string;
  stage?: string;
  suffix?: string;
  trainerType?: string;
  set: { id: string; name: string };
  variants?: {
    normal: boolean;
    reverse: boolean;
    holo: boolean;
    firstEdition: boolean;
  };
  // pricing is nested under `pricing` in the TCGdex v2 API
  pricing?: {
    tcgplayer?: {
      unit?: string;
      normal?:               TCGDexPriceVariant;
      reverse?:              TCGDexPriceVariant;
      'reverse-holofoil'?:   TCGDexPriceVariant;
      holofoil?:             TCGDexPriceVariant;
      '1st-edition'?:        TCGDexPriceVariant;
      '1st-edition-holofoil'?: TCGDexPriceVariant;
      unlimited?:            TCGDexPriceVariant;
    };
    cardmarket?: {
      unit?: string;
      avg?: number | null;
      low?: number | null;
      trend?: number | null;
      'avg-holo'?: number | null;
      'low-holo'?: number | null;
      'trend-holo'?: number | null;
      avg1?: number | null;  avg7?: number | null;  avg30?: number | null;
      'avg1-holo'?: number | null; 'avg7-holo'?: number | null; 'avg30-holo'?: number | null;
    };
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
  const t = card.pricing?.tcgplayer;
  if (!t) return null;
  switch (suffix) {
    case '_n':  return t.normal?.marketPrice ?? null;
    // TCGdex API uses 'reverse' in practice; 'reverse-holofoil' in docs
    case '_r':  return t.reverse?.marketPrice ?? t['reverse-holofoil']?.marketPrice ?? null;
    case '_h':  return t.holofoil?.marketPrice ?? null;
    case '_fe': return t['1st-edition-holofoil']?.marketPrice ?? t['1st-edition']?.marketPrice ?? t.holofoil?.marketPrice ?? null;
    default:    return null;
  }
}

export function getCardmarketPrice(card: TCGDexCard, suffix: string): number | null {
  const cm = card.pricing?.cardmarket;
  if (!cm) return null;
  if (suffix === '_h') {
    return cm['trend-holo'] ?? cm['avg-holo'] ?? cm.trend ?? null;
  }
  return cm.trend ?? cm.avg ?? null;
}
