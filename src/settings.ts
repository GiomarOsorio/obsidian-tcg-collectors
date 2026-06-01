import { App, PluginSettingTab, Setting } from 'obsidian';
import type CollectorsPlugin from './main';
import type { PriceSource, TCGGame } from './types';

const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  'scryfall-usd': 'Scryfall — USD',
  'scryfall-eur': 'Scryfall — EUR',
  'tcgplayer':    'TCGPlayer (API key required)',
  'cardmarket':   'Cardmarket (credentials required)',
};

type TabId = 'general' | TCGGame;

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'general',  icon: '⚙',  label: 'General'             },
  { id: 'mtg',      icon: '✦',  label: 'Magic: The Gathering' },
  { id: 'pokemon',  icon: '⚡', label: 'Pokémon'              },
  { id: 'onepiece', icon: '☠',  label: 'One Piece'            },
  { id: 'yugioh',   icon: '👁', label: 'Yu-Gi-Oh!'            },
];

export class CollectorsSettingTab extends PluginSettingTab {
  plugin: CollectorsPlugin;
  private activeTab: TabId = 'general';

  constructor(app: App, plugin: CollectorsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('col-settings');

    const tabBar = containerEl.createDiv({ cls: 'col-settings-tabs' });
    const body   = containerEl.createDiv({ cls: 'col-settings-body' });

    const paneEls: Partial<Record<TabId, HTMLElement>> = {};
    const tabEls:  Partial<Record<TabId, HTMLElement>> = {};

    const switchTab = (id: TabId) => {
      this.activeTab = id;
      for (const k of Object.keys(paneEls) as TabId[]) {
        paneEls[k]!.toggleClass('col-settings-pane-active', k === id);
        tabEls[k]!.toggleClass('col-settings-tab-active',   k === id);
      }
    };

    for (const { id, icon, label } of TABS) {
      const tab = tabBar.createEl('button', { cls: 'col-settings-tab' });
      tab.createEl('span', { cls: 'col-settings-tab-icon', text: icon });
      tab.createEl('span', { cls: 'col-settings-tab-label', text: label });
      tab.addEventListener('click', () => switchTab(id));
      tabEls[id]  = tab;
      paneEls[id] = body.createDiv({ cls: 'col-settings-pane' });
    }

    this.buildGeneral(paneEls['general']!);
    this.buildMTG(paneEls['mtg']!);
    this.buildComingSoon(paneEls['pokemon']!,  'pokemon',  '⚡', 'Pokémon');
    this.buildComingSoon(paneEls['onepiece']!, 'onepiece', '☠', 'One Piece');
    this.buildComingSoon(paneEls['yugioh']!,   'yugioh',   '👁', 'Yu-Gi-Oh!');

    switchTab(this.activeTab);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private sectionTitle(el: HTMLElement, text: string) {
    el.createEl('h3', { cls: 'col-settings-section-title', text });
  }

  private sectionDesc(el: HTMLElement, text: string) {
    el.createEl('p', { cls: 'col-settings-desc', text });
  }

  // ── General ───────────────────────────────────────────────────────────────────

  private buildGeneral(el: HTMLElement) {
    this.sectionTitle(el, 'Collections');

    new Setting(el)
      .setName('Collections folder')
      .setDesc('Folder to scan for .collection files. Leave empty to scan the entire vault.')
      .addText(t =>
        t.setPlaceholder('e.g. 004 MTG')
          .setValue(this.plugin.settings.collectionsFolder)
          .onChange(async v => {
            this.plugin.settings.collectionsFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );
  }

  // ── MTG ───────────────────────────────────────────────────────────────────────

  private buildMTG(el: HTMLElement) {
    // Ensure enabledGames exists
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }

    this.sectionTitle(el, 'Magic: The Gathering');

    new Setting(el)
      .setName('Enable Magic: The Gathering')
      .setDesc('Show MTG as an option when creating new collections.')
      .addToggle(t =>
        t.setValue(this.plugin.settings.enabledGames['mtg'] ?? true)
          .onChange(async v => {
            this.plugin.settings.enabledGames['mtg'] = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Card Data ────────────────────────────────────────────────────────────
    this.sectionTitle(el, 'Card Data');
    this.sectionDesc(el, 'Source used to fetch card lists and images.');

    new Setting(el)
      .setName('Source')
      .addDropdown(d => {
        d.addOption('scryfall', 'Scryfall');
        d.setValue('scryfall');
        d.setDisabled(true);
      });

    // ── Prices ───────────────────────────────────────────────────────────────
    this.sectionTitle(el, 'Prices');
    this.sectionDesc(el, 'Choose where to fetch card prices. If a provider has no API key configured, Scryfall USD is used as fallback.');

    const tcgSection = el.createDiv({ cls: 'col-settings-sub' });
    const cmSection  = el.createDiv({ cls: 'col-settings-sub' });

    const updateVisibility = (source: PriceSource) => {
      tcgSection.toggleClass('col-settings-sub-active', source === 'tcgplayer');
      cmSection.toggleClass('col-settings-sub-active',  source === 'cardmarket');
    };

    new Setting(el)
      .setName('Provider')
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

    // TCGPlayer
    this.sectionTitle(tcgSection, 'TCGPlayer');
    this.sectionDesc(tcgSection, 'Get your public API key at developer.tcgplayer.com. Uses market price (USD).');
    new Setting(tcgSection)
      .setName('Public API key')
      .setDesc('Bearer token for TCGPlayer API v1.39.0.')
      .addText(t =>
        t.setPlaceholder('Paste your public key here')
          .setValue(this.plugin.settings.tcgplayerKey)
          .onChange(async v => {
            this.plugin.settings.tcgplayerKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // Cardmarket
    this.sectionTitle(cmSection, 'Cardmarket');
    this.sectionDesc(cmSection, 'OAuth 1.0a credentials from your Cardmarket developer account. Uses TREND price (EUR).');
    for (const [key, label, placeholder] of [
      ['cardmarketAppToken',    'App token',           'App token'          ],
      ['cardmarketAppSecret',   'App secret',          'App secret'         ],
      ['cardmarketAccessToken', 'Access token',        'Access token'       ],
      ['cardmarketAccessSecret','Access token secret', 'Access token secret'],
    ] as const) {
      new Setting(cmSection)
        .setName(label)
        .addText(t =>
          t.setPlaceholder(placeholder)
            .setValue((this.plugin.settings as any)[key])
            .onChange(async v => {
              (this.plugin.settings as any)[key] = v.trim();
              await this.plugin.saveSettings();
            })
        );
    }
  }

  // ── Coming soon ───────────────────────────────────────────────────────────────

  private buildComingSoon(el: HTMLElement, game: TCGGame, icon: string, label: string) {
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }

    this.sectionTitle(el, `${icon}  ${label}`);

    new Setting(el)
      .setName(`Enable ${label}`)
      .setDesc('Show this game as an option when creating new collections.')
      .addToggle(t =>
        t.setValue(this.plugin.settings.enabledGames[game] ?? true)
          .onChange(async v => {
            this.plugin.settings.enabledGames[game] = v;
            await this.plugin.saveSettings();
          })
      );

    // Card Data
    this.sectionTitle(el, 'Card Data');
    const cardBox = el.createDiv({ cls: 'col-settings-coming-soon' });
    cardBox.createEl('span', { cls: 'col-settings-coming-soon-icon', text: '🚧' });
    cardBox.createEl('span', { text: `No card data source available for ${label} yet.` });

    // Prices
    this.sectionTitle(el, 'Prices');
    const priceBox = el.createDiv({ cls: 'col-settings-coming-soon' });
    priceBox.createEl('span', { cls: 'col-settings-coming-soon-icon', text: '🚧' });
    priceBox.createEl('span', { text: `No price data available for ${label} yet.` });
  }
}
