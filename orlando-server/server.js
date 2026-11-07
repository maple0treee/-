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
const VERSION = 36; // 게임 페이지(index.html)와 맞아야 하는 서버 버전
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
// 안내 페이지 (public/site/*.html, site-src/build.js 로 굽는다): 게임 소개·시작 안내·개인정보처리방침 등
try { for (const fn of fs.readdirSync(path.join(PUBLIC, 'site'))) if (/^[a-z]+\.html$/.test(fn)) files['/' + fn.slice(0, -5)] = { file: 'site/' + fn, type: 'text/html; charset=utf-8', cache: 'public, max-age=3600' }; } catch (e) {}
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
// 게임 코드(index.html 안의 큰 <script> 세 개, 약 1.8MB)는 jsDelivr(무료 CDN)의 같은 커밋 index.html에서 받게 한다
// 서버는 화면 틀(약 25KB 압축)만 보내서 서버 데이터 사용량이 크게 준다. CDN이 안 되면 이 서버의 /game-src.html 에서 받는다
const GAME_SRC = '/game-src.html';
const SHELL = /^[0-9a-f]{7,40}$/.test(GIT_SHA) && process.env.ORLANDO_SHELL !== '0';
if (SHELL) files[GAME_SRC] = { file: 'index.html', type: 'text/plain; charset=utf-8', cache: 'no-cache', src: true };
const BIG_SCRIPT = /<script>([\s\S]*?)<\/script>/g;
function makeShell(html, raw) {
  const parts = [];
  for (const m of raw.matchAll(BIG_SCRIPT)) if (m[1].length > 5000) {
    const start = m.index + '<script>'.length;
    parts.push([start, m[1].length, require('crypto').createHash('sha256').update(m[1], 'utf8').digest('base64')]);
  }
  if (!parts.length) return html;
  let k = 0;
  html = html.replace(BIG_SCRIPT, (all, code) => (code.length > 5000 ? `<script type="text/x-orlando-game" data-g="${k++}"></script>` : all));
  const cdn = /window\.ORLANDO_CDN="(https:\/\/cdn\.jsdelivr\.net\/gh\/[^@"]+@)[0-9a-f]+(\/[^"]*)"/.exec(raw);
  const src = cdn ? cdn[1] + GIT_SHA + cdn[2] + 'index.html' : null;
  const loader = `<script>(function(){var G=${JSON.stringify({ src, alt: GAME_SRC + '?v=' + GIT_SHA.slice(0, 12), parts })};
function get(u,ms){return new Promise(function(ok,no){var t=setTimeout(function(){no('시간 초과')},ms);fetch(u,{cache:'force-cache'}).then(function(r){if(!r.ok)throw r.status;return r.text()}).then(function(x){clearTimeout(t);ok(x)},function(e){clearTimeout(t);no(e)})})}
function b64(buf){var s='',a=new Uint8Array(buf);for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)}
function check(t){if(!t)return Promise.resolve(false);var c=window.crypto&&crypto.subtle;if(!c)return Promise.resolve(true);
  return Promise.all(G.parts.map(function(p){return c.digest('SHA-256',new TextEncoder().encode(t.substr(p[0],p[1]))).then(function(h){return b64(h)===p[2]})})).then(function(r){return r.every(Boolean)})}
function run(t){G.parts.forEach(function(p,i){var o=document.querySelector('script[data-g="'+i+'"]'),s=document.createElement('script');s.textContent=t.substr(p[0],p[1]);o.parentNode.replaceChild(s,o)})}
function fail(){var d=document.createElement('div');d.style.cssText='position:fixed;inset:auto 0 40% 0;text-align:center;color:#ffd9a0;font:16px sans-serif;z-index:99999';d.textContent='게임을 불러오지 못했어요. 새로고침해 주세요.';document.body.appendChild(d)}
(G.src?get(G.src,12000):Promise.reject()).then(function(t){return check(t).then(function(ok){if(!ok)throw 0;return t})})
  .catch(function(){return get(G.alt,60000).then(function(t){return check(t).then(function(ok){if(!ok)throw 0;return t})})})
  .then(run,fail);})();</script>`;
  const end = html.lastIndexOf('</body>');
  return end < 0 ? html + loader : html.slice(0, end) + loader + html.slice(end);
}
for (const f of Object.values(files)) {
  f.body = fs.readFileSync(path.join(PUBLIC, f.file));
  if (f.file === 'index.html' && !f.src && /^[0-9a-f]{7,40}$/.test(GIT_SHA)) {
    const html = f.body.toString('utf8'), m = /window\.ORLANDO_CDN="(https:\/\/cdn\.jsdelivr\.net\/gh\/[^@"]+@)[0-9a-f]+(\/[^"]*)"/.exec(html);
    if (m) f.body = Buffer.from(html.replace('<script>window.ORLANDO_WS=', `<script>window.ORLANDO_CDN_HEAD="${m[1]}${GIT_SHA}${m[2]}";</script><script>window.ORLANDO_WS=`), 'utf8');
    if (SHELL) f.body = Buffer.from(makeShell(f.body.toString('utf8'), html), 'utf8');
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
    xl: d.xl === 0 || d.xl === 1 || d.xl === 2 || d.xl === 3 ? d.xl : -1,
    mt: typeof d.mt === 'string' && /^[a-z]{0,8}$/.test(d.mt) ? d.mt : '',
    cr: typeof d.cr === 'string' && /^k\d{1,2}s\d$/.test(d.cr) ? d.cr : '',
    gd: typeof d.gd === 'string' && /^[a-z0-9]{8}\|[\uac00-\ud7a3A-Za-z0-9 ]{2,12}\|[mn]\|\d{1,7}\|[0-9a-f]{6}$/.test(d.gd) ? d.gd : null,
    pd: Array.isArray(d.pd) && d.pd.length === 3 && d.pd.every((v) => typeof v === 'number' && isFinite(v)) && d.pd[0] >= 0 && d.pd[0] < 100 ? [Math.floor(d.pd[0]), n(d.pd[1]), n(d.pd[2])] : 0,   // 쓰다듬는 개: [번호, 길 위 자리, 옆 자리]
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

// 길드 목록: 서버가 모든 길드의 이름·색·인원·길드장을 기억해서, 길드원이 아무도 접속하지 않은 길드도 보이게 한다.
// 명단 자체는 여전히 길드원 각자의 저장에 있다. 서버가 다시 켜지면(새 버전 배포 등) 접속한 사람들이 기억해 둔 목록을 보내 다시 채운다.
// 가입 신청도 길드장이 없을 때 받아 두었다가, 길드장이 접속하면 전해 준다.
const GUILD_FILE = path.join(__dirname, '.data', 'guilds.json');
const GUILD_KEEP = 60 * 24 * 3600 * 1000;   // 60일 동안 길드원이 아무도 오지 않으면 목록에서 뺀다
const GAPP_KEEP = 14 * 24 * 3600 * 1000;    // 가입 신청은 2주까지 맡아 둔다
const guilds = new Map();   // id -> {id, name, c, n(인원), m(길드장 이름), rv(명단 판수), at(마지막으로 길드원이 온 때), dis(해산)}
const gapps = new Map();    // 길드 id -> [{n, mk, t}]
const G_ID = /^[a-z0-9]{1,10}$/, G_NAME = /^[가-힣A-Za-z0-9 ]{2,12}$/, G_COL = /^[0-9a-f]{6}$/, G_KEY = /^[a-z0-9]{6,16}$/;
const gInt = (v, a, b) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, Math.floor(v))) : a);
function cleanGuild(d) {
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !G_ID.test(d.id)) return null;
  if (typeof d.name !== 'string' || !G_NAME.test(d.name) || d.name.trim() !== d.name) return null;
  return { id: d.id, name: d.name, c: typeof d.c === 'string' && G_COL.test(d.c) ? d.c : 'b8342a', n: gInt(d.n, 0, 30), m: cleanText(d.m, 12), rv: gInt(d.rv, 0, 9999999), at: Math.min(Date.now(), gInt(d.at, 0, 9e15)), dis: d.dis ? 1 : 0 };
}
try {
  const j = JSON.parse(fs.readFileSync(GUILD_FILE, 'utf8'));
  for (const q of j.guilds || []) { const g = cleanGuild(q); if (g) guilds.set(g.id, g); }
  for (const gid in j.apps || {}) if (G_ID.test(gid) && Array.isArray(j.apps[gid])) gapps.set(gid, j.apps[gid].filter((a) => a && G_KEY.test(a.mk)).slice(0, 40));
} catch (e) {}
let gSaveT = null, gSendT = null;
function guildSaveSoon() {
  if (gSaveT) return;
  gSaveT = setTimeout(() => {
    gSaveT = null;
    try { fs.mkdirSync(path.dirname(GUILD_FILE), { recursive: true }); fs.writeFileSync(GUILD_FILE, JSON.stringify({ guilds: [...guilds.values()], apps: Object.fromEntries(gapps) })); } catch (e) {}
  }, 5000);
}
const guildList = () => [...guilds.values()];
function guildsChanged() {
  guildSaveSoon();
  if (gSendT) return;
  gSendT = setTimeout(() => { gSendT = null; broadcast({ t: 'gdir', d: guildList() }); }, 1000);
}
// 길드원이 알려 준 자기 길드 (명단 판수가 같거나 새것일 때만)
function guildReport(d) {
  const g = cleanGuild(d); if (!g) return;
  const cur = guilds.get(g.id);
  if (cur && g.rv < cur.rv) return;
  g.at = Date.now(); if (g.dis) g.n = 0;
  if (cur && cur.name === g.name && cur.c === g.c && cur.n === g.n && cur.m === g.m && cur.rv === g.rv && cur.dis === g.dis) { cur.at = g.at; guildSaveSoon(); return; }
  guilds.set(g.id, g); if (g.dis) gapps.delete(g.id);
  guildsChanged();
}
// 서버가 다시 켜진 뒤: 접속한 사람이 기억해 둔 목록에서 서버가 모르는 길드만 채운다
function guildKnow(list) {
  if (!Array.isArray(list)) return;
  let ch = false;
  for (const q of list.slice(0, 200)) {
    const g = cleanGuild(q); if (!g || guilds.has(g.id) || Date.now() - g.at > GUILD_KEEP) continue;
    guilds.set(g.id, g); ch = true;
  }
  if (ch) guildsChanged();
}
// 이름표의 길드(gd)로도 길드가 살아 있음을 안다. 옛 게임 화면을 쓰는 사람의 길드도 목록에 들어온다
function guildSeen(ws) {
  const s = ws.pres.gd; if (!s) return;
  const [id, name, r, rv, c] = s.split('|'), v = parseInt(rv, 10) || 0;
  const cur = guilds.get(id);
  if (!cur || (cur.dis && v > cur.rv)) { guilds.set(id, { id, name, c, n: 0, m: r === 'm' ? ws.pres.n : '', rv: v, at: Date.now(), dis: 0 }); guildsChanged(); }
  else if (!cur.dis && Date.now() - cur.at > 60 * 1000) { cur.at = Date.now(); guildSaveSoon(); }
  if (r === 'm') guildDeliver(ws, id);
}
// 길드장에게 맡아 둔 가입 신청 전하기 (접속할 때마다 한 번씩)
function guildDeliver(ws, gid) {
  const L = gapps.get(gid); if (!L) return;
  ws.gSent = ws.gSent || new Set();
  for (const a of L) {
    const key = gid + ':' + a.mk; if (ws.gSent.has(key)) continue;
    ws.gSent.add(key);
    send(ws, { t: 'dm', from: 'srv', d: { k: 'greq', gid, n: a.n, mk: a.mk } });
  }
}
function guildApp(d) {
  if (!d || typeof d !== 'object' || typeof d.gid !== 'string' || !G_KEY.test(d.mk || '')) return;
  const g = guilds.get(d.gid); if (!g || g.dis) return;
  const L = (gapps.get(d.gid) || []).filter((a) => a.mk !== d.mk && Date.now() - a.t < GAPP_KEEP);
  L.push({ n: cleanText(d.n, 12) || '모험가', mk: d.mk, t: Date.now() });
  gapps.set(d.gid, L.slice(-40)); guildSaveSoon();
  for (const ws of clients.values()) { const p = ws.pres.gd; if (p && p.startsWith(d.gid + '|') && p.split('|')[2] === 'm') guildDeliver(ws, d.gid); }
}
function guildAppCancel(d) {
  if (!d || typeof d !== 'object' || typeof d.gid !== 'string') return;
  const L = gapps.get(d.gid); if (!L) return;
  const K = L.filter((a) => a.mk !== d.mk); if (K.length === L.length) return;
  if (K.length) gapps.set(d.gid, K); else gapps.delete(d.gid);
  guildSaveSoon();
}
setInterval(() => {
  const now = Date.now(); let ch = false;
  for (const [id, g] of guilds) if (now - g.at > GUILD_KEEP) { guilds.delete(id); gapps.delete(id); ch = true; }
  for (const [id, L] of gapps) { const K = L.filter((a) => now - a.t < GAPP_KEEP); if (!K.length) gapps.delete(id); else if (K.length !== L.length) gapps.set(id, K); }
  if (ch) guildsChanged();
}, 3600 * 1000);

// 엑시즈 왕립 도서관: 모험가가 집 책상에서 쓴 책을 사서에게 맡기면(등재) 서버가 간직하고, 누구나 읽고 베껴 갈(사 갈) 수 있다.
// 한 권을 여러 사람이 살 수 있다 (사는 것은 베낀 한 권을 받는 것). 서버가 다시 켜져 파일이 사라지면 작가가 접속할 때 자기 책을 다시 보내 채운다.
// 책을 올릴 때는 한 메시지 크기(8KB)를 넘지 않게 한 쪽씩 나눠 보낸다: lpub(머리) → lpg(쪽) … → 다 오면 lpubok
const LIB_FILE = path.join(__dirname, '.data', 'library.json');
const LIB_MAXP = 30, LIB_TX = 300, LIB_DR = 5000, LIB_MAXB = 3000;
const LIB_ID = /^b[a-z0-9]{6,14}$/, LIB_DRAW = /^[0-9A-Za-z+/|]*$/;
const crypto = require('crypto');
const akHash = (ak) => crypto.createHash('sha256').update('orlando-lib:' + ak).digest('hex').slice(0, 24);
// 기둥 책장 자리 번호 sp = 줄(아래부터 0~35)*288 + 칸(0~23, 남쪽 입구가 6)*12 + 칸 안 자리(0~11). 77은 '도움을 준 사람들' 자리
const LIB_ROWS = 36, LIB_NB = 24, LIB_SPN = LIB_ROWS * LIB_NB * 12, LIB_RESV = 77;
const libBooks = new Map();   // id -> {id, ti, au, ah(작가 열쇠 지문), pages:[{x,d}], at, up, sold}
try { const j = JSON.parse(fs.readFileSync(LIB_FILE, 'utf8')); for (const b of j.books || []) if (b && LIB_ID.test(b.id) && Array.isArray(b.pages)) libBooks.set(b.id, b); } catch (e) {}
function libUsed(skip) { const u = new Set([LIB_RESV]); for (const b of libBooks.values()) if (b.id !== skip && Number.isInteger(b.sp)) u.add(b.sp); return u; }
// 자리를 고르지 않은 책: 아래 줄부터, 입구 칸에서 양옆으로 번갈아 빈자리
function libAutoSp(u) {
  for (let j = 0; j < LIB_ROWS; j++) for (let b0 = 0; b0 < LIB_NB; b0++) { const b = (LIB_NB / 4 + (b0 % 2 ? -(b0 + 1) / 2 : b0 / 2) + LIB_NB) % LIB_NB; for (let t = 0; t < 12; t++) { const sp = j * LIB_NB * 12 + b * 12 + t; if (!u.has(sp)) return sp; } }
  return -1;
}
for (const b of libBooks.values()) if (!Number.isInteger(b.sp) || b.sp < 0 || b.sp >= LIB_SPN) b.sp = undefined;
{ const seen = new Set([LIB_RESV]); for (const b of libBooks.values()) { if (b.sp !== undefined && seen.has(b.sp)) b.sp = undefined; if (b.sp !== undefined) seen.add(b.sp); } for (const b of libBooks.values()) if (b.sp === undefined) { const sp = libAutoSp(seen); if (sp >= 0) { b.sp = sp; seen.add(sp); } } }
let libSaveT = null;
function libSaveSoon() {
  if (libSaveT) return;
  libSaveT = setTimeout(() => { libSaveT = null; try { fs.mkdirSync(path.dirname(LIB_FILE), { recursive: true }); fs.writeFileSync(LIB_FILE, JSON.stringify({ books: [...libBooks.values()] })); } catch (e) {} }, 4000);
}
const libMeta = (b) => ({ id: b.id, sp: b.sp, ti: b.ti, au: b.au, n: b.pages.length, at: b.at, up: b.up || b.at, sold: b.sold || 0, pic: b.pages.some((p) => p.d) ? 1 : 0 });
// cleanText는 줄바꿈도 지우므로 쪽 글은 따로 다듬는다
function libText(s) { if (typeof s !== 'string') return ''; return s.replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/\n{3,}/g, '\n\n').slice(0, LIB_TX); }
function libStart(ws, d) {
  if (!d || typeof d !== 'object') return;
  const ti = cleanText(d.ti, 24), au = cleanText(d.au, 12), ak = typeof d.ak === 'string' && /^[a-z0-9]{12,24}$/.test(d.ak) ? d.ak : null, n = gInt(d.n, 0, LIB_MAXP);
  if (!ti || !au || !ak || n < 1) { send(ws, { t: 'lpubok', d: { ok: 0, q: d.q } }); return; }
  let id = typeof d.id === 'string' && LIB_ID.test(d.id) ? d.id : null;
  const cur = id && libBooks.get(id);
  if (cur && cur.ah !== akHash(ak)) { send(ws, { t: 'lpubok', d: { ok: 0, q: d.q } }); return; }   // 남의 책은 고칠 수 없다
  if (!cur && !d.re) id = null;                     // 새 책은 서버가 번호를 준다 (다시 채우기 re만 옛 번호를 쓴다)
  if (!cur && libBooks.size >= LIB_MAXB) { send(ws, { t: 'lpubok', d: { ok: 0, q: d.q, full: 1 } }); return; }
  // 자리: 고른 자리가 비었으면 그 자리, 고르지 않았으면 지금 자리(고쳐 쓰기)나 빈자리
  const want = Number.isInteger(d.sp) && d.sp >= 0 && d.sp < LIB_SPN ? d.sp : null, u = libUsed(cur ? cur.id : id);
  let sp;
  if (want !== null && !u.has(want)) sp = want;
  else if (want !== null && !d.re) { send(ws, { t: 'lpubok', d: { ok: 0, q: d.q, taken: 1 } }); return; }
  else if (cur && Number.isInteger(cur.sp)) sp = cur.sp;
  else { sp = libAutoSp(u); if (sp < 0) { send(ws, { t: 'lpubok', d: { ok: 0, q: d.q, full: 1 } }); return; } }
  ws.lup = { sp, id: id || 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ti, au, ah: akHash(ak), n, pages: new Array(n).fill(null), got: 0, re: !!d.re && !cur, at: d.re ? Math.min(Date.now(), gInt(d.at, 0, 9e15)) || Date.now() : Date.now(), sold: d.re ? gInt(d.sold, 0, 1e7) : 0, q: d.q };
}
function libPageIn(ws, d) {
  const U = ws.lup; if (!U || !d || typeof d !== 'object') return;
  const i = gInt(d.i, -1, U.n - 1); if (i < 0 || U.pages[i]) return;
  U.pages[i] = { x: libText(d.x), d: typeof d.d === 'string' && d.d.length <= LIB_DR && LIB_DRAW.test(d.d) ? d.d : '' }; U.got++;
  if (U.got < U.n) return;
  ws.lup = null;
  const cur = libBooks.get(U.id);
  { const u = libUsed(U.id); if (u.has(U.sp)) { if (!U.re) { send(ws, { t: 'lpubok', d: { ok: 0, q: U.q, taken: 1 } }); return; } U.sp = libAutoSp(u); } }   // 올리는 사이 누가 먼저 차지했다
  const b = cur ? Object.assign(cur, { ti: U.ti, au: U.au, pages: U.pages, up: Date.now(), sp: U.sp }) : { id: U.id, sp: U.sp, ti: U.ti, au: U.au, ah: U.ah, pages: U.pages, at: U.at, up: U.re ? U.at : Date.now(), sold: U.sold };
  if (!cur) libBooks.set(b.id, b);
  libSaveSoon();
  send(ws, { t: 'lpubok', d: { ok: 1, id: b.id, q: U.q, at: b.at, sp: b.sp } });
  broadcast({ t: 'lnew', d: libMeta(b) });
}

wss.on('connection', (ws) => {
  const id = 'p' + (++counter).toString(36) + Math.random().toString(36).slice(2, 6);
  ws.id = id; ws.pres = {}; ws.alive = true; ws.budget = 60; ws.chatAt = 0;
  clients.set(id, ws);

  const peers = {};
  for (const [k, c] of clients) if (k !== id) peers[k] = c.pres;
  send(ws, { t: 'hello', id, peers, v: VERSION, b: files['/'] && files['/'].etag });   // b: 지금 게임 페이지의 지문 (바뀌면 접속한 사람들이 알아서 새 버전으로 바꾼다)
  send(ws, { t: 'gdir', d: guildList() });
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
      guildSeen(ws);
    } else if (m.t === 'gdir') {
      guildReport(m.d);
    } else if (m.t === 'gknow') {
      guildKnow(m.d);
    } else if (m.t === 'gapp') {
      guildApp(m.d);
    } else if (m.t === 'gcan') {
      guildAppCancel(m.d);
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
    } else if (m.t === 'lcat') {
      send(ws, { t: 'lcat', d: [...libBooks.values()].map(libMeta) });
    } else if (m.t === 'lget' && m.d && typeof m.d.id === 'string') {
      const b = libBooks.get(m.d.id);
      send(ws, { t: 'lbook', d: b ? { id: b.id, ti: b.ti, au: b.au, at: b.at, up: b.up || b.at, pages: b.pages } : { id: m.d.id, gone: 1 } });
    } else if (m.t === 'lbuy' && m.d && typeof m.d.id === 'string') {
      const b = libBooks.get(m.d.id);
      if (b) { b.sold = (b.sold || 0) + 1; libSaveSoon(); }
    } else if (m.t === 'lhas' && Array.isArray(m.d)) {
      // 작가가 자기 책 번호를 알려 주면, 서버가 모르는 번호만 다시 보내 달라고 한다 (서버가 다시 켜져 파일이 사라졌을 때)
      send(ws, { t: 'lneed', d: m.d.slice(0, 200).filter((id) => typeof id === 'string' && LIB_ID.test(id) && !libBooks.has(id)) });
    } else if (m.t === 'lpub') {
      libStart(ws, m.d);
    } else if (m.t === 'lpg') {
      libPageIn(ws, m.d);
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
