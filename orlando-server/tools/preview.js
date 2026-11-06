#!/usr/bin/env node
/*
 * 시험판(아티팩트) 만들기
 *
 * 시험용 브랜치 dev 의 게임을 claude.ai 아티팩트로 올릴 수 있게 준비한다.
 * - public/index.html 을 아티팩트용으로 고쳐 <출력 폴더>/index.html 에 쓴다
 *   (자체 서버 접속 대신 아티팩트의 room 으로 같이 하기, 큰 파일은 CDN 대신 같이 올린 파일에서 받기, 광고 빼기)
 * - 아티팩트 페이지는 늘 같은 작은 껍데기(<출력 폴더>/index.html)이고, 게임 본체는 game.html 로 같이 올린다
 * - 같이 올릴 파일 목록을 Artifact 도구의 files 모양({"올릴 경로": "원본 경로"})으로 나눠서 <출력 폴더>/files-N.json 에 쓴다
 *   (한 번에 64MB 까지만 올릴 수 있어서 60MB 씩 나눈다)
 *
 * 쓰는 법:
 *   node orlando-server/tools/preview.js <출력 폴더>              # 모든 파일 (처음 올릴 때)
 *   node orlando-server/tools/preview.js <출력 폴더> <커밋>       # 그 커밋 뒤로 바뀐 파일만 (다시 올릴 때)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const REPO = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || 'preview-out');
const since = process.argv[3] || null;
const CHUNK = 60 * 1024 * 1024;

// 아티팩트에서 쓰지 않는 파일 (검색·광고·글 페이지·서버 전용)
const SKIP = /^(site\/|index\.html$|ads\.txt$|robots\.txt$|sitemap\.xml$|og\.jpg$|manifest\.webmanifest$|icon\/)/;

function walk(dir, base = '') {
  const res = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) res.push(...walk(path.join(dir, e.name), rel));
    else res.push(rel);
  }
  return res;
}

const LOADER = `<title>오를란도 시험판</title>
<style>:root{--bg:#241e17;--fg:#e8dcc4}html,body{height:100%;background:var(--bg);color:var(--fg)}#ld{display:grid;place-items:center;height:100%;font:16px serif}</style>
<div id="ld">오를란도 시험판을 여는 중…</div>
<script>
fetch('game.html?t=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
  .then(t => { document.open(); document.write(t); document.close(); })
  .catch(e => { document.getElementById('ld').textContent = '시험판을 열지 못했어요 (' + e.message + ')'; });
</script>
`;

function transform(html) {
  const before = html.length;
  html = html.replace(/<title>[^<]*<\/title>/, '<title>오를란도 시험판</title>');
  // 자체 서버(WebSocket)·CDN 설정 줄을 지운다 → 아티팩트 room 으로 접속, 파일은 같이 올린 것에서 받음
  html = html.replace(/<script>window\.ORLANDO_WS=true;[^<]*<\/script>/, '<script>window.ORLANDO_PREVIEW=true;</script>');
  html = html.replace(/<script async src="https:\/\/pagead2\.googlesyndication\.com[^"]*"[^>]*><\/script>/, '');
  html = html.replace(/<link rel="(manifest|icon|apple-touch-icon|canonical)"[^>]*>\n?/g, '');
  if (/window\.ORLANDO_WS=true/.test(html)) throw new Error('ORLANDO_WS 줄을 못 지웠어요: index.html 모양이 바뀌었는지 보세요');
  if (html.length === before) throw new Error('index.html 이 하나도 안 바뀌었어요');
  return html;
}

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^files-\d+\.json$/.test(f)) fs.unlinkSync(path.join(out, f));
// 아티팩트 쪽 페이지(index.html)는 늘 같은 작은 껍데기이고, 게임 본체는 같이 올리는 game.html 이다
// (페이지가 안 바뀌니 여러 스레드가 번갈아 올려도 3MB 넘는 페이지를 서로 다시 읽을 필요가 없다)
fs.writeFileSync(path.join(out, 'game.html'), transform(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')));
fs.writeFileSync(path.join(out, 'index.html'), LOADER);

let list = walk(PUBLIC).filter(f => !SKIP.test(f));
const GAME = path.join(out, 'game.html');
const removed = [];
if (since) {
  const diff = execFileSync('git', ['-C', REPO, 'diff', '--name-status', '--no-renames', since, 'HEAD', '--', 'orlando-server/public'], { encoding: 'utf8' });
  const changed = new Set();
  for (const line of diff.split('\n').filter(Boolean)) {
    const [st, p] = line.split('\t');
    const rel = p.replace(/^orlando-server\/public\//, '');
    if (SKIP.test(rel)) continue;
    if (st === 'D') removed.push(rel); else changed.add(rel);
  }
  list = list.filter(f => changed.has(f));
}

const chunks = [];
let cur = { 'game.html': GAME }, size = fs.statSync(GAME).size;
for (const rel of list.sort()) {
  const abs = path.join(PUBLIC, rel);
  const s = fs.statSync(abs).size;
  if (size + s > CHUNK && Object.keys(cur).length) { chunks.push(cur); cur = {}; size = 0; }
  // 아티팩트는 .glb 를 올려 주지 않아서 종류를 .wasm 과 같게 적는다 (내용은 그대로 glb)
  cur[rel] = /\.glb$/.test(rel) ? { from: abs, contentType: 'application/wasm' } : abs;
  size += s;
}
for (const rel of removed) cur[rel] = null;   // 지운 파일은 아티팩트에서도 지움
if (Object.keys(cur).length) chunks.push(cur);
chunks.forEach((c, i) => fs.writeFileSync(path.join(out, `files-${i + 1}.json`), JSON.stringify(c, null, 1)));

const sha = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
console.log(JSON.stringify({ page: path.join(out, 'index.html'), sha, files: chunks.map((c, i) => ({ json: path.join(out, `files-${i + 1}.json`), count: Object.keys(c).length })), removed }, null, 1));
