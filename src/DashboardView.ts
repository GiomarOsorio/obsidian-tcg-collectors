import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type CollectorsPlugin from './main';
import { Collection, CollectionCard, CollectionType, SortBy } from './types';
import { parseCollectionFile, setCardCount, appendCards } from './parser';
import { NewCollectionModal } from './NewCollectionModal';
import { CardSearchModal } from './CardSearchModal';
import {
  fetchSetCards, fetchSearchCards, cardToMarkdownRows,
  getSetDate, fetchSetReleasedAt,
} from './ScryfallService';

export const DASHBOARD_VIEW_TYPE = 'collectors-dashboard';

type Filter = 'all' | 'owned' | 'missing';
type FinishFilter = 'all' | 'foil' | 'nonfoil';
type Screen = 'list' | 'detail';

export class DashboardView extends ItemView {
  plugin: CollectorsPlugin;
  private collections: Collection[] = [];
  private screen: Screen = 'list';
  private selected: Collection | null = null;
  private filter: Filter = 'all';
  private finishFilter: FinishFilter = 'all';
  private sortBy: SortBy = 'number';
  private searchQuery = '';
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(leaf: WorkspaceLeaf, plugin: CollectorsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return DASHBOARD_VIEW_TYPE; }
  getDisplayText() { return 'Collectors'; }
  getIcon() { return 'layout-grid'; }

  async onOpen() { await this.refresh(); }

  async refresh() {
    this.collections = await this.loadCollections();
    if (this.selected) {
      const updated = this.collections.find(c => c.path === this.selected!.path);
      this.selected = updated ?? null;
      if (!this.selected) this.screen = 'list';
    }
    this.render();
    this.runAutoUpdates();
    this.prefetchAllPrices();
  }

  // ── Price helpers ─────────────────────────────────────────────────────────────

  private cardPrice(card: CollectionCard): number | null | undefined {
    return this.plugin.priceService.getPrice(card.set.toLowerCase(), card.number, card.id.endsWith('_f'));
  }

  private fmt(val: number): string {
    return `${this.plugin.priceService.currency()}${val.toFixed(2)}`;
  }

  private collValues(cards: CollectionCard[]): { owned: number; missing: number; loaded: boolean } {
    let owned = 0, missing = 0, loaded = false;
    for (const card of cards) {
      if (!this.plugin.priceService.isCached(card.set.toLowerCase(), card.number)) continue;
      loaded = true;
      const p = this.cardPrice(card);
      if (typeof p === 'number') {
        if (card.owned) owned += p;
        else missing += p;
      }
    }
    return { owned, missing, loaded };
  }

  private async prefetchAllPrices() {
    const ids = this.collections.flatMap(c =>
      c.cards.map(card => ({ set: card.set.toLowerCase(), collector_number: card.number }))
    );
    const needed = ids.filter(id => !this.plugin.priceService.isCached(id.set, id.collector_number));
    if (needed.length === 0) return;
    await this.plugin.priceService.fetchPrices(ids);
    this.render();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  private runAutoUpdates() {
    const targets = this.collections.filter(
      c => c.autoUpdate && (c.setCode || c.scryfallQuery)
    );
    for (const coll of targets) {
      this.updateFromScryfall(coll, true).then(added => {
        if (added > 0) this.refresh();
      });
    }
  }

  private async loadCollections(): Promise<Collection[]> {
    const { vault } = this.app;
    const folder = this.plugin.settings.collectionsFolder;

    let files: TFile[];
    if (folder) {
      const abs = vault.getAbstractFileByPath(folder);
      if (abs && 'children' in abs) {
        files = (abs as any).children.filter(
          (f: any) => f instanceof TFile && f.extension === 'md'
        );
      } else {
        files = vault.getMarkdownFiles();
      }
    } else {
      files = vault.getMarkdownFiles();
    }

    const results = await Promise.all(
      files.map(f => parseCollectionFile(f, vault))
    );

    return results
      .filter((c): c is Collection => c !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private render() {
    const content = this.contentEl;
    content.empty();
    content.addClass('collectors-root');

    if (this.screen === 'detail' && this.selected) {
      this.renderDetail(content);
    } else {
      this.renderList(content);
    }
  }

  // ── List screen ───────────────────────────────────────────────────────────────

  private renderList(root: HTMLElement) {
    const header = root.createDiv({ cls: 'col-header col-header-stack' });
    header.createEl('h2', { text: 'Collectors', cls: 'col-title' });

    const actions = header.createDiv({ cls: 'col-actions' });
    const refreshBtn = actions.createEl('button', { cls: 'col-btn-icon', attr: { title: 'Refresh' } });
    refreshBtn.innerHTML = '↻';
    refreshBtn.addEventListener('click', () => this.refresh());

    const newBtn = actions.createEl('button', { cls: 'col-btn', text: '+ New Collection' });
    newBtn.addEventListener('click', () =>
      new NewCollectionModal(this.app, this.plugin, () => this.refresh()).open()
    );

    if (this.collections.length === 0) {
      root.createDiv({ cls: 'col-empty', text: 'No collections found. Create one or configure the folder in settings.' });
      return;
    }

    this.renderHeroStats(root);

    const grouped = this.groupByType(this.collections);
    const order: CollectionType[] = ['mtg-set', 'mtg-theme', 'custom'];
    const labels: Record<CollectionType, string> = {
      'mtg-set': 'MTG Sets',
      'mtg-theme': 'Theme Collections',
      'custom': 'Custom Collections',
    };

    for (const type of order) {
      const colls = grouped[type];
      if (!colls?.length) continue;

      const section = root.createDiv({ cls: 'col-section' });
      section.createEl('h3', { cls: 'col-section-title', text: labels[type] });

      const grid = section.createDiv({ cls: 'col-collection-grid' });
      for (const coll of colls) {
        this.renderCollectionCard(grid, coll);
      }
    }
  }

  private renderHeroStats(root: HTMLElement) {
    const allCards = this.collections.flatMap(c => c.cards);
    const totalOwned = this.collections.reduce((s, c) => s + c.owned, 0);
    const totalCards = this.collections.reduce((s, c) => s + c.total, 0);

    let totalInvested = 0, totalMissing = 0, pricesLoaded = false;
    for (const card of allCards) {
      if (!this.plugin.priceService.isCached(card.set.toLowerCase(), card.number)) continue;
      pricesLoaded = true;
      const p = this.cardPrice(card);
      if (typeof p === 'number') {
        if (card.owned) totalInvested += p;
        else totalMissing += p;
      }
    }

    const hero = root.createDiv({ cls: 'col-hero' });

    this.statBox(hero, String(this.collections.length), 'Collections', '');
    this.statBox(hero, `${totalOwned} / ${totalCards}`, 'Cards owned', 'col-hero-owned');
    this.statBox(hero, pricesLoaded ? this.fmt(totalInvested) : '…', `Invested · ${this.plugin.priceService.sourceLabel()}`, 'col-hero-money');
    this.statBox(hero, pricesLoaded ? this.fmt(totalMissing) : '…', 'To complete', 'col-hero-missing');
  }

  private statBox(container: HTMLElement, value: string, label: string, mod: string) {
    const box = container.createDiv({ cls: `col-hero-box${mod ? ' ' + mod : ''}` });
    box.createEl('span', { cls: 'col-hero-value', text: value });
    box.createEl('span', { cls: 'col-hero-label', text: label });
  }

  private renderCollectionCard(container: HTMLElement, coll: Collection) {
    const pct = coll.total > 0 ? Math.round((coll.owned / coll.total) * 100) : 0;
    const missing = coll.total - coll.owned;
    const { owned: ownedVal, missing: missingVal, loaded: pricesLoaded } = this.collValues(coll.cards);

    const card = container.createDiv({ cls: 'col-card' });

    // Thumbnail — first card with an image
    const thumb = card.createDiv({ cls: 'col-card-thumb' });
    const thumbCard = coll.cards.find(c => c.imageUrl);
    if (thumbCard?.imageUrl) {
      const img = thumb.createEl('img', {
        cls: 'col-card-thumb-img',
        attr: { src: thumbCard.imageUrl, alt: coll.name, loading: 'lazy' },
      });
      img.addEventListener('error', () => { img.remove(); thumb.createEl('div', { cls: 'col-card-thumb-fallback', text: coll.name[0]?.toUpperCase() ?? '?' }); });
    } else {
      thumb.createEl('div', { cls: 'col-card-thumb-fallback', text: coll.name[0]?.toUpperCase() ?? '?' });
    }

    const info = card.createDiv({ cls: 'col-card-info' });

    const nameRow = info.createDiv({ cls: 'col-card-name-row' });
    nameRow.createEl('span', { cls: 'col-card-name', text: coll.name });
    if (coll.setCode) nameRow.createEl('span', { cls: 'col-badge', text: coll.setCode });

    const progressWrap = info.createDiv({ cls: 'col-progress-wrap' });
    const bar = progressWrap.createDiv({ cls: 'col-progress-bar' });
    bar.createDiv({ cls: 'col-progress-fill' }).style.width = `${pct}%`;
    progressWrap.createEl('span', { cls: 'col-pct', text: `${pct}%` });

    const stats = info.createDiv({ cls: 'col-stats' });
    stats.createEl('span', { cls: 'col-stat-owned', text: `${coll.owned} owned` });
    stats.createEl('span', { cls: 'col-dot', text: '·' });
    stats.createEl('span', { text: `${coll.total} total` });
    if (missing > 0) {
      stats.createEl('span', { cls: 'col-dot', text: '·' });
      stats.createEl('span', { cls: 'col-stat-missing', text: `${missing} missing` });
    }

    if (pricesLoaded) {
      const priceRow = info.createDiv({ cls: 'col-price-row' });
      priceRow.createEl('span', { cls: 'col-price-invested', text: `${this.fmt(ownedVal)} invested` });
      if (missingVal > 0) {
        priceRow.createEl('span', { cls: 'col-dot', text: '·' });
        priceRow.createEl('span', { cls: 'col-price-missing', text: `${this.fmt(missingVal)} to complete` });
      }
    }

    const cardActions = info.createDiv({ cls: 'col-card-actions' });

    const detailBtn = cardActions.createEl('button', { cls: 'col-btn col-btn-view', attr: { title: 'View cards' } });
    detailBtn.innerHTML = '⊞ View';
    detailBtn.addEventListener('click', () => {
      this.selected = coll;
      this.screen = 'detail';
      this.filter = 'all';
      this.finishFilter = 'all';
      this.searchQuery = '';
      this.render();
    });

    if (coll.setCode || coll.scryfallQuery) {
      const updateBtn = cardActions.createEl('button', { cls: 'col-btn-icon', attr: { title: 'Update from Scryfall' } });
      updateBtn.innerHTML = '⟳';
      updateBtn.addEventListener('click', async () => {
        updateBtn.disabled = true;
        await this.updateFromScryfall(coll);
        updateBtn.disabled = false;
      });
    }

    const openBtn = cardActions.createEl('button', { cls: 'col-btn-icon', attr: { title: 'Open file' } });
    openBtn.innerHTML = '↗';
    openBtn.addEventListener('click', () => this.openFile(coll.path));
  }

  // ── Detail screen ─────────────────────────────────────────────────────────────

  private renderDetail(root: HTMLElement) {
    const coll = this.selected!;

    const header = root.createDiv({ cls: 'col-header' });
    const backBtn = header.createEl('button', { cls: 'col-btn-icon', attr: { title: 'Back' } });
    backBtn.innerHTML = '←';
    backBtn.addEventListener('click', () => {
      this.screen = 'list';
      this.selected = null;
      this.render();
    });

    const titleWrap = header.createDiv({ cls: 'col-header-title' });
    titleWrap.createEl('h2', { cls: 'col-title', text: coll.name });
    if (coll.setCode) titleWrap.createEl('span', { cls: 'col-badge', text: coll.setCode });

    const headerActions = header.createDiv({ cls: 'col-actions' });

    if (coll.setCode || coll.scryfallQuery) {
      const updateBtn = headerActions.createEl('button', { cls: 'col-btn-icon', attr: { title: 'Update from Scryfall' } });
      updateBtn.innerHTML = '⟳';
      updateBtn.addEventListener('click', async () => {
        updateBtn.disabled = true;
        await this.updateFromScryfall(coll);
        updateBtn.disabled = false;
        await this.refresh();
      });
    }

    const addCardBtn = headerActions.createEl('button', { cls: 'col-btn', text: '+ Card' });
    addCardBtn.addEventListener('click', () => {
      new CardSearchModal(this.app, coll, () => this.refresh()).open();
    });

    const openBtn = headerActions.createEl('button', { cls: 'col-btn-icon', attr: { title: 'Open file' } });
    openBtn.innerHTML = '↗';
    openBtn.addEventListener('click', () => this.openFile(coll.path));

    // Detail hero stats
    this.renderDetailHero(root, coll);

    // ── Controls ──────────────────────────────────────────────────────────────
    const controls = root.createDiv({ cls: 'col-controls' });
    const searchInput = controls.createEl('input', {
      cls: 'col-search',
      attr: { type: 'text', placeholder: 'Search cards...', value: this.searchQuery },
    });

    const row2 = controls.createDiv({ cls: 'col-controls-row' });

    // Owned/missing filter tabs
    const tabs = row2.createDiv({ cls: 'col-tabs' });
    const filterValues: Filter[] = ['all', 'owned', 'missing'];
    const tabLabels: Record<Filter, string> = { all: 'All', owned: 'Owned', missing: 'Missing' };

    // Foil filter checkboxes — only show if collection has both finishes
    const hasFoil    = coll.cards.some(c => c.id.endsWith('_f'));
    const hasNonFoil = coll.cards.some(c => c.id.endsWith('_n'));
    if (hasFoil && hasNonFoil) {
      const finishWrap = row2.createDiv({ cls: 'col-finish-wrap' });
      const finishOptions: Array<{ value: FinishFilter; label: string }> = [
        { value: 'foil',    label: '✦ Foil' },
        { value: 'nonfoil', label: '◇ Normal' },
      ];
      for (const fo of finishOptions) {
        const lbl = finishWrap.createEl('label', { cls: 'col-finish-label' });
        const cb = lbl.createEl('input', { attr: { type: 'checkbox' } });
        (cb as HTMLInputElement).checked = (this.finishFilter === fo.value || this.finishFilter === 'all');
        lbl.createEl('span', { text: fo.label });
        cb.addEventListener('change', () => {
          const inputs = finishWrap.querySelectorAll('input');
          const foilChecked   = (inputs[0] as HTMLInputElement).checked;
          const normalChecked = (inputs[1] as HTMLInputElement).checked;
          if (foilChecked && normalChecked) this.finishFilter = 'all';
          else if (foilChecked)             this.finishFilter = 'foil';
          else if (normalChecked)           this.finishFilter = 'nonfoil';
          else                              this.finishFilter = 'all';
          this.renderCards(grid, coll);
        });
      }
    }

    // Sort select
    const sortWrap = row2.createDiv({ cls: 'col-sort-wrap' });
    sortWrap.createEl('span', { cls: 'col-sort-label', text: 'Sort:' });
    const sortSelect = sortWrap.createEl('select', { cls: 'col-sort-select' });
    const sortOptions: Array<{ value: SortBy; label: string }> = [
      { value: 'number',       label: 'Number' },
      { value: 'name',         label: 'Name' },
      { value: 'price-desc',   label: 'Price ↓' },
      { value: 'price-asc',    label: 'Price ↑' },
      { value: 'release-desc', label: 'Newest first' },
      { value: 'release-asc',  label: 'Oldest first' },
    ];
    for (const opt of sortOptions) {
      const o = sortSelect.createEl('option', { attr: { value: opt.value }, text: opt.label });
      if (opt.value === this.sortBy) o.selected = true;
    }

    // Grid — declared BEFORE event listeners that reference it
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

    // Lazy-load prices for this collection
    const needsFetch = coll.cards.some(c => !this.plugin.priceService.isCached(c.set.toLowerCase(), c.number));
    if (needsFetch) {
      const ids = coll.cards.map(c => ({ set: c.set.toLowerCase(), collector_number: c.number }));
      this.plugin.priceService.fetchPrices(ids).then(() => this.render());
    }
  }

  private renderDetailHero(root: HTMLElement, coll: Collection) {
    const pct = coll.total > 0 ? Math.round((coll.owned / coll.total) * 100) : 0;
    const { owned: ownedVal, missing: missingVal, loaded: pricesLoaded } = this.collValues(coll.cards);

    const hero = root.createDiv({ cls: 'col-detail-hero' });

    this.statBox(hero, `${coll.owned} / ${coll.total}`, 'Cards owned', 'col-hero-owned');

    // Progress box
    const progBox = hero.createDiv({ cls: 'col-hero-box col-hero-progress' });
    const progWrap = progBox.createDiv({ cls: 'col-progress-wrap' });
    progWrap.createDiv({ cls: 'col-progress-bar' })
      .createDiv({ cls: 'col-progress-fill' }).style.width = `${pct}%`;
    progBox.createEl('span', { cls: 'col-hero-value col-hero-pct', text: `${pct}%` });

    if (pricesLoaded) {
      this.statBox(hero, this.fmt(ownedVal), 'Invested', 'col-hero-money');
      this.statBox(hero, this.fmt(missingVal), 'To complete', 'col-hero-missing');
    }
  }

  private renderCards(grid: HTMLElement, coll: Collection) {
    grid.empty();

    const filtered = coll.cards.filter(card => {
      if (this.filter === 'owned' && !card.owned) return false;
      if (this.filter === 'missing' && card.owned) return false;
      const isFoil = card.id.endsWith('_f');
      if (this.finishFilter === 'foil' && !isFoil) return false;
      if (this.finishFilter === 'nonfoil' && isFoil) return false;
      if (this.searchQuery) {
        return card.name.toLowerCase().includes(this.searchQuery.toLowerCase());
      }
      return true;
    });

    const paint = (sorted: CollectionCard[]) => {
      grid.empty();
      if (sorted.length === 0) {
        grid.createDiv({ cls: 'col-empty', text: 'No cards match this filter.' });
        return;
      }
      for (const card of sorted) {
        this.renderCardTile(grid, card, coll);
      }
    };

    // Synchronous sorts render immediately — no async race conditions
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
      paint([...filtered].sort((a, b) => {
        const pa = this.cardPrice(a) ?? -1;
        const pb = this.cardPrice(b) ?? -1;
        return (pa - pb) * dir;
      }));
      return;
    }

    // Release sort needs async fetch for set dates
    const uniqueSets = [...new Set(filtered.map(c => c.set.toLowerCase()))];
    const missing = uniqueSets.filter(s => !getSetDate(s));
    const dir = this.sortBy === 'release-desc' ? -1 : 1;
    const finish = (cards: CollectionCard[]) => paint([...cards].sort((a, b) => {
      const da = getSetDate(a.set) ?? '0000-00-00';
      const db = getSetDate(b.set) ?? '0000-00-00';
      if (da !== db) return da < db ? -dir : dir;
      return (parseInt(a.number) - parseInt(b.number)) || a.number.localeCompare(b.number);
    }));

    if (missing.length === 0) {
      finish(filtered);
    } else {
      Promise.all(missing.map(s => fetchSetReleasedAt(s))).then(() => finish(filtered));
    }
  }

  private renderCardTile(grid: HTMLElement, card: CollectionCard, coll: Collection) {
    const isFoil = card.id.endsWith('_f');
    const tileCls = ['col-tile', card.owned ? 'col-tile-owned' : '', isFoil ? 'col-tile-foil' : ''].filter(Boolean).join(' ');
    const tile = grid.createDiv({ cls: tileCls });

    // Foil badge — top-right
    if (isFoil) {
      tile.createDiv({ cls: 'col-foil-badge', text: 'F' });
    }

    if (card.imageUrl) {
      const img = tile.createEl('img', {
        cls: 'col-tile-img',
        attr: { src: card.imageUrl, alt: card.name, loading: 'lazy' },
      });
      img.addEventListener('error', () => {
        img.style.display = 'none';
        tile.createEl('div', { cls: 'col-tile-img-fallback', text: card.name[0] ?? '?' });
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

    const p = this.plugin.priceService.isCached(card.set.toLowerCase(), card.number)
      ? this.cardPrice(card)
      : null;
    const priceEl = tileFooter.createEl('span', { cls: 'col-tile-price' });
    if (typeof p === 'number') {
      priceEl.textContent = this.fmt(p);
    } else {
      priceEl.textContent = '—';
      priceEl.addClass('col-tile-price-empty');
    }

    const applyCount = (delta: number, e: MouseEvent) => {
      e.stopPropagation();
      const newCount = Math.max(0, card.count + delta);
      if (newCount === card.count) return;

      // Update UI immediately — no await
      card.count = newCount;
      card.owned = newCount > 0;
      coll.owned = coll.cards.filter(c => c.owned).length;
      countEl.textContent = `×${newCount}`;
      countEl.className = `col-tile-count${newCount > 0 ? ' col-tile-count-owned' : ''}`;
      tile.toggleClass('col-tile-owned', newCount > 0);
      this.refreshDetailHero(coll);

      // Debounce the file write — rapid clicks batch into one save
      clearTimeout(this.saveTimers.get(card.id));
      this.saveTimers.set(card.id, setTimeout(async () => {
        const file = this.app.vault.getAbstractFileByPath(coll.path);
        if (file instanceof TFile) await setCardCount(file, card.id, card.count, this.app.vault);
        this.saveTimers.delete(card.id);
      }, 400));
    };

    // − bottom-left
    const removeBtn = tile.createEl('button', { cls: 'col-qty-btn col-qty-remove', attr: { title: 'Remove one copy' } });
    removeBtn.textContent = '−';
    removeBtn.addEventListener('click', e => applyCount(-1, e));

    // + bottom-right
    const addBtn = tile.createEl('button', { cls: 'col-qty-btn col-qty-add', attr: { title: 'Add one copy' } });
    addBtn.textContent = '+';
    addBtn.addEventListener('click', e => applyCount(+1, e));
  }

  private refreshDetailHero(coll: Collection) {
    const root = this.contentEl;
    const pct = coll.total > 0 ? Math.round((coll.owned / coll.total) * 100) : 0;
    const { owned: ov, missing: mv } = this.collValues(coll.cards);

    const fill = root.querySelector<HTMLElement>('.col-progress-fill');
    if (fill) fill.style.width = `${pct}%`;

    const pctEl = root.querySelector<HTMLElement>('.col-hero-pct');
    if (pctEl) pctEl.textContent = `${pct}%`;

    const heroValues = root.querySelectorAll<HTMLElement>('.col-hero-value');
    if (heroValues[0]) heroValues[0].textContent = `${coll.owned} / ${coll.total}`;
    if (heroValues[2]) heroValues[2].textContent = this.fmt(ov);
    if (heroValues[3]) heroValues[3].textContent = this.fmt(mv);
  }

  // ── Scryfall update ───────────────────────────────────────────────────────────

  private async updateFromScryfall(coll: Collection, silent = false): Promise<number> {
    if (!silent) new Notice(`Fetching cards for "${coll.name}"...`);
    try {
      const cards = coll.setCode
        ? await fetchSetCards(coll.setCode, p => { if (!silent) new Notice(`Fetching page ${p}...`); })
        : await fetchSearchCards(
            coll.scryfallQuery!,
            p => { if (!silent) new Notice(`Fetching page ${p}...`); },
            coll.scryfallOrder ?? 'released'
          );

      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof TFile)) return 0;

      const rows = cards.flatMap(cardToMarkdownRows);
      const added = await appendCards(file, rows, this.app.vault);
      if (!silent) {
        new Notice(added > 0
          ? `Added ${added} new cards to "${coll.name}".`
          : `"${coll.name}" is already up to date.`
        );
      } else if (added > 0) {
        new Notice(`Auto-update: added ${added} new cards to "${coll.name}".`);
      }
      return added;
    } catch (e) {
      if (!silent) new Notice(`Scryfall update failed: ${(e as Error).message}`);
      return 0;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private groupByType(collections: Collection[]): Partial<Record<CollectionType, Collection[]>> {
    const result: Partial<Record<CollectionType, Collection[]>> = {};
    for (const c of collections) {
      (result[c.type] ??= []).push(c);
    }
    return result;
  }

  private async openFile(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }
}
