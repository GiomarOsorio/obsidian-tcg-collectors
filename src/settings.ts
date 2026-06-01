import { App, PluginSettingTab, Setting } from 'obsidian';
import type CollectorsPlugin from './main';
import type { PriceSource, TCGGame } from './types';

const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  'scryfall-usd': 'Scryfall — USD',
  'scryfall-eur': 'Scryfall — EUR',
  'tcgplayer':    'TCGPlayer (API key required)',
  'cardmarket':   'Cardmarket (credentials required)',
};

const GAME_META: Record<TCGGame, { icon: string; label: string; desc: string }> = {
  mtg:      { icon: '✦', label: 'Magic: The Gathering', desc: 'MTG sets, theme collections, and custom lists.' },
  pokemon:  { icon: '⚡', label: 'Pokémon',              desc: 'Pokémon TCG sets and collections.' },
  onepiece: { icon: '☠', label: 'One Piece',             desc: 'One Piece Card Game sets.' },
  yugioh:   { icon: '👁', label: 'Yu-Gi-Oh!',            desc: 'Yu-Gi-Oh! sets and collections.' },
};

const GAME_ORDER: TCGGame[] = ['mtg', 'pokemon', 'onepiece', 'yugioh'];

type PaneId = 'general' | 'games' | 'prices';

const PANES: { id: PaneId; icon: string; label: string }[] = [
  { id: 'general', icon: '⚙️', label: 'General' },
  { id: 'games',   icon: '🎮', label: 'Games'   },
  { id: 'prices',  icon: '💰', label: 'Prices'  },
];

export class CollectorsSettingTab extends PluginSettingTab {
  plugin: CollectorsPlugin;
  private activePane: PaneId = 'general';

  constructor(app: App, plugin: CollectorsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('col-settings');

    // ── Tab bar ────────────────────────────────────────────────────────────────
    const tabBar = containerEl.createDiv({ cls: 'col-settings-tabs' });
    const body   = containerEl.createDiv({ cls: 'col-settings-body' });

    const paneEls: Record<string, HTMLElement> = {};
    const tabEls:  Record<string, HTMLElement> = {};

    const switchPane = (id: PaneId) => {
      this.activePane = id;
      for (const k of Object.keys(paneEls)) {
        paneEls[k].toggleClass('col-settings-pane-active', k === id);
        tabEls[k].toggleClass('col-settings-tab-active', k === id);
      }
    };

    for (const { id, icon, label } of PANES) {
      const tab = tabBar.createEl('button', { cls: 'col-settings-tab' });
      tab.createEl('span', { cls: 'col-settings-tab-icon', text: icon });
      tab.createEl('span', { cls: 'col-settings-tab-label', text: label });
      tab.addEventListener('click', () => switchPane(id));
      tabEls[id] = tab;
      paneEls[id] = body.createDiv({ cls: 'col-settings-pane' });
    }

    this.buildGeneral(paneEls['general'] as HTMLElement);
    this.buildGames(paneEls['games'] as HTMLElement);
    this.buildPrices(paneEls['prices'] as HTMLElement);

    switchPane(this.activePane);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private panelHeader(el: HTMLElement, text: string) {
    el.createEl('h3', { cls: 'col-settings-panel-title', text });
  }

  // ── General ───────────────────────────────────────────────────────────────────

  private buildGeneral(el: HTMLElement) {
    this.panelHeader(el, 'Collections');

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

    this.panelHeader(el, 'Display');

    new Setting(el)
      .setName('Card view in files')
      .setDesc('Show collection cards as visual tiles in reading mode. Disable to show the raw table.')
      .addToggle(t =>
        t.setValue(this.plugin.settings.cardViewInFiles)
          .onChange(async v => {
            this.plugin.settings.cardViewInFiles = v;
            await this.plugin.saveSettings();
          })
      );
  }

  // ── Games ─────────────────────────────────────────────────────────────────────

  private buildGames(el: HTMLElement) {
    this.panelHeader(el, 'TCG Games');

    el.createEl('p', {
      cls: 'col-settings-desc',
      text: 'Choose which games appear as tabs in the New Collection wizard. Disabled games are hidden — their existing collections are not affected.',
    });

    // Ensure enabledGames exists (migration safety)
    if (!this.plugin.settings.enabledGames) {
      this.plugin.settings.enabledGames = { mtg: true, pokemon: true, onepiece: true, yugioh: true };
    }

    for (const game of GAME_ORDER) {
      const meta = GAME_META[game];
      new Setting(el)
        .setName(`${meta.icon}  ${meta.label}`)
        .setDesc(meta.desc)
        .addToggle(t =>
          t.setValue(this.plugin.settings.enabledGames[game] ?? true)
            .onChange(async v => {
              this.plugin.settings.enabledGames[game] = v;
              await this.plugin.saveSettings();
            })
        );
    }
  }

  // ── Prices ────────────────────────────────────────────────────────────────────

  private buildPrices(el: HTMLElement) {
    this.panelHeader(el, 'Price Source');

    el.createEl('p', {
      cls: 'col-settings-desc',
      text: 'Choose where to fetch card prices. If a provider has no API key configured, Scryfall USD is used as fallback.',
    });

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
    this.panelHeader(tcgSection, 'TCGPlayer');
    tcgSection.createEl('p', {
      cls: 'col-settings-desc',
      text: 'Get your public API key at developer.tcgplayer.com. Uses market price (USD).',
    });
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
    this.panelHeader(cmSection, 'Cardmarket');
    cmSection.createEl('p', {
      cls: 'col-settings-desc',
      text: 'OAuth 1.0a credentials from your Cardmarket developer account. Uses TREND price (EUR).',
    });
    for (const [key, label, placeholder] of [
      ['cardmarketAppToken',    'App token',          'App token'],
      ['cardmarketAppSecret',   'App secret',         'App secret'],
      ['cardmarketAccessToken', 'Access token',       'Access token'],
      ['cardmarketAccessSecret','Access token secret','Access token secret'],
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
}
