// Stickman Games — procedural parallax scenery (infinite, no assets).
(() => {
  'use strict';
  const { hash, clamp, rgba } = SG;
  const PI = Math.PI;

  const THEMES = {
    meadow: {
      sky: ['#3f9fe6', '#86cdf3', '#d9f3ee'], sun: { c: '#fffbe0', r: 34, x: 0.8, y: 0.2 },
      ridges: [{ c: '#9cc9e0', par: 0.06, base: 150, amp: 60, f: 0.004 }, { c: '#74b39e', par: 0.14, base: 90, amp: 46, f: 0.007 }, { c: '#519c6c', par: 0.28, base: 44, amp: 30, f: 0.011 }],
      tree: { kind: 'round', c: '#2f7d4c', c2: '#3f9a5c', trunk: '#5a4630', par: 0.5 },
      cloud: 'rgba(255,255,255,0.92)', ground: ['#74cd68', '#3d8a3b'], strip: '#a2ea8c', detail: '#2f7a35',
    },
    sunset: {
      sky: ['#2a1a4c', '#b8416d', '#ffb56a'], sun: { c: '#ffeeb0', r: 54, x: 0.72, y: 0.52 },
      ridges: [{ c: '#8a3f73', par: 0.06, base: 140, amp: 70, f: 0.0035 }, { c: '#622b5c', par: 0.14, base: 86, amp: 52, f: 0.006 }, { c: '#431f47', par: 0.28, base: 40, amp: 30, f: 0.012 }],
      tree: { kind: 'cactus', c: '#2c1533', c2: '#2c1533', trunk: '#2c1533', par: 0.5 },
      cloud: 'rgba(255,190,150,0.55)', ground: ['#d08a4e', '#7b4427'], strip: '#f0b070', detail: '#8a4f2c',
    },
    night: {
      sky: ['#050919', '#121b45', '#2c3c7c'], sun: { c: '#eef2ff', r: 26, x: 0.78, y: 0.18, moon: true }, stars: true,
      ridges: [{ c: '#1b2450', par: 0.05, base: 150, amp: 30, f: 0.003, city: 0.9 }, { c: '#141b3c', par: 0.12, base: 80, amp: 20, f: 0.005, city: 1.3 }],
      tree: null, cloud: 'rgba(150,165,215,0.28)', ground: ['#2d3560', '#141933'], strip: '#5868b4', detail: '#1a2046', fireflies: true,
    },
    snow: {
      sky: ['#8fb8dc', '#c9e0f0', '#f3f9fc'], sun: { c: '#ffffff', r: 30, x: 0.25, y: 0.2 },
      ridges: [{ c: '#c9dcea', par: 0.06, base: 150, amp: 80, f: 0.004, cap: '#ffffff' }, { c: '#a8c4d8', par: 0.14, base: 86, amp: 50, f: 0.007, cap: '#f4f9fc' }, { c: '#8db0c8', par: 0.28, base: 40, amp: 26, f: 0.012 }],
      tree: { kind: 'pine', c: '#3c6f78', c2: '#ffffff', trunk: '#4a3a2e', par: 0.5 },
      cloud: 'rgba(255,255,255,0.8)', ground: ['#f6fbfe', '#b9d0df'], strip: '#ffffff', detail: '#9fbdd0', snow: true,
    },
    forest: {
      sky: ['#18284c', '#48608f', '#f0ad7e'], sun: { c: '#ffe2b0', r: 40, x: 0.3, y: 0.5 },
      ridges: [{ c: '#3d4f76', par: 0.06, base: 150, amp: 60, f: 0.004 }, { c: '#2b3a5b', par: 0.14, base: 90, amp: 44, f: 0.007 }, { c: '#1d2944', par: 0.28, base: 46, amp: 30, f: 0.011 }],
      tree: { kind: 'pine', c: '#142033', c2: '#142033', trunk: '#101827', par: 0.5 },
      cloud: 'rgba(255,200,170,0.4)', ground: ['#35584a', '#172820'], strip: '#4f7f68', detail: '#1f3a2e', fireflies: true,
    },
    stadium: {
      sky: ['#070b1f', '#152255', '#2f4a9a'], sun: null, stars: true, stadium: true,
      ridges: [], tree: null, cloud: 'rgba(150,165,215,0.2)', ground: ['#4fae4a', '#2f7a33'], strip: '#7fd870', detail: '#3f9440',
    },
  };

  class Scenery {
    constructor(theme = 'meadow', seed = 1) {
      this.theme = THEMES[theme] || THEMES.meadow;
      this.name = theme;
      this.seed = seed;
    }

    drawSky(ctx, W, H, camX, gy, t) {
      const th = this.theme, seed = this.seed;
      const g = ctx.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, th.sky[0]); g.addColorStop(0.6, th.sky[1]); g.addColorStop(1, th.sky[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      if (th.stars) {
        for (let i = 0; i < 70; i++) {
          const sx = hash(i * 3.1 + seed) * W, sy = hash(i * 7.7 + seed) * gy * 0.75;
          const a = 0.35 + 0.45 * Math.sin(t * (1 + hash(i) * 2) + i);
          ctx.fillStyle = `rgba(255,255,255,${clamp(a, 0.08, 0.9)})`;
          ctx.fillRect(sx, sy, 1.6, 1.6);
        }
      }
      if (th.sun) {
        const sx = W * th.sun.x, sy = gy * th.sun.y, r = th.sun.r;
        const gl = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 3.6);
        gl.addColorStop(0, rgba(th.sun.c, 0.55)); gl.addColorStop(1, rgba(th.sun.c, 0));
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(sx, sy, r * 3.6, 0, PI * 2); ctx.fill();
        ctx.fillStyle = th.sun.c;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, PI * 2); ctx.fill();
        if (th.sun.moon) {
          ctx.fillStyle = 'rgba(160,175,215,0.5)';
          ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.2, r * 0.22, 0, PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(sx + r * 0.35, sy + r * 0.3, r * 0.16, 0, PI * 2); ctx.fill();
        }
      }

      // clouds
      ctx.fillStyle = th.cloud;
      for (let i = 0; i < 7; i++) {
        const span = W + 360;
        const speed = 5 + hash(i + seed) * 9;
        let cx = (hash(i * 5.3 + seed) * span - camX * 0.04 - t * speed) % span;
        if (cx < 0) cx += span;
        cx -= 180;
        const cy = 30 + hash(i * 9.1 + seed) * gy * 0.38;
        const r = 20 + hash(i * 2.7 + seed) * 22;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.62, 0, PI * 2);
        ctx.arc(cx + r * 0.62, cy + r * 0.12, r * 0.48, 0, PI * 2);
        ctx.arc(cx - r * 0.58, cy + r * 0.16, r * 0.42, 0, PI * 2);
        ctx.arc(cx + r * 0.1, cy + r * 0.22, r * 0.5, 0, PI * 2);
        ctx.fill();
      }

      if (th.stadium) this.drawStadium(ctx, W, gy, camX, t);

      // ridges
      for (let li = 0; li < th.ridges.length; li++) {
        const L = th.ridges[li];
        const off = camX * L.par + seed * 371 * (li + 1);
        if (L.city) { this.drawCity(ctx, W, gy, off, L, li); continue; }
        const yAt = sx => {
          const wx = sx + off;
          return gy - L.base - L.amp * (0.5 * Math.sin(wx * L.f) + 0.3 * Math.sin(wx * L.f * 2.3 + 1.7) + 0.2 * Math.sin(wx * L.f * 4.9 + 0.6));
        };
        ctx.beginPath(); ctx.moveTo(0, gy + 2);
        for (let sx = 0; sx <= W + 16; sx += 16) ctx.lineTo(sx, yAt(sx));
        ctx.lineTo(W, gy + 2); ctx.closePath();
        ctx.fillStyle = L.c; ctx.fill();
        if (L.cap) {
          ctx.save(); ctx.clip();
          ctx.beginPath(); ctx.moveTo(0, 0);
          for (let sx = 0; sx <= W + 16; sx += 16) ctx.lineTo(sx, yAt(sx) + 16 + 8 * Math.sin((sx + off) * 0.05));
          ctx.lineTo(W, 0); ctx.closePath();
          ctx.fillStyle = L.cap; ctx.fill();
          ctx.restore();
        }
      }

      // trees
      if (th.tree) {
        const T = th.tree, cell = 130;
        const off = camX * T.par;
        const first = Math.floor(off / cell) - 1;
        for (let i = first; i < first + Math.ceil(W / cell) + 3; i++) {
          const h1 = hash(i * 1.37 + seed * 3.3);
          if (h1 < 0.3) continue;
          const tx = i * cell - off + hash(i * 2.9 + seed) * 70;
          const sz = 0.7 + hash(i * 4.1 + seed) * 0.8;
          this.drawTree(ctx, T, tx, gy + 2, sz);
        }
      }

      if (th.snow) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 60; i++) {
          const sp = 30 + hash(i * 1.9) * 50;
          const x = (hash(i * 3.3) * W + Math.sin(t * 0.8 + i) * 20 - camX * 0.3) % W;
          const y = (hash(i * 5.7) * H + t * sp) % H;
          ctx.beginPath(); ctx.arc(x < 0 ? x + W : x, y, 1.4 + hash(i) * 1.8, 0, PI * 2); ctx.fill();
        }
      }
      if (th.fireflies) {
        for (let i = 0; i < 14; i++) {
          const x = (hash(i * 3.3 + 5) * W + Math.sin(t * 0.5 + i * 2) * 40 - camX * 0.4) % W;
          const y = gy - 30 - hash(i * 5.7) * 160 + Math.cos(t * 0.7 + i) * 14;
          const a = 0.4 + 0.5 * Math.sin(t * 3 + i * 1.7);
          ctx.fillStyle = `rgba(255,240,150,${clamp(a, 0, 0.9)})`;
          ctx.beginPath(); ctx.arc(x < 0 ? x + W : x, y, 2, 0, PI * 2); ctx.fill();
        }
      }
    }

    drawTree(ctx, T, x, gy, sz) {
      if (T.kind === 'pine') {
        ctx.fillStyle = T.trunk; ctx.fillRect(x - 3 * sz, gy - 16 * sz, 6 * sz, 16 * sz);
        for (let k = 0; k < 3; k++) {
          const w = (30 - k * 7) * sz, by = gy - (12 + k * 22) * sz, h = 34 * sz;
          ctx.fillStyle = T.c;
          ctx.beginPath(); ctx.moveTo(x - w, by); ctx.lineTo(x, by - h); ctx.lineTo(x + w, by); ctx.closePath(); ctx.fill();
          if (T.c2 !== T.c) {
            ctx.fillStyle = T.c2;
            ctx.beginPath(); ctx.moveTo(x - w * 0.42, by - h * 0.58); ctx.lineTo(x, by - h); ctx.lineTo(x + w * 0.42, by - h * 0.58);
            ctx.lineTo(x + w * 0.2, by - h * 0.5); ctx.lineTo(x, by - h * 0.62); ctx.lineTo(x - w * 0.2, by - h * 0.5); ctx.closePath(); ctx.fill();
          }
        }
      } else if (T.kind === 'cactus') {
        ctx.strokeStyle = T.c; ctx.lineCap = 'round'; ctx.lineWidth = 12 * sz;
        ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - 60 * sz); ctx.stroke();
        ctx.lineWidth = 8 * sz;
        ctx.beginPath(); ctx.moveTo(x, gy - 28 * sz); ctx.lineTo(x - 18 * sz, gy - 28 * sz); ctx.lineTo(x - 18 * sz, gy - 46 * sz); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, gy - 38 * sz); ctx.lineTo(x + 16 * sz, gy - 38 * sz); ctx.lineTo(x + 16 * sz, gy - 54 * sz); ctx.stroke();
      } else {
        ctx.fillStyle = T.trunk; ctx.fillRect(x - 4 * sz, gy - 40 * sz, 8 * sz, 40 * sz);
        ctx.fillStyle = T.c;
        ctx.beginPath(); ctx.arc(x, gy - 56 * sz, 26 * sz, 0, PI * 2); ctx.arc(x - 18 * sz, gy - 42 * sz, 18 * sz, 0, PI * 2); ctx.arc(x + 18 * sz, gy - 42 * sz, 18 * sz, 0, PI * 2); ctx.fill();
        ctx.fillStyle = T.c2;
        ctx.beginPath(); ctx.arc(x - 6 * sz, gy - 62 * sz, 14 * sz, 0, PI * 2); ctx.fill();
      }
    }

    drawCity(ctx, W, gy, off, L, li) {
      const cell = 64 * L.city;
      const first = Math.floor(off / cell) - 1;
      for (let i = first; i < first + Math.ceil(W / cell) + 3; i++) {
        const bx = i * cell - off;
        const bh = L.base + L.amp * 2 * hash(i * 1.7 + li * 9) + (hash(i * 3.3 + li) > 0.8 ? 60 : 0);
        const bw = cell * (0.7 + hash(i * 2.3 + li) * 0.28);
        ctx.fillStyle = L.c;
        ctx.fillRect(bx, gy - bh, bw, bh + 2);
        ctx.fillStyle = 'rgba(255,216,107,0.75)';
        const cols = Math.floor(bw / 12), rows = Math.floor(bh / 16);
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
          if (hash(i * 13.1 + c * 7.3 + r * 3.7 + li) > 0.72) ctx.fillRect(bx + 5 + c * 12, gy - bh + 7 + r * 16, 5, 7);
        }
      }
    }

    drawStadium(ctx, W, gy, camX, t) {
      const top = gy - 190;
      const g = ctx.createLinearGradient(0, top, 0, gy);
      g.addColorStop(0, '#1c2550'); g.addColorStop(1, '#2a3566');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, top + 30); ctx.quadraticCurveTo(W / 2, top - 30, W, top + 30); ctx.lineTo(W, gy); ctx.lineTo(0, gy); ctx.closePath(); ctx.fill();
      const cols = ['#ff5d5d', '#4da3ff', '#ffd34d', '#ffffff', '#37d6c4', '#c77dff'];
      for (let r = 0; r < 9; r++) {
        const y = top + 34 + r * 16;
        for (let c = 0; c < W / 13; c++) {
          const h = hash(c * 3.1 + r * 17.7);
          const bob = Math.sin(t * (3 + h * 3) + c + r) * 1.5;
          ctx.fillStyle = cols[(h * cols.length) | 0];
          ctx.globalAlpha = 0.55 + h * 0.3;
          ctx.beginPath(); ctx.arc(c * 13 + (r % 2) * 6, y + bob, 4, 0, PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e9eef8';
      ctx.fillRect(0, gy - 34, W, 22);
      ctx.fillStyle = '#c23b3b';
      for (let i = 0; i < W / 160 + 1; i++) ctx.fillRect(i * 160 + 20, gy - 30, 90, 14);
      // floodlights
      [0.12, 0.88].forEach(fx => {
        const lx = W * fx, ly = top - 40;
        ctx.strokeStyle = '#3a4578'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(lx, top + 30); ctx.lineTo(lx, ly); ctx.stroke();
        const gl = ctx.createRadialGradient(lx, ly, 4, lx, ly, 150);
        gl.addColorStop(0, 'rgba(255,255,230,0.75)'); gl.addColorStop(1, 'rgba(255,255,230,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(lx, ly, 150, 0, PI * 2); ctx.fill();
        ctx.fillStyle = '#fffbe0'; ctx.fillRect(lx - 22, ly - 8, 44, 16);
      });
    }

    drawGround(ctx, W, H, camX, gy) {
      const th = this.theme;
      const g = ctx.createLinearGradient(0, gy, 0, H);
      g.addColorStop(0, th.ground[0]); g.addColorStop(1, th.ground[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = th.strip;
      ctx.fillRect(0, gy, W, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(0, gy + 5, W, 4);
      // ground details locked to the world
      const cell = 46;
      const first = Math.floor(camX / cell) - 1;
      ctx.strokeStyle = th.detail; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = first; i < first + Math.ceil(W / cell) + 3; i++) {
        const h1 = hash(i * 1.93 + this.seed);
        const x = i * cell - camX + h1 * 30;
        if (h1 > 0.45) {
          ctx.beginPath();
          ctx.moveTo(x, gy + 1); ctx.lineTo(x - 4, gy - 7 - h1 * 5);
          ctx.moveTo(x + 4, gy + 1); ctx.lineTo(x + 7, gy - 6 - h1 * 4);
          ctx.stroke();
        }
        const h2 = hash(i * 5.31 + this.seed);
        if (h2 > 0.6) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.beginPath(); ctx.ellipse(x + 14, gy + 22 + h2 * 50, 12 + h2 * 10, 3, 0, 0, PI * 2); ctx.fill();
        }
      }
    }

    draw(ctx, W, H, camX, gy, t) {
      this.drawSky(ctx, W, H, camX, gy, t);
      this.drawGround(ctx, W, H, camX, gy);
    }
  }

  SG.Scenery = Scenery;
  SG.THEMES = THEMES;
})();
