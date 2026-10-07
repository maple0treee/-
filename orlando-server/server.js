// 오를란도 3D 동시접속 서버
// - 게임 페이지와 3D 파일을 보여 준다
// - /ws 로 들어온 접속자끼리 위치·스킬 효과·채팅을 주고받게 해 준다
// - 몬스터와 보스는 sim.js(게임과 같은 코드)가 서버에서 움직인다
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const createSim = require('./sim.js');

const PORT = process.env.PORT || 3000;
const VERSION = 8; // 게임 페이지(index.html)와 맞아야 하는 서버 버전
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
// 미리 구운 NPC 모델 (public/npcbake/*.json)
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'npcbake'))) if (/^[a-z0-9_]+\.json$/.test(fn)) files['/npcbake/' + fn] = { file: 'npcbake/' + fn, type: 'application/json; charset=utf-8', cache: 'public, max-age=86400' }; } catch (e) {}
for (const f of Object.values(files)) {
  f.body = fs.readFileSync(path.join(PUBLIC, f.file));
  f.gz = zlib.gzipSync(f.body);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok v' + VERSION + ' monsters ' + sim.count()); }
  const f = files[url];
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('없는 페이지'); }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': f.cache, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(gzip ? f.gz : f.body);
});

// ---------- 동시접속 ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
const clients = new Map(); // id -> ws
let counter = 0;

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(obj, except) {
  const msg = JSON.stringify(obj);
  for (const ws of clients.values()) if (ws !== except && ws.readyState === 1) ws.send(msg);
}
const cleanText = (s, n) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, n) : '');
// 다른 사람에게 그대로 전달하기 전에, 정해진 모양만 남긴다
function cleanPresence(d) {
  if (!d || typeof d !== 'object') return {};
  const n = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
  return {
    n: cleanText(d.n, 12) || '모험가',
    j: cleanText(d.j, 16) || 'warrior',
    lv: Math.max(1, Math.min(9999, Math.floor(n(d.lv)) || 1)),
    x: n(d.x), y: n(d.y), z: n(d.z), r: n(d.r),
    sw: Math.floor(n(d.sw)) % 1e6,
    on: d.on ? 1 : 0,
    al: d.al ? 1 : 0,
    pt: typeof d.pt === 'string' ? cleanText(d.pt, 24) : null,
    h: Math.max(0, Math.min(1, typeof d.h === 'number' && isFinite(d.h) ? Math.round(d.h * 100) / 100 : 1)),
    g: typeof d.g === 'string' && /^[-0-9,]{0,24}$/.test(d.g) ? d.g : '',
    st: d.st ? 1 : 0,
    mo: typeof d.mo === 'string' && /^[a-z0-9]{0,16}$/.test(d.mo) ? d.mo : '',
  };
}

// 몬스터 시뮬레이션 (나무·바위 위치는 colliders.json)
let cols = [];
try { cols = JSON.parse(fs.readFileSync(path.join(__dirname, 'colliders.json'), 'utf8')); } catch (e) { console.log('colliders.json 없음: 장애물 없이 실행'); }
const sim = createSim({ cols });
setInterval(() => sim.tick(), sim.TICK * 1000);

wss.on('connection', (ws) => {
  const id = 'p' + (++counter).toString(36) + Math.random().toString(36).slice(2, 6);
  ws.id = id; ws.pres = {}; ws.alive = true; ws.budget = 60; ws.chatAt = 0;
  clients.set(id, ws);

  const peers = {};
  for (const [k, c] of clients) if (k !== id) peers[k] = c.pres;
  send(ws, { t: 'hello', id, peers, v: VERSION });
  sim.join(id, (msg) => send(ws, msg));
  broadcast({ t: 'join', id }, ws);

  ws.on('message', (raw) => {
    if (ws.budget-- <= 0) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'p') {
      ws.pres = cleanPresence(m.d);
      sim.presence(id, ws.pres);
      broadcast({ t: 'p', id, d: ws.pres }, ws);
    } else if (m.t === 'hit') {
      sim.hit(id, m.d);
    } else if (m.t === 'fx' && m.d && typeof m.d === 'object') {
      // 스킬 효과: 정해진 종류와 숫자만 골라서 다른 사람에게 전달
      const d = m.d, n = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
      const out = { k: ['p', 'r', 'b'].includes(d.k) ? d.k : 'b' };
      for (const key of ['x', 'y', 'z', 'dx', 'dy', 'dz', 'sp', 's', 'c', 'g', 'd', 'r']) if (key in d) out[key] = n(d[key]);
      broadcast({ t: 'fx', id, d: out }, ws);
    } else if (m.t === 'dm' && m.d && typeof m.d === 'object' && typeof m.d.to === 'string') {
      // 파티·거래: 한 사람에게만 전달
      const to = clients.get(m.d.to);
      if (!to || to === ws) return;
      let body;
      try { body = JSON.stringify(m.d); } catch { return; }
      if (body.length > 4000) return;
      send(to, { t: 'dm', from: id, d: m.d });
    } else if (m.t === 'chat' && m.d && typeof m.d === 'object') {
      const now = Date.now();
      if (now - ws.chatAt < 700) return; // 도배 방지
      ws.chatAt = now;
      const text = cleanText(m.d.m, 80);
      if (!text) return;
      broadcast({ t: 'chat', id, d: { n: ws.pres.n || '모험가', m: text } }, ws);
    }
  });
  ws.on('pong', () => { ws.alive = true; });
  ws.on('close', () => {
    clients.delete(id);
    sim.leave(id);
    broadcast({ t: 'leave', id });
  });
});

setInterval(() => { for (const ws of clients.values()) ws.budget = 60; }, 1000);
setInterval(() => {
  for (const ws of clients.values()) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => console.log(`오를란도 서버 실행 중: http://localhost:${PORT}`));
