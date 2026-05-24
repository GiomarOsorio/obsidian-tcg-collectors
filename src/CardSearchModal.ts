import { App, Modal, Notice, requestUrl } from 'obsidian';
import { ScryfallCard, cardToMarkdownRows } from './ScryfallService';
import { appendCards } from './parser';
import { Collection } from './types';
import { TFile } from 'obsidian';

const API = 'https://api.scryfall.com';

async function autocomplete(q: string): Promise<string[]> {
  if (q.length < 2) return [];
  const res = await requestUrl({ url: `${API}/cards/autocomplete?q=${encodeURIComponent(q)}` });
  if (res.status < 200 || res.status >= 300) return [];
  const data: { data: string[] } = res.json;
  return data.data.slice(0, 10);
}

async function fetchPrintings(name: string): Promise<ScryfallCard[]> {
  const q = encodeURIComponent(`!"${name}"`);
  const res = await requestUrl({
    url: `${API}/cards/search?q=${q}&unique=prints&order=released&dir=asc`,
    headers: { Accept: 'application/json' },
  });
  if (res.status < 200 || res.status >= 300) return [];
  const data: { data: ScryfallCard[] } = res.json;
  return data.data;
}

export class CardSearchModal extends Modal {
  private collection: Collection;
  private onAdded: () => void;

  private query = '';
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private selectedPrints: Set<string> = new Set();

  private suggestionsEl!: HTMLElement;
  private printingsEl!: HTMLElement;
  private addBtn!: HTMLButtonElement;
  private printings: ScryfallCard[] = [];

  constructor(app: App, collection: Collection, onAdded: () => void) {
    super(app);
    this.collection = collection;
    this.onAdded = onAdded;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('card-search-modal');
    contentEl.createEl('h2', { text: `Add card to "${this.collection.name}"` });

    const searchWrap = contentEl.createDiv({ cls: 'csm-search-wrap' });
    const input = searchWrap.createEl('input', {
      cls: 'csm-input',
      attr: { type: 'text', placeholder: 'Type card name...', autofocus: 'true' },
    });

    this.suggestionsEl = searchWrap.createDiv({ cls: 'csm-suggestions' });
    this.printingsEl = contentEl.createDiv({ cls: 'csm-printings' });

    const footer = contentEl.createDiv({ cls: 'csm-footer' });
    const countEl = footer.createEl('span', { cls: 'csm-count', text: '0 selected' });
    this.addBtn = footer.createEl('button', {
      cls: 'csm-add-btn',
      text: 'Add to Collection',
      attr: { disabled: 'true' },
    });
    this.addBtn.addEventListener('click', () => this.addSelected());

    input.addEventListener('input', () => {
      this.query = input.value.trim();
      this.suggestionsEl.empty();
      this.printingsEl.empty();
      this.selectedPrints.clear();
      this.updateCount(countEl);

      if (this.debounce) clearTimeout(this.debounce);
      if (!this.query) return;

      this.debounce = setTimeout(async () => {
        const names = await autocomplete(this.query);
        this.renderSuggestions(names, input, countEl);
      }, 250);
    });
  }

  onClose() {
    this.contentEl.empty();
  }

  private renderSuggestions(names: string[], input: HTMLInputElement, countEl: HTMLElement) {
    this.suggestionsEl.empty();
    if (names.length === 0) {
      this.suggestionsEl.createEl('div', { cls: 'csm-no-results', text: 'No matches' });
      return;
    }
    for (const name of names) {
      const item = this.suggestionsEl.createEl('div', { cls: 'csm-suggestion', text: name });
      item.addEventListener('click', async () => {
        input.value = name;
        this.suggestionsEl.empty();
        this.selectedPrints.clear();
        this.printingsEl.empty();
        this.printingsEl.createEl('div', { cls: 'csm-loading', text: 'Loading printings...' });

        this.printings = await fetchPrintings(name);
        this.renderPrintings(this.printings, countEl);
      });
    }
  }

  private renderPrintings(cards: ScryfallCard[], countEl: HTMLElement) {
    this.printingsEl.empty();
    if (cards.length === 0) {
      this.printingsEl.createEl('div', { cls: 'csm-no-results', text: 'No printings found.' });
      return;
    }

    this.printingsEl.createEl('p', {
      cls: 'csm-hint',
      text: 'Select printings to add (click to toggle):',
    });

    const grid = this.printingsEl.createDiv({ cls: 'csm-print-grid' });

    for (const card of cards) {
      const imageUrl =
        card.image_uris?.normal ??
        card.card_faces?.[0]?.image_uris?.normal ??
        '';

      const finishes = card.finishes.filter(f => f === 'foil' || f === 'nonfoil');

      for (const finish of finishes) {
        const key = `${card.id}::${finish}`;
        const label = finish === 'foil' ? 'Foil' : 'Normal';

        const tile = grid.createDiv({ cls: 'csm-print-tile' });

        if (imageUrl) {
          tile.createEl('img', {
            cls: 'csm-print-img',
            attr: { src: imageUrl, alt: card.name, loading: 'lazy' },
          });
        }

        const info = tile.createDiv({ cls: 'csm-print-info' });
        info.createEl('span', { cls: 'csm-print-set', text: card.set.toUpperCase() });
        info.createEl('span', { cls: 'csm-print-num', text: `#${card.collector_number}` });
        info.createEl('span', { cls: `csm-rarity csm-rarity-${card.rarity}`, text: card.rarity });
        info.createEl('span', { cls: 'csm-finish', text: label });
        info.createEl('span', { cls: 'csm-date', text: card.released_at });

        tile.addEventListener('click', () => {
          if (this.selectedPrints.has(key)) {
            this.selectedPrints.delete(key);
            tile.removeClass('csm-print-selected');
          } else {
            this.selectedPrints.add(key);
            tile.addClass('csm-print-selected');
          }
          this.updateCount(countEl);
        });
      }
    }
  }

  private updateCount(countEl: HTMLElement) {
    const n = this.selectedPrints.size;
    countEl.textContent = `${n} selected`;
    if (n > 0) {
      this.addBtn.removeAttribute('disabled');
    } else {
      this.addBtn.setAttribute('disabled', 'true');
    }
  }

  private async addSelected() {
    if (this.selectedPrints.size === 0) return;

    const rows: string[] = [];
    for (const key of this.selectedPrints) {
      const [cardId, finish] = key.split('::');
      const card = this.printings.find(c => c.id === cardId);
      if (!card) continue;
      const allRows = cardToMarkdownRows(card);
      const matchRow = allRows.find(r =>
        finish === 'foil' ? r.includes('(Foil)') : r.includes('(Normal)')
      );
      if (matchRow) rows.push(matchRow);
    }

    const file = this.app.vault.getAbstractFileByPath(this.collection.path);
    if (!(file instanceof TFile)) return;

    const added = await appendCards(file, rows, this.app.vault);
    new Notice(added > 0 ? `Added ${added} card(s) to "${this.collection.name}".` : 'All selected cards already in collection.');
    this.close();
    if (added > 0) this.onAdded();
  }
}
