const GAMES = [
  { id: 'race', title: "Stickman Race", icon: '🏁', color: 'linear-gradient(135deg,#37d6c4,#2bb7a6)', players: '1-4 o\'yinchi', desc: "Ko'p qavatli poyga — botlarga qarshi yoki do'stlar bilan to'siqlardan oshib yuguring.", ready: true },
  { id: 'fight', title: "Arena Fight", icon: '🥊', color: 'linear-gradient(135deg,#ff5d5d,#c23b3b)', players: '1-2 o\'yinchi', desc: "Musht-tepki jangi — raqibni mag'lub qiling, 3 raundli duel.", ready: true },
  { id: 'stickhero', title: "Ko'prik qahramoni", icon: '🌉', color: 'linear-gradient(135deg,#ffb84d,#e08a1f)', players: '1 o\'yinchi', desc: "Tayoqni to'g'ri uzunlikda cho'zib platformadan platformaga sakrang.", ready: true },
  { id: 'archery', title: "O'q-yoy dueli", icon: '🏹', color: 'linear-gradient(135deg,#8ad46a,#4f9a3a)', players: '1-2 o\'yinchi', desc: "Burchak va kuchni sozlab, shamolni hisobga olib raqibni uring.", ready: true },
  { id: 'ninja', title: "Ninja kesish", icon: '🥷', color: 'linear-gradient(135deg,#c77dff,#7a3fc2)', players: '1 o\'yinchi', desc: "Uchib chiqayotgan nishonlarni kesing, bombalardan ehtiyot bo'ling." },
  { id: 'towerdefense', title: "Minora mudofaasi", icon: '🏹🛡️', color: 'linear-gradient(135deg,#4da3ff,#2a6fc9)', players: '1 o\'yinchi', desc: "Yo'lga mudofaachilar qo'yib, dushman to'lqinlarini to'xtating." },
  { id: 'football', title: "Stickman futbol", icon: '⚽', color: 'linear-gradient(135deg,#6fbf6a,#3f7a3a)', players: '1-2 o\'yinchi', desc: "To'pni raqib darvozasiga urib, g'alaba qozoning." },
  { id: 'battleroyale', title: "Battle Royale", icon: '💀', color: 'linear-gradient(135deg,#ff8a3d,#c2531f)', players: '2-4 o\'yinchi', desc: "Torayib boruvchi maydonda oxirgi omon qolgan g'olib." },
  { id: 'stealth', title: "Maxfiy o'tish", icon: '🕵️', color: 'linear-gradient(135deg,#556377,#2c3645)', players: '1 o\'yinchi', desc: "Qo'riqchilarning ko'zidan yashirinib, chiqishga yeting." },
];

const grid = document.getElementById('grid');
GAMES.forEach(g => {
  const el = document.createElement(g.ready ? 'a' : 'div');
  el.className = 'card' + (g.ready ? '' : ' soon');
  if (g.ready) el.href = `games/${g.id}/index.html`;
  el.innerHTML = `
    ${g.ready ? '' : '<span class="soon-badge">Tez orada</span>'}
    <div class="icon" style="background:${g.color}">${g.icon}</div>
    <h3>${g.title}</h3>
    <p>${g.desc}</p>
    <span class="players">${g.players}</span>
  `;
  grid.appendChild(el);
});
