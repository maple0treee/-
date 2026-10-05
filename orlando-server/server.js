// 오를란도 3D 동시접속 서버
// - 게임 페이지(public/index.html)와 캐릭터 모델(public/player.glb)을 보여준다
// - /ws 로 들어온 접속자끼리 위치·직업·레벨·스킬 효과를 주고받게 해 준다
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// 파일을 미리 읽어 두고(압축본 포함) 바로 보내 준다
const files = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-cache' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-cache' },
  '/player.glb': { file: 'player.glb', type: 'model/gltf-binary', cache: 'public, max-age=604800' },
  '/three.min.js': { file: 'three.min.js', type: 'application/javascript; charset=utf-8', cache: 'public, max-age=604800' },
  '/GLTFLoader.js': { file: 'GLTFLoader.js', type: 'application/javascript; charset=utf-8', cache: 'public, max-age=604800' },
  '/SkeletonUtils.js': { file: 'SkeletonUtils.js', type: 'application/javascript; charset=utf-8', cache: 'public, max-age=604800' },
};
for (const f of Object.values(files)) {
  f.body = fs.readFileSync(path.join(PUBLIC, f.file));
  f.gz = zlib.gzipSync(f.body);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  const f = files[url];
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('없는 페이지'); }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, {
    'Content-Type': f.type,
    'Cache-Control': f.cache,
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(gzip ? f.gz : f.body);
});

// ---------- 동시접속 ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
const clients = new Map(); // id -> ws
let counter = 0;

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(obj, except) {
  const msg = JSON.stringify(obj);
  for (const ws of clients.values()) if (ws !== except && ws.readyState === 1) ws.send(msg);
}
// 다른 사람에게 그대로 전달하기 전에, 정해진 모양만 남긴다
function cleanPresence(d) {
  if (!d || typeof d !== 'object') return {};
  const n = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
  return {
    n: typeof d.n === 'string' ? d.n.slice(0, 12) : '모험가',
    j: typeof d.j === 'string' ? d.j.slice(0, 16) : 'warrior',
    lv: Math.max(1, Math.min(99, Math.floor(n(d.lv)) || 1)),
    x: n(d.x), y: n(d.y), z: n(d.z), r: n(d.r),
    sw: Math.floor(n(d.sw)) % 1e6,
    on: d.on ? 1 : 0,
    al: d.al ? 1 : 0,
  };
}

wss.on('connection', (ws) => {
  const id = 'p' + (++counter).toString(36) + Math.random().toString(36).slice(2, 6);
  ws.id = id;
  ws.pres = {};
  ws.alive = true;
  ws.budget = 60; // 1초에 받을 수 있는 메시지 수
  clients.set(id, ws);

  const peers = {};
  for (const [k, c] of clients) if (k !== id) peers[k] = c.pres;
  send(ws, { t: 'hello', id, peers });
  send(ws, { t: 'mons', list: [...monsters.values()].map(pub) });
  broadcast({ t: 'join', id }, ws);

  ws.on('message', (raw) => {
    if (ws.budget-- <= 0) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'p') {
      ws.pres = cleanPresence(m.d);
      broadcast({ t: 'p', id, d: ws.pres }, ws);
    } else if (m.t === 'hit' && m.d && typeof m.d === 'object') {
      const mon = monsters.get(m.d.i);
      const dmg = Number(m.d.d);
      if (!mon || !isFinite(dmg) || dmg <= 0) return;
      if (Math.hypot(ws.pres.x - mon.x, ws.pres.z - mon.z) > 40) return; // 너무 먼 곳의 공격은 무시
      const st = Number(m.d.st);
      if (isFinite(st) && st > 0) mon.stun = Math.max(mon.stun, Math.min(st, 4) * (mon.D.boss ? 0.3 : 1));
      if (Array.isArray(m.d.dot)) { const dps = Number(m.d.dot[0]), t = Number(m.d.dot[1]); if (isFinite(dps) && isFinite(t) && dps > 0) mon.dot = { dps: Math.min(dps, 500), t: Math.min(t, 10), acc: 0 }; }
      hurtMon(mon, Math.min(dmg, 5000), id);
    } else if (m.t === 'fx' && m.d && typeof m.d === 'object') {
      // 스킬 효과: 정해진 종류와 숫자만 골라서 다른 사람에게 전달
      const d = m.d, n = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
      const out = { k: ['p', 'r', 'b'].includes(d.k) ? d.k : 'b' };
      for (const key of ['x', 'y', 'z', 'dx', 'dy', 'dz', 'sp', 's', 'c', 'g', 'd']) if (key in d) out[key] = n(d[key]);
      broadcast({ t: 'fx', id, d: out }, ws);
    }
  });
  ws.on('pong', () => { ws.alive = true; });
  ws.on('close', () => {
    clients.delete(id);
    broadcast({ t: 'leave', id });
  });
});

setInterval(() => { for (const ws of clients.values()) ws.budget = 60; }, 1000);

// ---------- 몬스터 (모든 접속자가 같은 몬스터를 본다) ----------
const MON = {
  slime:     { zone: 'forest',  hp: 26,   atk: 6,  build: 'slime' },
  wolf:      { zone: 'forest',  hp: 38,   atk: 8,  build: 'quad' },
  boar:      { zone: 'plains',  hp: 58,   atk: 11, build: 'quad' },
  goblin:    { zone: 'plains',  hp: 54,   atk: 13, build: 'biped', scale: 0.8 },
  toad:      { zone: 'swamp',   hp: 84,   atk: 16, build: 'slime', scale: 1.2 },
  lizard:    { zone: 'swamp',   hp: 104,  atk: 19, build: 'biped' },
  skeleton:  { zone: 'ruins',   hp: 120,  atk: 23, build: 'biped' },
  ogre:      { zone: 'ruins',   hp: 200,  atk: 29, build: 'biped', scale: 1.75 },
  kingslime: { zone: 'dungeon', hp: 2400, atk: 34, build: 'slime', scale: 4.2, boss: true },
};
const ZONE_MON = { forest: ['slime', 'slime', 'wolf'], plains: ['boar', 'goblin'], swamp: ['toad', 'lizard'], ruins: ['skeleton', 'skeleton', 'ogre'] };
const ZONE_COUNT = { forest: 10, plains: 9, swamp: 8, ruins: 7 };
// 지하 석굴(게임과 같은 치수)
const DUN = { x: 0, z: 422, R: 14, corZ0: 394, corZ1: 409, corW: 3.2 };
const BOSS_HOME = { x: 0, z: 421 };
// 게임(클라이언트)의 지역 구분과 같은 계산
function zoneAt(x, z) {
  if (z > 300) return 'dungeon';
  const d = Math.hypot(x, z);
  if (d < 26) return 'village';
  const a = Math.atan2(z, x) + Math.sin(d * 0.11) * 0.12, P = Math.PI;
  if (a >= -0.75 * P && a < -0.25 * P) return 'forest';
  if (a >= -0.25 * P && a < 0.25 * P) return 'plains';
  if (a >= 0.25 * P && a < 0.75 * P) return 'swamp';
  return 'ruins';
}
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 나무·바위·집 위치 (게임에서 뽑아 둔 colliders.json). 몬스터가 통과하지 않게 한다
let COLS = [];
try { COLS = JSON.parse(fs.readFileSync(path.join(__dirname, 'colliders.json'), 'utf8')); } catch (e) { console.log('colliders.json 없음: 장애물 없이 실행'); }
const GRID = new Map(), CELL = 8;
for (const c of COLS) {
  const [x, z, r] = c;
  for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++)
    for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
      const k = gx + ',' + gz; if (!GRID.has(k)) GRID.set(k, []); GRID.get(k).push(c);
    }
}
function pushOut(p, rad) {
  const list = GRID.get(Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL));
  if (!list) return;
  for (const [x, z, r] of list) {
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz), mn = r + rad;
    if (d < mn && d > 1e-4) { p.x = x + (dx / d) * mn; p.z = z + (dz / d) * mn; }
  }
}
function roomClamp(p, rad) {
  const R = DUN.R - rad, d = Math.hypot(p.x - DUN.x, p.z - DUN.z);
  const x0 = DUN.x - DUN.corW + rad, x1 = DUN.x + DUN.corW - rad, z0 = DUN.corZ0 + 0.6 + rad, z1 = DUN.corZ1 + 2;
  if (d <= R || (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1)) return;
  const k = R / Math.max(d, 1e-4), ax = DUN.x + (p.x - DUN.x) * k, az = DUN.z + (p.z - DUN.z) * k;
  const bx = clamp(p.x, x0, x1), bz = clamp(p.z, z0, z1);
  if (Math.hypot(p.x - ax, p.z - az) <= Math.hypot(p.x - bx, p.z - bz)) { p.x = ax; p.z = az; } else { p.x = bx; p.z = bz; }
}
const blocked = (x, z, rad) => { const p = { x, z }; pushOut(p, rad); return Math.hypot(p.x - x, p.z - z) > 0.01; };

const monsters = new Map();
let monSeq = 0;
function randPointIn(zone) {
  for (let i = 0; i < 300; i++) {
    const a = rnd(-Math.PI, Math.PI), d = rnd(34, 100), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (zoneAt(x, z) !== zone) continue;
    if (Math.min(Math.abs(x), Math.abs(z)) < 4) continue;
    if (Math.hypot(x + 64, z - 10) < 13) continue; // 석굴 입구 구덩이는 비워 둔다
    if (blocked(x, z, 1)) continue;
    let near = false;
    for (const c of clients.values()) if (c.pres.on && Math.hypot(c.pres.x - x, c.pres.z - z) < 18) near = true;
    if (!near) return { x, z };
  }
  return { x: 0, z: 60 };
}
function makeMon(ty, zone, p, extra = {}) {
  const D = MON[ty];
  const m = {
    i: ++monSeq, ty, zone, D, x: p.x, z: p.z, ry: rnd(0, 6.28), hp: D.hp,
    home: { ...p }, target: { ...p }, wait: rnd(0, 3), stun: 0, dot: null,
    atkCd: 1, windup: 0, aggroOn: null, hitBy: new Set(), lastHit: 0, r: 0.7 * (D.scale || 1), dirty: true,
    stuck: 0, detour: null, ...extra,
  };
  monsters.set(m.i, m);
  return m;
}
const spawn = (zone) => makeMon(pick(ZONE_MON[zone]), zone, randPointIn(zone));
function spawnBoss() { return makeMon('kingslime', 'dungeon', { ...BOSS_HOME }, { ry: Math.PI, slamCd: 3, sum: 0, slam: null, idleT: 0 }); }
const pub = (m) => ({ i: m.i, ty: m.ty, zone: m.zone, x: r2(m.x), z: r2(m.z), ry: r2(m.ry), hp: Math.max(0, Math.round(m.hp)) });
for (const z in ZONE_COUNT) for (let k = 0; k < ZONE_COUNT[z]; k++) spawn(z);
spawnBoss();

function killMon(m) {
  monsters.delete(m.i);
  broadcast({ t: 'mdie', i: m.i, by: [...m.hitBy].filter((id) => clients.has(id)) });
  if (m.D.boss) setTimeout(() => broadcast({ t: 'mspawn', m: pub(spawnBoss()) }), 90000);
  else if (!m.noRespawn) setTimeout(() => broadcast({ t: 'mspawn', m: pub(spawn(m.zone)) }), 20000);
}
function hurtMon(m, dmg, from) {
  m.hp -= dmg; m.dirty = true; m.lastHit = Date.now();
  if (from) { m.hitBy.add(from); m.aggroOn = from; }
  if (m.hp <= 0) killMon(m);
}
// 노릴 수 있는 접속자 (살아 있고, 마을 밖)
function targets() {
  const out = [];
  for (const c of clients.values()) {
    const p = c.pres;
    if (!p.on || !p.al) continue;
    if (Math.hypot(p.x, p.z) < 26) continue;
    out.push({ id: c.id, x: p.x, z: p.z });
  }
  return out;
}
const turn = (m, want, rate) => { let d = want - m.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); m.ry += d * Math.min(1, rate); };
function moveToward(m, gx, gz, spd) {
  const dx = gx - m.x, dz = gz - m.z, l = Math.hypot(dx, dz);
  if (l < 0.05) return 0;
  const s = Math.min(spd * TICK, l);
  m.x += (dx / l) * s; m.z += (dz / l) * s;
  turn(m, Math.atan2(dx, dz), 0.5);
  return s;
}

// 킹 슬라임: 뛰어올라 내려찍기(점프로 피할 수 있음), 몸통 박치기, 체력이 줄면 졸개 소환
function bossTick(m, ts) {
  const inRoom = ts.filter((t) => t.z > 300);
  if (!inRoom.length) {
    m.idleT += TICK; m.slam = null; m.aggroOn = null;
    if (m.idleT > 8 && m.hp < m.D.hp) { m.hp = Math.min(m.D.hp, m.hp + m.D.hp * 0.1 * TICK); m.dirty = true; if (m.hp >= m.D.hp) { m.sum = 0; m.hitBy.clear(); } }
    moveToward(m, BOSS_HOME.x, BOSS_HOME.z, 2);
    return;
  }
  m.idleT = 0;
  let tgt = inRoom.find((t) => t.id === m.aggroOn);
  if (!tgt) { tgt = inRoom.reduce((a, b) => (Math.hypot(a.x - m.x, a.z - m.z) < Math.hypot(b.x - m.x, b.z - m.z) ? a : b)); }
  const rage = m.hp < m.D.hp * 0.3;
  m.slamCd -= TICK; m.atkCd -= TICK; m.stun = Math.max(0, m.stun - TICK * 2);
  if (m.slam) {
    m.slam.t += TICK;
    const k = Math.min(1, m.slam.t / m.slam.dur);
    m.x = m.slam.fx + (m.slam.tx - m.slam.fx) * k; m.z = m.slam.fz + (m.slam.tz - m.slam.fz) * k;
    if (k >= 1) {
      const { tx, tz, r } = m.slam;
      broadcast({ t: 'bland', i: m.i, x: r2(tx), z: r2(tz), r });
      for (const t of inRoom) if (Math.hypot(t.x - tx, t.z - tz) < r + 1) { const c = clients.get(t.id); if (c) send(c, { t: 'bhit', to: t.id, x: r2(tx), z: r2(tz), r, dmg: Math.round(m.D.atk * 1.4) }); }
      m.slam = null;
    }
  } else if (m.stun <= 0) {
    const dx = tgt.x - m.x, dz = tgt.z - m.z, dist = Math.hypot(dx, dz), reach = 0.9 + m.r + 0.5;
    turn(m, Math.atan2(dx, dz), 0.35);
    if (m.slamCd <= 0 && dist > 2.5) {
      const p = { x: tgt.x, z: tgt.z }; roomClamp(p, m.r * 0.6);
      const dur = rage ? 0.95 : 1.3, r = rage ? 6.5 : 5.5;
      m.slam = { t: 0, dur, fx: m.x, fz: m.z, tx: p.x, tz: p.z, r };
      broadcast({ t: 'bslam', i: m.i, x: r2(p.x), z: r2(p.z), r, d: dur });
      m.slamCd = rnd(5, 7) * (rage ? 0.65 : 1); m.windup = 0;
    } else if (m.windup > 0) {
      m.windup -= TICK;
      if (m.windup <= 0) {
        m.atkCd = 1.7;
        const c = clients.get(tgt.id);
        if (c && dist < reach + 1.2) send(c, { t: 'matk', i: m.i, to: tgt.id });
        broadcast({ t: 'matk', i: m.i, to: null }, c);
      }
    } else if (dist > reach) moveToward(m, tgt.x, tgt.z, rage ? 3.4 : 2.4);
    else if (m.atkCd <= 0) m.windup = 0.55;
  }
  // 소환: 66%, 33%
  const ph = m.hp < m.D.hp * 0.33 ? 2 : m.hp < m.D.hp * 0.66 ? 1 : 0;
  if (ph > m.sum) {
    m.sum = ph;
    const n = 2 + ph;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, p = { x: m.x + Math.cos(a) * (m.r + 1.5), z: m.z + Math.sin(a) * (m.r + 1.5) };
      roomClamp(p, 0.8);
      const s = makeMon('slime', 'dungeon', p, { noRespawn: true, aggroOn: tgt.id });
      broadcast({ t: 'mspawn', m: pub(s) });
    }
  }
  roomClamp(m, m.r * 0.8);
}

const TICK = 0.1;
setInterval(() => {
  if (!clients.size) return;
  const ts = targets();
  const allPlayers = [...clients.values()].filter((c) => c.pres.on);
  const updates = [];
  const active = [];
  for (const m of [...monsters.values()]) {
    // 근처에 아무도 없으면 쉬게 해서 서버 부담과 전송량을 줄인다
    if (!allPlayers.some((c) => Math.hypot(c.pres.x - m.x, c.pres.z - m.z) < 70)) continue;
    active.push(m);
    m.before = [m.x, m.z, m.ry, Math.round(m.hp), m.windup > 0, m.stun > 0, !!m.dot];
    if (m.dot) {
      m.dot.acc += m.dot.dps * TICK; m.dot.t -= TICK;
      if (m.dot.acc >= 1) { const d = Math.floor(m.dot.acc); m.dot.acc -= d; hurtMon(m, d, null); if (!monsters.has(m.i)) continue; }
      if (m.dot.t <= 0) m.dot = null;
    }
    if (m.D.boss) { bossTick(m, ts); continue; }
    m.stun = Math.max(0, m.stun - TICK);
    const sx = m.x, sz = m.z; let want = 0;
    const homeD = Math.hypot(m.x - m.home.x, m.z - m.home.z);
    // 노릴 대상 고르기 (같은 공간에 있는 사람만)
    let tgt = null, best = 1e9;
    for (const t of ts) {
      if ((t.z > 300) !== (m.zone === 'dungeon')) continue;
      const d = Math.hypot(t.x - m.x, t.z - m.z);
      if (homeD > 45 || d > 30) continue;
      const pri = t.id === m.aggroOn ? d - 6 : d;
      if ((d < 9 || t.id === m.aggroOn) && pri < best) { best = pri; tgt = t; }
    }
    if (!tgt) m.aggroOn = null;
    if (m.stun > 0) m.windup = 0;
    else if (tgt) {
      const dx = tgt.x - m.x, dz = tgt.z - m.z, dist = Math.hypot(dx, dz);
      const reach = 0.9 + m.r + 0.5;
      m.atkCd -= TICK;
      if (m.windup > 0) {
        turn(m, Math.atan2(dx, dz), 0.6);
        m.windup -= TICK;
        if (m.windup <= 0) {
          m.atkCd = 1.6;
          const c = clients.get(tgt.id);
          if (c && dist < reach + 0.9) send(c, { t: 'matk', i: m.i, to: tgt.id });
          broadcast({ t: 'matk', i: m.i, to: null }, c);
        }
      } else if (dist > reach) {
        const spd = m.D.build === 'slime' ? 2.8 : 3.6;
        if (m.detour && m.detour.t > 0) { m.detour.t -= TICK; moveToward(m, m.detour.x, m.detour.z, spd); }
        else moveToward(m, tgt.x, tgt.z, spd);
        want = spd;
      } else { turn(m, Math.atan2(dx, dz), 0.6); if (m.atkCd <= 0) m.windup = 0.45; }
    } else {
      m.windup = 0;
      m.wait -= TICK;
      if (homeD > 12) m.target = { ...m.home };
      if (m.wait <= 0 && Math.hypot(m.target.x - m.x, m.target.z - m.z) < 0.6) {
        m.wait = rnd(1.5, 4); const a = rnd(0, 6.28), rr = rnd(2, 9);
        m.target = { x: m.home.x + Math.cos(a) * rr, z: m.home.z + Math.sin(a) * rr };
      }
      if (m.wait <= 0) { const spd = homeD > 20 ? 3 : 1.3; if (moveToward(m, m.target.x, m.target.z, spd) > 0) want = spd; }
      if (m.hp < m.D.hp && Date.now() - m.lastHit > 5000) { m.hp = Math.min(m.D.hp, m.hp + m.D.hp * 0.05 * TICK); if (m.hp >= m.D.hp) m.hitBy.clear(); }
    }
    if (m.zone === 'dungeon') roomClamp(m, m.r);
    else { const md = Math.hypot(m.x, m.z); if (md < 28) { m.x *= 28 / md; m.z *= 28 / md; } }
    pushOut(m, m.r * 0.8);
    // 막혔으면 옆으로 돌아가거나 다른 곳으로 간다
    if (want > 0) {
      const moved = Math.hypot(m.x - sx, m.z - sz);
      if (moved < want * TICK * 0.35) m.stuck += TICK; else m.stuck = Math.max(0, m.stuck - TICK * 2);
      if (m.stuck > 0.6) {
        m.stuck = 0;
        if (tgt) {
          const side = Math.random() < 0.5 ? 1 : -1, dx = tgt.x - m.x, dz = tgt.z - m.z, l = Math.hypot(dx, dz) || 1;
          m.detour = { x: m.x + (-dz / l) * side * 3.5 + (dx / l) * 1.5, z: m.z + (dx / l) * side * 3.5 + (dz / l) * 1.5, t: 0.9 };
        } else { m.wait = rnd(0.5, 1.5); const a = rnd(0, 6.28), rr = rnd(2, 7); m.target = { x: m.home.x + Math.cos(a) * rr, z: m.home.z + Math.sin(a) * rr }; }
      }
    }
  }
  // 몬스터끼리 겹치지 않게 밀어낸다
  for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
    const A = active[a], B = active[b];
    if (!monsters.has(A.i) || !monsters.has(B.i)) continue;
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), mn = (A.r + B.r) * 0.9;
    if (d < mn && d > 1e-4) {
      const push = mn - d, ux = dx / d, uz = dz / d, wa = A.D.boss ? 0 : B.D.boss ? 1 : 0.5, wb = 1 - wa;
      A.x -= ux * push * wa; A.z -= uz * push * wa; B.x += ux * push * wb; B.z += uz * push * wb;
    }
  }
  for (const m of active) {
    if (!monsters.has(m.i)) continue;
    const after = [m.x, m.z, m.ry, Math.round(m.hp), m.windup > 0, m.stun > 0, !!m.dot];
    if (m.dirty || after.some((v, k) => v !== m.before[k])) {
      m.dirty = false;
      updates.push([m.i, r2(m.x), r2(m.z), r2(m.ry), Math.max(0, Math.round(m.hp)), (m.windup > 0 ? 1 : 0) | (m.stun > 0 ? 2 : 0) | (m.dot ? 4 : 0)]);
    }
  }
  if (updates.length) broadcast({ t: 'mu', u: updates });
}, TICK * 1000);
setInterval(() => {
  for (const ws of clients.values()) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`오를란도 서버 실행 중: http://localhost:${PORT}`));
