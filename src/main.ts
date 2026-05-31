import { Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './DashboardView';
import { NewCollectionModal } from './NewCollectionModal';
import { CollectorsSettings, DEFAULT_SETTINGS } from './types';
import { CollectorsSettingTab } from './settings';
import { PriceService } from './PriceService';
import { setCardCount } from './parser';

export default class CollectorsPlugin extends Plugin {
  settings: CollectorsSettings = DEFAULT_SETTINGS;
  priceService!: PriceService;

  async onload() {
    await this.loadSettings();
    this.priceService = new PriceService(this.settings);

    this.registerView(DASHBOARD_VIEW_TYPE, leaf => new DashboardView(leaf, this));

    this.addRibbonIcon('layout-grid', 'Collectors Dashboard', () => this.activateDashboard());

    this.addCommand({
      id: 'open-dashboard',
      name: 'Open Dashboard',
      callback: () => this.activateDashboard(),
    });

    this.addCommand({
      id: 'new-collection',
      name: 'New Collection',
      callback: () => new NewCollectionModal(this.app, this, () => this.refreshDashboard()).open(),
    });

    this.addSettingTab(new CollectorsSettingTab(this.app, this));

    this.registerMarkdownPostProcessor((element, context) => {
      if (!this.settings.cardViewInFiles) return;
      element.querySelectorAll<HTMLTableElement>('table').forEach(table => {
        this.transformTableToCardView(table, context.sourcePath);
      });
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.priceService.updateSettings(this.settings);
  }

  async activateDashboard() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);

    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }

    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  private transformTableToCardView(table: HTMLTableElement, sourcePath: string) {
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    if (rows.length === 0) return;

    // Detect collectors table: first data cell has a checkbox with our ID format
    const firstCb = rows[0].querySelector<HTMLInputElement>('td input[type="checkbox"]');
    if (!firstCb?.id?.match(/^[a-f0-9]{8}_(f|n)$/)) return;

    const grid = createDiv({ cls: 'col-card-grid' });

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 7) continue;
      const cb = cells[0].querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!cb?.id) continue;

      const imageUrl = cells[1].querySelector('img')?.getAttribute('src') ?? '';
      const name     = cells[2].textContent?.trim() ?? '';
      const rarity   = cells[4].textContent?.trim().toLowerCase() ?? '';
      const set      = cells[5].textContent?.trim() ?? '';
      const number   = cells[6].textContent?.trim() ?? '';
      const id       = cb.id;
      const isFoil   = id.endsWith('_f');
      const isChecked = cb.checked;
      const rawCount  = cb.getAttribute('data-count');
      let count       = rawCount ? parseInt(rawCount) : (isChecked ? 1 : 0);
      let owned       = count > 0;

      const tileCls = ['col-tile', owned ? 'col-tile-owned' : '', isFoil ? 'col-tile-foil' : ''].filter(Boolean).join(' ');
      const tile = grid.createDiv({ cls: tileCls });

      // Foil badge — top-right
      if (isFoil) {
        tile.createDiv({ cls: 'col-foil-badge', text: 'F' });
      }

      if (imageUrl.startsWith('https://')) {
        const img = tile.createEl('img', {
          cls: 'col-tile-img',
          attr: { src: imageUrl, alt: name, loading: 'lazy' },
        });
        img.addEventListener('error', () => {
          const fb = createDiv({ cls: 'col-tile-img-fallback' });
          fb.setText(name[0] ?? '?');
          img.replaceWith(fb);
        });
      } else {
        tile.createDiv({ cls: 'col-tile-img-fallback' }).setText(name[0] ?? '?');
      }

      const footer = tile.createDiv({ cls: 'col-tile-footer' });
      footer.createEl('span', { cls: 'col-tile-name', text: name });
      const meta = footer.createDiv({ cls: 'col-tile-meta' });
      meta.createEl('span', { cls: `col-rarity col-rarity-${rarity}`, text: rarity[0]?.toUpperCase() ?? '' });
      meta.createEl('span', { text: `${set} #${number}` });
      const countEl = meta.createEl('span', {
        cls: `col-tile-count${count > 0 ? ' col-tile-count-owned' : ''}`,
        text: `×${count}`,
      });
      footer.createEl('span', { cls: 'col-tile-price col-tile-price-empty', text: '—' });

      const applyCount = async (delta: number, e: MouseEvent) => {
        e.stopPropagation();
        const file = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!(file instanceof TFile)) return;
        count = Math.max(0, count + delta);
        owned = count > 0;
        await setCardCount(file, id, count, this.app.vault);
        countEl.textContent = `×${count}`;
        countEl.className = `col-tile-count${count > 0 ? ' col-tile-count-owned' : ''}`;
        tile.toggleClass('col-tile-owned', owned);
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

    table.replaceWith(grid);
  }

  async refreshDashboard() {
    for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
      if (leaf.view instanceof DashboardView) {
        await (leaf.view as DashboardView).refresh();
      }
    }
  }
}
