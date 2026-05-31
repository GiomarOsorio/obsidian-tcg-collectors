export interface CollectionCard {
  id: string;
  owned: boolean;
  name: string;
  type: string;
  rarity: string;
  set: string;
  number: string;
  imageUrl: string;
  notes: string;
}

export type CollectionType = 'mtg-set' | 'mtg-theme' | 'custom';

export interface Collection {
  name: string;
  path: string;
  type: CollectionType;
  setCode?: string;
  scryfallQuery?: string;
  scryfallOrder?: string;
  autoUpdate: boolean;
  finishImport?: 'all' | 'foil' | 'nonfoil';
  allPrints?: boolean;
  lastFetched?: string;
  cards: CollectionCard[];
  owned: number;
  total: number;
}

export type SortBy = 'name' | 'number' | 'release-asc' | 'release-desc' | 'price-asc' | 'price-desc';

export type PriceSource = 'scryfall-usd' | 'scryfall-eur' | 'tcgplayer' | 'cardmarket';

export interface CollectorsSettings {
  collectionsFolder: string;
  autoDetect: boolean;
  cardViewInFiles: boolean;
  priceSource: PriceSource;
  tcgplayerKey: string;
  cardmarketAppToken: string;
  cardmarketAppSecret: string;
  cardmarketAccessToken: string;
  cardmarketAccessSecret: string;
}

export const DEFAULT_SETTINGS: CollectorsSettings = {
  collectionsFolder: '',
  autoDetect: true,
  cardViewInFiles: true,
  priceSource: 'scryfall-usd',
  tcgplayerKey: '',
  cardmarketAppToken: '',
  cardmarketAppSecret: '',
  cardmarketAccessToken: '',
  cardmarketAccessSecret: '',
};
