// 계정(회원가입·로그인): 아이디·비밀번호로 가입하고, 캐릭터 목록과 재무청 금고를 계정에 저장한다
// - 비밀번호는 그대로 두지 않고 scrypt(소금 섞은 느린 해시)로만 저장한다
// - 로그인하면 무작위 표(토큰)를 주고, 서버에는 표의 sha256만 남긴다
// - 저장소: DATABASE_URL(Postgres, 예: Neon 무료)이 있으면 거기에, ACCOUNT_DIR이 있으면 그 폴더(Render 저장 디스크 등)에,
//   둘 다 없으면 Render가 아닐 때(내 컴퓨터에서 시험할 때)만 .data/accounts 폴더에 둔다.
//   Render의 기본 디스크는 새로 배포할 때마다 지워지므로, 거기서는 보관할 곳이 정해지기 전까지 계정 기능을 끈다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_URL = process.env.DATABASE_URL || '';
const DIR = process.env.ACCOUNT_DIR || path.join(__dirname, '.data', 'accounts');
const ON = process.env.ORLANDO_ACCOUNTS !== '0' && !!(DB_URL || process.env.ACCOUNT_DIR || !process.env.RENDER);

const ID_RE = /^[a-z0-9]{4,16}$/;
const CHAR_ID = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_BODY = 4 * 1024 * 1024;      // 한 번에 받는 저장 크기
const MAX_DOC = 8 * 1024 * 1024;       // 계정 하나에 담을 수 있는 크기
const MAX_CHARS = 30;
const TOK_KEEP = 90 * 24 * 3600 * 1000; // 90일 동안 안 쓴 로그인 표는 버린다
const GONE_KEEP = 180 * 24 * 3600 * 1000;
const TRASH_KEEP = 90 * 24 * 3600 * 1000; // 지운 캐릭터를 되살릴 수 있게 남겨 두는 기간
const MAX_DEL = 3;                         // 한 번 저장에 지울 수 있는 캐릭터 수
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// ---------- 저장소 ----------
let pool = null;
async function pg() {
  if (pool) return pool;
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: DB_URL, max: 4 });   // Neon 주소에는 ?sslmode=require 가 붙어 있어 암호화해서 잇는다
  p.on('error', (e) => console.error('데이터베이스 연결 끊김 (다시 이음)', e && e.message));   // Neon이 쉬는 연결을 끊어도 서버가 죽지 않게
  await p.query('CREATE TABLE IF NOT EXISTS orlando_accounts (id text PRIMARY KEY, doc jsonb NOT NULL, updated timestamptz NOT NULL DEFAULT now())');
  pool = p;
  return p;
}
const fileOf = (id) => path.join(DIR, id + '.json');
async function rawGet(id) {
  if (DB_URL) { const r = await (await pg()).query('SELECT doc FROM orlando_accounts WHERE id=$1', [id]); return r.rows[0] ? r.rows[0].doc : null; }
  try { return JSON.parse(await fs.promises.readFile(fileOf(id), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function rawPut(id, doc, isNew) {
  if (DB_URL) {
    const db = await pg();
    if (isNew) { const r = await db.query('INSERT INTO orlando_accounts (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [id, doc]); return r.rowCount === 1; }
    await db.query('UPDATE orlando_accounts SET doc=$2, updated=now() WHERE id=$1', [id, doc]); return true;
  }
  await fs.promises.mkdir(DIR, { recursive: true });
  if (isNew) { try { await fs.promises.writeFile(fileOf(id), JSON.stringify(doc), { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; } }
  const tmp = fileOf(id) + '.' + process.pid + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(doc));
  await fs.promises.rename(tmp, fileOf(id));
  return true;
}
// 같은 계정의 읽고-고치고-쓰기는 한 줄로 세워 차례로 한다 (두 기기가 동시에 저장해도 서로 덮지 않게)
const locks = new Map();
function withLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(id, tail);
  tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
  return run;
}

// ---------- 비밀번호·표 ----------
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 64, SCRYPT, (e, k) => (e ? no(e) : ok(k))));
async function hashPw(pw) { const salt = crypto.randomBytes(16); const k = await scrypt(pw, salt); return { salt: salt.toString('base64'), hash: k.toString('base64'), ...SCRYPT_INFO }; }
const SCRYPT_INFO = { alg: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p };
async function checkPw(pw, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const k = await scrypt(pw, Buffer.from(rec.salt, 'base64')), h = Buffer.from(rec.hash, 'base64');
  return k.length === h.length && crypto.timingSafeEqual(k, h);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
let DUMMY = null;   // 없는 아이디도 같은 시간이 걸리게 (아이디가 있는지 알아내기 어렵게)
function newToken(doc) {
  const tok = crypto.randomBytes(32).toString('base64url'), now = Date.now();
  doc.tok = (doc.tok || []).filter((t) => now - t.t < TOK_KEEP).slice(-7);
  doc.tok.push({ h: sha(tok), t: now });
  return doc.id + '.' + tok;
}

// ---------- 너무 많이 시도하는 것 막기 ----------
const tries = new Map();   // key -> {n, t}
// over: 이미 max번을 넘겼는가 (세지는 않음), bump: 한 번 센다. 로그인은 틀린 것만 센다 (PC방처럼 IP 하나를 여럿이 써도 막히지 않게)
function over(key, max, ms) { const e = tries.get(key); return !!e && Date.now() - e.t <= ms && e.n >= max; }
function bump(key, ms) {
  const now = Date.now(), e = tries.get(key);
  if (!e || now - e.t > ms) tries.set(key, { n: 1, t: now }); else e.n++;
}
setInterval(() => { const now = Date.now(); for (const [k, e] of tries) if (now - e.t > 3600 * 1000) tries.delete(k); }, 10 * 60 * 1000).unref();

// ---------- 저장 내용 다듬기 ----------
function cleanChar(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c) || typeof c.id !== 'string' || !CHAR_ID.test(c.id)) return null;
  if (typeof c.name !== 'string' || typeof c.job !== 'string') return null;
  const o = { ...c }; delete o.tab;
  return o;
}
function cleanBank(b) {
  if (!b || typeof b !== 'object') return null;
  const gold = Number(b.gold), t = Number(b.t);
  if (!isFinite(gold) || gold < 0) return null;
  return { gold: Math.min(Number.MAX_SAFE_INTEGER, gold), t: isFinite(t) && t > 0 ? t : 0 };
}
const publicDoc = (d) => ({ name: d.id, chars: d.chars || [], gone: d.gone || {}, bank: d.bank || { gold: 0, t: 0 } });

// ---------- HTTP ----------
function reply(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((ok, no) => {
    let n = 0; const parts = [];
    req.on('data', (b) => { n += b.length; if (n > MAX_BODY) { no(Object.assign(new Error('too big'), { code: 413 })); req.destroy(); return; } parts.push(b); });
    req.on('end', () => { try { ok(n ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { no(Object.assign(e, { code: 400 })); } });
    req.on('error', no);
  });
}
const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
async function authed(req) {
  const m = /^Bearer ([a-z0-9]{4,16})\.([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const doc = await rawGet(m[1]);
  if (!doc || !doc.tok) return null;
  const h = sha(m[2]), now = Date.now(), t = doc.tok.find((x) => x.h === h && now - x.t < TOK_KEEP);
  return t ? { id: m[1], h, t } : null;
}

async function handle(req, res, url) {
  if (url === '/api/acct') return reply(res, 200, { on: ON });
  if (!ON) return reply(res, 404, { err: 'off' });
  const ip = ipOf(req);
  try {
    if (url === '/api/me' && req.method === 'GET') {
      const a = await authed(req); if (!a) return reply(res, 401, { err: 'auth' });
      return withLock(a.id, async () => {
        const doc = await rawGet(a.id);
        const t = doc.tok.find((x) => x.h === a.h);
        if (t && Date.now() - t.t > 3600 * 1000) { t.t = Date.now(); await rawPut(a.id, doc); }   // 쓰는 표는 오래 남긴다
        reply(res, 200, publicDoc(doc));
      });
    }
    if (req.method !== 'POST') return reply(res, 405, { err: 'method' });
    const body = await readBody(req);
    if (url === '/api/signup' || url === '/api/login') {
      const id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '', pw = typeof body.pw === 'string' ? body.pw : '';
      if (!ID_RE.test(id)) return reply(res, 400, { err: 'id' });
      if (pw.length < 6 || pw.length > 64) return reply(res, 400, { err: 'pw' });
      if (url === '/api/signup') {
        if (over('s:' + ip, 30, 3600 * 1000)) return reply(res, 429, { err: 'many' });
        bump('s:' + ip, 3600 * 1000);
        const doc = { id, pw: await hashPw(pw), created: Date.now(), chars: [], gone: {}, bank: { gold: 0, t: 0 }, tok: [] };
        const tok = newToken(doc);
        if (!(await rawPut(id, doc, true))) return reply(res, 409, { err: 'taken' });
        return reply(res, 200, { tok, name: id });
      }
      const FAIL_MS = 15 * 60 * 1000, failed = () => { bump('l:' + ip, FAIL_MS); bump('u:' + id, FAIL_MS); return reply(res, 401, { err: 'wrong' }); };
      if (over('l:' + ip, 30, FAIL_MS) || over('u:' + id, 10, FAIL_MS)) return reply(res, 429, { err: 'many' });
      return withLock(id, async () => {
        const doc = await rawGet(id);
        if (!doc) { if (!DUMMY) DUMMY = await hashPw('x'.repeat(12)); await checkPw(pw, DUMMY); return failed(); }
        if (!(await checkPw(pw, doc.pw))) return failed();
        tries.delete('u:' + id);
        const tok = newToken(doc); await rawPut(id, doc);
        reply(res, 200, { tok, name: id });
      });
    }
    const a = await authed(req); if (!a) return reply(res, 401, { err: 'auth' });
    if (url === '/api/logout') {
      return withLock(a.id, async () => { const doc = await rawGet(a.id); doc.tok = (doc.tok || []).filter((x) => x.h !== a.h); await rawPut(a.id, doc); reply(res, 200, { ok: true }); });
    }
    if (url === '/api/save') {
      return withLock(a.id, async () => {
        const doc = await rawGet(a.id), now = Date.now();
        const gone = doc.gone || {}, map = new Map((doc.chars || []).map((c) => [c.id, c]));
        // 지운 캐릭터는 바로 없애지 않고 휴지통(trash)에 90일 둔다. 한 번에 지울 수 있는 건 몇 개뿐 (잘못된 창이 '다 지워졌다'고 보내도 다 사라지지 않게)
        const trash = doc.trash || {};
        let del = 0;
        for (const id of Array.isArray(body.gone) ? body.gone : []) {
          if (typeof id !== 'string' || !CHAR_ID.test(id) || !map.has(id)) continue;
          if (++del > MAX_DEL) break;
          trash[id] = { c: map.get(id), at: now }; map.delete(id); gone[id] = now;
        }
        for (const id in trash) if (now - trash[id].at > TRASH_KEEP) delete trash[id];
        doc.trash = trash;
        for (const q of Array.isArray(body.chars) ? body.chars : []) {
          const c = cleanChar(q); if (!c) continue;
          if (gone[c.id] && gone[c.id] >= (c.t || 0)) continue;   // 다른 기기에서 지운 캐릭터를 옛 기록이 되살리지 않게
          const old = map.get(c.id);
          if (!old || (c.t || 0) >= (old.t || 0)) map.set(c.id, c);
        }
        for (const id in gone) if (now - gone[id] > GONE_KEEP) delete gone[id];
        if (map.size > MAX_CHARS) return reply(res, 400, { err: 'chars' });
        const b = cleanBank(body.bank), add = cleanBank(body.bankAdd), cur = cleanBank(doc.bank) || { gold: 0, t: 0 };
        if (b) doc.bank = b;
        else if (add && add.gold > 0) doc.bank = { gold: Math.min(Number.MAX_SAFE_INTEGER, cur.gold + add.gold), t: cur.t || add.t || now };   // 이 기기에 있던 금고를 계정 금고에 더한다
        doc.chars = [...map.values()]; doc.gone = gone;
        if (Buffer.byteLength(JSON.stringify(doc)) > MAX_DOC) return reply(res, 413, { err: 'big' });
        await rawPut(a.id, doc);
        reply(res, 200, { ok: true, bank: doc.bank });
      });
    }
    return reply(res, 404, { err: 'none' });
  } catch (e) {
    if (e && (e.code === 413 || e.code === 400)) return reply(res, e.code, { err: 'body' });
    console.error('계정 처리 실패', url, e && e.message);
    return reply(res, 500, { err: 'server' });
  }
}

if (ON) console.log('계정 저장소:', DB_URL ? 'Postgres' : DIR);
else console.log('계정 기능 꺼짐 (DATABASE_URL 또는 ACCOUNT_DIR 이 없음)');
module.exports = { handle, ON };
