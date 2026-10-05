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
  broadcast({ t: 'join', id }, ws);

  ws.on('message', (raw) => {
    if (ws.budget-- <= 0) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'p') {
      ws.pres = cleanPresence(m.d);
      broadcast({ t: 'p', id, d: ws.pres }, ws);
    } else if (m.t === 'fx' && m.d && typeof m.d === 'object') {
      const d = m.d, n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
      broadcast({ t: 'fx', id, d: { c: n(d.c), x: n(d.x), y: n(d.y), z: n(d.z), s: n(d.s) } }, ws);
    }
  });
  ws.on('pong', () => { ws.alive = true; });
  ws.on('close', () => {
    clients.delete(id);
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
