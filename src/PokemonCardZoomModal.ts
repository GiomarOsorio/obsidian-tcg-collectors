import type { CollectionCard } from './types';

const BACK_URL = 'https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg';
const CDN      = 'https://poke-holo.b-cdn.net';

// ── Data mapping ───────────────────────────────────────────────────────────────

function getCardSuffix(id: string): string {
  const m = id.match(/_([nrhf]e?)$/);
  return m ? `_${m[1]}` : '_n';
}

function mapRarity(rarity: string | undefined, suffix: string): string {
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
  if (suffix === '_n') return null;
  const foilSuffix = suffix === '_r' ? 'ph' : 'std';
  // Normalize set ID: sv3pt5 → sv3-5 (CDN path convention)
  const cdnSetId = setId.replace(/([a-z])pt(\d)/g, '$1-$2');
  const num = parseInt(localId);
  const paddedNum = isNaN(num) ? localId : num.toString().padStart(3, '0');
  return `${CDN}/foils/${cdnSetId}_en_${paddedNum}_${foilSuffix}.foil.webp`;
}

// ── Animation state ────────────────────────────────────────────────────────────

interface AnimState { rx: number; ry: number; px: number; py: number; op: number; bx: number; by: number; }

function makeState(): AnimState {
  return { rx: 0, ry: 0, px: 50, py: 50, op: 0, bx: 50, by: 50 };
}

function applyVars(el: HTMLElement, v: AnimState): void {
  const dx = (v.px - 50) / 50, dy = (v.py - 50) / 50;
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 1);
  el.style.setProperty('--rotate-x',           `${v.rx}deg`);
  el.style.setProperty('--rotate-y',           `${v.ry}deg`);
  el.style.setProperty('--pointer-x',          `${v.px}%`);
  el.style.setProperty('--pointer-y',          `${v.py}%`);
  el.style.setProperty('--card-opacity',       `${v.op}`);
  el.style.setProperty('--background-x',       `${v.bx}%`);
  el.style.setProperty('--background-y',       `${v.by}%`);
  el.style.setProperty('--pointer-from-center', `${dist}`);
  el.style.setProperty('--pointer-from-top',   `${v.py / 100}`);
  el.style.setProperty('--pointer-from-left',  `${v.px / 100}`);
  el.style.setProperty('--card-scale',         '1');
  el.style.setProperty('--translate-x',        '0px');
  el.style.setProperty('--translate-y',        '0px');
  el.style.setProperty('--rotate-delta',       '0');
  el.style.setProperty('--seedx',              '0.5');
  el.style.setProperty('--seedy',              '0.5');
}

// ── Public entry point ─────────────────────────────────────────────────────────

export function openPokemonCardZoom(card: CollectionCard): void {
  const suffix    = getCardSuffix(card.id);
  const rarity    = mapRarity(card.rarity, suffix);
  const supertype = detectSupertype(card.type);
  const typeClass = getTypeClasses(card.type);
  const foilUrl   = getFoilUrl(card.set, card.number, suffix);

  // ── Full-screen overlay (same pattern as CardZoomModal) ──────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'pkmn-zoom-overlay';

  const scopeWrap = document.createElement('div');
  scopeWrap.className = 'pkmn-zoom-modal'; // CSS effect scope

  // ── Card element ─────────────────────────────────────────────────────────────
  const cardEl = document.createElement('div');
  cardEl.className = ['card', 'interactive', typeClass].filter(Boolean).join(' ');
  cardEl.dataset.rarity         = rarity;
  cardEl.dataset.supertype      = supertype;
  cardEl.dataset.subtypes       = 'basic';
  cardEl.dataset.set            = card.set;
  cardEl.dataset.number         = card.number;
  cardEl.dataset.trainerGallery = 'false';

  const cur = makeState(), tgt = makeState();
  applyVars(cardEl, cur);

  const translater = document.createElement('div');
  translater.className = 'card__translater';

  const rotator = document.createElement('button');
  rotator.className = 'card__rotator';
  rotator.setAttribute('aria-label', card.name);

  const backImg = document.createElement('img');
  backImg.className = 'card__back';
  backImg.src = BACK_URL;
  backImg.alt = 'Card back';
  rotator.appendChild(backImg);

  const front = document.createElement('div');
  front.className = 'card__front';
  if (foilUrl) {
    front.style.cssText = `--foil:url(${foilUrl});--mask:url(${foilUrl})`;
  }

  cardEl.classList.add('loading');
  const frontImg = document.createElement('img');
  frontImg.src = card.imageUrl;
  frontImg.alt = card.name;
  frontImg.setAttribute('loading', 'eager');
  front.appendChild(frontImg);

  frontImg.onload = () => {
    cardEl.classList.remove('loading');
    if (foilUrl) {
      // Probe if foil loaded (attempt a 1x1 image test via the same URL)
      const probe = new Image();
      probe.onload  = () => cardEl.classList.add('masked');
      probe.onerror = () => {}; // fallback: CSS-only effect, no masked class
      probe.src = foilUrl;
    }
  };
  frontImg.onerror = () => cardEl.classList.remove('loading');

  for (const cls of ['card__shine', 'card__glitter', 'card__glare', 'card__glare2']) {
    const d = document.createElement('div');
    d.className = cls;
    front.appendChild(d);
  }

  rotator.appendChild(front);
  translater.appendChild(rotator);
  cardEl.appendChild(translater);
  scopeWrap.appendChild(cardEl);
  overlay.appendChild(scopeWrap);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('pkmn-zoom-active'));

  // ── Animation loop ───────────────────────────────────────────────────────────
  let rafId = 0;
  const tick = () => {
    const L = 0.12;
    cur.rx += (tgt.rx - cur.rx) * L;
    cur.ry += (tgt.ry - cur.ry) * L;
    cur.px += (tgt.px - cur.px) * L;
    cur.py += (tgt.py - cur.py) * L;
    cur.op += (tgt.op - cur.op) * L;
    cur.bx += (tgt.bx - cur.bx) * L;
    cur.by += (tgt.by - cur.by) * L;
    applyVars(cardEl, cur);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  // ── Pointer tracking ─────────────────────────────────────────────────────────
  cardEl.addEventListener('pointermove', (e: PointerEvent) => {
    const r = cardEl.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width)  * 100;
    const y = ((e.clientY - r.top)  / r.height) * 100;
    tgt.rx = (x - 50) *  0.35;
    tgt.ry = (y - 50) * -0.35;
    tgt.px = x;
    tgt.py = y;
    const dx = (x - 50) / 50, dy = (y - 50) / 50;
    tgt.op = Math.min(0.3 + Math.sqrt(dx*dx + dy*dy) * 0.5, 0.9);
    tgt.bx = 40 + (x / 100) * 20;
    tgt.by = 40 + (y / 100) * 20;
    cardEl.classList.add('interacting');
  });

  cardEl.addEventListener('pointerleave', () => {
    Object.assign(tgt, makeState());
    cardEl.classList.remove('interacting');
  });

  // ── Close ────────────────────────────────────────────────────────────────────
  const close = () => {
    cancelAnimationFrame(rafId);
    overlay.classList.remove('pkmn-zoom-active');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 250);
  };

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === scopeWrap) close();
  });
}
