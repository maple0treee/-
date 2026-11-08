// 오를란도 안내 페이지 만들기: node site-src/build.js
// pages.js 의 글을 같은 틀에 넣어 public/site/*.html 로 굽는다 (서버는 /about 같은 주소로 보여 준다)
const fs = require('fs');
const path = require('path');
const PAGES = require('./pages.js');

const OUT = path.join(__dirname, '..', 'public', 'site');
const SITE = 'https://orlando.io.kr';
const PUB = 'ca-pub-5615317040670557';
const NAV = [['/', '게임 하기'], ['/about', '게임 소개'], ['/guide', '시작 안내'], ['/jobs', '직업과 전직'], ['/world', '세계와 지역'], ['/news', '업데이트 소식'], ['/faq', '자주 묻는 질문']];
const FOOT = [['/about', '게임 소개'], ['/privacy', '개인정보처리방침'], ['/terms', '이용약관'], ['/contact', '문의하기']];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(p) {
  const url = SITE + p.path;
  const nav = NAV.map(([h, t]) => `<a href="${h}"${h === p.path ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const foot = FOOT.map(([h, t]) => `<a href="${h}">${t}</a>`).join('<span aria-hidden="true">·</span>');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)} - 오를란도</title>
<meta name="description" content="${esc(p.desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/icon/favicon-32.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap">
<meta property="og:type" content="article"><meta property="og:site_name" content="Orlando"><meta property="og:locale" content="ko_KR">
<meta property="og:url" content="${url}"><meta property="og:title" content="${esc(p.title)} - 오를란도"><meta property="og:description" content="${esc(p.desc)}"><meta property="og:image" content="${SITE}/og.jpg?v=2">
<meta name="google-adsense-account" content="${PUB}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUB}" crossorigin="anonymous"></script>
<style>
:root{--ink:#1b1712;--paper:#241e17;--line:#5c4b33;--parch:#efe4cc;--dim:#b8aa8c;--brass:#d4ae63;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--parch);font-family:'Gowun Batang','Nanum Myeongjo','Noto Serif KR',serif;font-size:17px;line-height:1.85;word-break:keep-all;overflow-wrap:break-word}
a{color:var(--brass)}
header{border-bottom:1px solid var(--line);background:var(--paper)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}
.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 18px;padding:14px 16px 10px}
.logo{font-size:26px;letter-spacing:.08em;text-decoration:none;color:var(--parch)}
nav{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:14.5px}
nav a{text-decoration:none;color:var(--dim)}nav a:hover,nav a[aria-current]{color:var(--brass)}
main{padding:28px 0 40px}
h1{font-size:30px;line-height:1.35;margin:0 0 6px;font-weight:700}
.lead{color:var(--dim);margin:0 0 26px}
h2{font-size:21px;margin:38px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--line)}
h3{font-size:18px;margin:24px 0 4px;color:var(--brass)}
p,ul,ol,dl,table{margin:0 0 14px}
li{margin:2px 0}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
th{background:var(--paper);font-weight:700}
.tbl{overflow-x:auto}
kbd{font-family:inherit;border:1px solid var(--line);border-bottom-width:2px;border-radius:3px;padding:0 5px;font-size:14px}
.play{display:inline-block;margin:10px 0 4px;padding:10px 22px;border:1px solid var(--brass);border-radius:6px;text-decoration:none;font-size:17px}
.play:hover{background:#3d3122}
.date{color:var(--dim);font-size:14px}
footer{border-top:1px solid var(--line);padding:18px 0 28px;color:var(--dim);font-size:14px}
footer .links{display:flex;flex-wrap:wrap;gap:6px}
footer a{color:var(--dim)}
</style>
</head><body>
<header><div class="wrap top"><a class="logo" href="/">오를란도</a><nav aria-label="안내">${nav}</nav></div></header>
<main class="wrap">
<h1>${esc(p.title)}</h1>
${p.lead ? `<p class="lead">${p.lead}</p>` : ''}
${p.body.trim()}
<p><a class="play" href="/">지금 오를란도 하러 가기</a></p>
</main>
<footer><div class="wrap"><div class="links">${foot}</div><p>© 2026 오를란도. 브라우저에서 바로 즐기는 3D 판타지 RPG.</p></div></footer>
</body></html>
`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const p of PAGES) {
  const name = p.path.slice(1) + '.html';
  fs.writeFileSync(path.join(OUT, name), page(p));
  console.log('만듦', name);
}
