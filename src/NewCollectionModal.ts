import { App, Modal, Notice, Setting, TFile, normalizePath } from 'obsidian';
import type CollectorsPlugin from './main';
import { CollectionFormat, CollectionType } from './types';
import { fetchSetCards, fetchSearchCards, cardToMarkdownRows, parseScryfallInput } from './ScryfallService';
import { appendCards, patchFrontmatter } from './parser';

type TCGGame = 'mtg' | 'pokemon' | 'onepiece' | 'yugioh';

interface GameConfig {
  label: string;
  icon: string;
  accent: string;
  bg: string;
  tagline: string;
}

const GAMES: Record<TCGGame, GameConfig> = {
  mtg: {
    label: 'MTG',
    icon: '✦',
    accent: '#bf9b30',
    bg: 'linear-gradient(135deg, #1a1209 0%, #2e1f0a 100%)',
    tagline: '',
  },
  pokemon: {
    label: 'Pokémon',
    icon: '⚡',
    accent: '#FFCB05',
    bg: 'linear-gradient(135deg, #CC0000 0%, #3B4CCA 100%)',
    tagline: 'Gotta catch \'em all',
  },
  onepiece: {
    label: 'One Piece',
    icon: '☠',
    accent: '#F7941D',
    bg: 'linear-gradient(135deg, #0d0d0d 0%, #8B0000 60%, #D62229 100%)',
    tagline: 'I\'m gonna be King of the Pirates',
  },
  yugioh: {
    label: 'Yu-Gi-Oh!',
    icon: '👁',
    accent: '#C9A44A',
    bg: 'linear-gradient(135deg, #0a0014 0%, #1a0a2e 60%, #3d1a6e 100%)',
    tagline: 'It\'s time to duel',
  },
};

const GAME_ORDER: TCGGame[] = ['mtg', 'pokemon', 'onepiece', 'yugioh'];

const TYPE_LABELS: Record<CollectionType, string> = {
  'mtg-set': 'MTG Set / Product',
  'mtg-theme': 'MTG Theme Collection',
  'custom': 'Custom Collection',
};

const TABLE_HEADERS: Record<CollectionType, string> = {
  'mtg-set':
    '| ¿La tengo? | Imagen | Nombre | Tipo | Rareza | Set | Número | Notas |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  'mtg-theme':
    '| In Collection | Image | Name | Type | Rarity | Set | Number | Notes |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  'custom':
    '| In Collection | Image | Name | Type | Category | Set | Number | Notes |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
};

export class NewCollectionModal extends Modal {
  plugin: CollectorsPlugin;
  onCreated: () => void;

  private activeGame: TCGGame = 'mtg';
  private gameContentEl!: HTMLElement;
  private tabEls: Map<TCGGame, HTMLElement> = new Map();

  // MTG form state
  private name = '';
  private type: CollectionType = 'mtg-set';
  private setCode = '';
  private finishImport: 'all' | 'foil' | 'nonfoil' = 'all';
  private allPrints = true;
  private scryfallQuery = '';
  private scryfallOrder = 'released';
  private autoFetch = true;
  private autoUpdate = false;
  private format: CollectionFormat = 'paper';

  constructor(app: App, plugin: CollectorsPlugin, onCreated: () => void) {
    super(app);
    this.plugin = plugin;
    this.onCreated = onCreated;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ncm-modal');

    contentEl.createEl('h2', { cls: 'ncm-title', text: 'New Collection' });

    // ── Game tab bar ───────────────────────────────────────────────────────────
    const tabBar = contentEl.createDiv({ cls: 'ncm-tab-bar' });

    for (const game of GAME_ORDER) {
      const cfg = GAMES[game];
      const tab = tabBar.createEl('button', {
        cls: `ncm-tab ncm-tab-${game}${game === this.activeGame ? ' ncm-tab-active' : ''}`,
      });
      tab.createEl('span', { cls: 'ncm-tab-icon', text: cfg.icon });
      tab.createEl('span', { cls: 'ncm-tab-label', text: cfg.label });

      tab.addEventListener('click', () => {
        if (this.activeGame === game) return;
        this.tabEls.get(this.activeGame)?.removeClass('ncm-tab-active');
        this.activeGame = game;
        tab.addClass('ncm-tab-active');
        this.renderGameContent();
      });

      this.tabEls.set(game, tab);
    }

    // ── Content area ───────────────────────────────────────────────────────────
    this.gameContentEl = contentEl.createDiv({ cls: 'ncm-content' });
    this.renderGameContent();
  }

  onClose() {
    this.contentEl.empty();
  }

  private renderGameContent() {
    this.gameContentEl.empty();
    this.gameContentEl.className = `ncm-content ncm-content-${this.activeGame}`;

    if (this.activeGame === 'mtg') {
      this.renderMTGForm(this.gameContentEl);
    } else {
      this.renderComingSoon(this.gameContentEl, this.activeGame);
    }
  }

  // ── MTG form ────────────────────────────────────────────────────────────────

  private renderMTGForm(el: HTMLElement) {
    new Setting(el)
      .setName('Collection name')
      .setDesc('Display name for this collection')
      .addText(t =>
        t.setPlaceholder('e.g. Bloomburrow Token Boosters')
          .setValue(this.name)
          .onChange(v => (this.name = v.trim()))
      );

    const setCodeSetting = new Setting(el)
      .setName('Set code')
      .setDesc('Scryfall set code (e.g. blb, tblb). Used to auto-fetch cards.')
      .addText(t =>
        t.setPlaceholder('e.g. tblb')
          .setValue(this.setCode)
          .onChange(v => (this.setCode = v.trim().toLowerCase()))
      );

    const finishSetting = new Setting(el)
      .setName('Print finish')
      .setDesc('Which finish to import from this set.')
      .addDropdown(d => {
        d.addOption('all',     'All');
        d.addOption('nonfoil', 'Non-foil only');
        d.addOption('foil',    'Foil only');
        d.setValue(this.finishImport);
        d.onChange(v => (this.finishImport = v as 'all' | 'foil' | 'nonfoil'));
      });

    const allPrintsSetting = new Setting(el)
      .setName('All printed cards')
      .setDesc('Include all variants: showcase, borderless, extended art, etc. Turn off to import only the main set list.')
      .addToggle(t => t.setValue(this.allPrints).onChange(v => (this.allPrints = v)));

    const queryWrap = el.createDiv({ cls: 'nm-query-wrap' });
    queryWrap.style.display = 'none';

    const previewEl = queryWrap.createEl('div', { cls: 'nm-query-preview' });
    previewEl.style.display = 'none';

    new Setting(queryWrap)
      .setName('Scryfall query or URL')
      .setDesc('Paste a Scryfall search URL or type a query directly. Add game:paper to exclude digital-only cards.')
      .addTextArea(t => {
        t.setPlaceholder('Query: type:turtle game:paper\n\nURL: https://scryfall.com/search?q=...');
        t.inputEl.rows = 3;
        t.inputEl.addClass('nm-query-input');
        t.onChange(raw => {
          const parsed = parseScryfallInput(raw);
          this.scryfallQuery = parsed.query;
          this.scryfallOrder = parsed.order ?? 'released';
          previewEl.textContent = parsed.query
            ? `Query: ${parsed.query}${parsed.order ? `  |  order: ${parsed.order}` : ''}`
            : '';
          previewEl.style.display = parsed.query ? '' : 'none';
        });
      });

    // move preview below the textarea
    queryWrap.appendChild(previewEl);

    const autoFetchSetting = new Setting(el)
      .setName('Auto-fetch cards from Scryfall')
      .setDesc('Populate collection with cards from Scryfall after creation.')
      .addToggle(t => t.setValue(this.autoFetch).onChange(v => (this.autoFetch = v)));

    const autoUpdateSetting = new Setting(el)
      .setName('Auto-update')
      .setDesc('Check for new cards on Scryfall every time the dashboard opens. Ideal for theme collections.')
      .addToggle(t => t.setValue(this.autoUpdate).onChange(v => (this.autoUpdate = v)));
    autoUpdateSetting.settingEl.style.display = 'none';

    new Setting(el)
      .setName('Type')
      .addDropdown(d => {
        for (const [val, label] of Object.entries(TYPE_LABELS)) {
          d.addOption(val, label);
        }
        d.setValue(this.type);
        d.onChange(v => {
          this.type = v as CollectionType;
          const isSet = this.type === 'mtg-set';
          setCodeSetting.settingEl.style.display    = isSet ? '' : 'none';
          finishSetting.settingEl.style.display      = isSet ? '' : 'none';
          allPrintsSetting.settingEl.style.display   = isSet ? '' : 'none';
          queryWrap.style.display                    = isSet ? 'none' : '';
          autoUpdateSetting.settingEl.style.display  = isSet ? 'none' : '';
        });
      });

    new Setting(el)
      .setName('Format')
      .setDesc('Physical cards or MTG Arena digital.')
      .addDropdown(d => {
        d.addOption('paper', '🃏 Paper');
        d.addOption('arena', '🖥 MTG Arena');
        d.setValue(this.format);
        d.onChange(v => (this.format = v as CollectionFormat));
      });

    new Setting(el)
      .addButton(btn => btn.setButtonText('Create').setCta().onClick(() => this.create()))
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
  }

  // ── Coming soon ─────────────────────────────────────────────────────────────

  private renderComingSoon(el: HTMLElement, game: TCGGame) {
    const cfg = GAMES[game];

    const screen = el.createDiv({ cls: `ncm-soon ncm-soon-${game}` });
    screen.style.background = cfg.bg;

    const inner = screen.createDiv({ cls: 'ncm-soon-inner' });
    inner.createEl('div', { cls: 'ncm-soon-icon', text: cfg.icon });
    inner.createEl('h3', { cls: 'ncm-soon-name', text: cfg.label }).style.color = cfg.accent;
    inner.createEl('p', { cls: 'ncm-soon-badge', text: 'Coming soon · Próximamente' });
    if (cfg.tagline) {
      inner.createEl('p', { cls: 'ncm-soon-tagline', text: `"${cfg.tagline}"` });
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  private async create() {
    if (!this.name) {
      new Notice('Collection name is required.');
      return;
    }

    const folder = this.plugin.settings.collectionsFolder;
    const filename = this.name.replace(/[\\/:*?"<>|]/g, '-') + '.md';
    const path = normalizePath(folder ? `${folder}/${filename}` : filename);

    if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) {
      new Notice(`File already exists: ${path}`);
      return;
    }

    const isSet = this.type === 'mtg-set';
    const needsFetch = this.autoFetch && (isSet ? !!this.setCode : !!this.scryfallQuery);

    const fmLines = [
      '---',
      `cssclasses: collectors-file`,
      `plugin-version: ${this.plugin.manifest.version}`,
      `collection-type: ${this.type}`,
      `collection-format: ${this.format}`,
      `collection-name: ${this.name}`,
      isSet && this.setCode ? `set-code: ${this.setCode.toUpperCase()}` : '',
      isSet ? `finish-import: ${this.finishImport}` : '',
      isSet ? `all-prints: ${this.allPrints}` : '',
      !isSet && this.scryfallQuery ? `scryfall-query: ${this.scryfallQuery}` : '',
      !isSet && this.scryfallOrder && this.scryfallOrder !== 'released' ? `scryfall-order: ${this.scryfallOrder}` : '',
      this.autoUpdate ? 'auto-update: true' : '',
      '---',
    ].filter(Boolean);

    const content = `${fmLines.join('\n')}\n\n${TABLE_HEADERS[this.type]}\n`;

    try {
      if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
      const file = await this.app.vault.create(path, content);
      this.close();

      if (needsFetch) {
        await this.fetchAndPopulate(file, isSet);
      }

      this.onCreated();
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (e) {
      new Notice(`Failed to create collection: ${(e as Error).message}`);
    }
  }

  private async fetchAndPopulate(file: TFile, isSet: boolean) {
    new Notice('Fetching cards from Scryfall...');
    try {
      const cards = isSet
        ? await fetchSetCards(
            this.setCode,
            p => new Notice(`Fetching page ${p}...`),
            this.allPrints ? 'prints' : 'cards'
          )
        : await fetchSearchCards(
            this.scryfallQuery,
            p => new Notice(`Fetching page ${p}...`),
            this.scryfallOrder
          );

      const finish = this.finishImport;
      const rows = cards.flatMap(card => {
        if (finish === 'all') return cardToMarkdownRows(card);
        const filtered = { ...card, finishes: card.finishes.filter(f => f === finish) };
        return cardToMarkdownRows(filtered);
      });

      const added = await appendCards(file, rows, this.app.vault);
      const today = new Date().toISOString().slice(0, 10);
      await patchFrontmatter(file, 'last-fetched', today, this.app.vault);
      new Notice(`Added ${added} cards to "${this.name}".`);
    } catch (e) {
      new Notice(`Scryfall fetch failed: ${(e as Error).message}`);
    }
  }
}
