import { App, PluginSettingTab, Setting } from 'obsidian';
import type CollectorsPlugin from './main';
import type { PriceSource } from './types';

const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  'scryfall-usd': 'Scryfall — USD (TCGPlayer market)',
  'scryfall-eur': 'Scryfall — EUR (Cardmarket trend)',
  'tcgplayer':    'TCGPlayer (API key required)',
  'cardmarket':   'Cardmarket (API credentials required)',
};

export class CollectorsSettingTab extends PluginSettingTab {
  plugin: CollectorsPlugin;

  constructor(app: App, plugin: CollectorsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    // ── General ────────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Collectors Settings' });

    new Setting(containerEl)
      .setName('Collections folder')
      .setDesc('Folder to scan for collection files. Leave empty to scan the entire vault. Example: "004 MTG"')
      .addText(t =>
        t.setPlaceholder('e.g. 004 MTG')
          .setValue(this.plugin.settings.collectionsFolder)
          .onChange(async v => {
            this.plugin.settings.collectionsFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Auto-detect collections')
      .setDesc('Detect collection files by their checkbox table format, not only by frontmatter.')
      .addToggle(t =>
        t.setValue(this.plugin.settings.autoDetect)
          .onChange(async v => {
            this.plugin.settings.autoDetect = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Price Sources ──────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Price Sources' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Choose where to fetch card prices from. If a provider has no API key configured, Scryfall USD is used as fallback.',
    });

    const tcgSection = containerEl.createDiv();
    const cmSection = containerEl.createDiv();

    const updateVisibility = (source: PriceSource) => {
      tcgSection.style.display = source === 'tcgplayer' ? '' : 'none';
      cmSection.style.display  = source === 'cardmarket' ? '' : 'none';
    };

    new Setting(containerEl)
      .setName('Price source')
      .setDesc('Active price provider for all collections.')
      .addDropdown(d => {
        for (const [val, label] of Object.entries(PRICE_SOURCE_LABELS)) {
          d.addOption(val, label);
        }
        d.setValue(this.plugin.settings.priceSource);
        updateVisibility(this.plugin.settings.priceSource);
        d.onChange(async v => {
          this.plugin.settings.priceSource = v as PriceSource;
          await this.plugin.saveSettings();
          updateVisibility(v as PriceSource);
        });
      });

    // ── TCGPlayer section ──────────────────────────────────────────────────────
    tcgSection.createEl('h3', { text: 'TCGPlayer' });
    tcgSection.createEl('p', {
      cls: 'setting-item-description',
      text: 'Get your public API key at developer.tcgplayer.com. Uses market price (USD).',
    });

    new Setting(tcgSection)
      .setName('API public key')
      .setDesc('Bearer token for TCGPlayer API v1.39.0.')
      .addText(t =>
        t.setPlaceholder('Paste your public key here')
          .setValue(this.plugin.settings.tcgplayerKey)
          .onChange(async v => {
            this.plugin.settings.tcgplayerKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── Cardmarket section ─────────────────────────────────────────────────────
    cmSection.createEl('h3', { text: 'Cardmarket' });
    cmSection.createEl('p', {
      cls: 'setting-item-description',
      text: 'Requires OAuth 1.0a credentials from your Cardmarket developer account. Uses TREND price (EUR).',
    });

    new Setting(cmSection)
      .setName('App token')
      .addText(t =>
        t.setPlaceholder('App token')
          .setValue(this.plugin.settings.cardmarketAppToken)
          .onChange(async v => {
            this.plugin.settings.cardmarketAppToken = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(cmSection)
      .setName('App secret')
      .addText(t =>
        t.setPlaceholder('App secret')
          .setValue(this.plugin.settings.cardmarketAppSecret)
          .onChange(async v => {
            this.plugin.settings.cardmarketAppSecret = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(cmSection)
      .setName('Access token')
      .addText(t =>
        t.setPlaceholder('Access token')
          .setValue(this.plugin.settings.cardmarketAccessToken)
          .onChange(async v => {
            this.plugin.settings.cardmarketAccessToken = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(cmSection)
      .setName('Access token secret')
      .addText(t =>
        t.setPlaceholder('Access token secret')
          .setValue(this.plugin.settings.cardmarketAccessSecret)
          .onChange(async v => {
            this.plugin.settings.cardmarketAccessSecret = v.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
