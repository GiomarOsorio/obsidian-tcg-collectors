import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type CollectorsPlugin from './main';
import { Collection, CollectionCard, CollectionType } from './types';
import { parseCollectionFile, appendCards, patchFrontmatter } from './parser';
import { migrateCollection } from './migrations';
import { NewCollectionModal } from './NewCollectionModal';
import {
  fetchSetCards, fetchSearchCards, cardToMarkdownRows,
} from './ScryfallService';

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
  getDisplayText() { return 'Collectors'; }
  getIcon() { return 'layout-grid'; }

  async onOpen() {
    await this.refresh();

    // Auto-refresh when any .collection file is created, modified, or deleted
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

    // Debounced modify — vault.modify fires multiple times during a save
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
    const ids = this.collections
      .filter(c => c.format !== 'arena')
      .flatMap(c => c.cards.map(card => ({ set: card.set.toLowerCase(), collector_number: card.number })));
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
    const order: CollectionType[] = ['mtg-set', 'mtg-theme'];
    const labels: Record<CollectionType, string> = {
      'mtg-set':   'MTG Sets',
      'mtg-theme': 'Theme Collections',
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
    if (coll.format === 'arena') nameRow.createEl('span', { cls: 'col-badge col-badge-arena', text: 'Arena' });

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
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (file instanceof TFile) this.app.workspace.getLeaf('tab').openFile(file);
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

    const editBtn = cardActions.createEl('button', { cls: 'col-btn-icon', attr: { title: 'Edit collection' } });
    editBtn.innerHTML = '✎';
    editBtn.addEventListener('click', () => {
      const file = this.app.vault.getAbstractFileByPath(coll.path);
      if (!(file instanceof TFile)) return;
      new NewCollectionModal(this.app, this.plugin, () => this.refresh(), { collection: coll, file }).open();
    });
  }

  // ── Scryfall update ───────────────────────────────────────────────────────────

  private async updateFromScryfall(coll: Collection, silent = false): Promise<number> {
    if (!silent) new Notice(`Fetching cards for "${coll.name}"...`);
    try {
      const finish = coll.finishImport ?? 'all';
      const unique  = coll.allPrints === false ? 'cards' : 'prints';

      const onPage = (p: number) => { if (!silent) new Notice(`Fetching page ${p}...`); };
      const onRateLimit = (s: number) => new Notice(`⏳ Scryfall rate limit hit — waiting ${s}s before retrying.`, s * 1000);

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
}
