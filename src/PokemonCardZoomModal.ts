import { App, Modal } from 'obsidian';
import type { CollectionCard } from './types';

// Card back image from official Pokemon TCG assets
const BACK_URL = 'https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg';

// CDN for per-card foil textures (pokemon-cards-151 by @simeydotme)
const CDN = 'https://poke-holo.b-cdn.net';

// ── Data mapping helpers ───────────────────────────────────────────────────────

function getCardSuffix(id: string): string {
  const m = id.match(/_([nrhf]e?)$/);
  return m ? `_${m[1]}` : '_n';
}

function mapRarity(rarity: string | undefined, suffix: string): string {
  // Reverse holo variant always gets the pokeball holo effect
  if (suffix === '_r') return 'pokeball holo';
  const r = (rarity ?? '').toLowerCase().trim();
  if (r.includes('hyper rare'))                return 'hyper rare';
  if (r.includes('special illustration rare')) return 'special illustration rare';
  if (r.includes('illustration rare'))         return 'illustration rare';
  if (r.includes('ultra rare'))                return 'ultra rare';
  if (r.includes('double rare'))               return 'double rare';
  if (r.includes('radiant rare'))              return 'radiant rare';
  if (r.includes('rare holo') || r === 'rare') return 'rare holo';
  if (r.includes('uncommon'))                  return 'uncommon';
  return 'common';
}

function detectSupertype(typeStr: string): string {
  const l = typeStr.toLowerCase();
  if (l === 'trainer' || l.includes('item') || l.includes('supporter') || l.includes('stadium')) {
    return 'trainer';
  }
  if (l === 'energy') return 'energy';
  return 'pokémon';
}

function getTypeClasses(typeStr: string): string {
  const known = new Set(['grass','fire','water','lightning','psychic','fighting','darkness','metal','dragon','fairy','colorless']);
  return typeStr.toLowerCase().split('/').map(t => t.trim()).filter(t => known.has(t)).join(' ');
}

function getFoilUrl(setId: string, localId: string, suffix: string): string | null {
  // Normal cards don't need a foil texture
  if (suffix === '_n') return null;
  // ph = pinched holo (reverse), std = standard holo
  const foilSuffix = suffix === '_r' ? 'ph' : 'std';
  // Normalize set ID for CDN path (sv3pt5 → sv3-5)
  const cdnSetId = setId.replace(/([a-z])pt(\d)/g, '$1-$2');
  const num = parseInt(localId);
  const paddedNum = isNaN(num) ? localId : num.toString().padStart(3, '0');
  return `${CDN}/foils/${cdnSetId}_en_${paddedNum}_${foilSuffix}.foil.webp`;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function openPokemonCardZoom(app: App, card: CollectionCard): void {
  new PokemonCardZoomModal(app, card).open();
}

class PokemonCardZoomModal extends Modal {
  private card: CollectionCard;
  private cardEl: HTMLElement | null = null;
  private rafId = 0;

  // Lerped current values
  private cur = { rx: 0, ry: 0, px: 50, py: 50, op: 0, bx: 50, by: 50 };
  // Target values driven by pointer
  private tgt = { rx: 0, ry: 0, px: 50, py: 50, op: 0, bx: 50, by: 50 };

  constructor(app: App, card: CollectionCard) {
    super(app);
    this.card = card;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.addClass('pkmn-zoom-modal');
    contentEl.empty();

    // Darken the modal backdrop
    modalEl.style.background = 'rgba(0,0,0,0.85)';
    modalEl.style.boxShadow = 'none';

    const card = this.card;
    const suffix    = getCardSuffix(card.id);
    const rarity    = mapRarity(card.rarity, suffix);
    const supertype = detectSupertype(card.type);
    const typeClass = getTypeClasses(card.type);
    const foilUrl   = getFoilUrl(card.set, card.number, suffix);

    const wrapper = contentEl.createDiv({ cls: 'pkmn-zoom-wrapper' });
    wrapper.addEventListener('click', (e) => { if (e.target === wrapper) this.close(); });

    // Build the card element with all required data attributes
    const cardEl = document.createElement('div');
    cardEl.className = ['card', 'interactive', typeClass].filter(Boolean).join(' ');
    cardEl.dataset.rarity          = rarity;
    cardEl.dataset.supertype       = supertype;
    cardEl.dataset.subtypes        = 'basic';
    cardEl.dataset.set             = card.set;
    cardEl.dataset.number          = card.number;
    cardEl.dataset.trainerGallery  = 'false';
    wrapper.appendChild(cardEl);

    this.applyVars(cardEl);

    const translater = cardEl.createDiv({ cls: 'card__translater' });
    const rotator    = translater.createEl('button', { cls: 'card__rotator' });
    rotator.setAttribute('aria-label', card.name);

    rotator.createEl('img', {
      cls: 'card__back',
      attr: { src: BACK_URL, alt: 'Card back', loading: 'lazy' },
    });

    const front = rotator.createDiv({ cls: 'card__front' });
    if (foilUrl) {
      front.style.cssText = `--foil:url(${foilUrl});--mask:url(${foilUrl})`;
    }

    cardEl.addClass('loading');
    const img = front.createEl('img', { attr: { src: card.imageUrl, alt: card.name, loading: 'eager' } });
    img.onload  = () => { cardEl.removeClass('loading'); if (foilUrl) cardEl.addClass('masked'); };
    img.onerror = () => cardEl.removeClass('loading');

    for (const cls of ['card__shine', 'card__glitter', 'card__glare', 'card__glare2']) {
      front.createDiv({ cls });
    }

    this.cardEl = cardEl;
    this.attachPointer(cardEl);
    this.rafId = requestAnimationFrame(this.tick);
  }

  onClose() {
    cancelAnimationFrame(this.rafId);
    this.cardEl = null;
    this.contentEl.empty();
  }

  // ── Animation loop ─────────────────────────────────────────────────────────

  private tick = (): void => {
    if (!this.cardEl) return;
    const L = 0.12, c = this.cur, t = this.tgt;
    c.rx += (t.rx - c.rx) * L;
    c.ry += (t.ry - c.ry) * L;
    c.px += (t.px - c.px) * L;
    c.py += (t.py - c.py) * L;
    c.op += (t.op - c.op) * L;
    c.bx += (t.bx - c.bx) * L;
    c.by += (t.by - c.by) * L;
    this.applyVars(this.cardEl);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private applyVars(el: HTMLElement | null): void {
    if (!el) return;
    const { rx, ry, px, py, op, bx, by } = this.cur;
    const dx   = (px - 50) / 50;
    const dy   = (py - 50) / 50;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 1);
    el.style.setProperty('--rotate-x',          `${rx}deg`);
    el.style.setProperty('--rotate-y',          `${ry}deg`);
    el.style.setProperty('--pointer-x',         `${px}%`);
    el.style.setProperty('--pointer-y',         `${py}%`);
    el.style.setProperty('--card-opacity',      `${op}`);
    el.style.setProperty('--background-x',      `${bx}%`);
    el.style.setProperty('--background-y',      `${by}%`);
    el.style.setProperty('--pointer-from-center', `${dist}`);
    el.style.setProperty('--pointer-from-top',  `${py / 100}`);
    el.style.setProperty('--pointer-from-left', `${px / 100}`);
    el.style.setProperty('--card-scale',        '1');
    el.style.setProperty('--translate-x',       '0px');
    el.style.setProperty('--translate-y',       '0px');
    el.style.setProperty('--rotate-delta',      '0');
    el.style.setProperty('--seedx',             '0.5');
    el.style.setProperty('--seedy',             '0.5');
  }

  private attachPointer(el: HTMLElement): void {
    el.addEventListener('pointermove', (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width)  * 100;
      const y = ((e.clientY - r.top)  / r.height) * 100;
      this.tgt.rx = (x - 50) *  0.35;
      this.tgt.ry = (y - 50) * -0.35;
      this.tgt.px = x;
      this.tgt.py = y;
      const dx = (x - 50) / 50, dy = (y - 50) / 50;
      const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 1);
      this.tgt.op = 0.3 + dist * 0.5;
      this.tgt.bx = 40 + (x / 100) * 20;
      this.tgt.by = 40 + (y / 100) * 20;
      el.classList.add('interacting');
    });

    el.addEventListener('pointerleave', () => {
      Object.assign(this.tgt, { rx: 0, ry: 0, px: 50, py: 50, op: 0, bx: 50, by: 50 });
      el.classList.remove('interacting');
    });
  }
}
