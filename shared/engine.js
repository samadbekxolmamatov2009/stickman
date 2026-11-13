// Stickman Games — shared engine: view, loop, input, touch UI, audio, effects.
const SG = (() => {
  'use strict';

  // ---------- math ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const choice = arr => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const ease = t => t * t * (3 - 2 * t);

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
  }
  function rgba(hex, a) { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /[?&]touch=1/.test(location.search);

  // ---------- view ----------
  const view = { W: 960, H: 540, dpr: 1, scale: 1, canvas: null, ctx: null };
  function initView(canvas, onResize) {
    view.canvas = canvas;
    view.ctx = canvas.getContext('2d');
    function resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const aspect = clamp(vw / vh, 1.25, 2.35);
      view.H = 540;
      view.W = Math.round(540 * aspect);
      view.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(view.W * view.dpr);
      canvas.height = Math.round(view.H * view.dpr);
      const s = Math.min(vw / view.W, vh / view.H);
      view.scale = s;
      canvas.style.width = `${Math.round(view.W * s)}px`;
      canvas.style.height = `${Math.round(view.H * s)}px`;
      if (onResize) onResize(view);
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));
    resize();
    return view;
  }
  function toLocal(e) {
    const r = view.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * view.W, y: (e.clientY - r.top) / r.height * view.H };
  }

  // ---------- loop ----------
  const time = { scale: 1, freeze: 0, t: 0 };
  function run(update, draw) {
    let last = performance.now();
    function frame(now) {
      let dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      if (time.freeze > 0) { time.freeze -= dt; dt = 0; }
      dt *= time.scale;
      time.t += dt;
      update(dt);
      const ctx = view.ctx;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      draw(ctx);
      pressedKeys.clear();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- keyboard ----------
  const keys = new Set();
  const pressedKeys = new Set();
  const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', e => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!keys.has(e.code)) pressedKeys.add(e.code);
    keys.add(e.code);
    audioUnlock();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const key = code => keys.has(code);
  const pressed = code => pressedKeys.has(code);
  const anyKey = (...codes) => codes.some(c => keys.has(c));
  const anyPressed = (...codes) => codes.some(c => pressedKeys.has(c));

  // ---------- touch UI ----------
  const uiK = () => clamp(window.innerHeight / 540, 0.6, 1);
  const hudX = () => Math.round(104 / (view.scale || 1)) + 10;
  let uiRoot = null;
  function ensureUiRoot() {
    if (uiRoot) return uiRoot;
    uiRoot = document.createElement('div');
    uiRoot.className = 'sg-touch';
    (document.getElementById('game-wrap') || document.body).appendChild(uiRoot);
    return uiRoot;
  }
  function showTouch(on) { if (uiRoot) uiRoot.style.display = on && isTouch ? 'block' : 'none'; }
  function clearTouch() { if (uiRoot) uiRoot.innerHTML = ''; }

  function makeStick(opts = {}) {
    const root = ensureUiRoot();
    const el = document.createElement('div');
    el.className = 'sg-stick';
    if (opts.right) { el.style.right = '26px'; el.style.left = 'auto'; }
    const knob = document.createElement('div');
    knob.className = 'sg-knob';
    el.appendChild(knob);
    root.appendChild(el);
    const k0 = uiK() * (opts.scale || 1.25);
    el.style.transform = `scale(${k0})`;
    el.style.transformOrigin = opts.right ? 'bottom right' : 'bottom left';
    const st = { x: 0, y: 0, active: false, el };
    let pid = null;
    const R = 46;
    function move(e) {
      const r = el.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / k0, dy = (e.clientY - (r.top + r.height / 2)) / k0;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(R, d);
      dx = dx / d * k; dy = dy / d * k;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      st.x = Math.abs(dx / R) < 0.22 ? 0 : dx / R;
      st.y = Math.abs(dy / R) < 0.22 ? 0 : dy / R;
    }
    el.addEventListener('pointerdown', e => { e.preventDefault(); pid = e.pointerId; el.setPointerCapture(pid); st.active = true; move(e); audioUnlock(); });
    el.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
    const end = e => { if (e.pointerId !== pid) return; pid = null; st.active = false; st.x = st.y = 0; knob.style.transform = 'translate(0,0)'; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return st;
  }

  function makeBtn(label, opts = {}) {
    const root = ensureUiRoot();
    const el = document.createElement('button');
    el.className = 'sg-btn';
    el.innerHTML = label;
    const k = uiK();
    const size = Math.round((opts.size || 66) * k);
    el.style.width = el.style.height = `${size}px`;
    el.style.fontSize = `${Math.round(size * 0.4)}px`;
    if (opts.left !== undefined) el.style.left = `${Math.round(opts.left * k)}px`; else el.style.right = `${Math.round((opts.right ?? 24) * k)}px`;
    el.style.bottom = `${Math.round((opts.bottom ?? 24) * k)}px`;
    if (opts.color) { el.style.background = rgba(opts.color, 0.38); el.style.borderColor = rgba(opts.color, 0.9); }
    root.appendChild(el);
    const st = { down: false, _hit: false, el, hit() { const h = st._hit; st._hit = false; return h; } };
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      st.down = true; st._hit = true; el.classList.add('on'); audioUnlock();
      if (opts.onPress) opts.onPress();
    });
    const end = () => { st.down = false; el.classList.remove('on'); if (opts.onRelease) opts.onRelease(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return st;
  }

  // ---------- audio ----------
  let actx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('sg_mute') === '1'; } catch (e) { /* ignore */ }
  function audioUnlock() {
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = muted ? 0 : 0.9;
        master.connect(actx.destination);
        noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('pointerdown', audioUnlock, { passive: true });
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('sg_mute', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.value = m ? 0 : 0.9;
  }
  function tone(freq, dur, type = 'sine', gain = 0.08, slideTo = 0, delay = 0) {
    if (!actx || muted) return;
    try {
      const t0 = actx.currentTime + delay;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function noise(dur, gain = 0.1, freq = 1200, q = 0.8, delay = 0) {
    if (!actx || muted) return;
    try {
      const t0 = actx.currentTime + delay;
      const src = actx.createBufferSource();
      src.buffer = noiseBuf;
      const f = actx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = actx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  const sfx = {
    click() { tone(660, 0.06, 'triangle', 0.06); },
    jump() { tone(380, 0.14, 'triangle', 0.07, 720); },
    land() { noise(0.08, 0.06, 300); },
    whoosh() { noise(0.12, 0.07, 1800, 0.5); },
    hit() { noise(0.1, 0.16, 900); tone(160, 0.1, 'square', 0.08, 70); },
    heavy() { noise(0.18, 0.22, 420); tone(110, 0.2, 'sawtooth', 0.12, 40); },
    block() { tone(900, 0.05, 'square', 0.05); noise(0.05, 0.08, 3200); },
    coin() { tone(988, 0.07, 'square', 0.05); tone(1319, 0.12, 'square', 0.05, 0, 0.07); },
    power() { tone(440, 0.1, 'sine', 0.08, 880); tone(880, 0.16, 'sine', 0.07, 1320, 0.1); },
    shoot() { noise(0.09, 0.09, 2400, 0.6); tone(520, 0.08, 'triangle', 0.05, 260); },
    thud() { noise(0.07, 0.12, 500); },
    kick() { noise(0.06, 0.14, 700); tone(210, 0.07, 'sine', 0.1, 90); },
    bounce() { tone(260, 0.06, 'sine', 0.06, 180); },
    goal() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 0, i * 0.09)); noise(0.6, 0.05, 1500, 0.3); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, 0, i * 0.1)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.06, 0, i * 0.14)); },
    explode() { noise(0.4, 0.25, 200, 0.4); tone(90, 0.35, 'sawtooth', 0.12, 30); },
    tick() { tone(1200, 0.03, 'square', 0.03); },
    build() { tone(330, 0.08, 'triangle', 0.07); tone(494, 0.1, 'triangle', 0.07, 0, 0.07); },
    error() { tone(150, 0.14, 'square', 0.06); },
    perfect() { tone(784, 0.08, 'triangle', 0.07); tone(1175, 0.08, 'triangle', 0.07, 0, 0.08); tone(1568, 0.16, 'triangle', 0.07, 0, 0.16); },
    splash() { noise(0.3, 0.12, 800, 0.4); },
    stretch() { tone(200, 0.05, 'sine', 0.03, 240); },
  };
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } }

  // ---------- effects ----------
  class FX {
    constructor() { this.p = []; this.texts = []; this.rings = []; this.shakeAmt = 0; }
    burst(x, y, n, o = {}) {
      for (let i = 0; i < n; i++) {
        const a = o.angle !== undefined ? o.angle + rand(-(o.spread ?? 0.6), o.spread ?? 0.6) : rand(0, Math.PI * 2);
        const sp = rand(o.speedMin ?? 60, o.speedMax ?? 240);
        this.p.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up ?? 0),
          life: rand(o.lifeMin ?? 0.3, o.lifeMax ?? 0.7), age: 0,
          r: rand(o.rMin ?? 2, o.rMax ?? 4.5), color: o.color || '#ffffff',
          g: o.gravity ?? 500, drag: o.drag ?? 1.5, spark: !!o.spark, glow: !!o.glow,
        });
      }
    }
    dust(x, y, n = 5, color = '#d8d2c0') {
      this.burst(x, y, n, { color, speedMin: 20, speedMax: 90, up: 40, gravity: -30, drag: 3, rMin: 3, rMax: 7, lifeMin: 0.3, lifeMax: 0.6 });
    }
    ring(x, y, color = '#ffffff', maxR = 60, life = 0.35, width = 4) { this.rings.push({ x, y, color, maxR, life, age: 0, width }); }
    text(x, y, str, color = '#ffd34d', size = 22) { this.texts.push({ x, y, str, color, size, age: 0, life: 1 }); }
    shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
    update(dt) {
      for (const p of this.p) {
        p.age += dt;
        p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt;
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      this.p = this.p.filter(p => p.age < p.life);
      for (const r of this.rings) r.age += dt;
      this.rings = this.rings.filter(r => r.age < r.life);
      for (const t of this.texts) { t.age += dt; t.y -= 38 * dt; }
      this.texts = this.texts.filter(t => t.age < t.life);
      this.shakeAmt = this.shakeAmt > 0.3 ? this.shakeAmt * Math.exp(-9 * dt) : 0;
    }
    applyShake(ctx) {
      if (this.shakeAmt > 0.3) ctx.translate(rand(-this.shakeAmt, this.shakeAmt), rand(-this.shakeAmt, this.shakeAmt));
    }
    draw(ctx) {
      for (const p of this.p) {
        const k = 1 - p.age / p.life;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.fillStyle = p.color;
        if (p.spark) {
          ctx.strokeStyle = p.color; ctx.lineWidth = p.r * 0.7; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill();
        }
      }
      for (const r of this.rings) {
        const k = r.age / r.life;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - k) + 0.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.maxR * ease(k), 0, Math.PI * 2); ctx.stroke();
      }
      for (const t of this.texts) {
        const k = t.age / t.life;
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const sc = k < 0.12 ? 0.6 + k / 0.12 * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 2);
        ctx.font = `900 ${Math.round(t.size * sc)}px "Trebuchet MS", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,14,24,0.75)';
        ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- canvas helpers ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function label(ctx, str, x, y, size = 16, color = '#fff', align = 'center', stroke = true) {
    ctx.font = `800 ${size}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = align;
    if (stroke) { ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = 'rgba(10,14,24,0.7)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  function bar(ctx, x, y, w, h, pct, c1, c2, back = 'rgba(8,10,18,0.55)') {
    rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = back; ctx.fill();
    if (pct > 0.005) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, c1); g.addColorStop(1, c2 || c1);
      ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip();
      ctx.fillStyle = g; ctx.fillRect(x, y, w * clamp(pct, 0, 1), h);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, w * clamp(pct, 0, 1), h * 0.4);
      ctx.restore();
    }
    rr(ctx, x, y, w, h, h / 2); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // ---------- screens ----------
  const $ = id => document.getElementById(id);
  function show(id, on = true) { const el = $(id); if (el) el.classList.toggle('hidden', !on); }
  function seg(id, onChange) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      [...el.children].forEach(x => x.classList.toggle('active', x === b));
      sfx.click();
      onChange(b.dataset.v);
    });
  }
  function best(keyName, value) {
    let cur = 0;
    try { cur = Number(localStorage.getItem(keyName) || 0); } catch (e) { /* ignore */ }
    if (value !== undefined && value > cur) { cur = value; try { localStorage.setItem(keyName, cur); } catch (e) { /* ignore */ } }
    return cur;
  }

  // mute button (auto-injected)
  window.addEventListener('DOMContentLoaded', () => {
    const wrap = $('game-wrap');
    if (!wrap) return;
    const b = document.createElement('button');
    b.className = 'sg-mute';
    b.textContent = muted ? '🔇' : '🔊';
    b.addEventListener('click', () => { audioUnlock(); setMuted(!muted); b.textContent = muted ? '🔇' : '🔊'; });
    wrap.appendChild(b);
  });

  return {
    rand, randi, choice, clamp, lerp, damp, dist, hash, ease, mix, rgba, hexToRgb,
    isTouch, view, initView, toLocal, time, run,
    keys, key, pressed, anyKey, anyPressed,
    makeStick, makeBtn, showTouch, clearTouch, hudX,
    sfx, tone, noise, buzz, audioUnlock,
    FX, rr, label, bar, $, show, seg, best,
  };
})();
