function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

function adjust(val: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return toMin + (toMax - toMin) * ((val - fromMin) / (fromMax - fromMin));
}

export function openCardZoom(imageUrl: string, name: string, isFoil: boolean): void {
  const overlay = document.createElement('div');
  overlay.className = 'col-zoom-overlay';

  const wrapper = document.createElement('div');
  wrapper.className = 'col-zoom-wrapper';

  const rotator = document.createElement('div');
  rotator.className = 'col-zoom-rotator';

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = name;
  img.className = 'col-zoom-img';

  if (isFoil) {
    const shine = document.createElement('div');
    shine.className = 'col-zoom-shine';
    const glare = document.createElement('div');
    glare.className = 'col-zoom-glare';
    rotator.append(img, shine, glare);
    rotator.classList.add('col-zoom-foil');
  } else {
    rotator.append(img);
  }
  wrapper.append(rotator);
  overlay.append(wrapper);
  document.body.append(overlay);

  requestAnimationFrame(() => overlay.classList.add('col-zoom-active'));

  const close = () => {
    overlay.classList.remove('col-zoom-active');
    document.removeEventListener('keydown', onKeyDown);
    setTimeout(() => overlay.remove(), 300);
  };

  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKeyDown);
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target === wrapper) close(); });

  let rafId: number | null = null;

  rotator.addEventListener('pointermove', (e: PointerEvent) => {
    const rect = rotator.getBoundingClientRect();
    const px = clamp((e.clientX - rect.left) / rect.width * 100);
    const py = clamp((e.clientY - rect.top) / rect.height * 100);
    const cx = px - 50;
    const cy = py - 50;

    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rotator.style.setProperty('--pointer-x', `${px}%`);
      rotator.style.setProperty('--pointer-y', `${py}%`);
      rotator.style.setProperty('--rx', `${-(cx / 3.5)}deg`);
      rotator.style.setProperty('--ry', `${cy / 3.5}deg`);
      rotator.style.setProperty('--bg-x', `${adjust(px, 0, 100, 37, 63)}%`);
      rotator.style.setProperty('--bg-y', `${adjust(py, 0, 100, 33, 67)}%`);
      rotator.style.setProperty('--card-opacity', '1');
      rafId = null;
    });
  });

  rotator.addEventListener('pointerleave', () => {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    rotator.style.setProperty('--rx', '0deg');
    rotator.style.setProperty('--ry', '0deg');
    rotator.style.setProperty('--pointer-x', '50%');
    rotator.style.setProperty('--pointer-y', '50%');
    rotator.style.setProperty('--bg-x', '50%');
    rotator.style.setProperty('--bg-y', '50%');
    rotator.style.setProperty('--card-opacity', '0');
  });
}
