import { App, Modal, Notice, Setting, TFile, normalizePath } from 'obsidian';
import type CollectorsPlugin from './main';
import { CollectionType } from './types';
import { fetchSetCards, fetchSearchCards, cardToMarkdownRows, parseScryfallInput } from './ScryfallService';
import { appendCards } from './parser';

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

  private name = '';
  private type: CollectionType = 'mtg-set';
  private setCode = '';
  private scryfallQuery = '';
  private scryfallOrder = 'released';
  private autoFetch = true;
  private autoUpdate = false;

  constructor(app: App, plugin: CollectorsPlugin, onCreated: () => void) {
    super(app);
    this.plugin = plugin;
    this.onCreated = onCreated;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'New Collection' });

    new Setting(contentEl)
      .setName('Collection name')
      .setDesc('Display name for this collection')
      .addText(t =>
        t.setPlaceholder('e.g. Bloomburrow Token Boosters')
          .onChange(v => (this.name = v.trim()))
      );

    let typeDropdown: ReturnType<typeof this.addTypeDropdown>;

    const setCodeSetting = new Setting(contentEl)
      .setName('Set code')
      .setDesc('Scryfall set code (e.g. blb, tblb). Used to auto-fetch cards.')
      .addText(t =>
        t.setPlaceholder('e.g. tblb')
          .onChange(v => (this.setCode = v.trim().toLowerCase()))
      );

    const queryWrap = contentEl.createDiv({ cls: 'nm-query-wrap' });
    queryWrap.style.display = 'none';

    new Setting(queryWrap)
      .setName('Scryfall query or URL')
      .setDesc('Paste a Scryfall search URL or type a query directly. Add game:paper to exclude digital-only cards.')
      .addTextArea(t => {
        t.setPlaceholder(
          'Query: type:turtle game:paper\n\nURL: https://scryfall.com/search?q=type%3Aturtle...'
        );
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

    const previewEl = queryWrap.createEl('div', { cls: 'nm-query-preview' });
    previewEl.style.display = 'none';

    // expose reference so type-dropdown onChange can show/hide
    const querySetting = { settingEl: queryWrap };

    const autoFetchSetting = new Setting(contentEl)
      .setName('Auto-fetch cards from Scryfall')
      .setDesc('Populate collection with cards from Scryfall after creation.')
      .addToggle(t => t.setValue(true).onChange(v => (this.autoFetch = v)));

    const autoUpdateSetting = new Setting(contentEl)
      .setName('Auto-update')
      .setDesc('Check for new cards on Scryfall every time the dashboard opens. Ideal for theme collections (e.g. t:turtle) that grow over time.')
      .addToggle(t => t.setValue(false).onChange(v => (this.autoUpdate = v)));
    autoUpdateSetting.settingEl.style.display = 'none';

    new Setting(contentEl)
      .setName('Type')
      .addDropdown(d => {
        for (const [val, label] of Object.entries(TYPE_LABELS)) {
          d.addOption(val, label);
        }
        d.setValue(this.type);
        d.onChange(v => {
          this.type = v as CollectionType;
          const isSet = this.type === 'mtg-set';
          setCodeSetting.settingEl.style.display = isSet ? '' : 'none';
          querySetting.settingEl.style.display = isSet ? 'none' : '';
          autoUpdateSetting.settingEl.style.display = isSet ? 'none' : '';
        });
      });

    new Setting(contentEl)
      .addButton(btn =>
        btn.setButtonText('Create').setCta().onClick(() => this.create())
      )
      .addButton(btn =>
        btn.setButtonText('Cancel').onClick(() => this.close())
      );
  }

  onClose() {
    this.contentEl.empty();
  }

  private addTypeDropdown(_: unknown) { return _; } // unused stub

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
      `collection-type: ${this.type}`,
      `collection-name: ${this.name}`,
      isSet && this.setCode ? `set-code: ${this.setCode.toUpperCase()}` : '',
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
        ? await fetchSetCards(this.setCode, p => new Notice(`Fetching page ${p}...`))
        : await fetchSearchCards(
            this.scryfallQuery,
            p => new Notice(`Fetching page ${p}...`),
            this.scryfallOrder
          );

      const rows = cards.flatMap(cardToMarkdownRows);
      const added = await appendCards(file, rows, this.app.vault);
      new Notice(`Added ${added} cards to "${this.name}".`);
    } catch (e) {
      new Notice(`Scryfall fetch failed: ${(e as Error).message}`);
    }
  }
}
