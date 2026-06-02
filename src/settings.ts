import { App, PluginSettingTab, Setting } from 'obsidian';
import type CollectorsPlugin from './main';
import type { PriceSource, TCGGame } from './types';
import { t } from './i18n';

type TabId = 'general' | TCGGame;

const TABS = (): { id: TabId; icon: string; label: string }[] => [
  { id: 'general',  icon: '⚙',  label: t('settings_tab_general')  },
  { id: 'mtg',      icon: '✦',  label: t('settings_tab_mtg')      },
  { id: 'pokemon',  icon: '⚡', label: t('settings_tab_pokemon')  },
  { id: 'onepiece', icon: '☠',  label: t('settings_tab_onepiece') },
  { id: 'yugioh',   icon: '👁', label: t('settings_tab_yugioh')   },
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

    for (const { id, icon, label } of TABS()) {
      const tab = tabBar.createEl('button', { cls: 'col-settings-tab' });
      tab.createEl('span', { cls: 'col-settings-tab-icon', text: icon });
      tab.createEl('span', { cls: 'col-settings-tab-label', text: label });
      tab.addEventListener('click', () => switchTab(id));
      tabEls[id]  = tab;
      paneEls[id] = body.createDiv({ cls: 'col-settings-pane' });
    }

    this.buildGeneral(paneEls['general']!);
    this.buildMTG(paneEls['mtg']!);
    this.buildPokemon(paneEls['pokemon']!);
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
    this.sectionTitle(el, t('settings_section_collections'));

    new Setting(el)
      .setName(t('settings_folder'))
      .setDesc(t('settings_folder_desc'))
      .addText(tx =>
        tx.setPlaceholder(t('settings_folder_ph'))
          .setValue(this.plugin.settings.collectionsFolder)
          .onChange(async v => {
            this.plugin.settings.collectionsFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );
  }

  // ── MTG ───────────────────────────────────────────────────────────────────────

  private buildMTG(el: HTMLElement) {
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }

    this.sectionTitle(el, t('settings_tab_mtg'));

    new Setting(el)
      .setName(t('settings_enable_game', { game: 'Magic: The Gathering' }))
      .setDesc(t('settings_enable_game_desc'))
      .addToggle(tx =>
        tx.setValue(this.plugin.settings.enabledGames['mtg'] ?? true)
          .onChange(async v => {
            this.plugin.settings.enabledGames['mtg'] = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Card Data ────────────────────────────────────────────────────────────
    this.sectionTitle(el, t('settings_section_card_data'));
    this.sectionDesc(el, t('settings_card_data_desc'));

    new Setting(el)
      .setName(t('settings_source'))
      .addDropdown(d => {
        d.addOption('scryfall', 'Scryfall');
        d.setValue('scryfall');
        d.setDisabled(true);
      });

    // ── Prices ───────────────────────────────────────────────────────────────
    this.sectionTitle(el, t('settings_section_prices'));
    this.sectionDesc(el, t('settings_prices_desc'));

    const tcgSection = el.createDiv({ cls: 'col-settings-sub' });
    const cmSection  = el.createDiv({ cls: 'col-settings-sub' });

    const updateVisibility = (source: PriceSource) => {
      tcgSection.toggleClass('col-settings-sub-active', source === 'tcgplayer');
      cmSection.toggleClass('col-settings-sub-active',  source === 'cardmarket');
    };

    new Setting(el)
      .setName(t('settings_provider'))
      .addDropdown(d => {
        d.addOption('scryfall-usd', t('settings_price_scryfall_usd'));
        d.addOption('scryfall-eur', t('settings_price_scryfall_eur'));
        d.addOption('tcgplayer',    t('settings_price_tcgplayer'));
        d.addOption('cardmarket',   t('settings_price_cardmarket'));
        d.setValue(this.plugin.settings.priceSource);
        updateVisibility(this.plugin.settings.priceSource);
        d.onChange(async v => {
          this.plugin.settings.priceSource = v as PriceSource;
          await this.plugin.saveSettings(true);
          updateVisibility(v as PriceSource);
        });
      });

    // TCGPlayer
    this.sectionTitle(tcgSection, t('settings_section_tcgplayer'));
    this.sectionDesc(tcgSection, t('settings_tcgplayer_desc'));
    new Setting(tcgSection)
      .setName(t('settings_tcgplayer_key'))
      .setDesc(t('settings_tcgplayer_key_desc'))
      .addText(tx =>
        tx.setPlaceholder(t('settings_tcgplayer_ph'))
          .setValue(this.plugin.settings.tcgplayerKey)
          .onChange(async v => {
            this.plugin.settings.tcgplayerKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // Cardmarket
    this.sectionTitle(cmSection, t('settings_section_cardmarket'));
    this.sectionDesc(cmSection, t('settings_cardmarket_desc'));
    for (const [key, labelKey, phKey] of [
      ['cardmarketAppToken',    'settings_cm_app_token',    'settings_cm_app_token'    ],
      ['cardmarketAppSecret',   'settings_cm_app_secret',   'settings_cm_app_secret'   ],
      ['cardmarketAccessToken', 'settings_cm_access_token', 'settings_cm_access_token' ],
      ['cardmarketAccessSecret','settings_cm_access_secret','settings_cm_access_secret'],
    ] as const) {
      new Setting(cmSection)
        .setName(t(labelKey))
        .addText(tx =>
          tx.setPlaceholder(t(phKey))
            .setValue((this.plugin.settings as any)[key])
            .onChange(async v => {
              (this.plugin.settings as any)[key] = v.trim();
              await this.plugin.saveSettings();
            })
        );
    }
  }

  // ── Pokémon ───────────────────────────────────────────────────────────────────

  private buildPokemon(el: HTMLElement) {
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }

    this.sectionTitle(el, '⚡  Pokémon');

    new Setting(el)
      .setName(t('settings_enable_game', { game: 'Pokémon' }))
      .setDesc(t('settings_enable_game_desc'))
      .addToggle(tx =>
        tx.setValue(this.plugin.settings.enabledGames['pokemon'] ?? true)
          .onChange(async v => {
            this.plugin.settings.enabledGames['pokemon'] = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Card Data ────────────────────────────────────────────────────────────
    this.sectionTitle(el, t('settings_section_card_data'));
    this.sectionDesc(el, t('settings_card_data_desc'));

    new Setting(el)
      .setName(t('settings_source'))
      .addDropdown(d => {
        d.addOption('tcgdex', 'TCGdex');
        d.setValue('tcgdex');
        d.setDisabled(true);
      });

    // ── Prices ───────────────────────────────────────────────────────────────
    this.sectionTitle(el, t('settings_section_prices'));
    this.sectionDesc(el, t('settings_pokemon_price_source_desc'));

    new Setting(el)
      .setName(t('settings_pokemon_price_source'))
      .addDropdown(d => {
        d.addOption('tcgplayer',  t('settings_pokemon_tcgplayer'));
        d.addOption('cardmarket', t('settings_pokemon_cardmarket'));
        d.setValue(this.plugin.settings.pokemonPriceSource ?? 'tcgplayer');
        d.onChange(async v => {
          this.plugin.settings.pokemonPriceSource = v as 'tcgplayer' | 'cardmarket';
          await this.plugin.saveSettings(true);
        });
      });

    // TCGdex sponsor link
    const sponsorDiv = el.createDiv({ cls: 'col-settings-sponsor' });
    sponsorDiv.createEl('span', { text: t('settings_pokemon_sponsor_desc') + ' ' });
    sponsorDiv.createEl('a', {
      text: t('settings_pokemon_sponsor'),
      href: 'https://github.com/tcgdex/cards-database#sponsors-',
    });
  }

  // ── Coming soon ───────────────────────────────────────────────────────────────

  private buildComingSoon(el: HTMLElement, game: TCGGame, icon: string, label: string) {
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }

    this.sectionTitle(el, `${icon}  ${label}`);

    new Setting(el)
      .setName(t('settings_enable_game', { game: label }))
      .setDesc(t('settings_enable_game_desc'))
      .addToggle(tx =>
        tx.setValue(this.plugin.settings.enabledGames[game] ?? true)
          .onChange(async v => {
            this.plugin.settings.enabledGames[game] = v;
            await this.plugin.saveSettings();
          })
      );

    this.sectionTitle(el, t('settings_section_card_data'));
    const cardBox = el.createDiv({ cls: 'col-settings-coming-soon' });
    cardBox.createEl('span', { cls: 'col-settings-coming-soon-icon', text: '🚧' });
    cardBox.createEl('span', { text: t('settings_no_card_data', { game: label }) });

    this.sectionTitle(el, t('settings_section_prices'));
    const priceBox = el.createDiv({ cls: 'col-settings-coming-soon' });
    priceBox.createEl('span', { cls: 'col-settings-coming-soon-icon', text: '🚧' });
    priceBox.createEl('span', { text: t('settings_no_price_data', { game: label }) });
  }
}
