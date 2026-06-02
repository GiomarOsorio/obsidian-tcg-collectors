import { App, Modal, Notice, Setting, TFile, normalizePath } from 'obsidian';
import type CollectorsPlugin from './main';
import { CollectionFormat, CollectionType, PokemonVariantImport, type TCGGame, type Collection } from './types';
import { fetchSetCards, fetchSearchCards, cardToMarkdownRows, parseScryfallInput } from './ScryfallService';
import { fetchPokemonSetCards, pokemonCardToMarkdownRows, fetchAllSets, TCGDexSetBrief } from './TCGDexService';
import { appendCards, patchFrontmatter, replaceFrontmatter, yamlStr, extractOwnedMap, clearCardRows, applyOwnedStates } from './parser';
import { t } from './i18n';

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

const MTG_TYPE_LABELS = (): Partial<Record<CollectionType, string>> => ({
  'mtg-set':   t('type_mtg_set'),
  'mtg-theme': t('type_mtg_theme'),
});

const TABLE_HEADER =
  '| Owned | Image | Name | Type | Rarity | Set | Number | Notes |\n' +
  '| --- | --- | --- | --- | --- | --- | --- | --- |';

export class NewCollectionModal extends Modal {
  plugin: CollectorsPlugin;
  onCreated: () => void;
  private editTarget?: { collection: Collection; file: TFile };

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

  // Pokémon form state
  private tcgdexSetId = '';
  private pokemonFormType: 'catalog' | 'custom' = 'catalog';
  private pokemonVariantImport: PokemonVariantImport = 'all';

  // Originals for change-detection in edit mode
  private originalSetCode       = '';
  private originalScryfallQuery = '';
  private originalTcgdexSetId   = '';

  constructor(
    app: App,
    plugin: CollectorsPlugin,
    onCreated: () => void,
    editTarget?: { collection: Collection; file: TFile }
  ) {
    super(app);
    this.plugin = plugin;
    this.onCreated = onCreated;
    if (editTarget) {
      this.editTarget = editTarget;
      const c = editTarget.collection;
      this.name          = c.name;
      this.type          = c.type;
      this.format        = c.format ?? 'paper';
      this.setCode       = c.setCode?.toLowerCase() ?? '';
      this.finishImport  = c.finishImport ?? 'all';
      this.allPrints     = c.allPrints ?? true;
      this.scryfallQuery = c.scryfallQuery ?? '';
      this.scryfallOrder = c.scryfallOrder ?? 'released';
      this.autoUpdate    = c.autoUpdate;
      this.autoFetch     = false;
      this.tcgdexSetId          = c.tcgdexSetId ?? '';
      this.pokemonVariantImport = c.pokemonVariantImport ?? 'all';
      this.originalSetCode       = this.setCode;
      this.originalScryfallQuery = this.scryfallQuery;
      this.originalTcgdexSetId   = this.tcgdexSetId;
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ncm-modal');

    contentEl.createEl('h2', { cls: 'ncm-title', text: this.editTarget ? t('modal_edit_title') : t('modal_new_title') });

    const enabledGames = this.plugin.settings.enabledGames ?? {};
    let visibleGames = GAME_ORDER.filter(g => enabledGames[g] !== false);

    // In edit mode only show the game that owns this collection
    if (this.editTarget) {
      const editGame: TCGGame = this.editTarget.collection.type.startsWith('pokemon') ? 'pokemon' : 'mtg';
      visibleGames = visibleGames.filter(g => g === editGame);
    }

    // Default to first visible game
    if (!visibleGames.includes(this.activeGame)) {
      this.activeGame = visibleGames[0] ?? 'mtg';
    }

    // ── Game tab bar (hidden when only one game enabled) ───────────────────────
    if (visibleGames.length > 1) {
      const tabBar = contentEl.createDiv({ cls: 'ncm-tab-bar' });

      for (const game of visibleGames) {
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
    } else if (this.activeGame === 'pokemon') {
      this.renderPokemonForm(this.gameContentEl);
    } else {
      this.renderComingSoon(this.gameContentEl, this.activeGame);
    }
  }

  // ── MTG form ────────────────────────────────────────────────────────────────

  private renderMTGForm(el: HTMLElement) {
    new Setting(el)
      .setName(t('field_name'))
      .setDesc(t('field_name_desc'))
      .addText(tx =>
        tx.setPlaceholder(t('field_name_placeholder'))
          .setValue(this.name)
          .onChange(v => (this.name = v.trim()))
      );

    let autoFetchToggleComp: any = null;
    let refetchWarning: HTMLElement | null = null;

    const syncRefetch = () => {
      const changed = this.setCode !== this.originalSetCode
                   || this.scryfallQuery !== this.originalScryfallQuery;
      this.autoFetch = changed;
      autoFetchToggleComp?.setValue(changed);
      if (refetchWarning) refetchWarning.style.display = changed ? '' : 'none';
    };

    const setCodeSetting = new Setting(el)
      .setName(t('field_set_code'))
      .setDesc(t('field_set_code_desc'))
      .addText(tx =>
        tx.setPlaceholder(t('field_set_code_ph'))
          .setValue(this.setCode)
          .onChange(v => {
            this.setCode = v.trim().toLowerCase();
            if (this.editTarget) syncRefetch();
          })
      );

    const finishSetting = new Setting(el)
      .setName(t('field_finish'))
      .setDesc(t('field_finish_desc'))
      .addDropdown(d => {
        d.addOption('all',     t('finish_all'));
        d.addOption('nonfoil', t('finish_nonfoil'));
        d.addOption('foil',    t('finish_foil_only'));
        d.setValue(this.finishImport);
        d.onChange(v => (this.finishImport = v as 'all' | 'foil' | 'nonfoil'));
      });

    const allPrintsSetting = new Setting(el)
      .setName(t('field_all_prints'))
      .setDesc(t('field_all_prints_desc'))
      .addToggle(tx => tx.setValue(this.allPrints).onChange(v => (this.allPrints = v)));

    const queryWrap = el.createDiv({ cls: 'nm-query-wrap' });
    queryWrap.style.display = 'none';

    const previewEl = queryWrap.createEl('div', { cls: 'nm-query-preview' });
    previewEl.style.display = 'none';

    new Setting(queryWrap)
      .setName(t('field_query'))
      .setDesc(t('field_query_desc'))
      .addTextArea(tx => {
        tx.setPlaceholder(t('field_query_ph'));
        tx.inputEl.rows = 3;
        tx.inputEl.addClass('nm-query-input');
        if (this.scryfallQuery) {
          tx.setValue(this.scryfallQuery);
          previewEl.textContent = `Query: ${this.scryfallQuery}`;
          previewEl.style.display = '';
        }
        tx.onChange(raw => {
          const parsed = parseScryfallInput(raw);
          this.scryfallQuery = parsed.query;
          this.scryfallOrder = parsed.order ?? 'released';
          previewEl.textContent = parsed.query
            ? `Query: ${parsed.query}${parsed.order ? `  |  order: ${parsed.order}` : ''}`
            : '';
          previewEl.style.display = parsed.query ? '' : 'none';
          if (this.editTarget) syncRefetch();
        });
      });

    // move preview below the textarea
    queryWrap.appendChild(previewEl);

    const autoFetchSetting = new Setting(el)
      .setName(this.editTarget ? t('field_refetch') : t('field_autofetch'))
      .setDesc(this.editTarget ? t('field_refetch_desc') : t('field_autofetch_desc'))
      .addToggle(tx => {
        autoFetchToggleComp = tx;
        tx.setValue(this.autoFetch).onChange(v => {
          this.autoFetch = v;
          if (refetchWarning) refetchWarning.style.display = v ? '' : 'none';
        });
      });

    if (this.editTarget) {
      refetchWarning = el.createDiv({ cls: 'ncm-refetch-warning' });
      refetchWarning.style.display = this.autoFetch ? '' : 'none';
      refetchWarning.setText(t('refetch_warning'));
    }

    const autoUpdateSetting = new Setting(el)
      .setName(t('field_auto_update'))
      .setDesc(t('field_auto_update_desc'))
      .addToggle(tx => tx.setValue(this.autoUpdate).onChange(v => (this.autoUpdate = v)));
    autoUpdateSetting.settingEl.style.display = 'none';

    new Setting(el)
      .setName(t('field_type'))
      .addDropdown(d => {
        for (const [val, label] of Object.entries(MTG_TYPE_LABELS())) {
          d.addOption(val, label);
        }
        d.setValue(this.type);

        const applyVisibility = (type: CollectionType) => {
          const isSet = type === 'mtg-set';
          setCodeSetting.settingEl.style.display   = isSet ? '' : 'none';
          finishSetting.settingEl.style.display     = isSet ? '' : 'none';
          allPrintsSetting.settingEl.style.display  = isSet ? '' : 'none';
          queryWrap.style.display                   = isSet ? 'none' : '';
          autoUpdateSetting.settingEl.style.display = isSet ? 'none' : '';
        };

        applyVisibility(this.type);
        d.onChange(v => { this.type = v as CollectionType; applyVisibility(this.type); });
      });

    new Setting(el)
      .setName(t('field_format'))
      .setDesc(t('field_format_desc'))
      .addDropdown(d => {
        d.addOption('paper', t('format_paper'));
        d.addOption('arena', t('format_arena'));
        d.setValue(this.format);
        d.onChange(v => (this.format = v as CollectionFormat));
      });

    new Setting(el)
      .addButton(btn => btn
        .setButtonText(this.editTarget ? t('btn_save') : t('btn_create'))
        .setCta()
        .onClick(() => this.editTarget ? this.save() : this.create())
      )
      .addButton(btn => btn.setButtonText(t('btn_cancel')).onClick(() => this.close()));
  }

  // ── Pokémon form ────────────────────────────────────────────────────────────

  private renderPokemonForm(el: HTMLElement) {
    let nameInputEl: HTMLInputElement | null = null;
    let pokemonRefetchWarning: HTMLElement | null = null;

    const syncPokemonRefetch = () => {
      const changed = this.tcgdexSetId !== this.originalTcgdexSetId;
      this.autoFetch = changed;
      if (pokemonRefetchWarning) pokemonRefetchWarning.style.display = changed ? '' : 'none';
    };

    new Setting(el)
      .setName(t('field_name'))
      .setDesc(t('field_name_desc'))
      .addText(tx => {
        tx.setPlaceholder(t('field_name_ph_pokemon'))
          .setValue(this.name)
          .onChange(v => (this.name = v.trim()));
        nameInputEl = tx.inputEl;
      });

    // Type toggle: catalog vs custom
    const typeWrap = el.createDiv({ cls: 'ncm-pokemon-type-toggle' });
    const catalogBtn = typeWrap.createEl('button', {
      cls: `ncm-type-btn${this.pokemonFormType === 'catalog' ? ' ncm-type-btn-active' : ''}`,
      text: t('pokemon_form_type_catalog'),
    });
    const customBtn = typeWrap.createEl('button', {
      cls: `ncm-type-btn${this.pokemonFormType === 'custom' ? ' ncm-type-btn-active' : ''}`,
      text: t('pokemon_form_type_custom'),
    });

    const catalogSection = el.createDiv({ cls: 'ncm-pokemon-catalog' });
    const customSection  = el.createDiv({ cls: 'ncm-pokemon-custom'  });
    if (this.pokemonFormType === 'custom') catalogSection.style.display = 'none';
    else customSection.style.display = 'none';

    this.renderSetCatalog(catalogSection, () => nameInputEl, () => {
      if (this.editTarget) syncPokemonRefetch();
    });

    new Setting(customSection)
      .setName(t('field_tcgdex_set_id'))
      .setDesc(t('field_tcgdex_set_id_desc'))
      .addText(tx =>
        tx.setPlaceholder(t('field_tcgdex_set_id_ph'))
          .setValue(this.tcgdexSetId)
          .onChange(v => {
            this.tcgdexSetId = v.trim().toLowerCase();
            if (this.editTarget) syncPokemonRefetch();
          })
      );

    if (this.editTarget) {
      pokemonRefetchWarning = el.createDiv({ cls: 'ncm-refetch-warning' });
      pokemonRefetchWarning.style.display = 'none';
      pokemonRefetchWarning.setText(t('refetch_warning_pokemon'));
    }

    catalogBtn.addEventListener('click', () => {
      this.pokemonFormType = 'catalog';
      catalogBtn.addClass('ncm-type-btn-active');
      customBtn.removeClass('ncm-type-btn-active');
      catalogSection.style.display = '';
      customSection.style.display = 'none';
    });
    customBtn.addEventListener('click', () => {
      this.pokemonFormType = 'custom';
      customBtn.addClass('ncm-type-btn-active');
      catalogBtn.removeClass('ncm-type-btn-active');
      customSection.style.display = '';
      catalogSection.style.display = 'none';
    });

    new Setting(el)
      .setName(t('field_pokemon_variant'))
      .setDesc(t('field_pokemon_variant_desc'))
      .addDropdown(d => {
        d.addOption('all',                     t('pokemon_variant_all'));
        d.addOption('normal',                  t('pokemon_variant_normal'));
        d.addOption('reverse',                 t('pokemon_variant_reverse'));
        d.addOption('holo',                    t('pokemon_variant_holo'));
        d.addOption('firstEdition',            t('pokemon_variant_first_edition'));
        d.addOption('rareHolo',                t('pokemon_variant_rare_holo'));
        d.addOption('radiantRare',             t('pokemon_variant_radiant_rare'));
        d.addOption('illustrationRare',        t('pokemon_variant_illustration_rare'));
        d.addOption('doubleRare',              t('pokemon_variant_double_rare'));
        d.addOption('ultraRare',               t('pokemon_variant_ultra_rare'));
        d.addOption('specialIllustrationRare', t('pokemon_variant_special_illustration_rare'));
        d.addOption('hyperRare',               t('pokemon_variant_hyper_rare'));
        d.addOption('rainbowAlt',              t('pokemon_variant_rainbow_alt'));
        d.setValue(this.pokemonVariantImport);
        d.onChange(v => (this.pokemonVariantImport = v as PokemonVariantImport));
      });

    new Setting(el)
      .addButton(btn => btn
        .setButtonText(this.editTarget ? t('btn_save') : t('btn_create'))
        .setCta()
        .onClick(() => this.editTarget ? this.savePokemon() : this.createPokemon())
      )
      .addButton(btn => btn.setButtonText(t('btn_cancel')).onClick(() => this.close()));
  }

  private renderSetCatalog(
    el: HTMLElement,
    getNameInput: () => HTMLInputElement | null,
    onSetSelected?: () => void,
  ) {
    const searchInput = el.createEl('input', {
      cls: 'ncm-set-search',
      attr: { type: 'text', placeholder: t('pokemon_set_search_ph') },
    });
    const listEl = el.createDiv({ cls: 'ncm-set-list' });
    listEl.createDiv({ cls: 'ncm-set-status', text: t('pokemon_set_loading') });

    fetchAllSets().then((sets: TCGDexSetBrief[]) => {
      // Newest first
      const sorted = [...sets].sort((a, b) => {
        if (a.releaseDate && b.releaseDate) return b.releaseDate.localeCompare(a.releaseDate);
        return a.name.localeCompare(b.name);
      });

      const paint = (query: string) => {
        listEl.empty();
        const q = query.toLowerCase();
        const filtered = q
          ? sorted.filter(s =>
              s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) ||
              s.serie?.name.toLowerCase().includes(q))
          : sorted;

        if (filtered.length === 0) {
          listEl.createDiv({ cls: 'ncm-set-status', text: t('pokemon_set_no_results') });
          return;
        }

        for (const set of filtered) {
          const isSelected = this.tcgdexSetId === set.id;
          const item = listEl.createDiv({ cls: `ncm-set-item${isSelected ? ' ncm-set-item-selected' : ''}` });
          item.createEl('span', { cls: 'ncm-set-name', text: set.name });
          const meta = item.createDiv({ cls: 'ncm-set-meta' });
          if (set.serie) meta.createEl('span', { cls: 'ncm-set-serie', text: set.serie.name });
          meta.createEl('code', { cls: 'ncm-set-id', text: set.id });
          if (set.cardCount?.total) {
            meta.createEl('span', { cls: 'ncm-set-count', text: t('pokemon_set_card_count', { count: set.cardCount.total }) });
          }

          item.addEventListener('click', () => {
            this.tcgdexSetId = set.id;
            if (!this.name) {
              this.name = set.name;
              const inp = getNameInput();
              if (inp) inp.value = set.name;
            }
            listEl.querySelectorAll('.ncm-set-item').forEach(el => el.removeClass('ncm-set-item-selected'));
            item.addClass('ncm-set-item-selected');
            onSetSelected?.();
          });
        }

        if (this.tcgdexSetId) {
          listEl.querySelector<HTMLElement>('.ncm-set-item-selected')?.scrollIntoView({ block: 'nearest' });
        }
      };

      paint('');
      searchInput.addEventListener('input', () => paint(searchInput.value));
    }).catch(() => {
      listEl.empty();
      listEl.createDiv({ cls: 'ncm-set-status', text: t('pokemon_set_load_failed') });
    });
  }

  // ── Coming soon ─────────────────────────────────────────────────────────────

  private renderComingSoon(el: HTMLElement, game: TCGGame) {
    const cfg = GAMES[game];

    const screen = el.createDiv({ cls: `ncm-soon ncm-soon-${game}` });
    screen.style.background = cfg.bg;

    const inner = screen.createDiv({ cls: 'ncm-soon-inner' });
    inner.createEl('div', { cls: 'ncm-soon-icon', text: cfg.icon });
    inner.createEl('h3', { cls: 'ncm-soon-name', text: cfg.label }).style.color = cfg.accent;
    inner.createEl('p', { cls: 'ncm-soon-badge', text: t('coming_soon') });
    if (cfg.tagline) {
      inner.createEl('p', { cls: 'ncm-soon-tagline', text: `"${cfg.tagline}"` });
    }
  }

  // ── Save (edit mode) ────────────────────────────────────────────────────────

  private async save() {
    if (!this.name) { new Notice(t('notice_name_required')); return; }
    const { file } = this.editTarget!;
    const isSet = this.type === 'mtg-set';

    const fmLines = [
      '---',
      `cssclasses: collectors-file`,
      `plugin-version: ${this.plugin.manifest.version}`,
      `collection-type: ${this.type}`,
      `collection-format: ${this.format}`,
      `collection-name: ${yamlStr(this.name)}`,
      isSet && this.setCode ? `set-code: ${this.setCode.toUpperCase()}` : '',
      isSet ? `finish-import: ${this.finishImport}` : '',
      isSet ? `all-prints: ${this.allPrints}` : '',
      !isSet && this.scryfallQuery ? `scryfall-query: ${this.scryfallQuery}` : '',
      !isSet && this.scryfallOrder && this.scryfallOrder !== 'released' ? `scryfall-order: ${this.scryfallOrder}` : '',
      this.autoUpdate ? 'auto-update: true' : '',
      '---',
    ].filter(Boolean);

    try {
      await replaceFrontmatter(file, fmLines, this.app.vault);
      new Notice(t('notice_saved'));
      this.close();
      if (this.autoFetch && (isSet ? !!this.setCode : !!this.scryfallQuery)) {
        await this.refetchWithPreservation(file, isSet);
      }
      this.onCreated();
    } catch (e) {
      new Notice(t('notice_save_failed', { error: (e as Error).message }));
    }
  }

  // ── Re-fetch with ownership preservation (edit mode) ────────────────────────

  private async refetchWithPreservation(file: TFile, isSet: boolean) {
    const content = await this.app.vault.read(file);
    const previousOwned = extractOwnedMap(content);

    new Notice(t('notice_fetching_for', { name: this.name }));
    try {
      const cards = isSet
        ? await fetchSetCards(
            this.setCode,
            p => new Notice(t('notice_fetching_page', { page: p })),
            this.allPrints ? 'prints' : 'cards'
          )
        : await fetchSearchCards(
            this.scryfallQuery,
            p => new Notice(t('notice_fetching_page', { page: p })),
            this.scryfallOrder
          );

      const finish = this.finishImport;
      const rawRows = cards.flatMap(card => {
        if (finish === 'all') return cardToMarkdownRows(card);
        const filtered = { ...card, finishes: card.finishes.filter(f => f === finish) };
        return cardToMarkdownRows(filtered);
      });

      const restoredRows = applyOwnedStates(rawRows, previousOwned);
      const preservedCount = restoredRows.filter((r, i) => r !== rawRows[i]).length;

      await clearCardRows(file, this.app.vault);
      await appendCards(file, restoredRows, this.app.vault);

      const today = new Date().toISOString().slice(0, 10);
      await patchFrontmatter(file, 'last-fetched', today, this.app.vault);

      const msg = previousOwned.size > 0
        ? t('notice_reimported', { count: restoredRows.length, preserved: preservedCount, total: previousOwned.size })
        : t('notice_reimported_simple', { count: restoredRows.length });
      new Notice(msg);
    } catch (e) {
      new Notice(t('notice_fetch_failed', { error: (e as Error).message }));
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  private async create() {
    if (!this.name) {
      new Notice(t('notice_name_required'));
      return;
    }

    const folder = this.plugin.settings.collectionsFolder;
    const filename = this.name.replace(/[\\/:*?"<>|]/g, '-') + '.collection';
    const path = normalizePath(folder ? `${folder}/${filename}` : filename);

    if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) {
      new Notice(t('notice_file_exists', { path }));
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
      `collection-name: ${yamlStr(this.name)}`,
      isSet && this.setCode ? `set-code: ${this.setCode.toUpperCase()}` : '',
      isSet ? `finish-import: ${this.finishImport}` : '',
      isSet ? `all-prints: ${this.allPrints}` : '',
      !isSet && this.scryfallQuery ? `scryfall-query: ${this.scryfallQuery}` : '',
      !isSet && this.scryfallOrder && this.scryfallOrder !== 'released' ? `scryfall-order: ${this.scryfallOrder}` : '',
      this.autoUpdate ? 'auto-update: true' : '',
      '---',
    ].filter(Boolean);

    const content = `${fmLines.join('\n')}\n\n${TABLE_HEADER}\n`;

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
      new Notice(t('notice_create_failed', { error: (e as Error).message }));
    }
  }

  // ── Pokémon create / save ────────────────────────────────────────────────────

  private pokemonFrontmatter(): string[] {
    return [
      '---',
      `cssclasses: collectors-file`,
      `plugin-version: ${this.plugin.manifest.version}`,
      `collection-type: pokemon-set`,
      `collection-name: ${yamlStr(this.name)}`,
      this.tcgdexSetId ? `tcgdex-set-id: ${this.tcgdexSetId}` : '',
      this.pokemonVariantImport !== 'all' ? `pokemon-variant-import: ${this.pokemonVariantImport}` : '',
      '---',
    ].filter(Boolean);
  }

  private async createPokemon() {
    if (!this.name) { new Notice(t('notice_name_required')); return; }

    const folder = this.plugin.settings.collectionsFolder;
    const filename = this.name.replace(/[\\/:*?"<>|]/g, '-') + '.collection';
    const path = normalizePath(folder ? `${folder}/${filename}` : filename);

    if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) {
      new Notice(t('notice_file_exists', { path })); return;
    }

    const content = `${this.pokemonFrontmatter().join('\n')}\n\n${TABLE_HEADER}\n`;
    try {
      if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
      const file = await this.app.vault.create(path, content);
      this.close();
      if (this.tcgdexSetId) await this.fetchAndPopulatePokemon(file);
      this.onCreated();
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch (e) {
      new Notice(t('notice_create_failed', { error: (e as Error).message }));
    }
  }

  private async savePokemon() {
    if (!this.name) { new Notice(t('notice_name_required')); return; }
    const { file } = this.editTarget!;
    try {
      await replaceFrontmatter(file, this.pokemonFrontmatter(), this.app.vault);
      new Notice(t('notice_saved'));
      this.close();
      if (this.autoFetch && this.tcgdexSetId) {
        const content = await this.app.vault.read(file);
        const previousOwned = extractOwnedMap(content);
        await this.fetchAndPopulatePokemon(file, previousOwned);
      }
      this.onCreated();
    } catch (e) {
      new Notice(t('notice_save_failed', { error: (e as Error).message }));
    }
  }

  private async fetchAndPopulatePokemon(file: TFile, previousOwned?: Map<string, number>) {
    new Notice(t('notice_fetching_pokemon', { name: this.name }));
    try {
      const cards = await fetchPokemonSetCards(
        this.tcgdexSetId,
        (fetched, total) => new Notice(t('notice_fetching_pokemon_progress', { fetched, total }))
      );
      const suffixMap: Record<string, string> = {
        normal: '_n', reverse: '_r', holo: '_h', firstEdition: '_fe',
      };
      const rarityImportMap: Record<string, string> = {
        rareHolo:               'Rare Holo',
        radiantRare:            'Radiant rare',
        illustrationRare:       'Illustration rare',
        doubleRare:             'Double rare',
        ultraRare:              'Ultra Rare',
        specialIllustrationRare:'Special illustration rare',
        hyperRare:              'Hyper rare',
        rainbowAlt:             'Rare Rainbow alt',
      };
      const targetSuffix  = suffixMap[this.pokemonVariantImport] ?? null;
      const targetRarity  = rarityImportMap[this.pokemonVariantImport] ?? null;
      const rawRows = cards.flatMap(pokemonCardToMarkdownRows)
        .filter(row => {
          if (targetSuffix) return row.includes(`${targetSuffix}">`);
          if (targetRarity) return row.toLowerCase().includes(`| ${targetRarity.toLowerCase()} |`);
          return true;
        });
      const rows = previousOwned ? applyOwnedStates(rawRows, previousOwned) : rawRows;

      if (previousOwned) {
        await clearCardRows(file, this.app.vault);
      }
      const added = await appendCards(file, rows, this.app.vault);
      const today = new Date().toISOString().slice(0, 10);
      await patchFrontmatter(file, 'last-fetched', today, this.app.vault);
      new Notice(t('notice_pokemon_added', { count: added, name: this.name }));
    } catch (e) {
      new Notice(t('notice_pokemon_failed', { error: (e as Error).message }));
    }
  }

  private async fetchAndPopulate(file: TFile, isSet: boolean) {
    new Notice(t('notice_fetching_for', { name: this.name }));
    try {
      const cards = isSet
        ? await fetchSetCards(
            this.setCode,
            p => new Notice(t('notice_fetching_page', { page: p })),
            this.allPrints ? 'prints' : 'cards'
          )
        : await fetchSearchCards(
            this.scryfallQuery,
            p => new Notice(t('notice_fetching_page', { page: p })),
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
      new Notice(t('notice_added_to', { count: added, name: this.name }));
    } catch (e) {
      new Notice(t('notice_fetch_failed', { error: (e as Error).message }));
    }
  }
}
