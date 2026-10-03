'use strict';
/* =====================================================
 * 斩鬼夜行 · 鬼灭之刃粉丝同人小游戏
 * 横版动作：扮演鬼杀队剑士，用水之呼吸斩杀恶鬼
 * 纯 Canvas 绘制 + WebAudio 合成音效，无外部资源
 * ===================================================== */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = 960, H = 540, GROUND = 472;

/* ---------------- 工具 ---------------- */
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- 音频（WebAudio 合成） ---------------- */
const AudioSys = {
  ctx: null, muted: false,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 不支持则静默 */ }
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.now(), o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, freq, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.now(), len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 2000; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  },
  swing()  { this.noise(0.14, 2600, 0.20); },
  swingBig(){ this.noise(0.30, 1400, 0.30); this.tone(180, 0.25, 'sawtooth', 0.10, 60); },
  hit()    { this.tone(220, 0.10, 'square', 0.18, 90); this.noise(0.08, 900, 0.15); },
  hitBig() { this.tone(160, 0.18, 'square', 0.24, 60); this.noise(0.15, 700, 0.22); },
  hurt()   { this.tone(170, 0.28, 'sawtooth', 0.22, 55); },
  jump()   { this.tone(300, 0.12, 'sine', 0.10, 520); },
  skill()  { this.tone(240, 0.35, 'sawtooth', 0.16, 880); this.noise(0.35, 3200, 0.18); },
  dash()   { this.noise(0.25, 1800, 0.22); this.tone(140, 0.25, 'sawtooth', 0.12, 420); },
  demonDie(){ this.tone(320, 0.30, 'sawtooth', 0.14, 70); this.noise(0.25, 500, 0.16); },
  wave()   { this.tone(65, 0.5, 'sine', 0.35, 40); this.tone(98, 0.4, 'sine', 0.2, 60); },
  bossRoar(){ this.tone(90, 0.9, 'sawtooth', 0.30, 45); this.noise(0.8, 300, 0.25); },
  shoot()  { this.tone(700, 0.15, 'square', 0.10, 220); },
  ui()     { this.tone(520, 0.08, 'sine', 0.15, 660); },
  victory(){ [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.22), i * 160)); },
  defeat() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'triangle', 0.22), i * 200)); }
};

/* ---------------- 输入 ---------------- */
const input = {
  left: false, right: false,
  jumpQ: 0, atkQ: 0, s1Q: 0, s2Q: 0, s3Q: 0, dodgeQ: 0,
  queue(name) { this[name]++; },
  take(name) { if (this[name] > 0) { this[name]--; return true; } return false; },
  clearQ() { this.jumpQ = this.atkQ = this.s1Q = this.s2Q = this.s3Q = this.dodgeQ = 0; }
};
const GAME_KEYS = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyA','KeyD','KeyW','KeyJ','KeyZ','KeyK','KeyX','KeyL','KeyC','KeyU','KeyV','KeyP','KeyM','KeyF','ShiftLeft','ShiftRight'];
const keyDown = {};
window.addEventListener('keydown', e => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  AudioSys.init();
  if (e.repeat) return;
  keyDown[e.code] = true;
  switch (e.code) {
    case 'KeyW': case 'ArrowUp': case 'Space': input.queue('jumpQ'); break;
    case 'KeyJ': case 'KeyZ': input.queue('atkQ'); break;
    case 'KeyK': case 'KeyX': input.queue('s1Q'); break;
    case 'KeyL': case 'KeyC': input.queue('s2Q'); break;
    case 'KeyU': case 'KeyV': input.queue('s3Q'); break;
    case 'ShiftLeft': case 'ShiftRight': input.queue('dodgeQ'); break;
    case 'KeyP': togglePause(); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyF': toggleFullscreen(); break;
  }
});
window.addEventListener('keyup', e => { keyDown[e.code] = false; });
function pollMoveKeys() {
  input.left = !!(keyDown['KeyA'] || keyDown['ArrowLeft'] || touch.left);
  input.right = !!(keyDown['KeyD'] || keyDown['ArrowRight'] || touch.right);
}
/* 触屏 */
const touch = { left: false, right: false };
document.querySelectorAll('#touch-controls .tc-btn').forEach(btn => {
  const act = btn.dataset.act;
  const on = e => {
    e.preventDefault(); AudioSys.init();
    if (act === 'left') touch.left = true;
    else if (act === 'right') touch.right = true;
    else if (act === 'jump') input.queue('jumpQ');
    else if (act === 'attack') input.queue('atkQ');
    else if (act === 'skill1') input.queue('s1Q');
    else if (act === 'skill2') input.queue('s2Q');
    else if (act === 'skill3') input.queue('s3Q');
    else if (act === 'dodge') input.queue('dodgeQ');
  };
  const off = e => {
    e.preventDefault();
    if (act === 'left') touch.left = false;
    else if (act === 'right') touch.right = false;
  };
  btn.addEventListener('touchstart', on, { passive: false });
  btn.addEventListener('touchend', off, { passive: false });
  btn.addEventListener('touchcancel', off, { passive: false });
  btn.addEventListener('mousedown', on);
  btn.addEventListener('mouseup', off);
  btn.addEventListener('mouseleave', off);
});
/* 触屏设备保底：不依赖 pointer:coarse 媒体查询，横竖屏都显示按键 */
if ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0) {
  document.body.classList.add('touch');
  const setTP = () => document.body.classList.toggle('touch-portrait', window.innerHeight > window.innerWidth);
  setTP();
  window.addEventListener('resize', setTP);
  window.addEventListener('orientationchange', setTP);
}

/* ---------------- 游戏状态 ---------------- */
let state = 'title';           // title | play | pause | over | win
let shake = 0, time = 0, slowmo = 0;
let score = 0, combo = 0, comboT = 0, kills = 0;
let stageIdx = 0, stageState = 'idle', stageTimer = 0, spawnQueue = [], spawnTimer = 0, addTimer = 0;
let boss = null, victoryTimer = 0;

/* 8 关：参考鬼灭之刃的鬼等级，从杂鱼到上弦，难度递增 */
const STAGES = [
  { name: '第壹关 · 狭雾山试炼', comp: { chibi: 4 }, interval: 1.0, cap: 4 },
  { name: '第贰关 · 浅草夜行', comp: { chibi: 4, swift: 2 }, interval: 0.9, cap: 5 },
  { name: '第叁关 · 那田蜘蛛山', comp: { chibi: 2, swift: 3, spitter: 2 }, interval: 0.85, cap: 5 },
  { name: '第肆关 · 无限列车', comp: { brute: 2, swift: 3, spitter: 2 }, interval: 0.8, cap: 6 },
  { name: '第伍关 · 吉原花街', comp: { elite: 1, brute: 2, spitter: 2 }, interval: 0.75, cap: 6 },
  { name: '第陆关 · 刀匠之村', comp: { elite: 2, brute: 2, swift: 3 }, interval: 0.7, cap: 7 },
  { name: '第柒关 · 柱之试炼', comp: { elite: 3, spitter: 3, brute: 2 }, interval: 0.62, cap: 7 },
  { name: '最终决战 · 上弦之鬼', comp: { boss: 1 }, interval: 1.0, cap: 4 }
];
const SCORE = { chibi: 100, swift: 150, spitter: 200, brute: 300, elite: 500, boss: 3000 };

/* ---------------- 粒子 ---------------- */
let particles = [];
function addP(p) { if (particles.length < 600) particles.push(Object.assign({ t: 0 }, p)); }
function spawnSlash(x, y, dir, big, color) {
  const n = big ? 26 : 14;
  for (let i = 0; i < n; i++) {
    addP({ type: 'spark', x: x + rand(-20, 20), y: y + rand(-30, 10),
      vx: rand(40, 260) * dir * (big ? 1.4 : 1), vy: rand(-160, 60),
      life: rand(0.25, 0.55), maxLife: 0.55, size: rand(2, big ? 6 : 4),
      color: color || (Math.random() < 0.6 ? '#bfe6ff' : '#5fb8ff') });
  }
  addP({ type: 'arc', x, y: y - 12, dir, life: 0.22, maxLife: 0.22, big: !!big });
}
function spawnWater(x, y, dir) {
  for (let i = 0; i < 30; i++) {
    const a = rand(-Math.PI, 0);
    addP({ type: 'drop', x: x + rand(-30, 30), y: y + rand(-40, 0),
      vx: Math.cos(a) * rand(60, 320) + dir * 120, vy: Math.sin(a) * rand(60, 300),
      life: rand(0.4, 0.8), maxLife: 0.8, size: rand(2, 5), color: '#7fd4ff' });
  }
}
function spawnBlood(x, y, dir) {
  for (let i = 0; i < 12; i++) {
    addP({ type: 'drop', x, y: y + rand(-20, 0), vx: rand(-160, 160) + dir * 90, vy: rand(-220, -40),
      life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 4), color: '#a01828', grav: 900 });
  }
}
function spawnSmoke(x, y, n, color) {
  for (let i = 0; i < (n || 14); i++) {
    addP({ type: 'smoke', x: x + rand(-16, 16), y: y + rand(-30, 0),
      vx: rand(-40, 40), vy: rand(-90, -20),
      life: rand(0.5, 1.1), maxLife: 1.1, size: rand(8, 20), color: color || '#5a3f6e' });
  }
}
function spawnPetals(n) {
  for (let i = 0; i < n; i++) {
    addP({ type: 'petal', x: rand(0, W), y: rand(-20, H * 0.6),
      vx: rand(-30, -5), vy: rand(25, 60), life: rand(6, 12), maxLife: 12,
      size: rand(3, 6), rot: rand(0, 6.3), vr: rand(-3, 3),
      color: Math.random() < 0.5 ? '#f7c9d9' : '#fbeef3' });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t >= p.life) { particles.splice(i, 1); continue; }
    if (p.grav) p.vy += p.grav * dt;
    if (p.type === 'petal') {
      p.x += (p.vx + Math.sin(time * 2 + p.rot) * 18) * dt;
      p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > H) { p.y = -10; p.x = rand(0, W); }
    } else {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'drop' && p.y > GROUND) { p.y = GROUND; p.vy *= -0.3; p.vx *= 0.6; }
    }
  }
}
function drawParticles() {
  for (const p of particles) {
    const k = 1 - p.t / p.life;
    if (p.type === 'spark') {
      ctx.globalAlpha = k; ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.type === 'drop') {
      ctx.globalAlpha = k; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k + 0.5, 0, 6.3); ctx.fill();
    } else if (p.type === 'smoke') {
      ctx.globalAlpha = k * 0.55; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.t * 1.4), 0, 6.3); ctx.fill();
    } else if (p.type === 'petal') {
      ctx.globalAlpha = 0.75; ctx.fillStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 6.3); ctx.fill();
      ctx.restore();
    } else if (p.type === 'arc') {
      // 水之呼吸斩击弧光
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#dff2ff'; ctx.lineWidth = p.big ? 10 : 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.big ? 95 : 62, p.dir > 0 ? -1.2 : Math.PI - 1.2, p.dir > 0 ? 1.2 : Math.PI + 1.2);
      ctx.stroke();
      ctx.globalAlpha = k * 0.7;
      ctx.strokeStyle = '#3fa8ff'; ctx.lineWidth = p.big ? 20 : 13;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.big ? 95 : 62, p.dir > 0 ? -1.0 : Math.PI - 1.0, p.dir > 0 ? 1.0 : Math.PI + 1.0);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------------- 背景 ---------------- */
const stars = [];
for (let i = 0; i < 130; i++) stars.push({ x: rand(0, W), y: rand(0, 300), r: rand(0.5, 1.8), tw: rand(0, 6.3) });
const ridge1 = [], ridge2 = [];
for (let x = 0; x <= W; x += 32) {
  ridge1.push(300 + Math.sin(x * 0.011) * 46 + Math.sin(x * 0.033 + 2) * 18);
  ridge2.push(360 + Math.sin(x * 0.017 + 5) * 34 + Math.sin(x * 0.05 + 1) * 12);
}
const trees = [];
for (let x = -40; x < W + 40; x += rand(90, 170)) trees.push({ x, h: rand(90, 170), w: rand(26, 44) });

/* ============ 背景：8 关卡鬼灭主题场景 ============ */
const SKY = [
  { top: '#031018', mid: '#0b1e30', bot: '#16303a' }, // 0 狭雾山·雾林
  { top: '#070a1c', mid: '#141a3a', bot: '#3a2440' }, // 1 浅草·夜街
  { top: '#0a0a18', mid: '#1a1430', bot: '#2a2040' }, // 2 蜘蛛山·蛛丝
  { top: '#050818', mid: '#101236', bot: '#2a1a3a' }, // 3 无限列车
  { top: '#0c0716', mid: '#22102e', bot: '#4a1a34' }, // 4 吉原花街
  { top: '#060a20', mid: '#12203c', bot: '#3a2a4a' }, // 5 刀匠之村
  { top: '#050818', mid: '#101a3a', bot: '#2e2148' }, // 6 产屋敷邸
  { top: '#0e0508', mid: '#220d12', bot: '#3d1420' }  // 7 无限城
];
const GROUND_C = [
  ['#232a33', '#12161c'], ['#2a2030', '#141020'], ['#20242a', '#101216'], ['#2a2a35', '#14141c'],
  ['#33202a', '#181018'], ['#2a2438', '#141020'], ['#262233', '#121020'], ['#2e1a1c', '#160d10']
];
/* 装饰物（载入时随机排布，固定不变） */
const fogBands = []; for (let i = 0; i < 6; i++) fogBands.push({ x: rand(0, W), y: rand(300, 450), w: rand(220, 420), h: rand(28, 60), sp: rand(6, 18) });
const wistA = []; for (let i = 0; i < 24; i++) wistA.push({ x: rand(20, W - 20), y: rand(50, 210), r: rand(6, 13), ph: rand(0, 6.3) });
const wistB = []; for (let i = 0; i < 30; i++) wistB.push({ x: rand(20, W - 20), y: rand(40, 130), r: rand(5, 11), ph: rand(0, 6.3) });
const townBldgs = []; { let bx = -20; while (bx < W) { const bw = rand(120, 200); townBldgs.push({ x: bx, w: bw, h: rand(150, 230) }); bx += bw + rand(8, 26); } }
const webNets = []; for (let i = 0; i < 5; i++) webNets.push({ x: rand(60, W - 60), y: rand(120, 250), r: rand(50, 90) });
const cocoons = []; for (let i = 0; i < 4; i++) cocoons.push({ x: rand(80, W - 80), y: rand(210, 320), len: rand(40, 80) });
const lampPosts = []; for (let lx = 120; lx < W; lx += 240) lampPosts.push(lx);
const redLanterns = []; for (let i = 0; i < 6; i++) redLanterns.push({ x: 60 + i * 165 + rand(-20, 20), y: rand(150, 220), n: 4 });
const sakuraTrees = []; for (let sx = 60; sx < W; sx += rand(180, 280)) sakuraTrees.push({ x: sx, s: rand(0.8, 1.2) });
const villageHouses = []; { let hx = 0; while (hx < W) { const hw = rand(130, 190); villageHouses.push({ x: hx, w: hw }); hx += hw + rand(20, 50); } }
const stoneLanterns = []; for (let lx = 100; lx < W; lx += 220) stoneLanterns.push(lx);
const floatLanterns = []; for (let i = 0; i < 10; i++) floatLanterns.push({ x: rand(0, W), y: rand(80, 380), r: rand(10, 22), ph: rand(0, 6.3), sp: rand(8, 20) });
const infFrames = []; for (let i = 0; i < 7; i++) infFrames.push({ x: rand(0, W), y: rand(60, 400), w: rand(120, 260), h: rand(90, 200), rot: rand(-0.35, 0.35) });

function drawSky(si) {
  const s = SKY[si];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.top); g.addColorStop(0.55, s.mid); g.addColorStop(0.85, s.bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const st of stars) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 1.6 + st.tw);
    ctx.fillStyle = '#cfe0ff'; ctx.fillRect(st.x, st.y, st.r, st.r);
  }
  ctx.globalAlpha = 1;
}
function drawMoonAt(mx, my, mr, color) {
  const mg = ctx.createRadialGradient(mx, my, 6, mx, my, mr * 2.6);
  mg.addColorStop(0, 'rgba(255,244,200,0.5)'); mg.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr * 2.6, 0, 6.3); ctx.fill();
  ctx.fillStyle = color || '#f7ecc0'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(210,190,140,0.5)';
  ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.18, mr * 0.2, 0, 6.3); ctx.fill();
}
function drawRidge() {
  ctx.fillStyle = '#141b3d';
  ctx.beginPath(); ctx.moveTo(0, H);
  ridge1.forEach((y, i) => ctx.lineTo(i * 32, y));
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0c1128';
  ctx.beginPath(); ctx.moveTo(0, H);
  ridge2.forEach((y, i) => ctx.lineTo(i * 32, y));
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}
function drawTrees() {
  ctx.fillStyle = '#070b1c';
  for (const t of trees) {
    ctx.fillRect(t.x - t.w * 0.12, GROUND - t.h, t.w * 0.24, t.h);
    for (let b = 0; b < 4; b++) {
      const bw = t.w * (1 - b * 0.2), by = GROUND - t.h + b * t.h * 0.24;
      ctx.beginPath();
      ctx.moveTo(t.x - bw / 2, by); ctx.lineTo(t.x + bw / 2, by); ctx.lineTo(t.x, by - t.h * 0.34);
      ctx.closePath(); ctx.fill();
    }
  }
}
function drawWisteria(list, topY) {
  for (const wc of list) {
    const sway = Math.sin(time * 0.8 + wc.ph) * 4;
    ctx.strokeStyle = 'rgba(110,80,150,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(wc.x, topY); ctx.lineTo(wc.x + sway, wc.y); ctx.stroke();
    ctx.fillStyle = 'rgba(150,110,200,0.9)';
    ctx.beginPath(); ctx.arc(wc.x + sway, wc.y, wc.r, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(195,155,235,0.9)';
    ctx.beginPath(); ctx.arc(wc.x + sway - wc.r * 0.4, wc.y + wc.r * 0.55, wc.r * 0.55, 0, 6.3); ctx.fill();
  }
}
/* 0 狭雾山：雾林 + 紫藤花 */
function bgMistForest() {
  drawRidge();
  drawTrees();
  for (const f of fogBands) {
    const fx = ((f.x + time * f.sp) % (W + f.w * 2)) - f.w;
    const fg = ctx.createRadialGradient(fx, f.y, 4, fx, f.y, f.w / 2);
    fg.addColorStop(0, 'rgba(185,215,228,0.22)'); fg.addColorStop(1, 'rgba(185,215,228,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse(fx, f.y, f.w / 2, f.h, 0, 0, 6.3); ctx.fill();
  }
  drawWisteria(wistA, 0);
}
/* 1 浅草：大正夜街 + 灯笼 */
function bgAsakusa() {
  drawMoonAt(830, 90, 30);
  for (const b of townBldgs) {
    const top = GROUND - b.h;
    ctx.fillStyle = '#0d0a18';
    ctx.fillRect(b.x, top, b.w, b.h);
    ctx.beginPath(); ctx.moveTo(b.x - 8, top); ctx.lineTo(b.x + b.w / 2, top - 26); ctx.lineTo(b.x + b.w + 8, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,110,0.85)';
    for (let wy = top + 32; wy < GROUND - 24; wy += 44)
      for (let wx = b.x + 16; wx < b.x + b.w - 22; wx += 40)
        if ((Math.floor(wx) * 7 + Math.floor(wy) * 13) % 5 < 2) ctx.fillRect(wx, wy, 20, 26);
  }
  // 大灯笼（雷门風）
  const lx = 90, ly = 300;
  const lg = ctx.createRadialGradient(lx, ly, 6, lx, ly, 90);
  lg.addColorStop(0, 'rgba(255,120,80,0.55)'); lg.addColorStop(1, 'rgba(255,120,80,0)');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, 90, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#a02318';
  ctx.beginPath(); ctx.ellipse(lx, ly, 34, 44, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(lx - 20, ly - 52, 40, 10); ctx.fillRect(lx - 14, ly + 42, 28, 8);
  // 灯笼串
  for (const ls of [{ x0: 260, y: 200 }, { x0: 520, y: 180 }, { x0: 760, y: 210 }]) {
    ctx.strokeStyle = 'rgba(60,50,70,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ls.x0, ls.y); ctx.quadraticCurveTo(ls.x0 + 100, ls.y + 34, ls.x0 + 200, ls.y); ctx.stroke();
    for (let k = 0; k < 5; k++) {
      const px = ls.x0 + 20 + k * 40, py = ls.y + 16 + Math.sin(k / 4 * Math.PI) * 14;
      ctx.fillStyle = 'rgba(255,170,90,0.9)';
      ctx.beginPath(); ctx.arc(px, py, 9, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,160,0.9)';
      ctx.beginPath(); ctx.arc(px, py, 4, 0, 6.3); ctx.fill();
    }
  }
}
/* 2 那田蜘蛛山：蛛网 + 茧 */
function bgSpiderMt() {
  drawRidge();
  drawTrees();
  ctx.lineWidth = 1.2;
  for (const wn of webNets) {
    ctx.strokeStyle = 'rgba(230,235,245,0.5)';
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(wn.x, wn.y);
      ctx.lineTo(wn.x + Math.cos(a) * wn.r, wn.y + Math.sin(a) * wn.r); ctx.stroke();
    }
    for (let rr2 = wn.r * 0.3; rr2 < wn.r; rr2 += wn.r * 0.22) {
      ctx.beginPath(); ctx.arc(wn.x, wn.y, rr2, 0, 6.3); ctx.stroke();
    }
  }
  for (const cn of cocoons) {
    const sway = Math.sin(time * 1.1 + cn.x) * 5;
    ctx.strokeStyle = 'rgba(230,235,245,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cn.x, cn.y - cn.len); ctx.lineTo(cn.x + sway, cn.y); ctx.stroke();
    ctx.fillStyle = 'rgba(215,220,230,0.92)';
    ctx.beginPath(); ctx.ellipse(cn.x + sway, cn.y + 14, 13, 20, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(160,165,180,0.9)';
    ctx.beginPath(); ctx.ellipse(cn.x + sway - 4, cn.y + 8, 6, 12, 0.3, 0, 6.3); ctx.fill();
  }
  const gg = ctx.createLinearGradient(0, 300, 0, GROUND);
  gg.addColorStop(0, 'rgba(120,180,140,0)'); gg.addColorStop(1, 'rgba(120,180,140,0.14)');
  ctx.fillStyle = gg; ctx.fillRect(0, 300, W, GROUND - 300);
}
/* 3 无限列车：列车剪影 + 铁轨 + 路灯 */
function bgTrain() {
  drawMoonAt(150, 100, 36);
  const ty = GROUND - 150;
  ctx.fillStyle = '#0a0c1a';
  ctx.fillRect(W - 420, ty, 440, 120);
  ctx.beginPath(); ctx.moveTo(W - 420, ty); ctx.lineTo(W - 462, ty + 42); ctx.lineTo(W - 462, ty + 120); ctx.lineTo(W - 420, ty + 120); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0a0c1a'; ctx.fillRect(W - 470, ty - 26, 60, 26); // 烟囱
  ctx.fillStyle = 'rgba(255,200,120,0.92)';
  for (let i = 0; i < 8; i++) ctx.fillRect(W - 400 + i * 48, ty + 32, 30, 34);
  for (let i = 0; i < 3; i++) { // 蒸汽
    const age = (time * 40 + i * 55) % 95;
    const sy = ty - 26 - age;
    ctx.fillStyle = 'rgba(200,205,220,' + Math.max(0, 0.28 - age / 95 * 0.28).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(W - 440 + i * 26, sy, 9 + age * 0.16, 0, 6.3); ctx.fill();
  }
  for (const lx of lampPosts) {
    ctx.fillStyle = '#0a0c1a'; ctx.fillRect(lx - 3, GROUND - 190, 6, 190);
    const lg = ctx.createRadialGradient(lx, GROUND - 200, 2, lx, GROUND - 200, 60);
    lg.addColorStop(0, 'rgba(255,210,140,0.8)'); lg.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, GROUND - 200, 60, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffe2b0'; ctx.beginPath(); ctx.arc(lx, GROUND - 200, 9, 0, 6.3); ctx.fill();
  }
}
function drawRailsOnGround() {
  ctx.strokeStyle = '#3d4258'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(W / 2 - 320, H); ctx.lineTo(W / 2 - 24, GROUND + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2 + 320, H); ctx.lineTo(W / 2 + 24, GROUND + 6); ctx.stroke();
  ctx.strokeStyle = '#2c3045'; ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    const k = i / 7, y = GROUND + 6 + k * (H - GROUND - 6), wdt = 24 + k * 300;
    ctx.beginPath(); ctx.moveTo(W / 2 - wdt, y); ctx.lineTo(W / 2 + wdt, y); ctx.stroke();
  }
}
/* 4 吉原花街：红灯笼 + 暖阁 */
function bgYoshiwara() {
  drawMoonAt(830, 80, 26);
  for (const b of townBldgs) {
    const top = GROUND - b.h;
    ctx.fillStyle = '#120a16';
    ctx.fillRect(b.x, top, b.w, b.h);
    ctx.beginPath(); ctx.moveTo(b.x - 8, top); ctx.lineTo(b.x + b.w / 2, top - 30); ctx.lineTo(b.x + b.w + 8, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,150,120,0.9)';
    for (let wy = top + 30; wy < GROUND - 24; wy += 40)
      for (let wx = b.x + 14; wx < b.x + b.w - 18; wx += 34)
        if ((Math.floor(wx) * 5 + Math.floor(wy) * 11) % 4 < 2) {
          ctx.fillRect(wx, wy, 18, 24);
          ctx.strokeStyle = 'rgba(40,20,20,0.8)'; ctx.lineWidth = 1.5;
          ctx.strokeRect(wx, wy, 18, 24);
        }
  }
  for (const rl of redLanterns) { // 红灯笼串
    ctx.strokeStyle = 'rgba(50,30,30,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rl.x, 0); ctx.lineTo(rl.x, rl.y + rl.n * 34); ctx.stroke();
    for (let k = 0; k < rl.n; k++) {
      const py = rl.y + k * 34;
      const lg = ctx.createRadialGradient(rl.x, py, 2, rl.x, py, 34);
      lg.addColorStop(0, 'rgba(255,90,70,0.7)'); lg.addColorStop(1, 'rgba(255,90,70,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(rl.x, py, 34, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#c03028';
      ctx.beginPath(); ctx.ellipse(rl.x, py, 13, 16, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(rl.x - 8, py - 20, 16, 5); ctx.fillRect(rl.x - 6, py + 15, 12, 4);
    }
  }
  const wg = ctx.createLinearGradient(0, GROUND - 140, 0, GROUND);
  wg.addColorStop(0, 'rgba(255,120,90,0)'); wg.addColorStop(1, 'rgba(255,120,90,0.16)');
  ctx.fillStyle = wg; ctx.fillRect(0, GROUND - 140, W, 140);
}
/* 5 刀匠之村：茅草屋 + 樱花 */
function bgSwordVillage() {
  drawMoonAt(140, 110, 34);
  drawRidge();
  for (const h of villageHouses) {
    const top = GROUND - 110;
    ctx.fillStyle = '#141021'; ctx.fillRect(h.x, top, h.w, 110);
    ctx.fillStyle = '#1f1832';
    ctx.beginPath(); ctx.moveTo(h.x - 12, top); ctx.lineTo(h.x + h.w / 2, top - 55); ctx.lineTo(h.x + h.w + 12, top); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(90,80,110,0.5)'; ctx.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath(); ctx.moveTo(h.x - 12 + k * 6, top - k * 2); ctx.lineTo(h.x + h.w / 2, top - 55 + k * 10); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,190,120,0.85)';
    ctx.fillRect(h.x + h.w * 0.28, top + 42, 26, 32); ctx.fillRect(h.x + h.w * 0.58, top + 42, 26, 32);
  }
  for (const st of sakuraTrees) {
    const tx = st.x, ty = GROUND - 165 * st.s;
    ctx.fillStyle = '#0e0a1c'; ctx.fillRect(tx - 5 * st.s, ty, 10 * st.s, 165 * st.s);
    const pg = ctx.createRadialGradient(tx, ty, 8, tx, ty, 95 * st.s);
    pg.addColorStop(0, 'rgba(250,180,210,0.95)'); pg.addColorStop(1, 'rgba(250,180,210,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(tx, ty, 95 * st.s, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(244,158,194,0.92)';
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * 6.28 + st.x;
      ctx.beginPath(); ctx.arc(tx + Math.cos(a) * 58 * st.s, ty + Math.sin(a) * 32 * st.s, 15 * st.s, 0, 6.3); ctx.fill();
    }
  }
}
/* 6 产屋敷宅邸：大宅 + 紫藤花架 + 石灯笼 */
function bgMansion() {
  drawMoonAt(820, 90, 28);
  const mx = W / 2 - 260;
  ctx.fillStyle = '#0c0a1c';
  ctx.fillRect(mx, GROUND - 190, 520, 190);
  ctx.beginPath(); ctx.moveTo(mx - 30, GROUND - 190); ctx.lineTo(mx + 260, GROUND - 262); ctx.lineTo(mx + 550, GROUND - 190); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 6; i++) {
    const wx = mx + 40 + i * 78;
    ctx.fillStyle = 'rgba(255,220,170,0.78)'; ctx.fillRect(wx, GROUND - 150, 52, 90);
    ctx.strokeStyle = 'rgba(20,16,30,0.9)'; ctx.lineWidth = 3; ctx.strokeRect(wx, GROUND - 150, 52, 90);
    ctx.beginPath(); ctx.moveTo(wx + 26, GROUND - 150); ctx.lineTo(wx + 26, GROUND - 60); ctx.stroke();
  }
  ctx.fillStyle = '#0e0a1c'; ctx.fillRect(0, 0, W, 24);
  for (let x = 40; x < W; x += 120) ctx.fillRect(x, 0, 10, 24);
  drawWisteria(wistB, 24);
  for (const lx of stoneLanterns) {
    ctx.fillStyle = '#1a1626';
    ctx.fillRect(lx - 14, GROUND - 26, 28, 8);
    ctx.fillRect(lx - 4, GROUND - 62, 8, 38);
    ctx.fillRect(lx - 12, GROUND - 76, 24, 15);
    ctx.beginPath(); ctx.moveTo(lx - 18, GROUND - 76); ctx.lineTo(lx, GROUND - 92); ctx.lineTo(lx + 18, GROUND - 76); ctx.closePath(); ctx.fill();
    ctx.fillRect(lx - 3, GROUND - 96, 6, 6);
    const lg = ctx.createRadialGradient(lx, GROUND - 68, 1, lx, GROUND - 68, 26);
    lg.addColorStop(0, 'rgba(255,210,150,0.85)'); lg.addColorStop(1, 'rgba(255,210,150,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, GROUND - 68, 26, 0, 6.3); ctx.fill();
  }
}
/* 7 无限城：错乱木格 + 浮空灯笼 */
function bgInfinityCastle() {
  for (const f of infFrames) {
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot);
    ctx.strokeStyle = 'rgba(130,64,52,0.55)'; ctx.lineWidth = 10;
    ctx.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
    ctx.strokeStyle = 'rgba(95,42,38,0.5)'; ctx.lineWidth = 4;
    for (let gx = -f.w / 2 + 30; gx < f.w / 2; gx += 30) {
      ctx.beginPath(); ctx.moveTo(gx, -f.h / 2); ctx.lineTo(gx, f.h / 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-f.w / 2, 0); ctx.lineTo(f.w / 2, 0); ctx.stroke();
    ctx.restore();
  }
  for (const fl of floatLanterns) {
    const fy = fl.y + Math.sin(time * 0.7 + fl.ph) * 24;
    const fx = fl.x + Math.cos(time * 0.4 + fl.ph) * 30;
    const lg = ctx.createRadialGradient(fx, fy, 2, fx, fy, fl.r * 2.6);
    lg.addColorStop(0, 'rgba(255,200,130,0.7)'); lg.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(fx, fy, fl.r * 2.6, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,30,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, fy - fl.r); ctx.stroke();
    ctx.fillStyle = '#e8a05a';
    ctx.beginPath(); ctx.ellipse(fx, fy, fl.r * 0.7, fl.r, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(fx - fl.r * 0.4, fy - fl.r - 4, fl.r * 0.8, 5);
  }
  const rg = ctx.createLinearGradient(0, GROUND - 120, 0, H);
  rg.addColorStop(0, 'rgba(180,60,50,0)'); rg.addColorStop(1, 'rgba(180,60,50,0.28)');
  ctx.fillStyle = rg; ctx.fillRect(0, GROUND - 120, W, H - GROUND + 120);
}
const BG_MID = [bgMistForest, bgAsakusa, bgSpiderMt, bgTrain, bgYoshiwara, bgSwordVillage, bgMansion, bgInfinityCastle];
function drawGroundLayer(si) {
  const gc = GROUND_C[si];
  const g = ctx.createLinearGradient(0, GROUND, 0, H);
  g.addColorStop(0, gc[0]); g.addColorStop(1, gc[1]);
  ctx.fillStyle = g; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, GROUND, W, 4);
  if (si === 3) { drawRailsOnGround(); return; }
  if (si === 7) { // 无限城：榻榻米格
    ctx.strokeStyle = 'rgba(150,90,70,0.25)'; ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x - 40, H); ctx.stroke(); }
    return;
  }
  ctx.fillStyle = 'rgba(140,150,180,0.18)';
  for (let x = 20; x < W; x += 90) {
    ctx.beginPath(); ctx.ellipse(x, GROUND + 34, 30, 9, 0, 0, 6.3); ctx.fill();
  }
  ctx.fillStyle = 'rgba(120,200,120,0.20)';
  for (let x = 8; x < W; x += 46) {
    ctx.fillRect(x, GROUND - 7, 3, 7); ctx.fillRect(x + 5, GROUND - 5, 3, 5);
  }
}
function drawBackground() {
  const si = Math.max(0, Math.min(stageIdx, STAGES.length - 1));
  drawSky(si);
  BG_MID[si]();
  drawGroundLayer(si);
}

/* ---------------- 玩家 ---------------- */
const player = {
  x: 200, y: GROUND, vx: 0, vy: 0, w: 34, h: 66,
  face: 1, hp: 100, maxHp: 100,
  onGround: true, jumps: 0,
  atkStage: 0, atkT: 0, atkCd: 0, atkDidHit: false,
  s1cd: 0, s2cd: 0, s3cd: 0, skillT: 0, skillKind: 0,
  dodgeT: 0, dodgeCd: 0, dodgeDir: 1,
  invuln: 0, runT: 0, dead: false, dashX: 0
};
const ATK = [
  { dur: 0.26, range: 78,  dmg: 12, kb: 160, lunge: 60 },
  { dur: 0.26, range: 82,  dmg: 14, kb: 200, lunge: 70 },
  { dur: 0.34, range: 95,  dmg: 22, kb: 380, lunge: 110 }
];
function playerRect() { return { x: player.x - player.w / 2, y: player.y - player.h, w: player.w, h: player.h }; }

function tryAttack() {
  if (player.atkT > 0 || player.skillT > 0 || player.dead) return;
  // 0.55 秒内连按则进阶连段，否则从第一段重新开始
  const st = (player.atkCd <= 0 || player.atkStage >= 2) ? 0 : player.atkStage + 1;
  player.atkStage = st; player.atkT = ATK[st].dur; player.atkDidHit = false;
  player.atkCd = 0.55;
  player.vx = 0; // 挥刀时原地不动：取消攻击前冲位移
  AudioSys.swing();
  spawnSlash(player.x + player.face * 40, player.y - 34, player.face, st === 2);
}
function trySkill1() { // 贰之型·水车：旋转大范围斩
  if (player.s1cd > 0 || player.skillT > 0 || player.atkT > 0 || player.dead) return;
  player.skillKind = 1; player.skillT = 0.62; player.s1cd = 6; player.invuln = Math.max(player.invuln, 0.35);
  AudioSys.skill();
  spawnWater(player.x, player.y - 30, player.face);
}
function trySkill2() { // 壹之型·水面斩击：突进斩
  if (player.s2cd > 0 || player.skillT > 0 || player.atkT > 0 || player.dead) return;
  player.skillKind = 2; player.skillT = 0.38; player.s2cd = 8; player.invuln = Math.max(player.invuln, 0.42);
  player.dashX = player.x + player.face * 250;
  AudioSys.dash();
  spawnWater(player.x, player.y - 30, player.face);
}
function tryDodge() { // 闪避突进：短暂无敌
  const p = player;
  if (p.dodgeCd > 0 || p.dodgeT > 0 || p.dead) return;
  p.dodgeT = 0.28; p.dodgeCd = 1.1;
  p.invuln = Math.max(p.invuln, 0.34);
  p.dodgeDir = (input.left && !input.right) ? -1 : (input.right && !input.left) ? 1 : p.face;
  p.face = p.dodgeDir;
  AudioSys.dash();
}
function trySkill3() { // 叁之型·流流舞：远程水刃三连
  const p = player;
  if (p.s3cd > 0 || p.skillT > 0 || p.atkT > 0 || p.dodgeT > 0 || p.dead) return;
  p.s3cd = 5;
  AudioSys.skill();
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      if (state !== 'play' || p.dead) return;
      projectiles.push({ x: p.x + p.face * 30, y: p.y - 44 - i * 14, vx: p.face * 480, vy: (i - 1) * 36, r: 12, dmg: 20, life: 1.6, friendly: true });
      spawnWater(p.x + p.face * 40, p.y - 40, p.face);
      AudioSys.swing();
    }, i * 130);
  }
}
function hurtPlayer(dmg, fromX) {
  if (player.invuln > 0 || player.dead || state !== 'play') return;
  player.hp -= dmg;
  player.invuln = 0.9;
  player.vx = (player.x < fromX ? -1 : 1) * 260;
  player.vy = -220; player.onGround = false;
  shake = Math.max(shake, 7);
  spawnBlood(player.x, player.y - 40, player.x < fromX ? -1 : 1);
  AudioSys.hurt();
  combo = 0;
  if (player.hp <= 0) { player.hp = 0; player.dead = true; gameOver(false); }
}
function updatePlayer(dt) {
  const p = player;
  p.runT += dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.atkCd > 0) p.atkCd -= dt;
  if (p.s1cd > 0) p.s1cd -= dt;
  if (p.s2cd > 0) p.s2cd -= dt;
  if (p.s3cd > 0) p.s3cd -= dt;
  if (p.dodgeCd > 0) p.dodgeCd -= dt;

  // 输入
  if (input.take('jumpQ') && !p.dead) {
    if (p.onGround || p.jumps < 2) {
      p.vy = -470; p.onGround = false; p.jumps++;
      AudioSys.jump();
      for (let i = 0; i < 6; i++) addP({ type: 'smoke', x: p.x + rand(-12, 12), y: p.y, vx: rand(-40, 40), vy: rand(-60, -10), life: 0.4, maxLife: 0.4, size: rand(5, 10), color: '#8a7fa8' });
    }
  }
  if (input.take('atkQ')) tryAttack();
  if (input.take('s1Q')) trySkill1();
  if (input.take('s2Q')) trySkill2();
  if (input.take('s3Q')) trySkill3();
  if (input.take('dodgeQ')) tryDodge();

  // 闪避突进
  if (p.dodgeT > 0) {
    p.dodgeT -= dt;
    p.vx = p.dodgeDir * 560;
    if (Math.random() < 0.7) addP({ type: 'smoke', x: p.x, y: p.y - 34, vx: rand(-30, 30), vy: rand(-40, -10), life: 0.35, maxLife: 0.35, size: rand(6, 12), color: '#7fb8e8' });
  }

  // 技能状态
  if (p.skillT > 0) {
    p.skillT -= dt;
    if (p.skillKind === 1) {
      // 水车：旋转，多段判定
      p.skillHitT = (p.skillHitT || 0) - dt;
      if (p.skillHitT <= 0) {
        p.skillHitT = 0.12;
        damageDemons(p.x, p.y - 34, 100, 12, p.face * 120, true);
        spawnSlash(p.x, p.y - 34, p.face, true);
      }
      p.vx *= 0.9;
    } else if (p.skillKind === 2) {
      // 水面斩击：突进
      const target = p.dashX;
      p.x = lerp(p.x, target, 1 - Math.pow(0.001, dt));
      damageDemons(p.x + p.face * 50, p.y - 34, 70, 45, p.face * 420, true);
      if (Math.random() < 0.6) spawnWater(p.x, p.y - 30, p.face);
      if (Math.abs(p.x - target) < 8 || p.skillT <= 0) p.skillT = Math.min(p.skillT, 0.01);
    }
  }

  // 普通攻击判定
  if (p.atkT > 0) {
    p.atkT -= dt;
    const st = ATK[p.atkStage];
    if (!p.atkDidHit && p.atkT < st.dur * 0.72) {
      p.atkDidHit = true;
      const hx = p.x + p.face * (st.range * 0.55);
      damageDemons(hx, p.y - 34, st.range, st.dmg, p.face * st.kb, false);
    }
  }

  // 移动
  const SPD = 250;
  if (p.skillT <= 0 && p.atkT <= 0 && p.dodgeT <= 0 && !p.dead) {
    if (p.onGround) {
      if (input.left && !input.right) { p.vx = -SPD; p.face = -1; }
      else if (input.right && !input.left) { p.vx = SPD; p.face = 1; }
      else p.vx *= 0.82;
    } else {
      // 空中：保留惯性。助跑起跳后即使松开方向键也会向前滑行；
      // 空中可微调方向，但转向比地面柔和
      const AIR_ACC = 1500;
      if (input.left && !input.right) { p.vx = Math.max(p.vx - AIR_ACC * dt, -SPD); p.face = -1; }
      else if (input.right && !input.left) { p.vx = Math.min(p.vx + AIR_ACC * dt, SPD); p.face = 1; }
    }
  }
  p.vy += 1500 * dt;
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.x = clamp(p.x, 40, W - 40);
  if (p.y >= GROUND) { p.y = GROUND; p.vy = 0; p.onGround = true; p.jumps = 0; }

  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
}

/* ---------------- 恶鬼 ---------------- */
const demons = [];
const projectiles = [];
const DEMON_CFG = {
  chibi:   { w: 38, h: 60, maxHp: 30, speed: 100, dmg: 8,  range: 48,  score: 100, skin: '#9d92b8', dark: '#6b5f86', windup: 0.42 },
  swift:   { w: 32, h: 62, maxHp: 22, speed: 185, dmg: 6,  range: 44,  score: 150, skin: '#8fb8a8', dark: '#57776c', windup: 0.36 },
  spitter: { w: 40, h: 64, maxHp: 30, speed: 95,  dmg: 8,  range: 330, score: 200, skin: '#a8a0c8', dark: '#6a5f8a', windup: 0.50, ranged: true },
  brute:   { w: 58, h: 96, maxHp: 95, speed: 62,  dmg: 16, range: 66,  score: 300, skin: '#a88a7a', dark: '#6e564a', windup: 0.55 },
  elite:   { w: 46, h: 78, maxHp: 170, speed: 150, dmg: 14, range: 58, score: 500, skin: '#b08a9a', dark: '#6e4a58', windup: 0.30 },
  boss:    { w: 76, h: 122, maxHp: 800, speed: 105, dmg: 20, range: 78, score: 3000, skin: '#d8cfae', dark: '#8a7a52', windup: 0.45 }
};
class Demon {
  constructor(type, x) {
    const c = DEMON_CFG[type];
    this.type = type; this.w = c.w; this.h = c.h;
    // 关卡难度缩放：越往后血量/速度/伤害越高、前摇越短
    const si = stageIdx;
    this.maxHp = Math.round(c.maxHp * (1 + si * 0.13)); this.hp = this.maxHp;
    this.speed = c.speed * (1 + si * 0.05);
    this.dmg = c.dmg + Math.floor(si / 2);
    this.windupTime = (c.windup || 0.42) * Math.max(0.62, 1 - si * 0.05);
    this.range = c.range;
    this.score = c.score; this.skin = c.skin; this.dark = c.dark;
    this.x = clamp(x, 50, W - 50); this.y = GROUND; this.vx = 0; this.vy = 0;
    this.face = this.x > W / 2 ? -1 : 1;
    this.state = 'spawn'; this.t = 0; this.atkT = 0; this.hurtT = 0;
    this.windup = 0; this.recover = 0; this.cool = rand(0.2, 0.9);
    this.flash = 0; this.deathT = 0; this.onGround = true;
    this.shooting = false; this.shootCd = rand(1, 2);
    this.stepT = 0; this.stepCd = 0;
    // Boss 专用
    this.pattern = 0; this.patT = 0; this.dashing = false; this.shots = 0;
    this.enraged = false; this.sumT = 14;
    spawnSmoke(this.x, GROUND, 16);
  }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  update(dt) {
    const p = player;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.state === 'die') {
      this.deathT += dt; this.y += 30 * dt;
      if (Math.random() < 0.3) spawnSmoke(this.x + rand(-14, 14), this.y - rand(0, 40), 2);
      return this.deathT > 0.7;
    }
    if (this.state === 'spawn') { if (this.t > 0.8) { this.state = 'chase'; this.t = 0; } return false; }
    if (p.dead) { this.vx *= 0.9; this.x += this.vx * dt; return false; }
    if (this.hurtT > 0) { this.hurtT -= dt; this.x += this.vx * dt; this.vx *= 0.86; return false; }

    const dx = p.x - this.x, adx = Math.abs(dx);
    this.face = dx >= 0 ? 1 : -1;

    if (this.type === 'boss') return this.updateBoss(dt, dx, adx);

    // 普通鬼 AI
    if (this.stepCd > 0) this.stepCd -= dt;
    if (this.stepT > 0) { // 精英垫步突进中
      this.stepT -= dt; this.x += this.vx * dt;
      this.x = clamp(this.x, 30, W - 30);
      return false;
    }
    if (this.recover > 0) { this.recover -= dt; this.vx *= 0.85; }
    else if (this.windup > 0) {
      this.windup -= dt; this.vx *= 0.8;
      if (this.windup <= 0) {
        if (this.shooting) { // 蛛丝鬼：喷吐蛛丝弹
          this.shooting = false;
          const ang = Math.atan2((p.y - 40) - (this.y - 50), p.x - this.x);
          projectiles.push({ x: this.x + this.face * 20, y: this.y - 50, vx: Math.cos(ang) * 270, vy: Math.sin(ang) * 270, r: 9, dmg: this.dmg, life: 3 });
          AudioSys.shoot();
        } else { // 近战出手判定
          const nx = p.x - this.x;
          if (Math.abs(nx) < this.range + 14 && Math.abs(p.y - this.y) < 70) hurtPlayer(this.dmg, this.x);
          AudioSys.swing();
        }
        this.atkT = 0.25; this.recover = this.cool;
      }
    } else if (this.type === 'spitter') {
      // 远程鬼：保持距离，读条喷丝
      this.shootCd -= dt;
      if (adx < 240) this.vx = -Math.sign(dx) * this.speed;
      else if (adx > 380) this.vx = Math.sign(dx) * this.speed;
      else this.vx *= 0.85;
      if (this.shootCd <= 0 && adx < 540) {
        this.shootCd = rand(1.8, 2.6);
        this.windup = 0.5; this.shooting = true; this.vx = 0;
      }
    } else if (adx < this.range) {
      if (this.type === 'elite' && this.stepCd <= 0 && adx > 30 && Math.random() < 0.35) {
        this.stepCd = 2.5; this.stepT = 0.18; // 垫步近身
        this.vx = Math.sign(dx) * 430;
      } else {
        this.windup = this.windupTime; this.vx = 0;
      }
    } else {
      this.vx = Math.sign(dx) * this.speed;
      if (this.type === 'swift' && this.onGround && adx < 260 && adx > 120 && Math.random() < 0.02) {
        this.vy = -430; this.vx = Math.sign(dx) * 320; this.onGround = false;
      }
    }
    if (this.atkT > 0) this.atkT -= dt;
    // 物理
    this.vy += 1500 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, 30, W - 30);
    if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; this.onGround = true; }
    return false;
  }
  updateBoss(dt, dx, adx) {
    const p = player;
    this.patT -= dt;
    // 狂暴：血量低于 35% 时加速、前摇缩短
    if (!this.enraged && this.hp < this.maxHp * 0.35) {
      this.enraged = true; this.speed *= 1.45;
      AudioSys.bossRoar(); shake = 12;
      spawnSmoke(this.x, this.y - 60, 24, '#c0392b');
    }
    const wScale = this.enraged ? 0.68 : 1;
    if (this.dashing) {
      this.x += this.vx * dt;
      spawnSmoke(this.x, this.y - 50, 1, '#8a5aa8');
      if (Math.abs(p.x - this.x) < 60 && Math.abs(p.y - this.y) < 80) { hurtPlayer(22, this.x); this.dashing = false; this.recover = 1.0; }
      if ((this.vx > 0 && this.x > W - 60) || (this.vx < 0 && this.x < 60) || this.patT <= 0) { this.dashing = false; this.recover = 1.0; }
      return false;
    }
    if (this.recover > 0) { this.recover -= dt; this.vx *= 0.85; this.x += this.vx * dt; return false; }
    if (this.windup > 0) {
      this.windup -= dt; this.vx *= 0.8;
      if (this.windup <= 0) {
        if (this.pattern === 0) { // 爪击三连
          if (Math.abs(p.x - this.x) < this.range + 20 && Math.abs(p.y - this.y) < 80) hurtPlayer(this.dmg, this.x);
          AudioSys.swingBig(); this.atkT = 0.3; this.shots++;
          if (this.shots < 3) this.windup = 0.28 * wScale; else { this.shots = 0; this.recover = 0.9; }
        }
      }
      this.x += this.vx * dt; return false;
    }
    // 选择招式
    if (this.patT <= 0) {
      const r = Math.random();
      if (adx < this.range + 10 || r < 0.32) { this.pattern = 0; this.windup = 0.5 * wScale; this.shots = 0; }  // 爪击
      else if (r < 0.58) { // 高速突进
        AudioSys.bossRoar();
        this.dashing = true; this.vx = Math.sign(dx) * (this.enraged ? 640 : 520); this.patT = 0.9;
        this.face = Math.sign(dx) || 1;
      } else if (r < 0.82 || this.sumT > 0) { // 血鬼术·丝牢乱舞：扇形弹幕
        this.pattern = 2; this.shots = this.enraged ? 10 : 8; this.patT = 2.4; this.recover = 0.4;
        this.vy = -260; this.onGround = false;
      } else { // 召唤小鬼助战
        this.sumT = 20;
        const adds = demons.filter(d => d.type !== 'boss' && d.state !== 'die').length;
        for (let i = 0; i < 2 && adds + i < 3; i++) {
          const d = new Demon('chibi', this.x + (i ? 90 : -90));
          demons.push(d);
        }
        AudioSys.bossRoar(); this.recover = 0.8; this.patT = 1.6;
        spawnSmoke(this.x, this.y - 60, 14, '#8a5aa8');
      }
    } else if (this.pattern === 2 && this.shots > 0) {
      this.shotT = (this.shotT || 0) - dt;
      if (this.shotT <= 0) {
        this.shotT = this.enraged ? 0.2 : 0.26; this.shots--;
        const base = Math.atan2((p.y - 40) - (this.y - 70), p.x - this.x);
        const ang = base + rand(-0.35, 0.35); // 扇形散布
        const spd = this.enraged ? 340 : 300;
        projectiles.push({ x: this.x, y: this.y - 70, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: 10, dmg: 12, life: 3 });
        AudioSys.shoot();
      }
    } else {
      this.vx = Math.sign(dx) * this.speed;
    }
    this.sumT -= dt;
    if (this.atkT > 0) this.atkT -= dt;
    this.vy += 1500 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, 40, W - 40);
    if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; this.onGround = true; }
    return false;
  }
  hurt(dmg, kb, dir) {
    if (this.state === 'die' || this.state === 'spawn') return;
    this.hp -= dmg; this.flash = 0.12;
    this.vx = dir * kb * (this.type === 'brute' || this.type === 'boss' ? 0.25 : 1);
    if (this.type !== 'boss') this.hurtT = 0.22;
    spawnBlood(this.x, this.y - this.h * 0.6, dir);
    if (this.hp <= 0) this.die();
    else AudioSys.hit();
  }
  die() {
    this.state = 'die'; this.deathT = 0;
    kills++;
    const bonus = 1 + Math.min(combo, 30) * 0.05;
    score += Math.round(this.score * bonus);
    player.hp = Math.min(player.maxHp, player.hp + 3);
    spawnSmoke(this.x, this.y - 30, this.type === 'elite' ? 26 : 20, this.type === 'elite' ? '#8a4a5a' : undefined);
    AudioSys.demonDie();
    if (this.type === 'boss') { AudioSys.bossRoar(); shake = 14; slowmo = 0.6; victoryTimer = 1.6; }
  }
}

/* 玩家攻击命中恶鬼（圆形范围判定） */
function damageDemons(x, y, range, dmg, kb, isSkill) {
  let hitAny = false;
  for (const d of demons) {
    if (d.state === 'die' || d.state === 'spawn') continue;
    const cx = clamp(x, d.x - d.w / 2, d.x + d.w / 2);
    const cy = clamp(y, d.y - d.h, d.y);
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < range * range) {
      const dir = d.x >= player.x ? 1 : -1;
      d.hurt(dmg, kb, dir || player.face);
      hitAny = true;
      combo++; comboT = 2.5;
      shake = Math.max(shake, isSkill ? 5 : 2.5);
      if (isSkill) AudioSys.hitBig();
    }
  }
  if (hitAny) slowmo = Math.max(slowmo, isSkill ? 0.10 : 0.045);
}

/* 弹幕更新 */
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.life -= dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    let dead = pr.life <= 0 || pr.x < -20 || pr.x > W + 20 || pr.y < -20 || pr.y > H + 20;
    if (!dead && state === 'play') {
      if (pr.friendly) {
        // 玩家水刃：命中恶鬼
        for (const d of demons) {
          if (d.state === 'die' || d.state === 'spawn') continue;
          const cx = clamp(pr.x, d.x - d.w / 2, d.x + d.w / 2);
          const cy = clamp(pr.y, d.y - d.h, d.y);
          const dx = pr.x - cx, dy = pr.y - cy;
          if (dx * dx + dy * dy < (pr.r + 16) * (pr.r + 16)) {
            d.hurt(pr.dmg, 170, Math.sign(pr.vx) || 1);
            combo++; comboT = 2.5;
            spawnSlash(pr.x, pr.y, Math.sign(pr.vx) || 1, false);
            AudioSys.hit(); dead = true; break;
          }
        }
      } else if (!player.dead) {
        const r = playerRect();
        if (pr.x > r.x && pr.x < r.x + r.w && pr.y > r.y && pr.y < r.y + r.h) {
          hurtPlayer(pr.dmg, pr.x); dead = true;
          spawnSmoke(pr.x, pr.y, 6, '#8a5aa8');
        }
      }
    }
    if (dead) projectiles.splice(i, 1);
  }
}
function drawProjectiles() {
  for (const pr of projectiles) {
    const friendly = !!pr.friendly;
    const g = ctx.createRadialGradient(pr.x, pr.y, 1, pr.x, pr.y, pr.r * 2.2);
    if (friendly) {
      g.addColorStop(0, 'rgba(220,245,255,0.95)'); g.addColorStop(0.5, 'rgba(110,190,255,0.7)'); g.addColorStop(1, 'rgba(60,140,255,0)');
    } else {
      g.addColorStop(0, 'rgba(230,180,255,0.95)'); g.addColorStop(0.5, 'rgba(160,80,220,0.7)'); g.addColorStop(1, 'rgba(120,40,180,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 2.2, 0, 6.3); ctx.fill();
    if (friendly) {
      // 水刃拖尾
      ctx.strokeStyle = 'rgba(160,220,255,0.8)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pr.x, pr.y);
      ctx.lineTo(pr.x - Math.sign(pr.vx) * pr.r * 3, pr.y - pr.vy * 0.03); ctx.stroke();
    } else {
      // 丝线
      ctx.strokeStyle = 'rgba(200,150,255,0.5)'; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const a = time * 4 + k * 2.1;
        ctx.beginPath(); ctx.moveTo(pr.x, pr.y);
        ctx.lineTo(pr.x + Math.cos(a) * pr.r * 2.4, pr.y + Math.sin(a) * pr.r * 2.4); ctx.stroke();
      }
    }
  }
}

/* ---------------- 绘制：通用 ---------------- */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function limb(x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function drawSword(hx, hy, ang, glow) {
  ctx.save();
  ctx.translate(hx, hy); ctx.rotate(ang);
  if (glow) { ctx.shadowColor = '#7fd4ff'; ctx.shadowBlur = 18; }
  // 刀身
  const g = ctx.createLinearGradient(0, 0, 52, 0);
  g.addColorStop(0, '#e8f2ff'); g.addColorStop(1, '#9fd0ff');
  ctx.fillStyle = g;
  ctx.fillRect(8, -2.5, 44, 5);
  ctx.beginPath(); ctx.moveTo(52, -2.5); ctx.lineTo(60, 0); ctx.lineTo(52, 2.5); ctx.closePath(); ctx.fill();
  // 镡（刀镡）
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(4, -7, 5, 14);
  // 刀柄
  ctx.fillStyle = '#20222e'; ctx.fillRect(-12, -3, 16, 6);
  ctx.restore();
}

/* ---------------- 绘制：玩家（鬼杀队剑士） ---------------- */
function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  ctx.scale(p.face, 1);
  if (p.dodgeT > 0) ctx.rotate(0.22); // 闪避前倾
  if (p.invuln > 0 && !p.dead && Math.floor(time * 18) % 2 === 0) ctx.globalAlpha = 0.35;
  const running = p.onGround && Math.abs(p.vx) > 40 && p.skillT <= 0 && p.atkT <= 0;
  const sw = running ? Math.sin(p.runT * 16) * 11 : 0;
  const bob = running ? Math.abs(Math.sin(p.runT * 16)) * 2.5 : 0;
  const deadK = p.dead ? 1 : 0;

  if (p.dead) { ctx.rotate(0.5 * Math.min(1, (1 - p.hp))); ctx.translate(0, 6); }

  // 腿
  limb(-3, -28, -3 + sw, -1, 9, '#26263e');
  limb(3, -28, 3 - sw, -1, 9, '#1e1e32');
  // 草鞋
  ctx.fillStyle = '#4a3b2a';
  ctx.fillRect(-3 + sw - 6, -4, 13, 5); ctx.fillRect(3 - sw - 6, -4, 13, 5);
  // 躯干（队服）
  ctx.fillStyle = '#1d1d33';
  ctx.fillRect(-10, -58 + bob, 20, 32);
  // 腰带
  ctx.fillStyle = '#cfd6ea'; ctx.fillRect(-11, -33 + bob, 22, 5);
  // 羽织（市松纹）：背后 + 衣袖
  const flap = running ? Math.sin(p.runT * 16) * 3 : Math.sin(time * 2) * 1.5;
  ctx.fillStyle = '#173a28';
  ctx.fillRect(-17, -62 + bob, 8, 44 + flap * 0.4);
  // 格纹
  for (let r = 0; r < 6; r++) for (let c = 0; c < 1; c++) {
    if ((r + c) % 2) { ctx.fillStyle = '#0e0e0e'; ctx.fillRect(-17, -62 + bob + r * 7.4, 8, 7.4); }
  }
  ctx.fillStyle = '#173a28'; ctx.fillRect(9, -62 + bob, 8, 44 - flap * 0.4);
  for (let r = 0; r < 6; r++) {
    if (r % 2 === 0) { ctx.fillStyle = '#0e0e0e'; ctx.fillRect(9, -62 + bob + r * 7.4, 8, 7.4); }
  }
  // 头
  const hx = 2, hy = -70 + bob;
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath(); ctx.arc(hx, hy, 9.5, 0, 6.3); ctx.fill();
  // 头发
  ctx.fillStyle = '#20202a';
  ctx.beginPath(); ctx.arc(hx - 1, hy - 2, 9.5, Math.PI * 0.95, Math.PI * 2.02); ctx.fill();
  ctx.fillRect(hx - 10, hy - 6, 4, 8);
  // 额头伤疤
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.moveTo(hx + 5, hy - 6); ctx.lineTo(hx + 8, hy - 3); ctx.lineTo(hx + 5, hy); ctx.lineTo(hx + 2, hy - 3); ctx.closePath(); ctx.fill();
  // 眼睛
  ctx.fillStyle = '#222'; ctx.fillRect(hx + 3, hy - 1, 3.5, 2.5);
  // 花札耳饰
  ctx.fillStyle = '#d23c3c'; ctx.fillRect(hx - 9, hy + 1, 5, 4);
  ctx.fillStyle = '#2e8b57'; ctx.fillRect(hx - 9, hy + 5, 5, 4);

  // 刀（根据状态摆姿势）
  let swordAng, handX, handY, glow = false;
  if (p.dead) { swordAng = 1.4; handX = 12; handY = -20; }
  else if (p.skillT > 0 && p.skillKind === 1) {
    const a = time * 26;
    handX = Math.cos(a) * 24; handY = -38 + Math.sin(a) * 24;
    swordAng = a + Math.PI / 2; glow = true;
    // 水车残影
    ctx.globalAlpha *= 1; ctx.strokeStyle = 'rgba(127,212,255,0.35)'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, -38, 46, 0, 6.3); ctx.stroke();
  } else if (p.atkT > 0) {
    const st = ATK[p.atkStage], k = 1 - p.atkT / st.dur;
    const e = 1 - Math.pow(1 - k, 3);
    const sweeps = [[-2.0, 0.9], [-2.2, 1.0], [-1.8, 1.35]];
    swordAng = lerp(sweeps[p.atkStage][0], sweeps[p.atkStage][1], e);
    handX = 15; handY = -44 + bob; glow = true;
  } else if (p.skillT > 0 && p.skillKind === 2) {
    swordAng = 0.04; handX = 22; handY = -42 + bob; glow = true;
  } else if (p.dodgeT > 0) {
    swordAng = 2.4; handX = -8; handY = -28; // 闪避收刀
  } else {
    swordAng = 1.25; handX = 9; handY = -30 + bob; // 腰间收刀
  }
  // 持刀手臂
  if (!(p.skillT > 0 && p.skillKind === 1)) limb(4, -50 + bob, handX, handY, 7, '#1d1d33');
  else limb(0, -38, handX, handY, 7, '#1d1d33');
  drawSword(handX, handY, swordAng, glow);
  ctx.restore();
}

/* ---------------- 绘制：恶鬼 ---------------- */
function drawDemon(d) {
  ctx.save();
  let alpha = 1, rise = 0;
  if (d.state === 'spawn') { const k = clamp(d.t / 0.8, 0, 1); alpha = k; rise = (1 - k) * 70; }
  if (d.state === 'die') alpha = clamp(1 - d.deathT / 0.7, 0, 1);
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(d.x), Math.round(d.y + rise));
  ctx.scale(d.face, 1);
  const s = d.type === 'brute' ? 1.45 : d.type === 'boss' ? 1.6 : d.type === 'swift' ? 0.95 : 1;
  ctx.scale(s, s);
  const wob = Math.sin(d.t * 7) * 2;
  const atkPose = d.atkT > 0 ? 1 : 0;
  if (d.type === 'boss' && d.enraged) { // 狂暴光环
    ctx.strokeStyle = 'rgba(255,60,60,' + (0.35 + 0.2 * Math.sin(time * 8)).toFixed(3) + ')';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, -44, 46, 0, 6.3); ctx.stroke();
  }

  // 腿
  limb(-6, -22, -8, -1, 8, d.dark); limb(6, -22, 8, -1, 8, d.dark);
  // 躯干（佝偻）
  ctx.fillStyle = d.skin;
  ctx.beginPath(); ctx.ellipse(0, -40 + wob * 0.4, 15, 21, 0.15, 0, 6.3); ctx.fill();
  if (d.type === 'boss') { // 蛛网纹
    ctx.strokeStyle = 'rgba(60,30,80,0.8)'; ctx.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 6, -58); ctx.lineTo(i * 9, -24); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, -58, 22, 0.4, Math.PI - 0.4); ctx.stroke();
  }
  if (d.type === 'brute') { // 背刺
    ctx.fillStyle = d.dark;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-8 - i * 2, -56 + i * 12); ctx.lineTo(-20 - i * 2, -50 + i * 12); ctx.lineTo(-8 - i * 2, -44 + i * 12); ctx.closePath(); ctx.fill();
    }
  }
  // 手臂 + 利爪
  const reach = d.windup > 0 ? 14 : atkPose ? 20 : 6;
  limb(6, -48, 20 + reach, -38 + wob, 7, d.skin);
  ctx.strokeStyle = '#e8e2f2'; ctx.lineWidth = 2.5;
  for (let c = 0; c < 3; c++) {
    ctx.beginPath(); ctx.moveTo(20 + reach, -42 + c * 4 + wob);
    ctx.lineTo(30 + reach, -40 + c * 4 + wob); ctx.stroke();
  }
  limb(-8, -48, -16, -36, 7, d.dark);
  // 头
  ctx.fillStyle = d.skin;
  ctx.beginPath(); ctx.arc(6, -66 + wob * 0.5, 12, 0, 6.3); ctx.fill();
  // 角
  ctx.fillStyle = d.dark;
  ctx.beginPath(); ctx.moveTo(-2, -74); ctx.lineTo(-6, -88); ctx.lineTo(2, -76); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, -76); ctx.lineTo(12, -90); ctx.lineTo(17, -75); ctx.closePath(); ctx.fill();
  if (d.type === 'boss') { // 白发
    ctx.fillStyle = '#e8e4f2';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.9 + i * 0.2);
      ctx.beginPath(); ctx.moveTo(6 + Math.cos(a) * 10, -66 + Math.sin(a) * 10);
      ctx.lineTo(6 + Math.cos(a) * 22, -66 + Math.sin(a) * 22);
      ctx.lineTo(6 + Math.cos(a + 0.15) * 10, -66 + Math.sin(a + 0.15) * 10);
      ctx.closePath(); ctx.fill();
    }
  }
  // 眼睛（红光 / Boss 紫光）
  const eg = d.type === 'boss' ? '#c77dff' : '#ff3b30';
  ctx.shadowColor = eg; ctx.shadowBlur = 8; ctx.fillStyle = eg;
  const eyeY = -67 + wob * 0.5;
  if (d.windup > 0) { ctx.fillRect(6, eyeY - 2, 9, 4); } // 蓄力时眼睛睁大
  else { ctx.beginPath(); ctx.arc(9, eyeY, 2.6, 0, 6.3); ctx.fill(); }
  ctx.shadowBlur = 0;
  if (d.type === 'spitter') { // 复眼
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(1, eyeY - 5, 1.8, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(14, eyeY - 5, 1.8, 0, 6.3); ctx.fill();
  }
  // 等级刻印：下弦 / 上弦
  if (d.type === 'elite' || d.type === 'boss') {
    ctx.fillStyle = d.type === 'boss' ? '#ffd76e' : '#ff8b8b';
    ctx.font = 'bold 12px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.type === 'boss' ? '上弦' : '下弦', 6, -84 + wob * 0.5);
    ctx.textAlign = 'left';
  }
  // 獠牙
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(10, -59); ctx.lineTo(12, -54); ctx.lineTo(14, -59); ctx.closePath(); ctx.fill();
  // 受击闪白
  if (d.flash > 0) {
    ctx.globalAlpha = alpha * 0.65; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(0, -44, 20, 34, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -66, 13, 0, 6.3); ctx.fill();
  }
  // 血条（受伤后显示）
  if (d.hp < d.maxHp && d.state !== 'die') {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-22, -92, 44, 6);
    ctx.fillStyle = d.type === 'boss' ? '#b45aff' : '#ff5b5b';
    ctx.fillRect(-21, -91, 42 * clamp(d.hp / d.maxHp, 0, 1), 4);
  }
  ctx.restore();
}

/* ---------------- 关卡 ---------------- */
function updateStages(dt) {
  const lastStage = STAGES.length - 1;
  if (stageState === 'intro') {
    stageTimer -= dt;
    if (stageTimer <= 0) {
      spawnQueue = [];
      const st = STAGES[stageIdx];
      for (const k in st.comp) for (let i = 0; i < st.comp[k]; i++) spawnQueue.push(k);
      spawnQueue.sort(() => Math.random() - 0.5);
      stageState = 'spawning'; spawnTimer = 0.6;
      AudioSys.wave();
      if (stageIdx === lastStage) AudioSys.bossRoar();
    }
  } else if (stageState === 'spawning') {
    spawnTimer -= dt;
    const st = STAGES[stageIdx];
    const alive = demons.filter(d => d.state !== 'die').length;
    if (spawnTimer <= 0 && spawnQueue.length && alive < st.cap) {
      spawnTimer = st.interval;
      const type = spawnQueue.shift();
      const x = Math.random() < 0.5 ? rand(30, 130) : rand(W - 130, W - 30);
      const d = new Demon(type, x);
      demons.push(d);
      if (type === 'boss') { boss = d; shake = 10; addTimer = 10; }
    }
    if (!spawnQueue.length) stageState = 'fight';
  } else if (stageState === 'fight') {
    if (stageIdx === lastStage && boss && boss.state !== 'die') {
      addTimer -= dt;
      const adds = demons.filter(d => d.type !== 'boss' && d.state !== 'die').length;
      if (addTimer <= 0 && adds < 2) { addTimer = 10; demons.push(new Demon('chibi', Math.random() < 0.5 ? 60 : W - 60)); }
    }
    if (demons.length === 0) {
      if (stageIdx >= lastStage) {
        if (victoryTimer > 0) victoryTimer -= dt;
        else { gameOver(true); return; }
      } else {
        stageState = 'clear'; stageTimer = 2.8;
        player.hp = Math.min(player.maxHp, player.hp + 12);
        AudioSys.ui();
      }
    }
  } else if (stageState === 'clear') {
    stageTimer -= dt;
    if (stageTimer <= 0) { stageIdx++; stageState = 'intro'; stageTimer = 2.4; }
  }
}

/* ---------------- HUD ---------------- */
function drawHUD() {
  ctx.textBaseline = 'middle';
  // HP
  ctx.fillStyle = 'rgba(6,10,24,0.62)'; rr(14, 12, 320, 52, 10); ctx.fill();
  ctx.fillStyle = '#cfe2ff'; ctx.font = 'bold 15px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('❤', 26, 39);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(48, 24, 240, 22, 6); ctx.fill();
  const hpk = clamp(player.hp / player.maxHp, 0, 1);
  const hg = ctx.createLinearGradient(48, 0, 288, 0);
  hg.addColorStop(0, '#ff5b5b'); hg.addColorStop(1, hpk > 0.3 ? '#ffb35b' : '#ff2222');
  ctx.fillStyle = hg;
  if (hpk > 0) { rr(48, 24, 240 * hpk, 22, 6); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
  ctx.fillText(Math.ceil(player.hp) + ' / ' + player.maxHp, 140, 36);
  // 关卡 & 得分
  ctx.fillStyle = 'rgba(6,10,24,0.62)'; rr(W - 284, 12, 270, 52, 10); ctx.fill();
  ctx.fillStyle = '#cfe2ff'; ctx.font = 'bold 14px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(STAGES[stageIdx].name, W - 272, 30);
  ctx.fillStyle = '#ffd76e'; ctx.fillText('得分 ' + score, W - 272, 50);
  // Boss 血条
  if (boss && boss.state !== 'die' && stageIdx === STAGES.length - 1) {
    ctx.fillStyle = 'rgba(6,10,24,0.62)'; rr(W / 2 - 230, 14, 460, 34, 8); ctx.fill();
    ctx.fillStyle = '#d9b8ff'; ctx.font = 'bold 14px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('上弦之鬼 · 血鬼术「丝牢」' + (boss.enraged ? ' · 狂暴' : ''), W / 2, 26); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(W / 2 - 220, 34, 440, 8, 4); ctx.fill();
    ctx.fillStyle = '#b45aff';
    const bk = clamp(boss.hp / boss.maxHp, 0, 1);
    if (bk > 0) { rr(W / 2 - 220, 34, 440 * bk, 8, 4); ctx.fill(); }
  }
  // 技能冷却
  const skills = [
    { name: '贰之型·水车', key: 'K', cd: player.s1cd, max: 6, x: 14 },
    { name: '壹之型·水面斩击', key: 'L', cd: player.s2cd, max: 8, x: 92 },
    { name: '叁之型·水刃', key: 'U', cd: player.s3cd, max: 5, x: 170 },
    { name: '闪避', key: 'Shift', cd: player.dodgeCd, max: 1.1, x: 248 }
  ];
  for (const s of skills) {
    ctx.fillStyle = 'rgba(6,10,24,0.62)'; rr(s.x, H - 92, 72, 78, 10); ctx.fill();
    ctx.strokeStyle = s.cd <= 0 ? 'rgba(127,212,255,0.9)' : 'rgba(120,140,180,0.4)';
    ctx.lineWidth = 2; rr(s.x, H - 92, 72, 78, 10); ctx.stroke();
    if (s.cd > 0) {
      ctx.fillStyle = 'rgba(4,6,16,0.72)'; rr(s.x, H - 92, 72, 78, 10); ctx.fill();
      ctx.fillStyle = '#9fb6e8'; ctx.font = 'bold 19px sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(s.cd.toFixed(1), s.x + 36, H - 53); ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = '#7fd4ff'; ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(s.name, s.x + 36, H - 66); ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#8fa8d8'; ctx.font = '11px sans-serif';
    ctx.fillText(s.key, s.x + 8, H - 24);
  }
  // 连斩
  if (combo >= 3) {
    const pulse = 1 + Math.sin(time * 10) * 0.06;
    ctx.save(); ctx.translate(W - 120, 130); ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ffd76e'; ctx.font = 'bold 30px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff9d2e'; ctx.shadowBlur = 14;
    ctx.fillText(combo + ' 连斩！', 0, 0);
    ctx.restore(); ctx.textAlign = 'left'; ctx.shadowBlur = 0;
  }
  // 关卡横幅
  if (stageState === 'intro' && stageTimer > 0) {
    const k = clamp(stageTimer / 2.4, 0, 1);
    ctx.globalAlpha = clamp(1.6 - k * 1.6, 0, 1);
    ctx.fillStyle = '#e8f0ff'; ctx.font = 'bold 50px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.shadowColor = '#5f9dff'; ctx.shadowBlur = 24;
    ctx.fillText(STAGES[stageIdx].name, W / 2, H / 2 - 40);
    ctx.font = 'bold 20px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#9fb6e8';
    ctx.fillText('恶鬼来袭！', W / 2, H / 2 + 8);
    ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  } else if (stageState === 'clear') {
    ctx.globalAlpha = clamp(stageTimer / 2.8, 0, 1) * 0.9 + 0.1;
    ctx.fillStyle = '#9fe8b8'; ctx.font = 'bold 44px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('肃清！体力小幅恢复', W / 2, H / 2 - 40);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
  // 低血量警告
  if (player.hp < 30 && !player.dead && state === 'play') {
    const a = 0.22 + 0.14 * Math.sin(time * 6);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(200,0,0,0)'); vg.addColorStop(1, 'rgba(200,0,0,' + a.toFixed(3) + ')');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
}

/* ---------------- 流程控制 ---------------- */
const screenTitle = document.getElementById('screen-title');
const screenOver = document.getElementById('screen-over');
const overTitle = document.getElementById('over-title');
const overStats = document.getElementById('over-stats');

function resetGame() {
  player.x = 200; player.y = GROUND; player.vx = 0; player.vy = 0;
  player.face = 1; player.hp = player.maxHp; player.dead = false;
  player.atkStage = 0; player.atkT = 0; player.atkCd = 0;
  player.s1cd = 0; player.s2cd = 0; player.s3cd = 0; player.skillT = 0;
  player.dodgeT = 0; player.dodgeCd = 0; player.invuln = 0;
  demons.length = 0; projectiles.length = 0;
  score = 0; combo = 0; comboT = 0; kills = 0;
  stageIdx = 0; stageState = 'intro'; stageTimer = 2.4;
  spawnQueue = []; boss = null; victoryTimer = 0; shake = 0; slowmo = 0;
  input.clearQ();
}
function startGame() {
  AudioSys.init(); AudioSys.ui();
  resetGame();
  screenTitle.classList.add('hidden');
  screenOver.classList.add('hidden');
  state = 'play';
}
function gameOver(win) {
  if (state !== 'play') return;
  state = win ? 'win' : 'over';
  input.clearQ();
  if (win) AudioSys.victory(); else AudioSys.defeat();
  overTitle.textContent = win ? '上弦之鬼，已被斩杀！' : '你被恶鬼吞噬了…';
  overTitle.style.color = win ? '#9fe8b8' : '#ff8b8b';
  overStats.innerHTML = '最终得分：<b style="color:#ffd76e">' + score + '</b><br>斩杀恶鬼：' + kills + ' 只　到达：' +
    STAGES[stageIdx].name;
  setTimeout(() => screenOver.classList.remove('hidden'), win ? 400 : 900);
}
function togglePause() {
  if (state === 'play') { state = 'pause'; }
  else if (state === 'pause') { state = 'play'; input.clearQ(); }
}
function toggleMute() {
  AudioSys.muted = !AudioSys.muted;
  document.getElementById('btn-mute').textContent = AudioSys.muted ? '🔇' : '🔊';
}
/* 全屏 */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
function toggleFullscreen() {
  const el = document.getElementById('game-wrap');
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else toast('当前浏览器不支持全屏，请横屏游玩');
  } catch (e) { toast('无法进入全屏'); }
}
document.getElementById('btn-full').addEventListener('click', () => { AudioSys.init(); toggleFullscreen(); });
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-pause').addEventListener('click', () => { AudioSys.init(); togglePause(); });
document.getElementById('btn-mute').addEventListener('click', () => { AudioSys.init(); toggleMute(); });

/* ---------------- 渲染 ---------------- */
function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  drawBackground();
  drawProjectiles();
  for (const d of demons) drawDemon(d);
  if (state !== 'title') drawPlayer();
  else {
    // 标题界面背景里站一个持刀剪影
    ctx.save(); ctx.globalAlpha = 0.9;
    const px = player.x; player.x = W / 2 - 260;
    drawPlayer(); player.x = px;
    ctx.restore();
  }
  drawParticles();
  ctx.restore();
  if (state === 'play' || state === 'pause') drawHUD();
  if (state === 'pause') {
    ctx.fillStyle = 'rgba(4,6,16,0.6)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8f0ff'; ctx.font = 'bold 48px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('暂 停', W / 2, H / 2);
    ctx.font = '18px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#9fb6e8'; ctx.fillText('按 P 或点击 ⏸ 继续', W / 2, H / 2 + 50);
    ctx.textAlign = 'left';
  }
}

/* ---------------- 主循环 ---------------- */
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.033, ((ts - last) / 1000) || 0.016);
  last = ts;
  if (state === 'pause') { render(); return; }
  let dt = rawDt;
  if (slowmo > 0) { slowmo -= rawDt; dt *= 0.22; }
  time += dt;
  if (shake > 0) shake = Math.max(0, shake - 46 * rawDt);
  if (state === 'play') {
    pollMoveKeys();
    updatePlayer(dt);
    for (let i = demons.length - 1; i >= 0; i--) {
      if (demons[i].update(dt)) demons.splice(i, 1);
    }
    updateProjectiles(dt);
    updateStages(dt);
  }
  updateParticles(state === 'play' ? dt : rawDt);
  render();
}

/* ---------------- 启动 ---------------- */
spawnPetals(45);
requestAnimationFrame(frame);
