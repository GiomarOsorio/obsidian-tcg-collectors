import type { CollectionCard } from './types';
import type { TCGDexCard } from './TCGDexService';

// ── Data mapping ───────────────────────────────────────────────────────────────

function getCardSuffix(id: string): string {
  const m = id.match(/_([nrhf]e?)$/);
  return m ? `_${m[1]}` : '_n';
}

// Maps TCGdex rarity string → data-rarity value expected by pokemon-cards-151 CSS.
// Reverse-holo variant overrides to 'pokeball holo' (poke-ball-holo.css selector).
function mapRarity(rarity: string | undefined, suffix: string): string {
  if (suffix === '_r') return 'pokeball holo';
  const r = (rarity ?? '').toLowerCase().trim();
  if (r === 'hyper rare')                  return 'hyper rare';
  if (r === 'special illustration rare')   return 'special illustration rare';
  if (r === 'illustration rare')           return 'illustration rare';
  if (r === 'ultra rare')                  return 'ultra rare';
  if (r === 'double rare')                 return 'double rare';
  if (r === 'radiant rare')                return 'radiant rare';
  if (r === 'rare holo vmax')              return 'rare holo vmax';
  if (r === 'rare rainbow alt')            return 'rare rainbow alt';
  if (r === 'rare holo' || r === 'rare')   return 'rare holo';
  if (r === 'uncommon')                    return 'uncommon';
  return 'common';
}

// category "Pokemon"→"pokémon", "Trainer"→"trainer", "Energy"→"energy"
function detectSupertype(category: string): string {
  const l = category.toLowerCase();
  if (l === 'trainer') return 'trainer';
  if (l === 'energy')  return 'energy';
  return 'pokémon';
}

// Builds data-subtypes from stage + suffix + trainerType (all optional).
// Examples: "basic", "stage1 ex", "supporter", "stage2"
function buildSubtypes(card: TCGDexCard): string {
  return [card.stage, card.suffix, card.trainerType]
    .filter((v): v is string => Boolean(v))
    .join(' ')
    .toLowerCase() || 'basic';
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function adjustRange(val: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return toMin + (toMax - toMin) * ((val - fromMin) / (fromMax - fromMin));
}

// ── Public entry point ─────────────────────────────────────────────────────────
// Outer shell mirrors MTG zoom (pkmn-zoom-* = copy of col-zoom-*).
// Inner card uses pokemon-cards-151 DOM so base.css effects apply.

export function openPokemonCardZoom(card: CollectionCard, tcgCard?: TCGDexCard): void {
  const suffix    = getCardSuffix(card.id);
  const rarity    = mapRarity(tcgCard?.rarity ?? card.rarity, suffix);
  const supertype = detectSupertype(tcgCard?.category ?? card.type);
  const subtypes  = tcgCard ? buildSubtypes(tcgCard) : 'basic';
  const typeClass = (tcgCard?.types ?? []).map(t => t.toLowerCase()).join(' ');

  // ── Outer shell (same layout as MTG zoom, own classes) ────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'pkmn-zoom-overlay';

  const wrapper = document.createElement('div');
  wrapper.className = 'pkmn-zoom-wrapper';

  // ── pokemon-cards-151 card DOM (simplified: card > rotator > img + layers) ─────
  // card__translater (scale/translate anim) and card__front (flip anim) omitted —
  // we don't need those animations, and the extra nesting caused sizing glitches.
  const cardEl = document.createElement('div');
  cardEl.className = ['card', 'interactive', 'pkmn-card-effects', typeClass].filter(Boolean).join(' ');
  cardEl.dataset.rarity         = rarity;
  cardEl.dataset.supertype      = supertype;
  cardEl.dataset.subtypes       = subtypes;
  cardEl.dataset.set            = card.set;
  cardEl.dataset.number         = card.number;
  cardEl.dataset.trainerGallery = 'false';

  const rotator = document.createElement('div');
  rotator.className = 'card__rotator';

  const frontImg = document.createElement('img');
  frontImg.src = card.imageUrl;
  frontImg.alt = card.name;
  frontImg.className = 'pkmn-card-img';

  const shine    = document.createElement('div'); shine.className    = 'card__shine';
  const glitter  = document.createElement('div'); glitter.className  = 'card__glitter';
  const glare    = document.createElement('div'); glare.className    = 'card__glare';
  const glare2   = document.createElement('div'); glare2.className   = 'card__glare2';

  rotator.append(frontImg, shine, glitter, glare, glare2);
  cardEl.append(rotator);

  // ── Pointer tracking → CSS custom props expected by base.css ─────────────────
  let curRx = 0, curRy = 0, curPx = 50, curPy = 50, curOp = 0, curBx = 50, curBy = 50;
  let tgtRx = 0, tgtRy = 0, tgtPx = 50, tgtPy = 50, tgtOp = 0, tgtBx = 50, tgtBy = 50;
  let rafId = 0;
  let isHovering = false;

  const applyVars = () => {
    const dx = (curPx - 50) / 50, dy = (curPy - 50) / 50;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 1);
    cardEl.style.setProperty('--rotate-x',            `${curRx}deg`);
    cardEl.style.setProperty('--rotate-y',            `${curRy}deg`);
    cardEl.style.setProperty('--pointer-x',           `${curPx}%`);
    cardEl.style.setProperty('--pointer-y',           `${curPy}%`);
    cardEl.style.setProperty('--background-x',        `${curBx}%`);
    cardEl.style.setProperty('--background-y',        `${curBy}%`);
    cardEl.style.setProperty('--card-opacity',        `${curOp}`);
    cardEl.style.setProperty('--pointer-from-center', `${dist}`);
    cardEl.style.setProperty('--pointer-from-top',    `${curPy / 100}`);
    cardEl.style.setProperty('--pointer-from-left',   `${curPx / 100}`);
    cardEl.style.setProperty('--card-scale',          '1');
    cardEl.style.setProperty('--translate-x',         '0px');
    cardEl.style.setProperty('--translate-y',         '0px');
  };

  // Init all vars to resting state BEFORE appending to DOM so no effect
  // flickers on open. Some effect CSS uses opacity: calc(var(--card-opacity) + ...)
  // without a fallback — unset vars make calc() invalid → opacity defaults to 1.
  applyVars();

  wrapper.append(cardEl);
  overlay.append(wrapper);
  document.body.append(overlay);

  requestAnimationFrame(() => overlay.classList.add('pkmn-zoom-active'));

  const tick = () => {
    const L = 0.12;
    curRx = lerp(curRx, tgtRx, L);
    curRy = lerp(curRy, tgtRy, L);
    curPx = lerp(curPx, tgtPx, L);
    curPy = lerp(curPy, tgtPy, L);
    curOp = lerp(curOp, tgtOp, L);
    curBx = lerp(curBx, tgtBx, L);
    curBy = lerp(curBy, tgtBy, L);
    applyVars();
    if (isHovering || Math.abs(curOp - tgtOp) > 0.001) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
    }
  };

  const setFromXY = (x: number, y: number) => {
    tgtRx = (x - 50) * -0.35;
    tgtRy = (y - 50) *  0.35;
    tgtPx = x;
    tgtPy = y;
    const dx = (x - 50) / 50, dy = (y - 50) / 50;
    tgtOp = Math.min(0.3 + Math.sqrt(dx * dx + dy * dy) * 0.6, 1);
    tgtBx = 40 + (x / 100) * 20;
    tgtBy = 40 + (y / 100) * 20;
  };

  const resetTargets = () => {
    tgtRx = 0; tgtRy = 0; tgtPx = 50; tgtPy = 50; tgtOp = 0; tgtBx = 50; tgtBy = 50;
  };

  // ── Mouse / pointer ──────────────────────────────────────────────────────────
  cardEl.addEventListener('pointerenter', () => {
    isHovering = true;
    cardEl.classList.add('interacting');
    if (!rafId) rafId = requestAnimationFrame(tick);
  });

  cardEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (e.pointerType === 'touch') return; // handled by touch branch
    const r = cardEl.getBoundingClientRect();
    setFromXY(
      clamp((e.clientX - r.left) / r.width  * 100),
      clamp((e.clientY - r.top)  / r.height * 100),
    );
  });

  cardEl.addEventListener('pointerleave', (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    isHovering = false;
    resetTargets();
    cardEl.classList.remove('interacting');
    if (!rafId) rafId = requestAnimationFrame(tick);
  });

  // ── Touch (finger drag on card) ───────────────────────────────────────────────
  cardEl.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    isHovering = true;
    cardEl.classList.add('interacting');
    if (!rafId) rafId = requestAnimationFrame(tick);
  }, { passive: false });

  cardEl.addEventListener('touchmove', (e: TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    const r = cardEl.getBoundingClientRect();
    setFromXY(
      clamp((t.clientX - r.left) / r.width  * 100),
      clamp((t.clientY - r.top)  / r.height * 100),
    );
  }, { passive: false });

  cardEl.addEventListener('touchend', () => {
    isHovering = false;
    resetTargets();
    cardEl.classList.remove('interacting');
    if (!rafId) rafId = requestAnimationFrame(tick);
  });

  // ── Device orientation (gyroscope) — mobile tilt effect ──────────────────────
  // gamma = left/right tilt (-90..90), beta = front/back tilt (-180..180)
  // Baseline captured on first reading so effect is relative to how phone is held.
  let baseGamma: number | null = null;
  let baseBeta:  number | null = null;
  const LIMIT_X = 16, LIMIT_Y = 18;

  const onOrientation = (e: DeviceOrientationEvent) => {
    if (isHovering) return; // pointer/touch takes priority
    const gamma = e.gamma ?? 0;
    const beta  = e.beta  ?? 0;

    if (baseGamma === null) { baseGamma = gamma; baseBeta = beta; return; }

    const dx = clamp(gamma - baseGamma,          -LIMIT_X, LIMIT_X);
    const dy = clamp(beta  - (baseBeta ?? beta), -LIMIT_Y, LIMIT_Y);

    tgtRx = dx * -1;
    tgtRy = dy;
    tgtPx = adjustRange(dx, -LIMIT_X, LIMIT_X, 0, 100);
    tgtPy = adjustRange(dy, -LIMIT_Y, LIMIT_Y, 0, 100);
    tgtOp = Math.min(0.2 + Math.sqrt((dx/LIMIT_X)**2 + (dy/LIMIT_Y)**2) * 0.7, 1);
    tgtBx = adjustRange(dx, -LIMIT_X, LIMIT_X, 37, 63);
    tgtBy = adjustRange(dy, -LIMIT_Y, LIMIT_Y, 33, 67);

    cardEl.classList.add('interacting');
    if (!rafId) rafId = requestAnimationFrame(tick);
  };

  window.addEventListener('deviceorientation', onOrientation, true);

  // ── Close ─────────────────────────────────────────────────────────────────────
  const close = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('deviceorientation', onOrientation, true);
    overlay.classList.remove('pkmn-zoom-active');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 300);
  };

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target === wrapper) close(); });
}
