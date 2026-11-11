// Shared helpers used across the Stickman mini-games collection.
const Stk = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const choice = arr => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lerpColor(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
  }
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function circleHit(ax, ay, ar, bx, by, br) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy < (ar + br) * (ar + br);
  }

  // ---------- audio ----------
  let actx = null;
  function sfx(freq, dur, type = 'sine', gain = 0.08) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(actx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.stop(actx.currentTime + dur);
    } catch (e) { /* ignore */ }
  }

  // ---------- particles ----------
  class Particles {
    constructor() { this.list = []; }
    emit(x, y, n, opts = {}) {
      for (let i = 0; i < n; i++) {
        this.list.push({
          x, y,
          vx: rand(opts.vxMin ?? -60, opts.vxMax ?? 60),
          vy: rand(opts.vyMin ?? -140, opts.vyMax ?? -10),
          life: rand(opts.lifeMin ?? 0.25, opts.lifeMax ?? 0.6),
          age: 0,
          r: rand(opts.rMin ?? 1.3, opts.rMax ?? 3.2),
          color: opts.color || '255,255,255',
          gravity: opts.gravity ?? 240,
        });
      }
    }
    update(dt) {
      for (const p of this.list) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
      }
      this.list = this.list.filter(p => p.age < p.life);
    }
    draw(ctx) {
      for (const p of this.list) {
        const a = 1 - p.age / p.life;
        ctx.fillStyle = `rgba(${p.color},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- generic side-view stick figure ----------
  // pose: { legPhase, legPhaseB, armPhase, armPhaseB, duck, dead, lean }
  function drawSideStick(ctx, x, y, opts) {
    const {
      color = '#ff5d5d', scale = 1, height = 92,
      legPhase = 0, legPhaseB = Math.PI, armPhase = Math.PI, armPhaseB = 0,
      duck = 0, dead = false, lean = 0, label = '', weapon = null,
    } = opts;
    const s = scale;
    const h = height * (1 - duck * 0.35);
    const hipY = -h * 0.55;
    const headR = 12 * s;
    const headY = hipY - h * 0.42 - headR;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dead ? Math.PI / 2 * 0.85 : lean);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#1a2a1a';
    ctx.beginPath();
    ctx.ellipse(0, 5 * s, 22 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = dead ? '#666' : '#1c2230';
    ctx.lineWidth = Math.max(2, 6 * s);

    const kneeDrop = h * 0.26;
    const legLen = h * 0.42 * (1 - duck * 0.3);
    drawLimb(ctx, 0, hipY, Math.sin(legPhase) * 20 * s, Math.sin(legPhase) * 8 * s, kneeDrop, legLen);
    drawLimb(ctx, 0, hipY, Math.sin(legPhaseB) * 20 * s, Math.sin(legPhaseB) * 8 * s, kneeDrop, legLen);

    const chestY = hipY - h * 0.42;
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.quadraticCurveTo(duck ? 8 * s : 0, (hipY + chestY) / 2, 0, chestY);
    ctx.stroke();

    const armLen = h * 0.34;
    drawArm(ctx, chestY, armLen, Math.sin(armPhase), s);
    drawArm(ctx, chestY, armLen, Math.sin(armPhaseB), s);

    if (weapon === 'sword') {
      ctx.save();
      ctx.translate(Math.sin(armPhaseB) * 18 * s, chestY + armLen * 0.9);
      ctx.rotate(-0.6);
      ctx.strokeStyle = '#cfd6e6';
      ctx.lineWidth = Math.max(2, 3.5 * s);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -28 * s); ctx.stroke();
      ctx.strokeStyle = '#8a6a3d';
      ctx.lineWidth = Math.max(2, 4 * s);
      ctx.beginPath(); ctx.moveTo(-5 * s, 2 * s); ctx.lineTo(5 * s, 2 * s); ctx.stroke();
      ctx.restore();
    } else if (weapon === 'bow') {
      ctx.save();
      ctx.translate(Math.sin(armPhaseB) * 10 * s, chestY + armLen * 0.5);
      ctx.strokeStyle = '#8a6a3d';
      ctx.lineWidth = Math.max(1.5, 2.5 * s);
      ctx.beginPath(); ctx.arc(0, 0, 16 * s, -1.1, 1.1); ctx.stroke();
      ctx.restore();
    }

    const grad = ctx.createRadialGradient(-3 * s, headY - 3 * s, 2, 0, headY, headR);
    grad.addColorStop(0, dead ? '#cfcfcf' : '#ffe9c7');
    grad.addColorStop(1, dead ? '#9a9a9a' : '#f2b06b');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 3 * s);
    ctx.strokeStyle = dead ? '#555' : '#1c2230';
    ctx.stroke();

    ctx.fillStyle = '#1c2230';
    ctx.beginPath();
    ctx.arc(3.5 * s, headY - 2 * s, Math.max(1, 1.5 * s), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, 4 * s);
    ctx.beginPath();
    ctx.arc(0, headY, headR + 1, -2.6, -0.6);
    ctx.stroke();
    ctx.restore();

    if (label) {
      ctx.save();
      ctx.font = `${Math.max(9, 11 * s)}px Trebuchet MS, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(label, x, y - height - headR * 2 - 6);
      ctx.restore();
    }
  }

  function drawLimb(ctx, ox, oy, footX, kneeX, kneeDrop, len) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(ox + kneeX, oy + kneeDrop, ox + footX, oy + len);
    ctx.stroke();
  }
  function drawArm(ctx, chestY, armLen, swing, s) {
    const handX = swing * 18 * s;
    const handY = chestY + armLen * 0.9;
    const elbowX = swing * 9 * s;
    const elbowY = chestY + armLen * 0.45;
    ctx.beginPath();
    ctx.moveTo(0, chestY + 4 * s);
    ctx.quadraticCurveTo(elbowX, elbowY, handX, handY);
    ctx.stroke();
  }

  // ---------- generic top-down stick figure ----------
  function drawTopDownStick(ctx, x, y, angle, color, scale = 1, opts = {}) {
    const s = scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.save();
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 2 * s, 10 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.rotate(angle);
    ctx.strokeStyle = '#1c2230';
    ctx.lineWidth = Math.max(1.6, 3 * s);
    ctx.lineCap = 'round';
    // limbs
    const t = opts.walk || 0;
    [1, -1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(-2 * s, 0);
      ctx.lineTo(-10 * s, side * (6 + Math.sin(t + side) * 3) * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(6 * s, 0);
      ctx.lineTo(12 * s, side * (5 + Math.sin(t + side + 1) * 3) * s);
      ctx.stroke();
    });
    // body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // head / facing indicator
    ctx.fillStyle = '#ffe9c7';
    ctx.beginPath();
    ctx.arc(9 * s, 0, 5.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1c2230';
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.stroke();
    ctx.restore();

    if (opts.label) {
      ctx.save();
      ctx.font = `${Math.max(9, 10 * s)}px Trebuchet MS, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(opts.label, x, y - 18 * s);
      ctx.restore();
    }
  }

  // ---------- generic layered sky ----------
  function drawSky(ctx, W, H, topColor, midColor, botColor) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, topColor);
    g.addColorStop(0.6, midColor);
    g.addColorStop(1, botColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return {
    rand, choice, clamp, lerp, hexToRgb, lerpColor, aabb, circleHit, sfx,
    Particles, drawSideStick, drawTopDownStick, drawSky, roundRectPath,
  };
})();
