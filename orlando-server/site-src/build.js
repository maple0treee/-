// 오를란도 안내 페이지 만들기: node site-src/build.js
// pages.js 의 글을 같은 틀에 넣어 public/site/*.html 로 굽는다 (서버는 /about 같은 주소로 보여 준다)
const fs = require('fs');
const path = require('path');
const GROUPS = [
  ['처음 시작하기', ['/about', '/guide', '/leveling', '/faq']],
  ['직업', ['/jobs', '/warrior', '/mage', '/rogue', '/archer']],
  ['세계와 지역', ['/world', '/harena', '/exiz', '/westwoods', '/hechil', '/bosses']],
  ['모험과 생활', ['/quests', '/citylife', '/news']],
  ['운영 정보', ['/privacy', '/terms', '/contact']],
];
const PAGES = [...require('./pages.js'), ...require('./pages-jobs.js'), ...require('./pages2.js')];
const BY = Object.fromEntries(PAGES.map((p) => [p.path, p]));
for (const [, L] of GROUPS) for (const h of L) if (!BY[h]) throw new Error('목록에 있는데 글이 없음: ' + h);
for (const p of PAGES) if (!GROUPS.some(([, L]) => L.includes(p.path))) throw new Error('목록에 없는 글: ' + p.path);
// 모든 글 목록 (/articles)
PAGES.push({ path: '/articles', title: '오를란도 읽을거리', desc: '오를란도의 게임 소개, 시작 안내, 직업과 스킬, 지역과 사냥터, 보스, 퀘스트, 도시 생활에 대한 글을 한곳에 모았습니다.',
  lead: '오를란도에 대한 모든 글을 주제별로 모았습니다.',
  body: GROUPS.map(([g, L]) => `<h2>${g}</h2>\n<ul>\n` + L.map((h) => `<li><a href="${h}"><b>${BY[h].title}</b></a><br>${BY[h].desc}</li>`).join('\n') + '\n</ul>').join('\n\n') });
BY['/articles'] = PAGES[PAGES.length - 1];
const TODAY = new Date().toISOString().slice(0, 10);

const OUT = path.join(__dirname, '..', 'public', 'site');
const SITE = 'https://orlando.io.kr';
const PUB = 'ca-pub-5615317040670557';
const NAV = [['/', '게임 하기'], ['/about', '게임 소개'], ['/guide', '시작 안내'], ['/jobs', '직업'], ['/world', '세계'], ['/articles', '읽을거리'], ['/news', '업데이트 소식'], ['/faq', '자주 묻는 질문']];
const FOOT = [['/about', '게임 소개'], ['/articles', '모든 글'], ['/privacy', '개인정보처리방침'], ['/terms', '이용약관'], ['/contact', '문의하기']];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(p) {
  const url = SITE + p.path;
  const nav = NAV.map(([h, t]) => `<a href="${h}"${h === p.path ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const grp = GROUPS.find(([, L]) => L.includes(p.path));
  const more = grp ? grp[1].filter((h) => h !== p.path) : [];
  const related = more.length ? `<h2>함께 읽기</h2>\n<ul>${more.map((h) => `<li><a href="${h}">${esc(BY[h].title)}</a></li>`).join('')}</ul>\n` : '';
  const foot = FOOT.map(([h, t]) => `<a href="${h}">${t}</a>`).join('<span aria-hidden="true">·</span>');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)} - 오를란도</title>
<meta name="description" content="${esc(p.desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/icon/favicon-32.png?v=2">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap">
<meta property="og:type" content="${p.path === '/articles' ? 'website' : 'article'}"><meta property="og:site_name" content="Orlando"><meta property="og:locale" content="ko_KR">
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
${related}<p><a class="play" href="/">지금 오를란도 하러 가기</a></p>
</main>
<footer><div class="wrap"><div class="links">${foot}</div><p>© 2026 오를란도. 브라우저에서 바로 즐기는 3D 판타지 RPG.</p></div></footer>
</body></html>
`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const fn of fs.readdirSync(OUT)) if (/\.html$/.test(fn)) fs.unlinkSync(path.join(OUT, fn));   // 없어진 글이 남지 않게
for (const p of PAGES) {
  const name = p.path.slice(1) + '.html';
  fs.writeFileSync(path.join(OUT, name), page(p));
  console.log('만듦', name);
}
// 없는 주소 (server.js가 404로 보여 준다). 이름에 숫자가 있어 /이름 주소로는 등록되지 않는다
fs.writeFileSync(path.join(OUT, '404.html'), page({ path: '/404', title: '찾는 페이지가 없습니다', desc: '주소가 바뀌었거나 없는 페이지입니다.',
  lead: '주소가 바뀌었거나 없는 페이지입니다.', body: '<p>아래의 글 목록에서 찾아보거나, 위의 메뉴에서 다른 페이지로 가 보세요.</p>\n' + BY['/articles'].body }).replace('content="index,follow"', 'content="noindex,follow"').replace(/<link rel="canonical"[^>]*>\n/, ''));
// sitemap.xml: 첫 화면 + 모든 글
const PRI = { '/about': '0.8', '/guide': '0.8', '/jobs': '0.8', '/world': '0.8', '/articles': '0.8', '/news': '0.7', '/privacy': '0.3', '/terms': '0.3', '/contact': '0.4' };
const urls = [`  <url>\n    <loc>${SITE}/</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n    <image:image><image:loc>${SITE}/og.jpg</image:loc></image:image>\n  </url>`,
  ...PAGES.map((p) => `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>${p.path === '/news' ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${PRI[p.path] || '0.6'}</priority>\n  </url>`)];
fs.writeFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`);
console.log('만듦 404.html, sitemap.xml (' + (PAGES.length + 1) + '개 주소)');
