export interface CollectionCard {
  id: string;
  owned: boolean;
  count: number;
  name: string;
  type: string;
  rarity: string;
  set: string;
  number: string;
  imageUrl: string;
  notes: string;
}

export type CollectionType = 'mtg-set' | 'mtg-theme' | 'pokemon-set';
export type PokemonVariantImport = 'all' | 'normal' | 'reverse' | 'holo' | 'firstEdition';
export type CollectionFormat = 'paper' | 'arena';

export interface Collection {
  name: string;
  path: string;
  type: CollectionType;
  setCode?: string;
  tcgdexSetId?: string;
  pokemonVariantImport?: PokemonVariantImport;
  scryfallQuery?: string;
  scryfallOrder?: string;
  autoUpdate: boolean;
  finishImport?: 'all' | 'foil' | 'nonfoil';
  allPrints?: boolean;
  format: CollectionFormat;
  lastFetched?: string;
  pluginVersion?: string;
  cards: CollectionCard[];
  owned: number;
  total: number;
}

export type SortBy = 'name' | 'number' | 'release-asc' | 'release-desc' | 'price-asc' | 'price-desc';

export type PriceSource = 'scryfall-usd' | 'scryfall-eur' | 'tcgplayer' | 'cardmarket';

export type TCGGame = 'mtg' | 'pokemon' | 'onepiece' | 'yugioh';

export interface CollectorsSettings {
  collectionsFolder: string;
  autoDetect: boolean;
  priceSource: PriceSource;
  tcgplayerKey: string;
  cardmarketAppToken: string;
  cardmarketAppSecret: string;
  cardmarketAccessToken: string;
  cardmarketAccessSecret: string;
  enabledGames: Record<TCGGame, boolean>;
  pokemonPriceSource: 'tcgplayer' | 'cardmarket';
}

export const DEFAULT_SETTINGS: CollectorsSettings = {
  collectionsFolder: '',
  autoDetect: true,
  priceSource: 'scryfall-usd',
  tcgplayerKey: '',
  cardmarketAppToken: '',
  cardmarketAppSecret: '',
  cardmarketAccessToken: '',
  cardmarketAccessSecret: '',
  enabledGames: { mtg: true, pokemon: true, onepiece: true, yugioh: true },
  pokemonPriceSource: 'tcgplayer',
};
