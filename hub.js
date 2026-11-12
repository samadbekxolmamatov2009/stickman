(() => {
  'use strict';
  const GAMES = [
    { id: 'fight', title: 'Arena Fight', icon: '🥊', color: 'linear-gradient(135deg,#ff6b6b,#c23b3b)', players: '1-2 o\'yinchi', desc: 'Kombo, blok, qurol va olovli zarba bilan jang.', ready: true },
    { id: 'football', title: 'Stickman Futbol', icon: '⚽', color: 'linear-gradient(135deg,#6fd166,#2f8a3a)', players: '1-2 o\'yinchi', desc: 'Bosh bilan ur, tep, super zarba bilan gol kirit.', ready: true },
    { id: 'race', title: 'Stickman Race', icon: '🏁', color: 'linear-gradient(135deg,#37d6c4,#1f9a8c)', players: '1-4 o\'yinchi', desc: 'Marragacha poyga: to\'siqlar, turbo, o\'zib ketish.', ready: true },
    { id: 'archery', title: 'O\'q-yoy dueli', icon: '🏹', color: 'linear-gradient(135deg,#ffb84d,#d9791f)', players: '1-2 o\'yinchi', desc: 'Minoradan nishonga ol: shamol, tepalik, bonuslar.', ready: true },
    { id: 'towerdefense', title: 'Minora mudofaasi', icon: '🛡️', color: 'linear-gradient(135deg,#5aa9ff,#2a62c9)', players: '1 o\'yinchi', desc: '4 xil himoyachi, yangilash, 10 to\'lqin va boss.', ready: true },
    { id: 'stickhero', title: 'Ko\'prik qahramoni', icon: '🌉', color: 'linear-gradient(135deg,#c77dff,#7a3fc2)', players: '1 o\'yinchi', desc: 'Ko\'prik tashla, teskari o\'tib olmos yig\'.', ready: true },
    { id: 'ninja', title: 'Ninja kesish', icon: '🥷', color: 'linear-gradient(135deg,#ff8a5d,#c2452e)', players: '1 o\'yinchi', desc: 'Mevalarni kes, kombo yig\', bombaga tegma.', ready: true },
    { id: 'battleroyale', title: 'Battle Royale', icon: '💀', color: 'linear-gradient(135deg,#b06cff,#6a2fc2)', players: '1 o\'yinchi + 7 bot', desc: 'Qurol top, zonada qol, oxirgi omon qolgan yutadi.', ready: true },
    { id: 'rope', title: 'Arqonda uchish', icon: '🪢', color: 'linear-gradient(135deg,#7df9ff,#2a8fb0)', players: '1 o\'yinchi', desc: 'Arqon ot, tebran, to\'g\'ri paytda qo\'yib yubor.', ready: true },
    { id: 'tower', title: 'Parkur minorasi', icon: '🌋', color: 'linear-gradient(135deg,#ff9a3d,#c2301f)', players: '1 o\'yinchi', desc: 'Tepaga sakrab chiq — pastdan lava ko\'tariladi.', ready: true },
  ];
  const grid = document.getElementById('grid');
  GAMES.forEach(g => {
    const el = document.createElement(g.ready ? 'a' : 'div');
    el.className = 'card' + (g.ready ? '' : ' soon');
    if (g.ready) el.href = `games/${g.id}/index.html`;
    el.innerHTML = `${g.ready ? '' : '<span class="soon-badge">Tez orada</span>'}
      <div class="icon" style="background:${g.color}">${g.icon}</div>
      <div><h3>${g.title}</h3><p>${g.desc}</p><span class="players">${g.players}</span></div>`;
    grid.appendChild(el);
  });

  // animated backdrop
  let W = 960;
  SG.initView(document.getElementById('game'), () => { W = SG.view.W; });
  const scenery = new SG.Scenery('night', 7);
  const cast = [
    { c: new SG.Char({ color: '#ff5d5d' }), x: 0.1, kind: 'run' },
    { c: new SG.Char({ color: '#4da3ff', style: 'spiky' }), x: 0.3, kind: 'guard' },
    { c: new SG.Char({ color: '#ffd34d' }), x: 0.72, kind: 'aim' },
    { c: new SG.Char({ color: '#4ddd8f', style: 'spiky' }), x: 0.9, kind: 'cheer' },
  ];
  let t = 0;
  SG.run(dt => { t += dt; }, ctx => {
    const gy = 500;
    scenery.draw(ctx, W, 540, t * 30, gy, t);
    cast.forEach(a => {
      const P = SG.poses;
      const pose = a.kind === 'run' ? P.run(t * 11) : a.kind === 'guard' ? (Math.sin(t * 2) > 0.6 ? P.punch() : P.guard(t)) : a.kind === 'aim' ? P.aim(0.4 + Math.sin(t) * 0.2, 0.5 + 0.5 * Math.sin(t * 2)) : P.cheer(t);
      a.c.to(pose, 0.016, 14);
      a.c.draw(ctx, W * a.x, gy, { facing: a.x > 0.5 ? -1 : 1, weapon: a.kind === 'aim' ? 'bow' : a.kind === 'guard' ? null : null, bowPull: 0.5 + 0.5 * Math.sin(t * 2), arrow: true, mood: a.kind === 'cheer' ? 'happy' : 'normal' });
    });
    ctx.fillStyle = 'rgba(5,7,16,0.45)'; ctx.fillRect(0, 0, W, 540);
  });
})();
