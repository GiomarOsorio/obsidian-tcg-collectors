import { Plugin, addIcon } from 'obsidian';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './DashboardView';
import { CollectionView, COLLECTION_VIEW_TYPE } from './CollectionView';
import { NewCollectionModal } from './NewCollectionModal';
import { CollectorsSettings, DEFAULT_SETTINGS } from './types';
import { CollectorsSettingTab } from './settings';
import { PriceService } from './PriceService';
import { t } from './i18n';

const COLLECTORS_ICON = 'collectors-card';

export default class CollectorsPlugin extends Plugin {
  settings: CollectorsSettings = DEFAULT_SETTINGS;
  priceService!: PriceService;

  async onload() {
    addIcon(COLLECTORS_ICON, `
      <rect x="14" y="4" width="72" height="92" rx="7" ry="7" fill="none" stroke="currentColor" stroke-width="6"/>
      <rect x="22" y="12" width="56" height="40" rx="3" fill="currentColor" opacity="0.25"/>
      <line x1="22" y1="62" x2="78" y2="62" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <line x1="22" y1="75" x2="78" y2="75" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <line x1="22" y1="88" x2="58" y2="88" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    `);

    await this.loadSettings();
    this.priceService = new PriceService(this.settings);
    this.priceService.setVault(this.app.vault);
    await this.priceService.loadPokemonCache();

    this.registerView(DASHBOARD_VIEW_TYPE, leaf => new DashboardView(leaf, this));
    this.registerView(COLLECTION_VIEW_TYPE, leaf => new CollectionView(leaf, this));

    this.registerExtensions(['collection'], COLLECTION_VIEW_TYPE);

    this.addRibbonIcon(COLLECTORS_ICON, t('ribbon_dashboard'), () => this.activateDashboard());

    this.addCommand({
      id: 'open-dashboard',
      name: t('cmd_open_dashboard'),
      callback: () => this.activateDashboard(),
    });

    this.addCommand({
      id: 'new-collection',
      name: t('cmd_new_collection'),
      callback: () => new NewCollectionModal(this.app, this, () => this.refreshDashboard()).open(),
    });

    this.addSettingTab(new CollectorsSettingTab(this.app, this));
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

  async refreshDashboard() {
    for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
      if (leaf.view instanceof DashboardView) {
        await (leaf.view as DashboardView).refresh();
      }
    }
  }
}
