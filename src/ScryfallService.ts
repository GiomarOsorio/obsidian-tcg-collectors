import { requestUrl } from 'obsidian';

const API = 'https://api.scryfall.com';

// Web-only operators that are not valid in the Scryfall API
const WEB_ONLY_PATTERN = /\b(?:prefer|display):\S+/g;

export interface ParsedScryfallUrl {
  query: string;
  order?: string;
}

/**
 * Accept either a raw Scryfall query ("type:turtle game:paper")
 * or a full Scryfall search URL and return the API-ready query + order.
 */
export function parseScryfallInput(input: string): ParsedScryfallUrl {
  const trimmed = input.trim();

  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    try {
      const url = new URL(trimmed);
      const q = url.searchParams.get('q') ?? '';
      const order = url.searchParams.get('order') ?? undefined;
      const cleaned = q.replace(WEB_ONLY_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
      return { query: cleaned, order };
    } catch {
      // Not a valid URL — fall through and treat as raw query
    }
  }

  return { query: trimmed.replace(WEB_ONLY_PATTERN, '').trim() };
}

// Session cache: setCode (lowercase) → YYYY-MM-DD, populated from fetched card data
const setDateCache = new Map<string, string>();

export function getSetDate(setCode: string): string | undefined {
  return setDateCache.get(setCode.toLowerCase());
}

function cacheSetDate(card: ScryfallCard) {
  const key = card.set.toLowerCase();
  if (!setDateCache.has(key)) {
    setDateCache.set(key, card.released_at);
  }
}

// Fetch release date for a single set not yet in cache
export async function fetchSetReleasedAt(setCode: string): Promise<string> {
  const key = setCode.toLowerCase();
  if (setDateCache.has(key)) return setDateCache.get(key)!;

  const res = await requestUrl({ url: `${API}/sets/${key}`, headers: { Accept: 'application/json' } });
  if (res.status < 200 || res.status >= 300) return '0000-00-00';
  const data: { released_at: string } = res.json;
  setDateCache.set(key, data.released_at);
  return data.released_at;
}

export interface ScryfallCard {
  id: string;
  name: string;
  type_line: string;
  rarity: string;
  set: string;
  set_name: string;
  collector_number: string;
  released_at: string; // YYYY-MM-DD
  finishes: string[];
  image_uris?: { normal: string };
  card_faces?: Array<{ image_uris?: { normal: string } }>;
}

interface ScryfallList {
  data: ScryfallCard[];
  has_more: boolean;
  next_page?: string;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllPages(
  url: string,
  onPage?: (page: number) => void
): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let nextUrl: string | undefined = url;
  let page = 1;

  while (nextUrl) {
    const res = await requestUrl({ url: nextUrl, headers: { Accept: 'application/json' } });

    if (res.status < 200 || res.status >= 300) {
      let details = '';
      try { details = (res.json as any).details ?? ''; } catch { /* empty */ }
      throw new Error(details || `Scryfall error ${res.status}`);
    }

    const list: ScryfallList = res.json;
    list.data.forEach(cacheSetDate);
    cards.push(...list.data);
    onPage?.(page);

    if (list.has_more && list.next_page) {
      nextUrl = list.next_page;
      page++;
      await delay(500); // Scryfall rate limit: 2 req/sec
    } else {
      nextUrl = undefined;
    }
  }

  return cards;
}

export async function fetchSetCards(
  setCode: string,
  onPage?: (page: number) => void
): Promise<ScryfallCard[]> {
  const q = encodeURIComponent(`e:${setCode.toLowerCase()} order:set`);
  return fetchAllPages(`${API}/cards/search?q=${q}&unique=prints`, onPage);
}

export async function fetchSearchCards(
  query: string,
  onPage?: (page: number) => void,
  order = 'released'
): Promise<ScryfallCard[]> {
  const q = encodeURIComponent(query);
  return fetchAllPages(
    `${API}/cards/search?q=${q}&unique=prints&order=${order}&dir=asc`,
    onPage
  );
}

// ── Price cache ──────────────────────────────────────────────────────────────

export interface CardPrices {
  usd: number | null;
  usd_foil: number | null;
}

const priceCache = new Map<string, CardPrices>();

export function getCardPrice(set: string, number: string, isFoil: boolean): number | null | undefined {
  const key = `${set.toLowerCase()}#${number}`;
  if (!priceCache.has(key)) return undefined;
  const entry = priceCache.get(key)!;
  return isFoil ? entry.usd_foil : entry.usd;
}

export function isPriceCached(set: string, number: string): boolean {
  return priceCache.has(`${set.toLowerCase()}#${number}`);
}

export async function fetchCardPrices(
  identifiers: Array<{ set: string; collector_number: string }>
): Promise<void> {
  const seen = new Set<string>();
  const toFetch = identifiers.filter(id => {
    const key = `${id.set.toLowerCase()}#${id.collector_number}`;
    if (priceCache.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (toFetch.length === 0) return;

  for (let i = 0; i < toFetch.length; i += 75) {
    const batch = toFetch.slice(i, i + 75);
    try {
      const res = await requestUrl({
        url: `${API}/cards/collection`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identifiers: batch }),
      });
      if (res.status < 200 || res.status >= 300) continue;
      const data = res.json as {
        data: Array<{
          set: string;
          collector_number: string;
          prices: { usd: string | null; usd_foil: string | null };
        }>;
      };
      for (const card of data.data) {
        priceCache.set(`${card.set.toLowerCase()}#${card.collector_number}`, {
          usd: card.prices.usd != null ? parseFloat(card.prices.usd) : null,
          usd_foil: card.prices.usd_foil != null ? parseFloat(card.prices.usd_foil) : null,
        });
      }
    } catch {
      // price load is non-critical
    }
  }
}

export function cardToMarkdownRows(card: ScryfallCard): string[] {
  const imageUrl =
    card.image_uris?.normal ??
    card.card_faces?.[0]?.image_uris?.normal ??
    '';

  const set = card.set.toUpperCase();
  const id8 = card.id.slice(0, 8);
  const rows: string[] = [];

  const finishes = card.finishes.filter(f => f === 'foil' || f === 'nonfoil');

  for (const finish of finishes) {
    const label = finish === 'foil' ? 'Foil' : 'Normal';
    const suffix = finish === 'foil' ? '_f' : '_n';
    const rowId = `${id8}${suffix}`;
    const name = `${card.name} (${label})`;

    rows.push(
      `| <input type="checkbox" unchecked id="${rowId}"> | ![${name}](${imageUrl}) | ${name} | ${card.type_line} | ${card.rarity} | ${set} | ${card.collector_number} |  |`
    );
  }

  return rows;
}
