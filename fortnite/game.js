/* ============================================================
 * FORTBYTE — a top-down battle-royale mini-game (Fortnite-style)
 * Pure HTML5 canvas, no dependencies.
 * ============================================================ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mmCtx = minimap.getContext('2d');

const WORLD = 4000;          // world is WORLD x WORLD
const START_PLAYERS = 100;

// ---- HUD elements ----
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const overlayBody = document.getElementById('overlay-body');
const startBtn = document.getElementById('start-btn');
const aliveCountEl = document.getElementById('alive-count');
const healthFill = document.getElementById('health-fill');
const healthText = document.getElementById('health-text');
const shieldFill = document.getElementById('shield-fill');
const shieldText = document.getElementById('shield-text');
const matCountEl = document.getElementById('mat-count');
const ammoCountEl = document.getElementById('ammo-count');
const weaponNameEl = document.getElementById('weapon-name');
const stormTimerEl = document.getElementById('storm-timer');

// ---- Input state ----
const keys = {};
const mouse = { x: 0, y: 0, down: false };

// ---- Game state ----
let player, bots, bullets, trees, loot, walls, storm;
let phantomAlive = 0;       // far-away players we just count down for flavour
let running = false;
let lastTime = 0;
let killCount = 0;
let camera = { x: 0, y: 0 };

// =========================================================
//  Setup / resize
// =========================================================
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// =========================================================
//  Helpers
// =========================================================
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return dist(cx, cy, nx, ny) < cr;
}

// =========================================================
//  World generation
// =========================================================
function initWorld() {
  bullets = [];
  walls = [];
  killCount = 0;

  // Trees = harvestable resource nodes.
  trees = [];
  for (let i = 0; i < 260; i++) {
    trees.push({ x: rand(100, WORLD - 100), y: rand(100, WORLD - 100), r: 22, hp: 60 });
  }

  // Loot scattered around the map.
  loot = [];
  const types = ['gun', 'ammo', 'shield', 'wood'];
  for (let i = 0; i < 120; i++) {
    loot.push({
      x: rand(80, WORLD - 80),
      y: rand(80, WORLD - 80),
      type: types[Math.floor(Math.random() * types.length)],
    });
  }

  // Player.
  player = {
    x: WORLD / 2, y: WORLD / 2, angle: 0,
    speed: 200, health: 100, shield: 0, mats: 30,
    weapon: 1,                 // 1 = gun, 2 = pickaxe
    gunLevel: 1, ammo: 90,
    fireCd: 0, buildCd: 0, harvestCd: 0,
    alive: true, radius: 18,
  };

  // Real, simulated bots near the action.
  bots = [];
  const REAL_BOTS = 34;
  for (let i = 0; i < REAL_BOTS; i++) {
    let x, y;
    do {
      x = rand(200, WORLD - 200);
      y = rand(200, WORLD - 200);
    } while (dist(x, y, player.x, player.y) < 500);
    bots.push({
      x, y, angle: 0, health: 100, shield: rand(0, 50) | 0,
      speed: rand(150, 195), fireCd: rand(0, 2),
      tx: x, ty: y, retarget: 0, alive: true, radius: 18,
      detect: rand(420, 620), accuracy: rand(0.6, 0.95),
    });
  }
  // Remaining players exist only as a counter that ticks down over time.
  phantomAlive = START_PLAYERS - 1 - REAL_BOTS;

  // Storm: safe circle that shrinks toward a random point.
  storm = {
    x: rand(WORLD * 0.35, WORLD * 0.65),
    y: rand(WORLD * 0.35, WORLD * 0.65),
    radius: WORLD * 0.72,
    target: WORLD * 0.55,
    shrinkRate: 14,
    damage: 8,                 // dps outside the circle
  };
}

function aliveCount() {
  return 1 + bots.filter((b) => b.alive).length + Math.max(0, phantomAlive);
}

// =========================================================
//  Input
// =========================================================
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === '1') player && (player.weapon = 1);
  if (e.key === '2') player && (player.weapon = 2);
  if (e.key.toLowerCase() === 'q') tryBuild();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', () => { mouse.down = true; });
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// =========================================================
//  Player actions
// =========================================================
function worldMouse() {
  return { x: mouse.x + camera.x, y: mouse.y + camera.y };
}

function shoot() {
  if (player.fireCd > 0 || player.ammo <= 0) return;
  player.ammo--;
  player.fireCd = 0.12;
  const speed = 760;
  const spread = rand(-0.04, 0.04);
  const a = player.angle + spread;
  bullets.push({
    x: player.x + Math.cos(a) * 22,
    y: player.y + Math.sin(a) * 22,
    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    dmg: 18 + player.gunLevel * 6, owner: 'player', life: 1.1,
  });
}

function pickaxe() {
  if (player.harvestCd > 0) return;
  player.harvestCd = 0.32;
  const reach = 70;
  const tx = player.x + Math.cos(player.angle) * reach;
  const ty = player.y + Math.sin(player.angle) * reach;

  // Harvest nearest tree in reach.
  for (const t of trees) {
    if (t.hp > 0 && dist(tx, ty, t.x, t.y) < t.r + 14) {
      t.hp -= 25;
      player.mats = Math.min(999, player.mats + 8);
      if (t.hp <= 0) player.mats = Math.min(999, player.mats + 12);
      return;
    }
  }
  // Or damage a wall / bot in melee range.
  for (const w of walls) {
    if (w.hp > 0 && circleRect(tx, ty, 16, w.x, w.y, w.w, w.h)) { w.hp -= 40; return; }
  }
  for (const b of bots) {
    if (b.alive && dist(tx, ty, b.x, b.y) < b.radius + 16) { damageBot(b, 30); return; }
  }
}

function tryBuild() {
  if (!player || !player.alive || player.mats < 10 || player.buildCd > 0) return;
  player.buildCd = 0.25;
  player.mats -= 10;
  const d = 60, size = 80;
  const bx = player.x + Math.cos(player.angle) * d - size / 2;
  const by = player.y + Math.sin(player.angle) * d - size / 2;
  walls.push({ x: bx, y: by, w: size, h: size, hp: 150, maxHp: 150 });
}

// =========================================================
//  Combat helpers
// =========================================================
function damageBot(b, dmg) {
  if (!b.alive) return;
  if (b.shield > 0) {
    const a = Math.min(b.shield, dmg);
    b.shield -= a; dmg -= a;
  }
  b.health -= dmg;
  if (b.health <= 0) {
    b.alive = false;
    killCount++;
  }
}

function damagePlayer(dmg) {
  if (player.shield > 0) {
    const a = Math.min(player.shield, dmg);
    player.shield -= a; dmg -= a;
  }
  player.health -= dmg;
  if (player.health <= 0) {
    player.health = 0;
    player.alive = false;
    endGame(false);
  }
}

function blockedByWall(x, y, r) {
  for (const w of walls) {
    if (w.hp > 0 && circleRect(x, y, r, w.x, w.y, w.w, w.h)) return true;
  }
  return false;
}

// =========================================================
//  Update
// =========================================================
function update(dt) {
  // ---- Player movement ----
  let dx = 0, dy = 0;
  if (keys['w']) dy -= 1;
  if (keys['s']) dy += 1;
  if (keys['a']) dx -= 1;
  if (keys['d']) dx += 1;
  const len = Math.hypot(dx, dy) || 1;
  const sprint = keys['shift'] ? 1.5 : 1;
  const nx = player.x + (dx / len) * player.speed * sprint * dt;
  const ny = player.y + (dy / len) * player.speed * sprint * dt;
  if (!blockedByWall(nx, player.y, player.radius)) player.x = clamp(nx, 0, WORLD);
  if (!blockedByWall(player.x, ny, player.radius)) player.y = clamp(ny, 0, WORLD);

  // ---- Aim ----
  const wm = worldMouse();
  player.angle = Math.atan2(wm.y - player.y, wm.x - player.x);

  // ---- Cooldowns ----
  player.fireCd = Math.max(0, player.fireCd - dt);
  player.buildCd = Math.max(0, player.buildCd - dt);
  player.harvestCd = Math.max(0, player.harvestCd - dt);

  // ---- Actions ----
  if (mouse.down) {
    if (player.weapon === 1) shoot();
    else pickaxe();
  }

  // ---- Loot pickup ----
  for (const item of loot) {
    if (item.taken) continue;
    if (dist(player.x, player.y, item.x, item.y) < 32) {
      item.taken = true;
      if (item.type === 'gun') player.gunLevel = Math.min(4, player.gunLevel + 1);
      else if (item.type === 'ammo') player.ammo += 45;
      else if (item.type === 'shield') player.shield = Math.min(100, player.shield + 50);
      else if (item.type === 'wood') player.mats = Math.min(999, player.mats + 40);
    }
  }

  // ---- Storm shrink + damage ----
  if (storm.radius > storm.target) {
    storm.radius = Math.max(storm.target, storm.radius - storm.shrinkRate * dt);
  } else {
    // Next storm phase.
    storm.target = Math.max(160, storm.target * 0.62);
    storm.damage += 3;
    storm.x += rand(-200, 200);
    storm.y += rand(-200, 200);
  }
  if (dist(player.x, player.y, storm.x, storm.y) > storm.radius) {
    damagePlayer(storm.damage * dt);
  }

  // ---- Phantom players die off over time ----
  if (phantomAlive > 0 && Math.random() < dt * 1.4) phantomAlive--;

  updateBots(dt);
  updateBullets(dt);

  // ---- Camera ----
  camera.x = player.x - canvas.width / 2;
  camera.y = player.y - canvas.height / 2;

  // ---- Win check ----
  if (player.alive && aliveCount() <= 1) endGame(true);
}

function updateBots(dt) {
  for (const b of bots) {
    if (!b.alive) continue;

    // Storm damage on bots too.
    if (dist(b.x, b.y, storm.x, storm.y) > storm.radius) {
      b.health -= storm.damage * dt;
      if (b.health <= 0) { b.alive = false; killCount++; continue; }
    }

    const toPlayer = dist(b.x, b.y, player.x, player.y);
    const seePlayer = player.alive && toPlayer < b.detect;

    // Decide a movement target.
    b.retarget -= dt;
    const outsideStorm = dist(b.x, b.y, storm.x, storm.y) > storm.radius - 80;
    if (outsideStorm) {
      // Run toward storm centre.
      b.tx = storm.x + rand(-120, 120);
      b.ty = storm.y + rand(-120, 120);
    } else if (seePlayer) {
      // Strafe around the player at mid range.
      if (toPlayer > 320) { b.tx = player.x; b.ty = player.y; }
      else if (toPlayer < 180) {
        b.tx = b.x + (b.x - player.x); b.ty = b.y + (b.y - player.y);
      } else if (b.retarget <= 0) {
        const a = Math.atan2(b.y - player.y, b.x - player.x) + rand(-1, 1);
        b.tx = player.x + Math.cos(a) * 250;
        b.ty = player.y + Math.sin(a) * 250;
        b.retarget = 1;
      }
    } else if (b.retarget <= 0) {
      b.tx = clamp(b.x + rand(-400, 400), 0, WORLD);
      b.ty = clamp(b.y + rand(-400, 400), 0, WORLD);
      b.retarget = rand(2, 4);
    }

    // Move toward target.
    const mvx = b.tx - b.x, mvy = b.ty - b.y;
    const ml = Math.hypot(mvx, mvy) || 1;
    const bnx = b.x + (mvx / ml) * b.speed * dt;
    const bny = b.y + (mvy / ml) * b.speed * dt;
    if (!blockedByWall(bnx, b.y, b.radius)) b.x = clamp(bnx, 0, WORLD);
    if (!blockedByWall(b.x, bny, b.radius)) b.y = clamp(bny, 0, WORLD);

    // Shoot at the player.
    b.fireCd -= dt;
    if (seePlayer && toPlayer < 540 && b.fireCd <= 0) {
      b.fireCd = rand(0.45, 0.9);
      b.angle = Math.atan2(player.y - b.y, player.x - b.x);
      const miss = (1 - b.accuracy) * rand(-0.5, 0.5);
      const a = b.angle + miss;
      bullets.push({
        x: b.x + Math.cos(a) * 22, y: b.y + Math.sin(a) * 22,
        vx: Math.cos(a) * 680, vy: Math.sin(a) * 680,
        dmg: 12, owner: b, life: 1.1,
      });
    } else if (seePlayer) {
      b.angle = Math.atan2(player.y - b.y, player.x - b.x);
    }
  }
}

function updateBullets(dt) {
  for (const blt of bullets) {
    if (blt.dead) continue;
    blt.x += blt.vx * dt;
    blt.y += blt.vy * dt;
    blt.life -= dt;
    if (blt.life <= 0) { blt.dead = true; continue; }

    // Walls.
    for (const w of walls) {
      if (w.hp > 0 && circleRect(blt.x, blt.y, 3, w.x, w.y, w.w, w.h)) {
        w.hp -= blt.dmg; blt.dead = true; break;
      }
    }
    if (blt.dead) continue;

    if (blt.owner === 'player') {
      for (const b of bots) {
        if (b.alive && dist(blt.x, blt.y, b.x, b.y) < b.radius) {
          damageBot(b, blt.dmg); blt.dead = true; break;
        }
      }
    } else if (player.alive && dist(blt.x, blt.y, player.x, player.y) < player.radius) {
      damagePlayer(blt.dmg); blt.dead = true;
    }
  }
  bullets = bullets.filter((b) => !b.dead);
  trees = trees.filter((t) => t.hp > 0);
  walls = walls.filter((w) => w.hp > 0);
  loot = loot.filter((l) => !l.taken);
}

// =========================================================
//  Render
// =========================================================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Ground grid.
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  ctx.fillStyle = '#4a7a3a';
  ctx.fillRect(0, 0, WORLD, WORLD);
  ctx.strokeStyle = '#00000018';
  ctx.lineWidth = 1;
  const step = 200;
  const startX = Math.floor(camera.x / step) * step;
  const startY = Math.floor(camera.y / step) * step;
  for (let x = startX; x < camera.x + canvas.width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, camera.y); ctx.lineTo(x, camera.y + canvas.height); ctx.stroke();
  }
  for (let y = startY; y < camera.y + canvas.height; y += step) {
    ctx.beginPath(); ctx.moveTo(camera.x, y); ctx.lineTo(camera.x + canvas.width, y); ctx.stroke();
  }

  // World border.
  ctx.strokeStyle = '#00000055'; ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, WORLD, WORLD);

  // Loot.
  for (const item of loot) {
    if (item.taken || !inView(item.x, item.y, 40)) continue;
    drawLoot(item);
  }

  // Trees.
  ctx.fillStyle = '#2e5e22';
  for (const t of trees) {
    if (!inView(t.x, t.y, 40)) continue;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a4a22';
    ctx.fillRect(t.x - 4, t.y - 2, 8, 8);
    ctx.fillStyle = '#2e5e22';
  }

  // Walls.
  for (const w of walls) {
    if (!inView(w.x + w.w / 2, w.y + w.h / 2, 80)) continue;
    const t = w.hp / w.maxHp;
    ctx.fillStyle = `rgb(${150 - t * 30}, ${100 + t * 40}, ${60})`;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = '#00000055'; ctx.lineWidth = 2;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
    ctx.beginPath();
    ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + w.w, w.y + w.h);
    ctx.moveTo(w.x + w.w, w.y); ctx.lineTo(w.x, w.y + w.h);
    ctx.stroke();
  }

  // Bots.
  for (const b of bots) {
    if (!b.alive || !inView(b.x, b.y, 40)) continue;
    drawCharacter(b.x, b.y, b.angle, '#d9434e', '#ffb3b8');
  }

  // Bullets.
  ctx.fillStyle = '#ffe14d';
  for (const blt of bullets) {
    if (!inView(blt.x, blt.y, 20)) continue;
    ctx.beginPath(); ctx.arc(blt.x, blt.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  // Player.
  if (player.alive) drawCharacter(player.x, player.y, player.angle, '#2f9bff', '#bfe0ff');

  // Storm ring (drawn as darkened area outside the safe circle).
  ctx.save();
  ctx.beginPath();
  ctx.rect(camera.x, camera.y, canvas.width, canvas.height);
  ctx.arc(storm.x, storm.y, storm.radius, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(123,47,247,0.28)';
  ctx.fill('evenodd');
  ctx.restore();
  ctx.beginPath();
  ctx.arc(storm.x, storm.y, storm.radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#c08bff'; ctx.lineWidth = 4; ctx.stroke();

  ctx.restore();
  renderMinimap();
}

function inView(x, y, pad) {
  return x > camera.x - pad && x < camera.x + canvas.width + pad &&
         y > camera.y - pad && y < camera.y + canvas.height + pad;
}

function drawCharacter(x, y, angle, body, accent) {
  ctx.save();
  ctx.translate(x, y);
  // gun barrel
  ctx.rotate(angle);
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -3, 22, 6);
  ctx.rotate(-angle);
  // body
  ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fillStyle = body; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#00000055'; ctx.stroke();
  // accent dot (facing)
  ctx.beginPath();
  ctx.arc(Math.cos(angle) * 7, Math.sin(angle) * 7, 6, 0, Math.PI * 2);
  ctx.fillStyle = accent; ctx.fill();
  ctx.restore();
}

function drawLoot(item) {
  const colors = { gun: '#ffd34d', ammo: '#ff8c42', shield: '#2f9bff', wood: '#9c6b3f' };
  const icons = { gun: '🔫', ammo: '▮', shield: '🛡', wood: '🪵' };
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fillStyle = colors[item.type] + 'cc';
  ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(icons[item.type], 0, 1);
  ctx.restore();
}

function renderMinimap() {
  const s = minimap.width / WORLD;
  mmCtx.clearRect(0, 0, minimap.width, minimap.height);
  mmCtx.fillStyle = '#1b3a14';
  mmCtx.fillRect(0, 0, minimap.width, minimap.height);

  // storm
  mmCtx.beginPath();
  mmCtx.arc(storm.x * s, storm.y * s, storm.radius * s, 0, Math.PI * 2);
  mmCtx.strokeStyle = '#c08bff'; mmCtx.lineWidth = 2; mmCtx.stroke();

  // bots
  mmCtx.fillStyle = '#ff5a5a';
  for (const b of bots) {
    if (!b.alive) continue;
    mmCtx.fillRect(b.x * s - 1.5, b.y * s - 1.5, 3, 3);
  }
  // player
  mmCtx.fillStyle = '#4dd2ff';
  mmCtx.fillRect(player.x * s - 2.5, player.y * s - 2.5, 5, 5);
}

// =========================================================
//  HUD
// =========================================================
function updateHud() {
  aliveCountEl.textContent = aliveCount();
  healthFill.style.width = player.health + '%';
  healthText.textContent = Math.ceil(player.health);
  shieldFill.style.width = player.shield + '%';
  shieldText.textContent = Math.ceil(player.shield);
  matCountEl.textContent = player.mats;
  ammoCountEl.textContent = player.weapon === 1 ? player.ammo : '—';
  weaponNameEl.textContent = player.weapon === 1
    ? `Gewehr Lv.${player.gunLevel}`
    : 'Spitzhacke';
  const phase = storm.radius <= storm.target + 1 ? 'Sturm geschlossen!' : 'Sturm zieht sich zusammen …';
  stormTimerEl.textContent = phase;
}

// =========================================================
//  Loop
// =========================================================
function loop(t) {
  if (!running) return;
  const dt = Math.min(0.05, (t - lastTime) / 1000) || 0;
  lastTime = t;
  update(dt);
  render();
  updateHud();
  requestAnimationFrame(loop);
}

// =========================================================
//  Start / end
// =========================================================
function startGame() {
  initWorld();
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame(won) {
  if (!running) return;
  running = false;
  hud.classList.add('hidden');
  overlay.classList.remove('hidden');
  const placement = won ? 1 : aliveCount();
  overlayBody.innerHTML = `
    <h2 class="result-title ${won ? 'win' : 'lose'}">
      ${won ? '👑 #1 VICTORY ROYALE!' : '💀 Ausgeschieden'}
    </h2>
    <p class="result-stats">
      Platzierung: <b>#${placement}</b> von ${START_PLAYERS}<br>
      Eliminierungen: <b>${killCount}</b>
    </p>`;
  startBtn.textContent = 'Nochmal spielen';
}

startBtn.addEventListener('click', startGame);
