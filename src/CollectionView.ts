import { FileView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type CollectorsPlugin from './main';
import { Collection, CollectionCard, SortBy } from './types';
import { parseCollectionFile, setCardCount, appendCards, patchFrontmatter } from './parser';
import { openCardZoom } from './CardZoomModal';
import { openPokemonCardZoom } from './PokemonCardZoomModal';
import { fetchPokemonCard } from './TCGDexService';
import { NewCollectionModal } from './NewCollectionModal';
import { CardSearchModal } from './CardSearchModal';
import {
  fetchSetCards, fetchSearchCards, cardToMarkdownRows,
  getSetDate, fetchSetReleasedAt,
} from './ScryfallService';
import { t } from './i18n';

export const COLLECTION_VIEW_TYPE = 'collection-detail';

export function getCardVariant(card: CollectionCard): 'foil' | 'nonfoil' | 'reverse' | 'holo' | 'firstEdition' {
  if (card.id.endsWith('_f'))  return 'foil';
  if (card.id.endsWith('_r'))  return 'reverse';
  if (card.id.endsWith('_h'))  return 'holo';
  if (card.id.endsWith('_fe')) return 'firstEdition';
  return 'nonfoil';
}

type Filter = 'all' | 'owned' | 'missing';
type FinishFilter =
  | 'all'
  | 'foil' | 'nonfoil' | 'reverse' | 'holo' | 'firstEdition'
  | 'rareHolo' | 'radiantRare' | 'illustrationRare' | 'doubleRare'
  | 'ultraRare' | 'specialIllustrationRare' | 'hyperRare' | 'rainbowAlt';

export class CollectionView extends FileView {
  plugin: CollectorsPlugin;
  private collection: Collection | null = null;
  private filter: Filter = 'all';
  private finishFilter: FinishFilter = 'all';
  private sortBy: SortBy = 'number';
  private searchQuery = '';
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(leaf: WorkspaceLeaf, plugin: CollectorsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return COLLECTION_VIEW_TYPE; }
  getDisplayText() { return this.collection?.name ?? t('collection_display_text'); }
  getIcon() { return 'collectors-card'; }
  canAcceptExtension(ext: string) { return ext === 'collection'; }

  async onLoadFile(file: TFile) {
    // Reset filter state so it doesn't bleed from a previous collection
    this.filter       = 'all';
    this.finishFilter = 'all';
    this.sortBy       = 'number';
    this.searchQuery  = '';

    this.collection = await parseCollectionFile(file, this.app.vault);
    this.render();
    if (this.collection && this.collection.format !== 'arena') {
      await this.fetchPricesForCollection(this.collection);
    }
  }

  async onUnloadFile(_file: TFile) {
    this.contentEl.empty();
    this.collection = null;
  }

  async reload() {
    if (!this.file) return;
    this.collection = await parseCollectionFile(this.file, this.app.vault);
    this.render();
    if (this.collection && this.collection.format !== 'arena') {
      await this.fetchPricesForCollection(this.collection);
    }
  }

  async refreshPrices() {
    if (!this.collection || this.collection.format === 'arena') return;
    this.showLoading(t('loading_prices'));
    if (this.collection.type === 'pokemon-set') {
      await this.plugin.priceService.fetchPokemonPrices(this.collection.cards.map(c => c.id));
    } else {
      const ids = this.collection.cards.map(c => ({ set: c.set.toLowerCase(), collector_number: c.number }));
      await this.plugin.priceService.fetchPrices(ids, s => this.showLoading(t('loading_rate_limited', { seconds: s })));
    }
    this.hideLoading();
    this.render();
  }

  private async fetchPricesForCollection(coll: Collection): Promise<void> {
    if (coll.type === 'pokemon-set') {
      const anyUncached = coll.cards.some(card => !this.plugin.priceService.isPokemonCached(card.set, card.number));
      if (!anyUncached) return;
      this.showLoading(t('loading_prices'));
      await this.plugin.priceService.fetchPokemonPrices(coll.cards.map(c => c.id));
      this.hideLoading();
      this.render();
    } else {
      const ids = coll.cards.map(c => ({ set: c.set.toLowerCase(), collector_number: c.number }));
      const needed = ids.filter(id => !this.plugin.priceService.isCached(id.set, id.collector_number));
      if (needed.length === 0) return;
      this.showLoading(t('loading_prices'));
      await this.plugin.priceService.fetchPrices(ids, s => this.showLoading(t('loading_rate_limited', { seconds: s })));
      this.hideLoading();
      this.render();
    }
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('collectors-root');
    if (!this.collection) {
      contentEl.createDiv({ cls: 'col-empty', text: t('loading') });
      return;
    }
    this.renderDetail(contentEl, this.collection);
  }

  // ── Price helpers ────────────────────────────────────────────────────────────

  private cardPrice(card: CollectionCard): number | null | undefined {
    if (this.collection?.type === 'pokemon-set') {
      const m = card.id.match(/_([nrhf]e?)$/);
      const suffix = m ? `_${m[1]}` : '_n';
      return this.plugin.priceService.getPokemonPrice(card.set, card.number, suffix);
    }
    return this.plugin.priceService.getPrice(card.set.toLowerCase(), card.number, card.id.endsWith('_f'));
  }

  private fmt(val: number): string {
    const symbol = this.collection?.type === 'pokemon-set'
      ? this.plugin.priceService.pokemonCurrency()
      : this.plugin.priceService.currency();
    return `${symbol}${val.toFixed(2)}`;
  }

  private collValues(coll: Collection): { owned: number; missing: number; loaded: boolean } {
    let owned = 0, missing = 0, loaded = false;
    const isPokemon = coll.type === 'pokemon-set';
    for (const card of coll.cards) {
      if (isPokemon) {
        if (!this.plugin.priceService.isPokemonCached(card.set, card.number)) continue;
        loaded = true;
        const m = card.id.match(/_([nrhf]e?)$/);
        const suffix = m ? `_${m[1]}` : '_n';
        const p = this.plugin.priceService.getPokemonPrice(card.set, card.number, suffix);
        if (typeof p === 'number') { if (card.owned) owned += p; else missing += p; }
      } else {
        if (!this.plugin.priceService.isCached(card.set.toLowerCase(), card.number)) continue;
        loaded = true;
        const p = this.plugin.priceService.getPrice(card.set.toLowerCase(), card.number, card.id.endsWith('_f'));
        if (typeof p === 'number') { if (card.owned) owned += p; else missing += p; }
      }
    }
    return { owned, missing, loaded };
  }

  private statBox(container: HTMLElement, value: string, label: string, mod: string) {
    const box = container.createDiv({ cls: `col-hero-box${mod ? ' ' + mod : ''}` });
    box.createEl('span', { cls: 'col-hero-value', text: value });
    box.createEl('span', { cls: 'col-hero-label', text: label });
  }

  // ── Detail view ──────────────────────────────────────────────────────────────

  private renderDetail(root: HTMLElement, coll: Collection) {
    const header = root.createDiv({ cls: 'col-header' });
    const titleWrap = header.createDiv({ cls: 'col-header-title' });
    titleWrap.createEl('h2', { cls: 'col-title', text: coll.name });
    if (coll.setCode) titleWrap.createEl('span', { cls: 'col-badge', text: coll.setCode });
    if (coll.format === 'arena') titleWrap.createEl('span', { cls: 'col-badge col-badge-arena', text: t('badge_arena') });

    const headerActions = header.createDiv({ cls: 'col-actions' });

    if ((coll.setCode || coll.scryfallQuery) && coll.type.startsWith('mtg')) {
      const updateBtn = headerActions.createEl('button', { cls: 'col-btn-icon', attr: { title: t('btn_update_scryfall') } });
      updateBtn.innerHTML = '⟳';
      updateBtn.addEventListener('click', async () => {
        updateBtn.disabled = true;
        this.showLoading(t('loading_fetching'));
        await this.updateFromScryfall(coll);
        this.hideLoading();
        updateBtn.disabled = false;
        await this.reload();
      });
    }

    const addCardBtn = headerActions.createEl('button', { cls: 'col-btn', text: t('btn_add_card') });
    addCardBtn.addEventListener('click', () => {
      new CardSearchModal(this.app, coll, () => this.reload()).open();
    });

    const editBtn = headerActions.createEl('button', { cls: 'col-btn-icon', attr: { title: t('btn_edit_collection') } });
    editBtn.innerHTML = '✎';
    editBtn.addEventListener('click', () => {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof TFile)) return;
      new NewCollectionModal(this.app, this.plugin, () => this.reload(), { collection: coll, file }).open();
    });

    this.renderDetailHero(root, coll);

    const controls = root.createDiv({ cls: 'col-controls' });
    const searchInput = controls.createEl('input', {
      cls: 'col-search',
      attr: { type: 'text', placeholder: t('search_placeholder'), value: this.searchQuery },
    });

    const row2 = controls.createDiv({ cls: 'col-controls-row' });
    const tabs = row2.createDiv({ cls: 'col-tabs' });

    const filterValues: Filter[] = ['all', 'owned', 'missing'];
    const tabLabels: Record<Filter, string> = {
      all:     t('filter_all'),
      owned:   t('filter_owned'),
      missing: t('filter_missing'),
    };

    if (coll.type === 'pokemon-set') {
      const pokemonVariants: Array<{ value: FinishFilter; label: string }> = [
        { value: 'all',                    label: t('filter_all') },
        { value: 'nonfoil',                label: t('variant_normal') },
        { value: 'reverse',                label: t('variant_reverse_holo') },
        { value: 'holo',                   label: t('variant_holo') },
        { value: 'firstEdition',           label: t('variant_first_edition') },
        { value: 'rareHolo',               label: t('rarity_rare_holo') },
        { value: 'radiantRare',            label: t('rarity_radiant_rare') },
        { value: 'illustrationRare',       label: t('rarity_illustration_rare') },
        { value: 'doubleRare',             label: t('rarity_double_rare') },
        { value: 'ultraRare',              label: t('rarity_ultra_rare') },
        { value: 'specialIllustrationRare', label: t('rarity_special_illustration_rare') },
        { value: 'hyperRare',              label: t('rarity_hyper_rare') },
        { value: 'rainbowAlt',             label: t('rarity_rainbow_alt') },
      ];
      // Own row so 13 buttons don't overflow into tabs/sort area
      const variantRow = controls.createDiv({ cls: 'col-controls-row col-variant-row' });
      const variantWrap = variantRow.createDiv({ cls: 'col-finish-wrap col-variant-wrap' });
      for (const v of pokemonVariants) {
        const btn = variantWrap.createEl('button', {
          cls: `col-finish-btn${this.finishFilter === v.value ? ' col-finish-btn-active' : ''}`,
          text: v.label,
        });
        btn.addEventListener('click', () => {
          this.finishFilter = v.value;
          variantWrap.querySelectorAll('.col-finish-btn').forEach(b => b.removeClass('col-finish-btn-active'));
          btn.addClass('col-finish-btn-active');
          this.renderCards(grid, coll);
        });
      }
    } else {
      const hasFoil    = coll.cards.some(c => c.id.endsWith('_f'));
      const hasNonFoil = coll.cards.some(c => c.id.endsWith('_n'));
      if (hasFoil && hasNonFoil) {
        const finishWrap = row2.createDiv({ cls: 'col-finish-wrap' });
        for (const fo of [
          { value: 'foil'    as FinishFilter, label: t('finish_foil') },
          { value: 'nonfoil' as FinishFilter, label: t('finish_normal') },
        ]) {
          const lbl = finishWrap.createEl('label', { cls: 'col-finish-label' });
          const cb = lbl.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
          cb.checked = this.finishFilter === fo.value || this.finishFilter === 'all';
          lbl.createEl('span', { text: fo.label });
          cb.addEventListener('change', () => {
            const inputs = finishWrap.querySelectorAll<HTMLInputElement>('input');
            const f = inputs[0].checked, n = inputs[1].checked;
            this.finishFilter = f && n ? 'all' : f ? 'foil' : n ? 'nonfoil' : 'all';
            this.renderCards(grid, coll);
          });
        }
      }
    }

    const sortWrap = row2.createDiv({ cls: 'col-sort-wrap' });
    sortWrap.createEl('span', { cls: 'col-sort-label', text: t('sort_label') });
    const sortSelect = sortWrap.createEl('select', { cls: 'col-sort-select' });
    const sortOptions: Array<{ value: SortBy; label: string }> = [
      { value: 'number',       label: t('sort_number') },
      { value: 'name',         label: t('sort_name') },
      { value: 'price-desc',   label: t('sort_price_desc') },
      { value: 'price-asc',    label: t('sort_price_asc') },
      { value: 'release-desc', label: t('sort_newest') },
      { value: 'release-asc',  label: t('sort_oldest') },
    ];
    for (const opt of sortOptions) {
      const o = sortSelect.createEl('option', { attr: { value: opt.value }, text: opt.label });
      if (opt.value === this.sortBy) o.selected = true;
    }

    const grid = root.createDiv({ cls: 'col-card-grid' });

    for (const f of filterValues) {
      const tab = tabs.createEl('button', {
        cls: `col-tab${this.filter === f ? ' col-tab-active' : ''}`,
        text: tabLabels[f],
      });
      tab.addEventListener('click', () => {
        this.filter = f;
        this.renderCards(grid, coll);
        tabs.querySelectorAll('.col-tab').forEach(t => t.removeClass('col-tab-active'));
        tab.addClass('col-tab-active');
      });
    }

    sortSelect.addEventListener('change', () => {
      this.sortBy = sortSelect.value as SortBy;
      this.renderCards(grid, coll);
    });

    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.renderCards(grid, coll);
    });

    this.renderCards(grid, coll);
  }

  private renderDetailHero(root: HTMLElement, coll: Collection) {
    const pct = coll.total > 0 ? Math.round((coll.owned / coll.total) * 100) : 0;
    const { owned: ownedVal, missing: missingVal, loaded: pricesLoaded } = this.collValues(coll);

    const hero = root.createDiv({ cls: 'col-detail-hero' });
    this.statBox(hero, `${coll.owned} / ${coll.total}`, t('stat_cards_owned'), 'col-hero-owned');

    const progBox = hero.createDiv({ cls: 'col-hero-box col-hero-progress' });
    const progWrap = progBox.createDiv({ cls: 'col-progress-wrap' });
    progWrap.createDiv({ cls: 'col-progress-bar' })
      .createDiv({ cls: 'col-progress-fill' }).style.width = `${pct}%`;
    progBox.createEl('span', { cls: 'col-hero-value col-hero-pct', text: `${pct}%` });

    if (pricesLoaded) {
      const srcLabel = coll.type === 'pokemon-set'
        ? this.plugin.priceService.pokemonSourceLabel()
        : this.plugin.priceService.sourceLabel();
      this.statBox(hero, this.fmt(ownedVal), t('stat_invested', { source: srcLabel }), 'col-hero-money');
      this.statBox(hero, this.fmt(missingVal), t('stat_to_complete'), 'col-hero-missing');
    }
  }

  private renderCards(grid: HTMLElement, coll: Collection) {
    grid.empty();

    const filtered = coll.cards.filter(card => {
      if (this.filter === 'owned'   &&  !card.owned) return false;
      if (this.filter === 'missing' &&   card.owned) return false;
      if (this.finishFilter !== 'all') {
        const rarityFilterMap: Partial<Record<FinishFilter, string>> = {
          rareHolo:               'Rare Holo',
          radiantRare:            'Radiant rare',
          illustrationRare:       'Illustration rare',
          doubleRare:             'Double rare',
          ultraRare:              'Ultra Rare',
          specialIllustrationRare:'Special illustration rare',
          hyperRare:              'Hyper rare',
          rainbowAlt:             'Rare Rainbow alt',
        };
        const rarityTarget = rarityFilterMap[this.finishFilter];
        if (rarityTarget) {
          if (card.rarity.toLowerCase() !== rarityTarget.toLowerCase()) return false;
        } else {
          if (getCardVariant(card) !== this.finishFilter) return false;
        }
      }
      if (this.searchQuery) return card.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      return true;
    });

    const paint = (sorted: CollectionCard[]) => {
      grid.empty();
      if (sorted.length === 0) {
        grid.createDiv({ cls: 'col-empty', text: t('no_cards_match') });
        return;
      }
      for (const card of sorted) this.renderCardTile(grid, card, coll);
    };

    if (this.sortBy === 'name') {
      paint([...filtered].sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }
    if (this.sortBy === 'number') {
      paint([...filtered].sort((a, b) => {
        if (a.set !== b.set) return a.set.localeCompare(b.set);
        return parseInt(a.number) - parseInt(b.number) || a.number.localeCompare(b.number);
      }));
      return;
    }
    if (this.sortBy === 'price-desc' || this.sortBy === 'price-asc') {
      const dir = this.sortBy === 'price-desc' ? -1 : 1;
      paint([...filtered].sort((a, b) => ((this.cardPrice(a) ?? -1) - (this.cardPrice(b) ?? -1)) * dir));
      return;
    }

    const uniqueSets = [...new Set(filtered.map(c => c.set.toLowerCase()))];
    const missing = uniqueSets.filter(s => !getSetDate(s));
    const dir = this.sortBy === 'release-desc' ? -1 : 1;
    const finish = (cards: CollectionCard[]) => paint([...cards].sort((a, b) => {
      const da = getSetDate(a.set) ?? '0000-00-00';
      const db = getSetDate(b.set) ?? '0000-00-00';
      if (da !== db) return da < db ? -dir : dir;
      return parseInt(a.number) - parseInt(b.number) || a.number.localeCompare(b.number);
    }));

    if (missing.length === 0) {
      finish(filtered);
    } else {
      Promise.all(missing.map(s => fetchSetReleasedAt(s))).then(() => finish(filtered));
    }
  }

  private renderCardTile(grid: HTMLElement, card: CollectionCard, coll: Collection) {
    const variant = getCardVariant(card);
    const isFoil = variant === 'foil';
    const tileCls = ['col-tile', card.owned ? 'col-tile-owned' : '', isFoil ? 'col-tile-foil' : ''].filter(Boolean).join(' ');
    const tile = grid.createDiv({ cls: tileCls });

    const badgeText: Partial<Record<typeof variant, string>> = {
      foil:         'F',
      reverse:      'R',
      holo:         'H',
      firstEdition: '1st',
    };
    if (badgeText[variant]) tile.createDiv({ cls: 'col-foil-badge', text: badgeText[variant] });

    if (card.imageUrl) {
      const imgWrap = tile.createDiv({ cls: 'col-tile-img-wrap' });
      const img = imgWrap.createEl('img', {
        cls: 'col-tile-img',
        attr: { src: card.imageUrl, alt: card.name, loading: 'lazy' },
      });
      img.addEventListener('error', () => {
        img.style.display = 'none';
        imgWrap.createEl('div', { cls: 'col-tile-img-fallback', text: card.name[0] ?? '?' });
      });
      tile.addEventListener('click', async () => {
        if (coll.type === 'pokemon-set') {
          const baseId = card.id.replace(/_[nrhf]e?$/, '');
          const tcgCard = await fetchPokemonCard(baseId) ?? undefined;
          openPokemonCardZoom(card, tcgCard);
        } else {
          openCardZoom(card.imageUrl, card.name, isFoil);
        }
      });
    } else {
      tile.createDiv({ cls: 'col-tile-img-fallback', text: card.name[0] ?? '?' });
    }

    const tileFooter = tile.createDiv({ cls: 'col-tile-footer' });
    tileFooter.createEl('span', { cls: 'col-tile-name', text: card.name });

    const meta = tileFooter.createDiv({ cls: 'col-tile-meta' });
    meta.createEl('span', { cls: `col-rarity col-rarity-${card.rarity}`, text: card.rarity[0]?.toUpperCase() ?? '' });
    meta.createEl('span', { text: `${card.set} #${card.number}` });
    const countEl = meta.createEl('span', {
      cls: `col-tile-count${card.count > 0 ? ' col-tile-count-owned' : ''}`,
      text: `×${card.count}`,
    });

    const priceEl = tileFooter.createEl('span', { cls: 'col-tile-price' });
    if (coll.format === 'arena') {
      priceEl.textContent = t('price_digital');
      priceEl.addClass('col-tile-price-empty');
    } else {
      const isPokemon = coll.type === 'pokemon-set';
      const isCached = isPokemon
        ? this.plugin.priceService.isPokemonCached(card.set, card.number)
        : this.plugin.priceService.isCached(card.set.toLowerCase(), card.number);
      const p = isCached ? this.cardPrice(card) : undefined;
      if (typeof p === 'number') {
        priceEl.textContent = this.fmt(p);
      } else if (!isCached) {
        priceEl.addClass('col-tile-price-loading');
      } else {
        priceEl.textContent = '—';
        priceEl.addClass('col-tile-price-empty');
      }
    }

    const applyCount = (delta: number, e: MouseEvent) => {
      e.stopPropagation();
      const newCount = Math.max(0, card.count + delta);
      if (newCount === card.count) return;

      card.count = newCount;
      card.owned = newCount > 0;
      coll.owned = coll.cards.filter(c => c.owned).length;
      countEl.textContent = `×${newCount}`;
      countEl.className = `col-tile-count${newCount > 0 ? ' col-tile-count-owned' : ''}`;
      tile.toggleClass('col-tile-owned', newCount > 0);
      this.refreshDetailHero(coll);

      clearTimeout(this.saveTimers.get(card.id));
      this.saveTimers.set(card.id, setTimeout(async () => {
        const file = this.app.vault.getAbstractFileByPath(coll.path);
        if (file instanceof TFile) await setCardCount(file, card.id, card.count, this.app.vault);
        this.saveTimers.delete(card.id);
      }, 400));
    };

    const removeBtn = tile.createEl('button', { cls: 'col-qty-btn col-qty-remove', attr: { title: t('btn_remove_copy') } });
    removeBtn.textContent = '−';
    removeBtn.addEventListener('click', e => applyCount(-1, e));

    const addBtn = tile.createEl('button', { cls: 'col-qty-btn col-qty-add', attr: { title: t('btn_add_copy') } });
    addBtn.textContent = '+';
    addBtn.addEventListener('click', e => applyCount(+1, e));
  }

  private refreshDetailHero(coll: Collection) {
    const root = this.contentEl;
    const pct = coll.total > 0 ? Math.round((coll.owned / coll.total) * 100) : 0;
    const { owned: ov, missing: mv } = this.collValues(coll);

    const fill = root.querySelector<HTMLElement>('.col-progress-fill');
    if (fill) fill.style.width = `${pct}%`;

    const pctEl = root.querySelector<HTMLElement>('.col-hero-pct');
    if (pctEl) pctEl.textContent = `${pct}%`;

    const heroValues = root.querySelectorAll<HTMLElement>('.col-hero-value');
    if (heroValues[0]) heroValues[0].textContent = `${coll.owned} / ${coll.total}`;
    if (heroValues[2]) heroValues[2].textContent = this.fmt(ov);
    if (heroValues[3]) heroValues[3].textContent = this.fmt(mv);
  }

  // ── Loading overlay ──────────────────────────────────────────────────────────

  private showLoading(label = t('loading_updating')) {
    let overlay = this.contentEl.querySelector<HTMLElement>('.col-loading-overlay');
    if (!overlay) {
      overlay = this.contentEl.createDiv({ cls: 'col-loading-overlay' });
      overlay.createDiv({ cls: 'col-loading-spinner' });
      overlay.createDiv({ cls: 'col-loading-label', text: label });
    } else {
      const lbl = overlay.querySelector<HTMLElement>('.col-loading-label');
      if (lbl) lbl.textContent = label;
    }
    requestAnimationFrame(() => overlay!.addClass('col-loading-visible'));
  }

  private hideLoading() {
    const overlay = this.contentEl.querySelector<HTMLElement>('.col-loading-overlay');
    if (!overlay) return;
    overlay.removeClass('col-loading-visible');
    setTimeout(() => overlay.remove(), 220);
  }

  // ── Scryfall update ──────────────────────────────────────────────────────────

  private async updateFromScryfall(coll: Collection): Promise<void> {
    new Notice(t('notice_fetching_for', { name: coll.name }));
    try {
      const finish = coll.finishImport ?? 'all';
      const unique  = coll.allPrints === false ? 'cards' : 'prints';

      const onPage = (p: number) => this.showLoading(t('loading_page', { page: p }));
      const onRateLimit = (s: number) => this.showLoading(t('loading_rate_limited', { seconds: s }));

      const rawCards = coll.setCode
        ? await fetchSetCards(coll.setCode, onPage, unique, onRateLimit)
        : await fetchSearchCards(
            coll.scryfallQuery!,
            onPage,
            coll.scryfallOrder ?? 'released',
            onRateLimit
          );

      const cards = finish === 'all'
        ? rawCards
        : rawCards.map(c => ({ ...c, finishes: c.finishes.filter(f => f === finish) }))
                  .filter(c => c.finishes.length > 0);

      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof TFile)) return;

      const rows = cards.flatMap(cardToMarkdownRows);
      const added = await appendCards(file, rows, this.app.vault);

      const today = new Date().toISOString().slice(0, 10);
      await patchFrontmatter(file, 'last-fetched', today, this.app.vault);

      new Notice(added > 0
        ? t('notice_cards_added', { count: added, name: coll.name })
        : t('notice_up_to_date', { name: coll.name })
      );
    } catch (e) {
      new Notice(t('notice_scryfall_failed', { error: (e as Error).message }));
    }
  }
}
