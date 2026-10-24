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
const OR = require('./shared.js');

const PORT = process.env.PORT || 3000;
const VERSION = 10; // 게임 페이지(index.html)와 맞아야 하는 서버 버전
const PUBLIC = path.join(__dirname, 'public');

// 파일을 미리 읽어 두고(압축본 포함) 바로 보내 준다
const files = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-cache' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-cache' },
  '/player.glb': { file: 'player.glb', type: 'model/gltf-binary', cache: 'public, max-age=604800' },
  '/three.min.js': { file: 'three.min.js', type: 'application/javascript; charset=utf-8', cache: 'public, max-age=604800' },
  '/GLTFLoader.js': { file: 'GLTFLoader.js', type: 'application/javascript; charset=utf-8', cache: 'public, max-age=604800' },
  '/ads.txt': { file: 'ads.txt', type: 'text/plain; charset=utf-8', cache: 'public, max-age=86400' },
  '/robots.txt': { file: 'robots.txt', type: 'text/plain; charset=utf-8', cache: 'public, max-age=86400' },
  '/sitemap.xml': { file: 'sitemap.xml', type: 'application/xml; charset=utf-8', cache: 'public, max-age=86400' },
  '/manifest.webmanifest': { file: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8', cache: 'public, max-age=86400' },
  '/og.jpg': { file: 'og.jpg', type: 'image/jpeg', cache: 'public, max-age=604800' },
  '/sfx.json': { file: 'sfx.json', type: 'application/json; charset=utf-8', cache: 'public, max-age=604800' },
  '/SkeletonUtils.js': { file: 'SkeletonUtils.js', type: 'application/javascript; charset=utf-8', cache: 'public, max-age=604800' },
};
// 미리 구운 NPC 모델 (public/npcbake/*.json)
// 플레이어 애니 모델 (public/pmodel/*.json)
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'icon'))) if (/^[a-z0-9_-]+\.png$/.test(fn)) files['/icon/' + fn] = { file: 'icon/' + fn, type: 'image/png', cache: 'public, max-age=604800' }; } catch (e) {}
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'pmodel'))) if (/^[a-z0-9_]+\.json$/.test(fn)) files['/pmodel/' + fn] = { file: 'pmodel/' + fn, type: 'application/json; charset=utf-8', cache: 'public, max-age=86400' }; } catch (e) {}
// 하레나 풍경 모델 (public/models/*.glb, Quaternius CC0)
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'models'))) { if (/^[a-z0-9_]+\.glb\.wasm$/.test(fn)) files['/models/' + fn] = { file: 'models/' + fn, type: 'application/octet-stream', cache: 'public, max-age=86400' };   /* 이름 끝 .wasm: 아티팩트가 .glb 를 올려 주지 않아서 (내용은 glb) */ } } catch (e) {}
// 마르쿠스 주민 모델 (public/citbake/*.json)
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'citbake'))) { if (/^[a-z0-9_]+\.json$/.test(fn)) files['/citbake/' + fn] = { file: 'citbake/' + fn, type: 'application/json; charset=utf-8', cache: 'public, max-age=86400' }; else if (/^[a-z0-9_]+\.webp$/.test(fn)) files['/citbake/' + fn] = { file: 'citbake/' + fn, type: 'image/webp', cache: 'public, max-age=86400' }; } } catch (e) {}
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'npcbake'))) if (/^[a-z0-9_]+\.json$/.test(fn)) files['/npcbake/' + fn] = { file: 'npcbake/' + fn, type: 'application/json; charset=utf-8', cache: 'public, max-age=86400' }; } catch (e) {}
// 배경 음악 (public/music/*.mp3): 압축하지 않고, 부분 요청(Range)을 받아 준다 (휴대폰 브라우저가 음악을 나눠 받는다)
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'fonts'))) if (/^[A-Za-z0-9_-]+\.woff2$/.test(fn)) files['/fonts/' + fn] = { file: 'fonts/' + fn, type: 'font/woff2', cache: 'public, max-age=2592000' }; } catch (e) {}
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'music'))) if (/^[a-z0-9_]+\.mp3$/.test(fn)) files['/music/' + fn] = { file: 'music/' + fn, type: 'audio/mpeg', cache: 'public, max-age=86400', raw: true }; } catch (e) {}
// 지금 배포된 커밋: 효과음(sfx.json)처럼 자주 바뀌지 않는 작은 파일을 CDN의 이 커밋에서 받게 한다
const GIT_SHA = process.env.RENDER_GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || '';
for (const f of Object.values(files)) {
  f.body = fs.readFileSync(path.join(PUBLIC, f.file));
  if (f.file === 'index.html' && /^[0-9a-f]{7,40}$/.test(GIT_SHA)) {
    const html = f.body.toString('utf8'), m = /window\.ORLANDO_CDN="(https:\/\/cdn\.jsdelivr\.net\/gh\/[^@"]+@)[0-9a-f]+(\/[^"]*)"/.exec(html);
    if (m) f.body = Buffer.from(html.replace('<script>window.ORLANDO_WS=', `<script>window.ORLANDO_CDN_HEAD="${m[1]}${GIT_SHA}${m[2]}";</script><script>window.ORLANDO_WS=`), 'utf8');
  }
  if (!f.raw) f.gz = zlib.gzipSync(f.body, { level: 9 });
  if (f.file === 'index.html') f.br = zlib.brotliCompressSync(f.body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: f.body.length } });   // 브라우저가 받으면 gzip보다 더 작게
  f.etag = '"' + require('crypto').createHash('sha1').update(f.body).digest('base64').slice(0, 20) + '"';   // 바뀌지 않았으면 304로 끝낸다
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok v' + VERSION + ' monsters ' + sim.count()); }
  if (url === '/index.html') { res.writeHead(301, { Location: '/' }); return res.end(); }   // 같은 페이지는 주소 하나로 (검색 노출)
  const f = files[url];
  if (f && req.headers['if-none-match'] === f.etag) { res.writeHead(304, { ETag: f.etag, 'Cache-Control': f.cache }); return res.end(); }
  if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('없는 페이지'); }
  if (f.raw) {
    const L = f.body.length, m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let a = m[1] ? +m[1] : L - +m[2], b = m[1] && m[2] ? Math.min(+m[2], L - 1) : L - 1;
      if (!m[1]) { a = Math.max(0, a); }
      if (a >= L || a > b) { res.writeHead(416, { 'Content-Range': 'bytes */' + L }); return res.end(); }
      res.writeHead(206, { 'Content-Type': f.type, 'Cache-Control': f.cache, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${b}/${L}`, 'Content-Length': b - a + 1 });
      return res.end(f.body.subarray(a, b + 1));
    }
    res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': f.cache, ETag: f.etag, 'Accept-Ranges': 'bytes', 'Content-Length': L });
    return res.end(f.body);
  }
  const ae = req.headers['accept-encoding'] || '', br = f.br && /\bbr\b/.test(ae), gzip = !br && /\bgzip\b/.test(ae);
  res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': f.cache, ETag: f.etag, Vary: 'Accept-Encoding', ...(br ? { 'Content-Encoding': 'br' } : gzip ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(br ? f.br : gzip ? f.gz : f.body);
});

// ---------- 동시접속 ----------
// 메시지를 압축해서 보낸다 (몬스터 위치 같은 JSON은 1/4~1/5로 줄어 서버 대역폭이 크게 준다)
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024,
  perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 6 }, serverNoContextTakeover: false, clientNoContextTakeover: true, concurrencyLimit: 4 } });
const clients = new Map(); // id -> ws
let counter = 0;

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(obj, except) {
  const msg = JSON.stringify(obj);
  for (const ws of clients.values()) if (ws !== except && ws.readyState === 1) ws.send(msg);
}
// 가까운 사람에게만 (멀리 있는 사람은 볼 수 없는 스킬 효과 등)
const NEAR = 125;
const isNear = (ws, x, z) => { const p = ws.pres; return typeof p.x !== 'number' || typeof x !== 'number' || Math.hypot(p.x - x, p.z - z) < NEAR; };
function broadcastNear(obj, x, z, except) {
  let msg = null;
  for (const ws of clients.values()) if (ws !== except && ws.readyState === 1 && isNear(ws, x, z)) ws.send(msg || (msg = JSON.stringify(obj)));
}
// 위치 소식: 가까운 사람에게는 바로, 먼 사람에게는 3초에 한 번 마지막 것만 (접속자 목록·지도용)
function broadcastPres(id, from) {
  const d = from.pres;
  let msg = null;
  for (const ws of clients.values()) {
    if (ws === from || ws.readyState !== 1) continue;
    if (isNear(ws, d.x, d.z)) { if (ws.farPend) ws.farPend.delete(id); ws.send(msg || (msg = JSON.stringify({ t: 'p', id, d }))); }
    else (ws.farPend || (ws.farPend = new Map())).set(id, from);
  }
}
setInterval(() => {
  for (const ws of clients.values()) {
    if (!ws.farPend || !ws.farPend.size || ws.readyState !== 1) continue;
    for (const [id, from] of ws.farPend) if (clients.get(id) === from) ws.send(JSON.stringify({ t: 'p', id, d: from.pres }));
    ws.farPend.clear();
  }
}, 3000);
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
    sd: d.sd ? 1 : 0,
    ss: Math.max(0, Math.min(7, Math.floor(n(d.ss)))),
    dc: Array.isArray(d.dc) && d.dc.length >= 2 && d.dc.slice(0, 3).every((v) => typeof v === 'number' && isFinite(v)) ? d.dc.slice(0, 3).map(n) : null,
    pp: Array.isArray(d.pp) && d.pp.length === 3 && d.pp.every((v) => typeof v === 'number' && isFinite(v)) ? d.pp.map(n) : null,
    hd: d.hd ? 1 : 0,
    mo: typeof d.mo === 'string' && /^[a-z0-9]{0,16}$/.test(d.mo) ? d.mo : '',
    xl: d.xl === 0 || d.xl === 1 || d.xl === 2 ? d.xl : -1,
    cr: typeof d.cr === 'string' && /^k\d{1,2}s\d$/.test(d.cr) ? d.cr : '',
    gd: typeof d.gd === 'string' && /^[a-z0-9]{8}\|[\uac00-\ud7a3A-Za-z0-9 ]{2,12}\|[mn]\|\d{1,7}\|[0-9a-f]{6}$/.test(d.gd) ? d.gd : null,
    ap: typeof d.ap === 'string' && /^[mf],[0-9a-f]{6},[0-9a-f]{6}(,\d(,\d,\d,[0-9a-f]{6},[0-9a-f]{6}(,\d)?)?)?$/.test(d.ap) ? d.ap : '',
  };
}

// 몬스터 시뮬레이션 (나무·바위 위치는 colliders.json)
let cols = [];
try { cols = JSON.parse(fs.readFileSync(path.join(__dirname, 'colliders.json'), 'utf8')); } catch (e) { console.log('colliders.json 없음: 장애물 없이 실행'); }
const sim = createSim({ cols });
setInterval(() => sim.tick(), sim.TICK * 1000);

// 의뢰 게시판: 모든 사람이 같은 게시판을 본다. 누가 포스터를 떼어 가면 다른 사람 게시판에서도 사라진다
const boards = {}; for (const k in OR.BOARDS) boards[k] = [];
let bseq = 0;
const newPoster = (b) => OR.makePoster(b, Math.random, 'q' + (++bseq).toString(36) + Math.random().toString(36).slice(2, 5));
for (const b in boards) while (boards[b].length < OR.BOARD_CAP[b]) boards[b].push(newPoster(b));
setInterval(() => {
  const now = Date.now();
  for (const b in boards) {
    let changed = false;
    const keep = boards[b].filter((p) => now - p.at < 45 * 60 * 1000);   // 오래된 포스터는 바람에 날아간다
    if (keep.length !== boards[b].length) { boards[b] = keep; changed = true; }
    for (let k = 0; k < 2 && boards[b].length < OR.BOARD_CAP[b]; k++) { boards[b].push(newPoster(b)); changed = true; }
    if (changed) broadcast({ t: 'board', d: { b, list: boards[b] } });
  }
}, 60 * 1000);

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
      broadcastPres(id, ws);
    } else if (m.t === 'hit') {
      sim.hit(id, m.d);
    } else if (m.t === 'fx' && m.d && typeof m.d === 'object') {
      // 스킬 효과: 정해진 종류와 숫자만 골라서 다른 사람에게 전달
      const d = m.d, n = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0);
      const out = { k: ['p', 'r', 'b', 'l'].includes(d.k) ? d.k : 'b' };
      for (const key of ['x', 'y', 'z', 'dx', 'dy', 'dz', 'sp', 's', 'c', 'g', 'd', 'r', 'a']) if (key in d) out[key] = n(d[key]);
      broadcastNear({ t: 'fx', id, d: out }, out.x, out.z, ws);
    } else if (m.t === 'dm' && m.d && typeof m.d === 'object' && typeof m.d.to === 'string') {
      // 파티·거래: 한 사람에게만 전달
      const to = clients.get(m.d.to);
      if (!to || to === ws) return;
      let body;
      try { body = JSON.stringify(m.d); } catch { return; }
      if (body.length > 4000) return;
      send(to, { t: 'dm', from: id, d: m.d });
    } else if (m.t === 'board' && m.d && boards[m.d.b]) {
      send(ws, { t: 'board', d: { b: m.d.b, list: boards[m.d.b] } });
    } else if (m.t === 'btake' && m.d && boards[m.d.b]) {
      const L = boards[m.d.b], i = L.findIndex((p) => p.id === m.d.id);
      if (i < 0) { send(ws, { t: 'btook', d: { ok: 0, id: m.d.id } }); return; }
      const [p] = L.splice(i, 1);
      send(ws, { t: 'btook', d: { ok: 1, id: p.id, p } });
      broadcast({ t: 'board', d: { b: m.d.b, list: L } });
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

// 무료 서버가 15분 동안 아무도 안 오면 잠드는 걸 막는다: 10분마다 자기 자신의 /health를 부른다 (응답이 한 줄이라 대역폭은 거의 안 씀)
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) setInterval(() => {
  require('https').get(SELF_URL + '/health', r => r.resume()).on('error', () => {});
}, 10 * 60 * 1000);
