// Stickman Games — articulated character rig ("shadow ninja" style) with pose blending.
(() => {
  'use strict';
  const { clamp, mix, rand } = SG;

  const D = { thigh: 21, shin: 21, torso: 31, neck: 3, head: 13.5, uarm: 16, farm: 16 };
  const HIP_H = D.thigh + D.shin;
  const KEYS = ['hx', 'hy', 'lean', 'head', 'rot', 'af1', 'af2', 'ab1', 'ab2', 'lf1', 'lf2', 'lb1', 'lb2'];
  const BASE = { hx: 0, hy: 0, lean: 0, head: 0, rot: 0, af1: 0.12, af2: 0.35, ab1: -0.15, ab2: 0.3, lf1: 0.12, lf2: -0.08, lb1: -0.12, lb2: -0.05 };
  const P = o => Object.assign({}, BASE, o);
  const PI = Math.PI;

  // Angles: 0 = pointing down, +PI/2 = pointing forward (facing dir), PI = up. Second value of a limb is the joint bend.
  const poses = {
    stand: (t = 0) => P({ hy: Math.sin(t * 2.2) * 0.8, af2: 0.35 + Math.sin(t * 2.2) * 0.04 }),
    guard: (t = 0) => P({ lean: 0.12, hy: 3 + Math.sin(t * 5) * 1.2, af1: 0.95, af2: 1.55, ab1: 0.45, ab2: 1.9, lf1: 0.38, lf2: -0.45, lb1: -0.42, lb2: -0.3 }),
    run: (ph) => {
      const s = Math.sin(ph), c = Math.cos(ph);
      return P({
        lean: 0.26, hy: -2.5 * Math.abs(c) + 2,
        lf1: 0.95 * s, lf2: -(0.2 + 1.15 * Math.max(0, c)),
        lb1: -0.95 * s, lb2: -(0.2 + 1.15 * Math.max(0, -c)),
        af1: -0.95 * s, af2: 1.35, ab1: 0.95 * s, ab2: 1.35,
      });
    },
    walk: (ph) => {
      const s = Math.sin(ph), c = Math.cos(ph);
      return P({
        lean: 0.06, hy: -1.2 * Math.abs(c) + 1,
        lf1: 0.5 * s, lf2: -(0.1 + 0.55 * Math.max(0, c)),
        lb1: -0.5 * s, lb2: -(0.1 + 0.55 * Math.max(0, -c)),
        af1: -0.45 * s, af2: 0.45, ab1: 0.45 * s, ab2: 0.45,
      });
    },
    jump: () => P({ lean: 0.1, af1: 2.5, af2: 0.3, ab1: 2.1, ab2: 0.4, lf1: 1.0, lf2: -1.5, lb1: -0.1, lb2: -0.9 }),
    fall: () => P({ lean: -0.05, af1: 1.9, af2: 0.25, ab1: -1.2, ab2: -0.3, lf1: 0.35, lf2: -0.4, lb1: -0.45, lb2: -0.5 }),
    slide: () => P({ lean: -1.2, hy: 27, hx: -6, head: 0.6, lf1: 1.45, lf2: -0.05, lb1: 1.15, lb2: -1.1, af1: -0.5, af2: -0.3, ab1: -0.9, ab2: -0.2 }),
    duck: () => P({ lean: 0.5, hy: 17, head: -0.3, af1: 0.9, af2: 1.6, ab1: 0.6, ab2: 1.7, lf1: 1.0, lf2: -1.75, lb1: 0.2, lb2: -1.5 }),
    block: (t = 0) => P({ lean: 0.2, hy: 7, af1: 1.35, af2: 1.75, ab1: 1.05, ab2: 1.95, lf1: 0.55, lf2: -0.75, lb1: -0.4, lb2: -0.55 }),
    punch: () => P({ lean: 0.32, hx: 5, af1: 1.62, af2: 0.0, ab1: 0.5, ab2: 2.0, lf1: 0.55, lf2: -0.4, lb1: -0.6, lb2: -0.15 }),
    cross: () => P({ lean: 0.4, hx: 7, af1: 0.6, af2: 1.9, ab1: 1.66, ab2: 0.0, lf1: 0.6, lf2: -0.45, lb1: -0.65, lb2: -0.1 }),
    upper: () => P({ lean: -0.08, hy: -5, af1: 2.75, af2: 0.25, ab1: 0.4, ab2: 1.8, lf1: 0.3, lf2: -0.2, lb1: -0.4, lb2: -0.1 }),
    windup: () => P({ lean: -0.15, hx: -3, af1: -0.5, af2: 1.9, ab1: 0.7, ab2: 1.7, lf1: 0.4, lf2: -0.5, lb1: -0.4, lb2: -0.4 }),
    kick: () => P({ lean: -0.38, hx: -2, lf1: 1.6, lf2: 0.0, lb1: -0.05, lb2: -0.12, af1: 0.4, af2: 1.2, ab1: -0.8, ab2: 0.6 }),
    kickUp: () => P({ lean: -0.55, hx: -3, lf1: 2.2, lf2: 0.0, lb1: -0.05, lb2: -0.15, af1: 0.2, af2: 1.0, ab1: -1.0, ab2: 0.5 }),
    kickBack: () => P({ lean: 0.2, lf1: -0.6, lf2: -1.2, lb1: 0.1, lb2: -0.1, af1: 0.8, af2: 1.0, ab1: -0.4, ab2: 0.8 }),
    hurt: () => P({ lean: -0.42, head: -0.35, af1: -0.4, af2: -0.5, ab1: -1.1, ab2: -0.3, lf1: 0.35, lf2: -0.3, lb1: -0.3, lb2: -0.25 }),
    ko: () => P({ rot: -1.5, lean: -0.05, head: -0.2, af1: -0.9, af2: -0.4, ab1: -2.0, ab2: -0.3, lf1: 0.3, lf2: -0.2, lb1: 0.0, lb2: -0.5 }),
    faceplant: () => P({ rot: 1.5, lean: 0.1, head: 0.3, af1: 2.6, af2: 0.3, ab1: 2.2, ab2: 0.2, lf1: -0.2, lf2: -0.3, lb1: 0.1, lb2: -0.6 }),
    cheer: (t = 0) => P({ hy: -Math.abs(Math.sin(t * 7)) * 7, af1: 2.75 + Math.sin(t * 12) * 0.2, af2: 0.2, ab1: 2.45 - Math.sin(t * 12) * 0.2, ab2: 0.25, lf1: 0.2, lf2: -0.15, lb1: -0.2, lb2: -0.15 }),
    sad: (t = 0) => P({ lean: 0.35, head: 0.5, hy: 2, af1: 0.1, af2: 0.1, ab1: 0.05, ab2: 0.1 }),
    aim: (a = 0, pull = 1) => P({ lean: -0.08, af1: PI / 2 + a, af2: 0, ab1: PI / 2 + a - 0.3 - 0.15 * pull, ab2: 1.2 + 1.1 * pull, lf1: 0.32, lf2: -0.1, lb1: -0.38, lb2: -0.1 }),
    slash: (p = 0) => P({ lean: 0.1 + 0.25 * p, hx: 4 * p, af1: 2.7 - 2.0 * p, af2: 0.25, ab1: 0.3, ab2: 1.2, lf1: 0.45, lf2: -0.35, lb1: -0.5, lb2: -0.2 }),
    push: (t = 0) => P({ lean: 0.2, af1: 1.3, af2: 0.5, ab1: 1.1, ab2: 0.7, lf1: 0.4, lf2: -0.4, lb1: -0.45, lb2: -0.2, hy: 2 + Math.sin(t * 20) * 0.6 }),
    cast: () => P({ lean: -0.1, af1: 2.2, af2: 0.3, ab1: 0.6, ab2: 1.2 }),
  };

  class Char {
    constructor(o = {}) {
      this.color = o.color || '#ff5d5d';
      this.body = o.body || '#171d2b';
      this.style = o.style || 'band';
      this.p = P({});
      this.j = { hand: { x: 0, y: 0 }, hand2: { x: 0, y: 0 }, foot: { x: 0, y: 0 }, foot2: { x: 0, y: 0 }, head: { x: 0, y: 0 }, chest: { x: 0, y: 0 } };
      this.tails = [[], []];
      this._lt = 0;
      this.blinkT = rand(1, 4);
      this.blink = 0;
    }
    snap(target) { for (const k of KEYS) this.p[k] = target[k]; return this; }
    to(target, dt, rate = 16) {
      const a = 1 - Math.exp(-rate * dt);
      for (const k of KEYS) this.p[k] += (target[k] - this.p[k]) * a;
      return this;
    }

    draw(ctx, x, y, o = {}) {
      const f = o.facing === -1 ? -1 : 1;
      const s = o.scale || 1;
      const p = this.p;
      const flash = o.flash > 0;
      const body = flash ? '#ffffff' : this.body;
      const back = flash ? '#ffffff' : mix(this.body, '#5b6a8c', 0.28);
      const rim = flash ? '#ffffff' : mix(this.body, this.color, 0.42);
      const accent = flash ? '#ffffff' : this.color;
      const accentDark = flash ? '#ffffff' : mix(this.color, '#000000', 0.28);

      const now = performance.now();
      const rdt = Math.min(0.05, (now - this._lt) / 1000) || 0.016;
      this._lt = now;
      this.blinkT -= rdt;
      if (this.blinkT <= 0) { this.blink = 0.12; this.blinkT = rand(1.8, 4.5); }
      if (this.blink > 0) this.blink -= rdt;

      // --- joints (local, y down) ---
      const hipX = f * p.hx * s, hipY = (-HIP_H + p.hy) * s;
      const T = D.torso * s;
      const chX = hipX + f * Math.sin(p.lean) * T, chY = hipY - Math.cos(p.lean) * T;
      const shX = hipX + (chX - hipX) * 0.88, shY = hipY + (chY - hipY) * 0.88;
      const ha = p.lean + p.head;
      const hr = D.head * s;
      const hdX = chX + f * Math.sin(ha) * (D.neck * s + hr), hdY = chY - Math.cos(ha) * (D.neck * s + hr);
      const limb = (jx, jy, a1, a2, l1, l2) => {
        const mx = jx + f * Math.sin(a1) * l1 * s, my = jy + Math.cos(a1) * l1 * s;
        const ex = mx + f * Math.sin(a1 + a2) * l2 * s, ey = my + Math.cos(a1 + a2) * l2 * s;
        return [jx, jy, mx, my, ex, ey, a1 + a2];
      };
      const aF = limb(shX, shY, p.af1, p.af2, D.uarm, D.farm);
      const aB = limb(shX, shY, p.ab1, p.ab2, D.uarm, D.farm);
      const lF = limb(hipX, hipY, p.lf1, p.lf2, D.thigh, D.shin);
      const lB = limb(hipX, hipY, p.lb1, p.lb2, D.thigh, D.shin);

      const rot = p.rot * f;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const world = (lx, ly) => ({ x: x + lx * cr - ly * sr, y: y + lx * sr + ly * cr });
      this.j.hand = world(aF[4], aF[5]); this.j.hand2 = world(aB[4], aB[5]);
      this.j.foot = world(lF[4], lF[5]); this.j.foot2 = world(lB[4], lB[5]);
      this.j.head = world(hdX, hdY); this.j.chest = world(chX, chY);

      ctx.save();
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;

      // --- ground shadow ---
      if (o.shadow !== false) {
        const gy = o.groundY !== undefined ? o.groundY : y;
        const hgt = clamp(1 - (gy - y) / (240 * s), 0.25, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(x + hipX * 0.5, gy + 3 * s, 25 * s * hgt, 6 * s * hgt, 0, 0, PI * 2);
        ctx.fill();
      }

      // --- headband tails (world space, behind the body) ---
      if (this.style !== 'helmet' && this.style !== 'none' && o.tails !== false) {
        const knot = world(hdX - f * hr * 0.92, hdY - hr * 0.28);
        for (let r = 0; r < 2; r++) {
          const pts = this.tails[r];
          const n = 5 + r;
          if (pts.length !== n || Math.hypot(pts[0].x - knot.x, pts[0].y - knot.y) > 90) {
            pts.length = 0;
            for (let i = 0; i < n; i++) pts.push({ x: knot.x - f * i * 5 * s, y: knot.y + i * 2 * s });
          }
          pts[0].x = knot.x; pts[0].y = knot.y;
          const k = Math.min(1, rdt * 24);
          for (let i = 1; i < n; i++) {
            const tx = pts[i - 1].x - f * 5.2 * s;
            const ty = pts[i - 1].y + (1.6 + r * 1.2) * s + Math.sin(now / 110 + i * 1.2 + r * 2) * 1.5 * s;
            pts[i].x += (tx - pts[i].x) * k; pts[i].y += (ty - pts[i].y) * k;
          }
          ctx.strokeStyle = r === 0 ? accent : accentDark;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let i = 1; i < n; i++) {
            ctx.lineWidth = Math.max(1.2, (4.4 - i * 0.55) * s);
            ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
          }
        }
      }

      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      const R = 2.2 * Math.max(0.6, s);
      const stroke3 = (L, w, col) => {
        ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(L[2], L[3]); ctx.lineTo(L[4], L[5]);
        ctx.lineWidth = w * s + R * 2; ctx.strokeStyle = rim; ctx.stroke();
        ctx.lineWidth = Math.max(1.5, w * s); ctx.strokeStyle = col; ctx.stroke();
      };
      const shoe = (L, col) => {
        const a = -f * L[6];
        ctx.save();
        ctx.translate(L[4], L[5]); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(f * 3.2 * s, 0, 7.6 * s, 4.4 * s, 0, 0, PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = Math.max(1, 1.4 * s); ctx.strokeStyle = rim; ctx.stroke();
        ctx.restore();
      };
      const glove = (L, col) => {
        ctx.beginPath(); ctx.arc(L[4], L[5], 4.9 * s, 0, PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = Math.max(1, 1.4 * s); ctx.strokeStyle = rim; ctx.stroke();
      };

      // back arm, back leg
      stroke3(aB, 6.5, back); glove(aB, accentDark);
      stroke3(lB, 7.5, back); shoe(lB, accentDark);

      // bow sits behind the torso/front arm
      if (o.weapon === 'bow') this.drawBow(ctx, aF, aB, f, s, o, flash);

      // torso + sash
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(chX, chY);
      ctx.lineWidth = 12.5 * s + R * 2; ctx.strokeStyle = rim; ctx.stroke();
      ctx.lineWidth = 12.5 * s; ctx.strokeStyle = body; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hipX + (chX - hipX) * 0.06, hipY + (chY - hipY) * 0.06);
      ctx.lineTo(hipX + (chX - hipX) * 0.2, hipY + (chY - hipY) * 0.2);
      ctx.lineCap = 'butt'; ctx.lineWidth = 13 * s; ctx.strokeStyle = accent; ctx.stroke(); ctx.lineCap = 'round';

      // front leg
      stroke3(lF, 8, body); shoe(lF, accent);

      // head
      this.drawHead(ctx, hdX, hdY, hr, f, s, ha, o, body, rim, accent, accentDark, flash);

      // weapon (front hand) + front arm
      if (o.weapon && o.weapon !== 'bow') this.drawWeapon(ctx, o.weapon, aF, f, s, o, flash);
      stroke3(aF, 7, body); glove(aF, accent);

      ctx.restore();
    }

    drawHead(ctx, hx, hy, hr, f, s, ha, o, body, rim, accent, accentDark, flash) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(f * ha * 0.6);
      if (this.style === 'spiky') {
        ctx.beginPath();
        ctx.moveTo(f * hr * 0.75, -hr * 0.7);
        ctx.lineTo(f * hr * 0.55, -hr * 1.55); ctx.lineTo(f * hr * 0.1, -hr * 1.05);
        ctx.lineTo(-f * hr * 0.25, -hr * 1.7); ctx.lineTo(-f * hr * 0.5, -hr * 1.0);
        ctx.lineTo(-f * hr * 1.15, -hr * 1.35); ctx.lineTo(-f * hr * 1.0, -hr * 0.4);
        ctx.lineTo(-f * hr * 1.5, -hr * 0.3); ctx.lineTo(-f * hr * 0.9, hr * 0.25);
        ctx.closePath();
        ctx.fillStyle = body; ctx.fill();
        ctx.lineWidth = Math.max(1, 2 * s); ctx.strokeStyle = rim; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, hr, 0, PI * 2);
      ctx.fillStyle = body; ctx.fill();
      ctx.lineWidth = Math.max(1, 2.2 * s); ctx.strokeStyle = rim; ctx.stroke();

      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, hr - 0.4, 0, PI * 2); ctx.clip();
      if (this.style === 'helmet') {
        ctx.fillStyle = accent;
        ctx.fillRect(-hr, -hr, hr * 2, hr * 0.95);
        ctx.fillStyle = accentDark;
        ctx.fillRect(-hr, -hr * 0.2, hr * 2, hr * 0.22);
      } else if (this.style !== 'none') {
        ctx.fillStyle = accent;
        ctx.fillRect(-hr, -hr * 0.52, hr * 2, hr * 0.44);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(-hr, -hr * 0.52, hr * 2, hr * 0.12);
      }
      // eyes
      const mood = o.mood || 'normal';
      const eyeCol = flash ? '#222' : '#ffffff';
      const ey = hr * 0.26;
      if (mood === 'ko' || mood === 'hurt') {
        ctx.strokeStyle = eyeCol; ctx.lineWidth = Math.max(1.2, 2 * s); ctx.lineCap = 'round';
        const ex = f * hr * 0.5, d = hr * 0.22;
        ctx.beginPath();
        if (mood === 'ko') {
          ctx.moveTo(ex - d, ey - d); ctx.lineTo(ex + d, ey + d); ctx.moveTo(ex + d, ey - d); ctx.lineTo(ex - d, ey + d);
        } else {
          ctx.moveTo(ex - f * d, ey - d); ctx.lineTo(ex + f * d, ey); ctx.lineTo(ex - f * d, ey + d);
        }
        ctx.stroke();
      } else if (mood === 'happy') {
        ctx.strokeStyle = eyeCol; ctx.lineWidth = Math.max(1.2, 2.2 * s); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(f * hr * 0.45, ey + hr * 0.12, hr * 0.22, PI * 1.1, PI * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(f * hr * 0.88, ey + hr * 0.12, hr * 0.13, PI * 1.1, PI * 1.9); ctx.stroke();
      } else {
        const bl = this.blink > 0 ? 0.15 : 1;
        ctx.fillStyle = eyeCol;
        if (!flash) { ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 5 * s; }
        ctx.beginPath(); ctx.ellipse(f * hr * 0.46, ey, hr * 0.25, hr * 0.31 * bl, 0, 0, PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(f * hr * 0.86, ey, hr * 0.13, hr * 0.28 * bl, 0, 0, PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (mood !== 'calm') {
          ctx.fillStyle = body;
          ctx.beginPath();
          ctx.moveTo(f * hr * 0.05, ey - hr * 0.55); ctx.lineTo(f * hr * 1.1, ey - hr * 0.55);
          ctx.lineTo(f * hr * 1.1, ey + hr * 0.02); ctx.lineTo(f * hr * 0.05, ey - hr * 0.2);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();

      if (this.style !== 'helmet' && this.style !== 'none') {
        ctx.beginPath(); ctx.arc(-f * hr * 0.95, -hr * 0.3, 3.1 * s, 0, PI * 2);
        ctx.fillStyle = accentDark; ctx.fill();
      }
      if (this.style === 'helmet') {
        ctx.beginPath(); ctx.moveTo(0, -hr); ctx.lineTo(-f * hr * 0.2, -hr * 1.5); ctx.lineTo(f * hr * 0.25, -hr * 1.02);
        ctx.closePath(); ctx.fillStyle = accentDark; ctx.fill();
      }
      if (o.crown) {
        ctx.beginPath();
        ctx.moveTo(-hr * 0.7, -hr * 0.82); ctx.lineTo(-hr * 0.8, -hr * 1.6); ctx.lineTo(-hr * 0.3, -hr * 1.2);
        ctx.lineTo(0, -hr * 1.75); ctx.lineTo(hr * 0.3, -hr * 1.2); ctx.lineTo(hr * 0.8, -hr * 1.6); ctx.lineTo(hr * 0.7, -hr * 0.82);
        ctx.closePath(); ctx.fillStyle = '#ffd34d'; ctx.fill();
        ctx.lineWidth = Math.max(1, 1.5 * s); ctx.strokeStyle = '#a66d00'; ctx.stroke();
      }
      ctx.restore();
    }

    drawWeapon(ctx, type, aF, f, s, o, flash) {
      const fa = aF[6];
      const wa = o.weaponAngle !== undefined ? o.weaponAngle : fa + 1.3;
      const dx = f * Math.sin(wa), dy = Math.cos(wa);
      const hx = aF[4], hy = aF[5];
      ctx.save();
      ctx.lineCap = 'round';
      if (type === 'sword') {
        const L = 38 * s;
        ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.moveTo(hx - dx * 6 * s, hy - dy * 6 * s); ctx.lineTo(hx + dx * 4 * s, hy + dy * 4 * s); ctx.stroke();
        ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3.4 * s;
        ctx.beginPath(); ctx.moveTo(hx + dx * 5 * s - dy * 6 * s, hy + dy * 5 * s + dx * 6 * s); ctx.lineTo(hx + dx * 5 * s + dy * 6 * s, hy + dy * 5 * s - dx * 6 * s); ctx.stroke();
        const g = ctx.createLinearGradient(hx, hy, hx + dx * L, hy + dy * L);
        g.addColorStop(0, '#b8c4d8'); g.addColorStop(1, '#ffffff');
        ctx.strokeStyle = 'rgba(20,26,40,0.9)'; ctx.lineWidth = 6.4 * s;
        ctx.beginPath(); ctx.moveTo(hx + dx * 7 * s, hy + dy * 7 * s); ctx.lineTo(hx + dx * L, hy + dy * L); ctx.stroke();
        ctx.strokeStyle = flash ? '#fff' : g; ctx.lineWidth = 4 * s;
        ctx.stroke();
      } else if (type === 'club') {
        ctx.strokeStyle = 'rgba(20,26,40,0.9)'; ctx.lineWidth = 9 * s;
        ctx.beginPath(); ctx.moveTo(hx - dx * 5 * s, hy - dy * 5 * s); ctx.lineTo(hx + dx * 30 * s, hy + dy * 30 * s); ctx.stroke();
        ctx.strokeStyle = '#9a6a3a'; ctx.lineWidth = 4.5 * s;
        ctx.beginPath(); ctx.moveTo(hx - dx * 5 * s, hy - dy * 5 * s); ctx.lineTo(hx + dx * 12 * s, hy + dy * 12 * s); ctx.stroke();
        ctx.strokeStyle = '#b98248'; ctx.lineWidth = 7 * s;
        ctx.beginPath(); ctx.moveTo(hx + dx * 14 * s, hy + dy * 14 * s); ctx.lineTo(hx + dx * 30 * s, hy + dy * 30 * s); ctx.stroke();
      } else if (type === 'hammer') {
        ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 4.5 * s;
        ctx.beginPath(); ctx.moveTo(hx - dx * 6 * s, hy - dy * 6 * s); ctx.lineTo(hx + dx * 30 * s, hy + dy * 30 * s); ctx.stroke();
        ctx.strokeStyle = 'rgba(20,26,40,0.9)'; ctx.lineWidth = 17 * s; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(hx + dx * 26 * s - dy * 12 * s, hy + dy * 26 * s + dx * 12 * s); ctx.lineTo(hx + dx * 26 * s + dy * 12 * s, hy + dy * 26 * s - dx * 12 * s); ctx.stroke();
        ctx.strokeStyle = '#9aa7bd'; ctx.lineWidth = 13 * s;
        ctx.beginPath(); ctx.moveTo(hx + dx * 26 * s - dy * 10 * s, hy + dy * 26 * s + dx * 10 * s); ctx.lineTo(hx + dx * 26 * s + dy * 10 * s, hy + dy * 26 * s - dx * 10 * s); ctx.stroke();
      } else if (type === 'spear') {
        ctx.strokeStyle = 'rgba(20,26,40,0.9)'; ctx.lineWidth = 6 * s;
        ctx.beginPath(); ctx.moveTo(hx - dx * 24 * s, hy - dy * 24 * s); ctx.lineTo(hx + dx * 40 * s, hy + dy * 40 * s); ctx.stroke();
        ctx.strokeStyle = '#9a6a3a'; ctx.lineWidth = 3.4 * s; ctx.stroke();
        ctx.fillStyle = '#e6edf7';
        ctx.beginPath();
        ctx.moveTo(hx + dx * 52 * s, hy + dy * 52 * s);
        ctx.lineTo(hx + dx * 38 * s - dy * 5 * s, hy + dy * 38 * s + dx * 5 * s);
        ctx.lineTo(hx + dx * 38 * s + dy * 5 * s, hy + dy * 38 * s - dx * 5 * s);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(20,26,40,0.9)'; ctx.lineWidth = 1.5 * s; ctx.stroke();
      } else if (type === 'staff') {
        ctx.strokeStyle = 'rgba(20,26,40,0.9)'; ctx.lineWidth = 6 * s;
        ctx.beginPath(); ctx.moveTo(hx - dx * 20 * s, hy - dy * 20 * s); ctx.lineTo(hx + dx * 30 * s, hy + dy * 30 * s); ctx.stroke();
        ctx.strokeStyle = '#6b4a8a'; ctx.lineWidth = 3.4 * s; ctx.stroke();
        const ox = hx + dx * 34 * s, oy = hy + dy * 34 * s;
        const g = ctx.createRadialGradient(ox, oy, 1, ox, oy, 10 * s);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, o.orb || '#c77dff'); g.addColorStop(1, 'rgba(199,125,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ox, oy, 10 * s, 0, PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    drawBow(ctx, aF, aB, f, s, o, flash) {
      const a = aF[6];
      const dx = f * Math.sin(a), dy = Math.cos(a);
      const nx = -dy, ny = dx;
      const hx = aF[4], hy = aF[5];
      const Rb = 26 * s;
      const t1x = hx + nx * Rb - dx * 9 * s, t1y = hy + ny * Rb - dy * 9 * s;
      const t2x = hx - nx * Rb - dx * 9 * s, t2y = hy - ny * Rb - dy * 9 * s;
      ctx.save();
      ctx.lineCap = 'round';
      const pull = o.bowPull || 0;
      const sx = pull > 0.02 ? aB[4] : hx - dx * 9 * s, sy = pull > 0.02 ? aB[5] : hy - dy * 9 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, 1.3 * s);
      ctx.beginPath(); ctx.moveTo(t1x, t1y); ctx.lineTo(sx, sy); ctx.lineTo(t2x, t2y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(t1x, t1y);
      ctx.quadraticCurveTo(hx + dx * 12 * s, hy + dy * 12 * s, t2x, t2y);
      ctx.strokeStyle = 'rgba(20,26,40,0.9)'; ctx.lineWidth = 7 * s; ctx.stroke();
      ctx.strokeStyle = flash ? '#fff' : '#b9824a'; ctx.lineWidth = 4 * s; ctx.stroke();
      if (o.arrow) {
        const ax = sx, ay = sy;
        const L = 46 * s;
        ctx.strokeStyle = '#f2e6d0'; ctx.lineWidth = 2.4 * s;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + dx * L, ay + dy * L); ctx.stroke();
        ctx.fillStyle = '#e6edf7';
        ctx.beginPath();
        ctx.moveTo(ax + dx * (L + 8 * s), ay + dy * (L + 8 * s));
        ctx.lineTo(ax + dx * L + nx * 4 * s, ay + dy * L + ny * 4 * s);
        ctx.lineTo(ax + dx * L - nx * 4 * s, ay + dy * L - ny * 4 * s);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  SG.Char = Char;
  SG.poses = poses;
  SG.CHAR_H = HIP_H + D.torso + D.neck + D.head * 2;
})();
