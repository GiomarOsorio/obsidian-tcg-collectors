import { requestUrl } from 'obsidian';
import type { CollectorsSettings, PriceSource } from './types';
import { fetchScryfallData, getScryfallData, isScryfallCached } from './ScryfallService';

export interface PriceEntry {
  normal: number | null;
  foil: number | null;
}

// Separate cache for TCGPlayer / Cardmarket results (cleared when provider changes)
const providerCache = new Map<string, PriceEntry>();

function cacheKey(set: string, number: string): string {
  return `${set.toLowerCase()}#${number}`;
}

// ── PriceService ──────────────────────────────────────────────────────────────

export class PriceService {
  private settings: CollectorsSettings;

  constructor(settings: CollectorsSettings) {
    this.settings = settings;
  }

  updateSettings(settings: CollectorsSettings) {
    const prevSource = this.effectiveSource();
    this.settings = settings;
    if (this.effectiveSource() !== prevSource) {
      providerCache.clear();
    }
  }

  /** Currency symbol for the active source */
  currency(): string {
    const src = this.effectiveSource();
    return src === 'scryfall-eur' || src === 'cardmarket' ? '€' : '$';
  }

  /** Source label for display in UI */
  sourceLabel(): string {
    const labels: Record<PriceSource, string> = {
      'scryfall-usd': 'Scryfall · USD',
      'scryfall-eur': 'Scryfall · EUR',
      'tcgplayer':    'TCGPlayer',
      'cardmarket':   'Cardmarket',
    };
    return labels[this.effectiveSource()];
  }

  /** Whether this card has any price in the cache (provider or Scryfall fallback) */
  isCached(set: string, number: string): boolean {
    const key = cacheKey(set, number);
    const src = this.effectiveSource();
    if (src === 'tcgplayer' || src === 'cardmarket') {
      return providerCache.has(key) || isScryfallCached(set, number);
    }
    return isScryfallCached(set, number);
  }

  /**
   * Returns price for a card.
   * - `undefined` → not yet fetched (show "…")
   * - `null`      → fetched but no price available (show "—")
   * - `number`    → actual price
   */
  getPrice(set: string, number: string, isFoil: boolean): number | null | undefined {
    const key = cacheKey(set, number);
    const src = this.effectiveSource();

    // Provider cache (TCGPlayer / Cardmarket)
    if (src === 'tcgplayer' || src === 'cardmarket') {
      if (providerCache.has(key)) {
        const e = providerCache.get(key)!;
        return isFoil ? e.foil : e.normal;
      }
      // Fall back to Scryfall USD if provider didn't return this card
      const d = getScryfallData(set, number);
      if (d) return isFoil ? d.usd_foil : d.usd;
      return undefined;
    }

    // Scryfall USD / EUR
    const d = getScryfallData(set, number);
    if (!d) return undefined;
    if (src === 'scryfall-eur') return isFoil ? d.eur_foil : d.eur;
    return isFoil ? d.usd_foil : d.usd;
  }

  /**
   * Fetch prices for a list of cards.
   * Always calls Scryfall first (for fallback + external IDs), then the provider if configured.
   */
  async fetchPrices(identifiers: Array<{ set: string; collector_number: string }>): Promise<void> {
    await fetchScryfallData(identifiers);

    const src = this.effectiveSource();
    if (src === 'tcgplayer') {
      await this.fetchTCGPlayerPrices(identifiers);
    } else if (src === 'cardmarket') {
      await this.fetchCardmarketPrices(identifiers);
    }
  }

  // ── Effective source (respects fallback rules) ─────────────────────────────

  private effectiveSource(): PriceSource {
    const src = this.settings.priceSource ?? 'scryfall-usd';
    if (src === 'tcgplayer' && !this.settings.tcgplayerKey) return 'scryfall-usd';
    if (src === 'cardmarket' && !this.hasCardmarketCreds()) return 'scryfall-usd';
    return src;
  }

  private hasCardmarketCreds(): boolean {
    const s = this.settings;
    return !!(s.cardmarketAppToken && s.cardmarketAppSecret
           && s.cardmarketAccessToken && s.cardmarketAccessSecret);
  }

  // ── TCGPlayer ──────────────────────────────────────────────────────────────

  private async fetchTCGPlayerPrices(
    identifiers: Array<{ set: string; collector_number: string }>
  ): Promise<void> {
    // Collect uncached cards with known tcgplayer_id
    const pending: Array<{ key: string; tcgId: number }> = [];
    for (const id of identifiers) {
      const key = cacheKey(id.set, id.collector_number);
      if (providerCache.has(key)) continue;
      const d = getScryfallData(id.set, id.collector_number);
      if (d?.tcgplayer_id) pending.push({ key, tcgId: d.tcgplayer_id });
    }
    if (pending.length === 0) return;

    // Deduplicate IDs (foil + normal share the same TCGPlayer product)
    const idToKeys = new Map<number, string[]>();
    for (const { key, tcgId } of pending) {
      if (!idToKeys.has(tcgId)) idToKeys.set(tcgId, []);
      idToKeys.get(tcgId)!.push(key);
    }

    const uniqueIds = [...idToKeys.keys()];

    for (let i = 0; i < uniqueIds.length; i += 250) {
      const batch = uniqueIds.slice(i, i + 250);
      try {
        const res = await requestUrl({
          url: `https://api.tcgplayer.com/v1.39.0/pricing/product/${batch.join(',')}`,
          headers: {
            Authorization: `Bearer ${this.settings.tcgplayerKey}`,
            Accept: 'application/json',
          },
        });
        if (res.status < 200 || res.status >= 300) continue;

        const data = res.json as {
          results: Array<{ productId: number; marketPrice: number | null; subTypeName: string }>;
        };

        // Group by productId → {normal, foil}
        const priceMap = new Map<number, PriceEntry>();
        for (const r of data.results) {
          if (!priceMap.has(r.productId)) priceMap.set(r.productId, { normal: null, foil: null });
          const e = priceMap.get(r.productId)!;
          if (r.subTypeName === 'Foil') e.foil = r.marketPrice;
          else e.normal = r.marketPrice;
        }

        // Map back to set#number keys
        for (const [tcgId, keys] of idToKeys) {
          const e = priceMap.get(tcgId);
          if (e) keys.forEach(k => providerCache.set(k, e));
        }
      } catch {
        // non-critical
      }
    }
  }

  // ── Cardmarket (OAuth 1.0a) ────────────────────────────────────────────────

  private async fetchCardmarketPrices(
    identifiers: Array<{ set: string; collector_number: string }>
  ): Promise<void> {
    const cmIdToKeys = new Map<number, string[]>();
    for (const id of identifiers) {
      const key = cacheKey(id.set, id.collector_number);
      if (providerCache.has(key)) continue;
      const d = getScryfallData(id.set, id.collector_number);
      if (!d?.cardmarket_id) continue;
      if (!cmIdToKeys.has(d.cardmarket_id)) cmIdToKeys.set(d.cardmarket_id, []);
      cmIdToKeys.get(d.cardmarket_id)!.push(key);
    }
    if (cmIdToKeys.size === 0) return;

    const { cardmarketAppToken, cardmarketAppSecret,
            cardmarketAccessToken, cardmarketAccessSecret } = this.settings;

    const entries = [...cmIdToKeys.entries()];
    const CONCURRENCY = 5;

    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ([cmId, keys]) => {
        const url = `https://api.cardmarket.com/ws/v2.0/products/${cmId}`;
        try {
          const auth = await buildOAuth1Header(
            'GET', url,
            cardmarketAppToken, cardmarketAppSecret,
            cardmarketAccessToken, cardmarketAccessSecret
          );
          const res = await requestUrl({ url, headers: { Authorization: auth, Accept: 'application/json' } });
          if (res.status < 200 || res.status >= 300) return;

          const data = res.json as {
            product: {
              priceGuide: {
                SELL?: number; TREND?: number;
                FOIL_SELL?: number; FOIL_TREND?: number;
              };
            };
          };
          const pg = data.product.priceGuide;
          const entry: PriceEntry = {
            normal: pg.TREND  ?? pg.SELL       ?? null,
            foil:   pg.FOIL_TREND ?? pg.FOIL_SELL ?? null,
          };
          keys.forEach(k => providerCache.set(k, entry));
        } catch {
          // non-critical
        }
      }));

      if (i + CONCURRENCY < entries.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }
}

// ── OAuth 1.0a helpers ────────────────────────────────────────────────────────

async function hmacSha1(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function pct(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

async function buildOAuth1Header(
  method: string, url: string,
  appToken: string, appSecret: string,
  accessToken: string, accessSecret: string
): Promise<string> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const ts = String(Math.floor(Date.now() / 1000));

  const params: [string, string][] = [
    ['oauth_consumer_key',     appToken],
    ['oauth_nonce',            nonce],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp',        ts],
    ['oauth_token',            accessToken],
    ['oauth_version',          '1.0'],
  ];

  const normParams = [...params]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pct(k)}=${pct(v)}`)
    .join('&');

  const base     = [method.toUpperCase(), pct(url), pct(normParams)].join('&');
  const sigKey   = `${pct(appSecret)}&${pct(accessSecret)}`;
  const signature = await hmacSha1(sigKey, base);

  return 'OAuth ' + [...params, ['oauth_signature', signature] as [string, string]]
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(', ');
}
