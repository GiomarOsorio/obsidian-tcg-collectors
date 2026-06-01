import { Plugin } from 'obsidian';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './DashboardView';
import { CollectionView, COLLECTION_VIEW_TYPE } from './CollectionView';
import { NewCollectionModal } from './NewCollectionModal';
import { CollectorsSettings, DEFAULT_SETTINGS } from './types';
import { CollectorsSettingTab } from './settings';
import { PriceService } from './PriceService';

export default class CollectorsPlugin extends Plugin {
  settings: CollectorsSettings = DEFAULT_SETTINGS;
  priceService!: PriceService;

  async onload() {
    await this.loadSettings();
    this.priceService = new PriceService(this.settings);

    this.registerView(DASHBOARD_VIEW_TYPE, leaf => new DashboardView(leaf, this));
    this.registerView(COLLECTION_VIEW_TYPE, leaf => new CollectionView(leaf, this));

    this.registerExtensions(['collection'], COLLECTION_VIEW_TYPE);

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
