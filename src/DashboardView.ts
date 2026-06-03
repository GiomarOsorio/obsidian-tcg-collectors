import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type CollectorsPlugin from './main';
import { Collection, CollectionType } from './types';
import { parseCollectionFile, appendCards, patchFrontmatter } from './parser';
import { migrateCollection } from './migrations';
import { NewCollectionModal } from './NewCollectionModal';
import {
  fetchSetCards, fetchSearchCards, cardToMarkdownRows,
} from './ScryfallService';
import { t } from './i18n';

export const DASHBOARD_VIEW_TYPE = 'collectors-dashboard';

export class DashboardView extends ItemView {
  plugin: CollectorsPlugin;
  private collections: Collection[] = [];
  private collapsedGroups = new Set<CollectionType>();

  constructor(leaf: WorkspaceLeaf, plugin: CollectorsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return DASHBOARD_VIEW_TYPE; }
  getDisplayText() { return t('dashboard_title'); }
  getIcon() { return 'collectors-card'; }

  async onOpen() {
    await this.refresh();

    this.registerEvent(this.app.vault.on('create', f => {
      if (f instanceof TFile && f.extension === 'collection') this.refresh();
    }));
    this.registerEvent(this.app.vault.on('delete', f => {
      if (f instanceof TFile && f.extension === 'collection') this.refresh();
    }));
    this.registerEvent(this.app.vault.on('rename', (f, old) => {
      if (f instanceof TFile && f.extension === 'collection') this.refresh();
      else if (old.endsWith('.collection')) this.refresh();
    }));

    let modifyTimer: ReturnType<typeof setTimeout> | null = null;
    this.registerEvent(this.app.vault.on('modify', f => {
      if (!(f instanceof TFile) || f.extension !== 'collection') return;
      if (modifyTimer) clearTimeout(modifyTimer);
      modifyTimer = setTimeout(() => { modifyTimer = null; this.refresh(); }, 300);
    }));
  }

  async refresh() {
    this.collections = await this.loadCollections();
    this.render();
    this.runMigrations();
    this.runAutoUpdates();
    this.prefetchAllPrices();
  }

  private runMigrations() {
    const currentVersion = this.plugin.manifest.version;
    for (const coll of this.collections) {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (file instanceof TFile) {
        migrateCollection(file, coll.pluginVersion, currentVersion, this.app.vault);
      }
    }
  }

  // ── Price helpers ─────────────────────────────────────────────────────────────

  private fmt(val: number, coll?: Collection): string {
    const symbol = coll?.type === 'pokemon-set'
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

  private async prefetchAllPrices() {
    // MTG: batch fetch via Scryfall
    const mtgIds = this.collections
      .filter(c => c.type.startsWith('mtg') && c.format !== 'arena')
      .flatMap(c => c.cards.map(card => ({ set: card.set.toLowerCase(), collector_number: card.number })));
    const mtgNeeded = mtgIds.filter(id => !this.plugin.priceService.isCached(id.set, id.collector_number));
    if (mtgNeeded.length > 0) await this.plugin.priceService.fetchPrices(mtgIds);

    // Pokémon: per-card via TCGdex
    const pokemonColls = this.collections.filter(c => c.type === 'pokemon-set');
    for (const coll of pokemonColls) {
      const anyUncached = coll.cards.some(card => !this.plugin.priceService.isPokemonCached(card.set, card.number));
      if (!anyUncached) continue;
      await this.plugin.priceService.fetchPokemonPrices(coll.cards.map(c => c.id));
    }

    this.render();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  private runAutoUpdates() {
    const targets = this.collections.filter(
      c => c.type === 'mtg-theme' && c.autoUpdate && (c.setCode || c.scryfallQuery)
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

    const allFiles = vault.getFiles().filter(f => f.extension === 'collection');

    let files: TFile[];
    if (folder) {
      files = allFiles.filter(f => f.path.startsWith(folder + '/') || f.parent?.path === folder);
    } else {
      files = allFiles;
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
    this.renderList(content);
  }

  // ── List screen ───────────────────────────────────────────────────────────────

  private renderList(root: HTMLElement) {
    const header = root.createDiv({ cls: 'col-header col-header-stack' });
    header.createEl('h2', { text: t('dashboard_title'), cls: 'col-title' });

    const actions = header.createDiv({ cls: 'col-actions' });
    const refreshBtn = actions.createEl('button', { cls: 'col-btn-icon', attr: { title: t('btn_refresh') } });
    refreshBtn.innerHTML = '↻';
    refreshBtn.addEventListener('click', () => this.refresh());

    const newBtn = actions.createEl('button', { cls: 'col-btn', text: t('btn_new_collection') });
    newBtn.addEventListener('click', () =>
      new NewCollectionModal(this.app, this.plugin, () => this.refresh()).open()
    );

    if (this.collections.length === 0) {
      root.createDiv({ cls: 'col-empty', text: t('empty_no_collections') });
      return;
    }

    this.renderHeroStats(root);

    const grouped = this.groupByType(this.collections);
    const order: CollectionType[] = ['mtg-set', 'mtg-theme', 'pokemon-set'];
    const labels: Record<CollectionType, string> = {
      'mtg-set':     t('group_mtg_sets'),
      'mtg-theme':   t('group_theme'),
      'pokemon-set': t('group_pokemon_sets'),
    };

    for (const type of order) {
      const colls = grouped[type];
      if (!colls?.length) continue;

      const collapsed = this.collapsedGroups.has(type);
      const section = root.createDiv({ cls: `col-section${collapsed ? ' col-section-collapsed' : ''}` });

      const titleRow = section.createEl('h3', { cls: 'col-section-title' });
      titleRow.createEl('span', { cls: 'col-section-chevron', text: collapsed ? '▶' : '▼' });
      titleRow.createEl('span', { text: `${labels[type]} (${colls.length})` });
      titleRow.addEventListener('click', () => {
        if (this.collapsedGroups.has(type)) this.collapsedGroups.delete(type);
        else this.collapsedGroups.add(type);
        section.toggleClass('col-section-collapsed', this.collapsedGroups.has(type));
        const chevron = titleRow.querySelector<HTMLElement>('.col-section-chevron');
        if (chevron) chevron.textContent = this.collapsedGroups.has(type) ? '▶' : '▼';
      });

      const grid = section.createDiv({ cls: 'col-collection-grid' });
      for (const coll of colls) {
        this.renderCollectionCard(grid, coll);
      }
    }
  }

  private renderHeroStats(root: HTMLElement) {
    const totalOwned = this.collections.reduce((s, c) => s + c.owned, 0);
    const totalCards = this.collections.reduce((s, c) => s + c.total, 0);

    let totalInvested = 0, totalMissing = 0, pricesLoaded = false;
    for (const coll of this.collections) {
      if (coll.format === 'arena') continue;
      const { owned, missing, loaded } = this.collValues(coll);
      if (loaded) { pricesLoaded = true; totalInvested += owned; totalMissing += missing; }
    }

    const hasMTG = this.collections.some(c => c.type.startsWith('mtg'));
    const currency = hasMTG
      ? this.plugin.priceService.currency()
      : this.plugin.priceService.pokemonCurrency();
    const sourceLabel = hasMTG
      ? this.plugin.priceService.sourceLabel()
      : this.plugin.priceService.pokemonSourceLabel();
    const fmt = (v: number) => `${currency}${v.toFixed(2)}`;

    const hero = root.createDiv({ cls: 'col-hero' });
    this.statBox(hero, String(this.collections.length), t('stat_collections'), '');
    this.statBox(hero, `${totalOwned} / ${totalCards}`, t('stat_cards_owned'), 'col-hero-owned');
    this.statBox(hero, pricesLoaded ? fmt(totalInvested) : '…', t('stat_invested', { source: sourceLabel }), 'col-hero-money');
    this.statBox(hero, pricesLoaded ? fmt(totalMissing) : '…', t('stat_to_complete'), 'col-hero-missing');
  }

  private statBox(container: HTMLElement, value: string, label: string, mod: string) {
    const box = container.createDiv({ cls: `col-hero-box${mod ? ' ' + mod : ''}` });
    box.createEl('span', { cls: 'col-hero-value', text: value });
    box.createEl('span', { cls: 'col-hero-label', text: label });
  }

  private renderCollectionCard(container: HTMLElement, coll: Collection) {
    const pct = coll.total > 0 ? Math.round((coll.owned / coll.total) * 100) : 0;
    const missing = coll.total - coll.owned;
    const { owned: ownedVal, missing: missingVal, loaded: pricesLoaded } = this.collValues(coll);

    const card = container.createDiv({ cls: 'col-card' });

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
    if (coll.tcgdexSetId) nameRow.createEl('span', { cls: 'col-badge', text: coll.tcgdexSetId });
    if (coll.type === 'mtg-theme') nameRow.createEl('span', { cls: 'col-badge col-badge-custom', text: t('badge_custom') });
    if (coll.format === 'arena') nameRow.createEl('span', { cls: 'col-badge col-badge-arena', text: t('badge_arena') });

    const progressWrap = info.createDiv({ cls: 'col-progress-wrap' });
    const bar = progressWrap.createDiv({ cls: 'col-progress-bar' });
    bar.createDiv({ cls: 'col-progress-fill' }).style.width = `${pct}%`;
    progressWrap.createEl('span', { cls: 'col-pct', text: `${pct}%` });

    const stats = info.createDiv({ cls: 'col-stats' });
    stats.createEl('span', { cls: 'col-stat-owned', text: t('card_owned_count', { count: coll.owned }) });
    stats.createEl('span', { cls: 'col-dot', text: '·' });
    stats.createEl('span', { text: t('card_total_count', { count: coll.total }) });
    if (missing > 0) {
      stats.createEl('span', { cls: 'col-dot', text: '·' });
      stats.createEl('span', { cls: 'col-stat-missing', text: t('card_missing_count', { count: missing }) });
    }

    if (pricesLoaded) {
      const priceRow = info.createDiv({ cls: 'col-price-row' });
      priceRow.createEl('span', { cls: 'col-price-invested', text: t('card_invested', { value: this.fmt(ownedVal, coll) }) });
      if (missingVal > 0) {
        priceRow.createEl('span', { cls: 'col-dot', text: '·' });
        priceRow.createEl('span', { cls: 'col-price-missing', text: t('card_to_complete', { value: this.fmt(missingVal, coll) }) });
      }
    }

    const cardActions = info.createDiv({ cls: 'col-card-actions' });

    const detailBtn = cardActions.createEl('button', { cls: 'col-btn col-btn-view', attr: { title: t('btn_view_title') } });
    detailBtn.innerHTML = t('btn_view');
    detailBtn.addEventListener('click', () => {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (file instanceof TFile) this.app.workspace.getLeaf('tab').openFile(file);
    });

    if ((coll.setCode || coll.scryfallQuery) && coll.type.startsWith('mtg')) {
      const updateBtn = cardActions.createEl('button', { cls: 'col-btn-icon', attr: { title: t('btn_update_scryfall') } });
      updateBtn.innerHTML = '⟳';
      updateBtn.addEventListener('click', async () => {
        updateBtn.disabled = true;
        await this.updateFromScryfall(coll);
        updateBtn.disabled = false;
      });
    }

    const editBtn = cardActions.createEl('button', { cls: 'col-btn-icon', attr: { title: t('btn_edit_collection') } });
    editBtn.innerHTML = '✎';
    editBtn.addEventListener('click', () => {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof TFile)) return;
      new NewCollectionModal(this.app, this.plugin, () => this.refresh(), { collection: coll, file }).open();
    });
  }

  // ── Scryfall update ───────────────────────────────────────────────────────────

  private async updateFromScryfall(coll: Collection, silent = false): Promise<number> {
    if (!silent) new Notice(t('notice_fetching_for', { name: coll.name }));
    try {
      const finish = coll.finishImport ?? 'all';
      const unique  = coll.allPrints === false ? 'cards' : 'prints';

      const onPage = (p: number) => { if (!silent) new Notice(t('notice_fetching_page', { page: p })); };
      const onRateLimit = (s: number) => new Notice(t('notice_rate_limit', { seconds: s }), s * 1000);

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
      if (!(file instanceof TFile)) return 0;

      const rows = cards.flatMap(cardToMarkdownRows);
      const added = await appendCards(file, rows, this.app.vault);

      const today = new Date().toISOString().slice(0, 10);
      await patchFrontmatter(file, 'last-fetched', today, this.app.vault);

      if (!silent) {
        new Notice(added > 0
          ? t('notice_cards_added', { count: added, name: coll.name })
          : t('notice_up_to_date', { name: coll.name })
        );
      } else if (added > 0) {
        new Notice(t('notice_auto_updated', { count: added, name: coll.name }));
      }
      return added;
    } catch (e) {
      if (!silent) new Notice(t('notice_scryfall_failed', { error: (e as Error).message }));
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
}
