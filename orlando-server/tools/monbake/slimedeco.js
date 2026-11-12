/*
 * 슬라임 꾸밈 (거리 함수로 빚는다) — 몸 겉에 붙는 것(가시·나무껍질·이끼·얼음·껍데기 …)과 몸 속에 떠 있는 삼킨 것(뼈·해골·동전 …)
 * 한 파일(slimedeco.json)에 무리마다 하나씩 담는다. 게임은 슬라임 종류마다 필요한 무리만 골라 붙인다 (SLD.kit, index.html).
 * 좌표는 슬라임 몸 모양 그대로 (makeJellySlime: 바닥 y≈.03, 꼭대기 y≈1.03, 가운데 높이 .38, 옆 반지름 .8쯤). 뼈는 root 하나.
 */
'use strict';
const { clamp, mix, sstep, smax, smin, rgb, fbm, vnoise, ellD, capD, E, C, F } = require('./lib');
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cm = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const ck = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/* 몸 겉면 (대충): 가운데 (0,.38,0), 반지름 (.8,.66,.8) */
const BC = [0, .33, 0], BR = [.745, .7, .745];
const bodyD = (x, y, z) => ellD(x - BC[0], y - BC[1], z - BC[2], BR[0], BR[1], BR[2]);
/* 겉면 위 한 점과 바깥쪽 방향 (a: 둘레 각, e: 높이 각) */
const surf = (a, e, off = 0) => { const d = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]; const n = norm([d[0] / BR[0], d[1] / BR[1], d[2] / BR[2]]); const p = [BC[0] + d[0] * BR[0], BC[1] + d[1] * BR[1], BC[2] + d[2] * BR[2]]; return { p: add(p, scl(n, off)), n }; };
let SEED = 1; const rnd = () => (SEED = (SEED * 16807) % 2147483647) / 2147483647;
/* 판 모양 (잎·꽃잎·조개): 가운데 c, 위 n, 길이 방향 t. w 너비 th 두께 L 길이, cu 휨 */
function plate(b, c, n, t, w, th, L, o) {
  n = norm(n); t = norm(sub(t, scl(n, dot(t, n)))); const bb = cross(n, t), cu = o.cu || 0, tip = o.tip ?? .3;
  const d = (x, y, z) => { const r = sub([x, y, z], c), u = dot(r, t), v = dot(r, bb), h = dot(r, n) - cu * u * u - (o.cv || 0) * v * v; const k = clamp(u / L, -1, 1), wid = w * Math.sqrt(Math.max(0, 1 - k * k)) * (1 - tip * Math.max(0, k)); return smax(ellD(v, h, u, Math.max(wid, .002), th, L), -1, 0); };
  const R = Math.max(w, L) + .05;
  return F(b, [c[0] - R, c[1] - R, c[2] - R, c[0] + R, c[1] + R, c[2] + R], d, Object.assign({ c: (x, y, z) => o.col(dot(sub([x, y, z], c), t) / L, dot(sub([x, y, z], c), bb) / w, x, y, z) }, o));
}
/* 육각 기둥 결정: 밑 a 에서 방향 dir 으로 길이 L, 반지름 r, 끝은 뾰족 */
function crystal(b, a, dir, L, r, o) {
  dir = norm(dir); const t = norm(cross(dir, Math.abs(dir[1]) < .9 ? [0, 1, 0] : [1, 0, 0])), s = cross(dir, t);
  const d = (x, y, z) => { const q = sub([x, y, z], a), h = dot(q, dir), px = Math.abs(dot(q, t)), py = Math.abs(dot(q, s));
    const hx = Math.max(px * .866 + py * .5, py) - r * (1 - .9 * sstep(L - r * 2.2, L, h)); return smax(hx, Math.max(-h, h - L), .004); };
  const R = L + r; return F(b, [a[0] - R, a[1] - R, a[2] - R, a[0] + R, a[1] + R, a[2] + R], d, o);
}
const shellD = (off, th) => (x, y, z) => Math.abs(bodyD(x, y, z) - off) - th;
const BB = [-.95, -.05, -.95, .95, 1.15, .95];

function deco() {
  const prims = [], P = p => { prims.push(p); return p; };
  /* ===================== 겉에 붙는 것 ===================== */
  /* 가시 (가시 슬라임): 굽은 가시가 사방으로 */
  SEED = 11;
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4 + rnd() * .5, e = .05 + rnd() * 1.25, L = .16 + rnd() * .14, { p, n } = surf(a, e, -.05);
    const m = add(p, add(scl(n, L * .6), [0, L * .15, 0])), q = add(m, add(scl(n, L * .5), [0, L * .3, 0]));
    const TC = (x, y, z) => { const k = clamp(Math.hypot(...sub([x, y, z], p)) / (L * 1.2), 0, 1); return cm(rgb(0x3a4a1e), rgb(0xd8d0a0), Math.pow(k, 1.5)); };
    P(C('root', p, m, .05, .028, { g: 'thorn', c: TC }));
    P(C('root', m, q, .028, .002, { g: 'thorn', c: TC, k: .015 }));
  }
  /* 나무껍질 판 (나무껍질 슬라임): 위쪽에 갈라진 껍질 조각 */
  P(F('root', BB, (x, y, z) => smax(smax(shellD(.012, .028)(x, y, z), .42 - y + .1 * vnoise(x * 6, 2, z * 6), .03), .05 - Math.abs(vnoise(x * 9 + 3, y * 4, z * 9)), .012) + .006 * vnoise(x * 60, y * 160, z * 60),
    { g: 'bark', c: (x, y, z) => { const v = .6 + .4 * fbm(x * 30, y * 90, z * 30, 3); return ck(rgb(0x6a4a30), v); } }));
  /* 이끼 (이끼 슬라임): 위에 북슬한 이끼 덩이와 작은 싹 */
  SEED = 21;
  for (let i = 0; i < 18; i++) { const a = i * 2.1 + rnd(), e = .45 + rnd() * 1.05, { p } = surf(a, e, -.012); P(E('root', p, [.15 + rnd() * .07, .055, .15 + rnd() * .07], { g: 'moss', k: .05, c: (x, y, z) => cm(rgb(0x2e5a1e), rgb(0x8ab04a), .5 + .5 * vnoise(x * 40, y * 40, z * 40)), disp: (x, y, z) => -.012 * Math.abs(vnoise(x * 70, y * 70, z * 70)), amp: .01 })); }
  for (let i = 0; i < 6; i++) { const a = i * 1.7 + 1, { p, n } = surf(a, .9 + rnd() * .5, .03); P(C('root', p, add(p, add(scl(n, .06), [0, .05, 0])), .006, .003, { g: 'moss', c: rgb(0x6a8a3a) })); P(E('root', add(p, add(scl(n, .06), [0, .055, 0])), [.012, .012, .012], { g: 'moss', c: rgb(0xb8a040) })); }
  /* 잎 (잎 슬라임 / 썩은 잎 슬라임) */
  const leafCol = (c0, c1, vein) => (u, v) => { const midrib = Math.abs(v) < .08 ? .6 : 1, side = Math.abs(Math.abs(v) - Math.abs(u - .1) * .9) < .05 ? .85 : 1; return ck(cm(c0, c1, clamp(.5 + .5 * u, 0, 1)), midrib * side * vein); };
  const leaves = (g, n0, c0, c1, seed) => {
    SEED = seed;
    for (let i = 0; i < n0; i++) { const a = i * 2.5 + rnd() * .6, e = .35 + rnd() * 1.0, { p, n } = surf(a, e, .008); const t = norm(add(cross(n, [0, 1, 0]), [rnd() - .5, rnd() - .5, rnd() - .5]));
      P(plate('root', p, n, t, .07 + rnd() * .03, .007, .15 + rnd() * .05, { g, cu: -.9, cv: -.6, col: leafCol(c0, c1, 1) })); }
  };
  leaves('leaf', 9, rgb(0x3a7a2a), rgb(0x8ac04a), 31);
  leaves('rot', 9, rgb(0x5a3a1a), rgb(0x9a6a2a), 41);
  /* 썩은 잎 위 작은 버섯 */
  SEED = 43;
  for (let i = 0; i < 4; i++) { const a = i * 1.9 + .4, { p, n } = surf(a, .6 + rnd() * .7, -.01), h = .07 + rnd() * .05, top = add(p, scl(norm(add(n, [0, 1.2, 0])), h));
    P(C('root', p, top, .014, .011, { g: 'rot', c: rgb(0xe8dcc0) })); P(E('root', top, [.04, .022, .04], { g: 'rot', k: .01, c: (x, y, z) => y > top[1] - .002 ? cm(rgb(0x8a3a1a), rgb(0xc86a2a), .5 + .5 * vnoise(x * 80, y * 80, z * 80)) : rgb(0xe0d0b0) })); }
  /* 얼음 결정 (서리 슬라임): 꼭대기에 모인 결정 */
  SEED = 51;
  const ICE = (x, y, z) => cm(rgb(0xb8d8f0), rgb(0xf4fbff), clamp((y - .8) * 2, 0, 1));
  for (let i = 0; i < 9; i++) { const a = i * 2.3 + rnd(), e = 1.0 + rnd() * .5, { p, n } = surf(a, e, -.08); P(crystal('root', p, add(n, [rnd() * .4 - .2, .6, rnd() * .4 - .2]), .2 + rnd() * .2, .04 + rnd() * .025, { g: 'ice', c: ICE })); }
  for (let i = 0; i < 5; i++) { const a = i * 1.3 + 2, { p, n } = surf(a, .2 + rnd() * .5, -.04); P(crystal('root', p, n, .1 + rnd() * .06, .025, { g: 'ice', c: ICE })); }
  /* 눈 모자 (눈 슬라임): 꼭대기에 소복이 쌓인 눈과 고드름 */
  P(F('root', BB, (x, y, z) => smax(smax(bodyD(x, y, z) - .05 - .025 * vnoise(x * 14, z * 14, 1) , -bodyD(x, y, z) - .01, .01), .78 - y - .05 * vnoise(x * 9, 3, z * 9), .03),
    { g: 'snow', c: (x, y, z) => ck([.95, .97, 1], .92 + .08 * vnoise(x * 60, y * 60, z * 60)) }));
  /* 수정 (수정 슬라임): 크게 솟은 보라 결정 다발 */
  SEED = 61;
  const CRY = (x, y, z) => cm(rgb(0x6a3ab0), rgb(0xe0c0ff), clamp((y - .6) * 1.6, 0, 1));
  for (let i = 0; i < 7; i++) { const a = i * 2.2 + rnd(), e = .7 + rnd() * .8, { p, n } = surf(a, e, -.12); P(crystal('root', p, add(n, [0, .4, 0]), .28 + rnd() * .22, .055 + rnd() * .03, { g: 'crystal', c: CRY })); }
  /* 굳은 껍질과 빛나는 틈 (불씨·용암·연기 슬라임) */
  const crustCell = (x, y, z) => .045 - Math.abs(vnoise(x * 6.5 + 7, y * 6.5, z * 6.5) + .35 * vnoise(x * 14, y * 14 + 3, z * 14));   /* 판 사이 가는 금 */
  P(F('root', BB, (x, y, z) => smax(smax(shellD(.012, .026)(x, y, z), crustCell(x, y, z), .015), .22 - y, .03) + .005 * vnoise(x * 70, y * 70, z * 70),
    { g: 'crust', c: (x, y, z) => ck(rgb(0x2a1e18), .7 + .3 * fbm(x * 25, y * 25, z * 25, 2)) }));
  P(F('root', BB, (x, y, z) => smax(smax(shellD(.006, .008)(x, y, z), .24 - y, .03), -crustCell(x, y, z) - .03, .01), { g: 'crack', c: (x, y, z) => cm(rgb(0xb83208), rgb(0xff7a18), .5 + .5 * vnoise(x * 20, y * 20, z * 20)) }));
  /* 박힌 돌 (바위·돌 슬라임) */
  SEED = 71;
  for (let i = 0; i < 13; i++) { const a = i * 2.39 + rnd(), e = -.05 + rnd() * 1.35, { p } = surf(a, e, .0), r = .07 + rnd() * .07;
    P(E('root', p, [r * 1.2, r * .85, r], { g: 'stones', k: .0, rot: [rnd() * 3, rnd() * 3, 0], c: (x, y, z) => ck(cm(rgb(0x6a645c), rgb(0x9a948a), .5 + .5 * vnoise(x * 30, y * 30, z * 30)), .85 + .15 * vnoise(x * 120, y * 120, z * 120)), disp: (x, y, z) => .01 * vnoise(x * 25, y * 25, z * 25), amp: .012 })); }
  /* 모래 띠 (모래 슬라임): 아랫도리에 붙은 모래와 작은 돌 */
  P(F('root', BB, (x, y, z) => smax(shellD(.008, .016)(x, y, z) - .01 * vnoise(x * 50, y * 50, z * 50), y - .3 - .08 * vnoise(x * 6, 0, z * 6), .04),
    { g: 'sand', c: (x, y, z) => ck(rgb(0xc8a870), .8 + .2 * vnoise(x * 150, y * 150, z * 150)) }));
  /* 진흙 (진흙·점토 슬라임): 위를 덮고 흘러내린 진흙 */
  SEED = 81;
  P(F('root', BB, (x, y, z) => smax(shellD(.01, .025)(x, y, z), .62 - y + .12 * vnoise(x * 5, 1, z * 5), .04), { g: 'mud', c: (x, y, z) => ck(rgb(0xa08068), .8 + .2 * vnoise(x * 40, y * 40, z * 40)) }));
  for (let i = 0; i < 9; i++) { const a = i * .7 + rnd() * .3, { p } = surf(a, .5, .015), q = surf(a, .5 - .3 - rnd() * .4, .015).p; P(C('root', p, q, .035, .022, { g: 'mud', k: .03, c: rgb(0xa08068) })); P(E('root', q, [.03, .035, .03], { g: 'mud', k: .02, c: rgb(0x907058) })); }
  /* 물풀·따개비 (파도 슬라임) */
  SEED = 91;
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + rnd() * .3; let prev = surf(a, -.05, .0).p; const H = 4 + Math.floor(rnd() * 3);
    for (let k = 1; k <= H; k++) { const e = -.05 + k * .2, q = add(surf(a + Math.sin(k * 1.7 + i) * .12, e, .004).p, [0, 0, 0]); P(C('root', prev, q, .03, .024, { g: 'weed', k: .015, c: (x, y, z) => cm(rgb(0x2a4a2a), rgb(0x6a8a3a), clamp(y, 0, 1)) })); prev = q; } }
  for (let i = 0; i < 10; i++) { const a = rnd() * 6.28, e = rnd() * .9, { p, n } = surf(a, e, -.01); P(C('root', p, add(p, scl(n, .035)), .028, .016, { g: 'weed', c: rgb(0xd8d0c0) })); }
  /* 구름 덩이 (구름·안개·연기 슬라임): 위쪽을 감싼 몽실한 덩이 */
  SEED = 101;
  for (let i = 0; i < 14; i++) { const a = i * 2.4 + rnd() * .3, e = .35 + rnd() * 1.1, { p } = surf(a, e, .03); const r = .17 + rnd() * .1; P(E('root', p, [r, r * .75, r], { g: 'puff', k: .14, c: (x, y, z) => ck([1, 1, 1], .85 + .15 * clamp(y, 0, 1)), disp: (x, y, z) => -.015 * Math.abs(vnoise(x * 18, y * 18, z * 18)), amp: .01 })); }
  /* 꽃 (꽃가루 슬라임): 꼭대기에 큰 꽃 한 송이, 둘레에 작은 꽃 */
  const flower = (top, n, R, nP, c0, c1, ctr) => {
    const t0 = norm(cross(n, [1, 0, 0]));
    for (let k = 0; k < nP; k++) { const ang = k / nP * 6.283, t = norm(add(scl(t0, Math.cos(ang)), scl(cross(n, t0), Math.sin(ang)))); P(plate('root', add(add(top, scl(t, R * .55)), scl(n, .01)), add(n, scl(t, -.25)), t, R * .3, .006, R * .55, { g: 'flower', cu: .6, tip: .1, col: u => cm(c0, c1, clamp(.5 + .5 * u, 0, 1)) })); }
    P(E('root', add(top, scl(n, .02)), [R * .28, R * .14, R * .28], { g: 'flower', c: (x, y, z) => ck(ctr, .8 + .2 * vnoise(x * 200, y * 200, z * 200)), disp: (x, y, z) => -.004 * Math.abs(Math.sin(x * 300) * Math.sin(z * 300)), amp: .004 }));
  };
  flower(surf(0, 1.5, .02).p, [0, 1, 0], .42, 7, rgb(0xf0e070), rgb(0xfff8c0), rgb(0xc87a20));
  SEED = 111; for (let i = 0; i < 4; i++) { const s = surf(i * 1.6 + .5, .6 + rnd() * .5, -.005); flower(s.p, s.n, .17, 5, rgb(0xf0a0c0), rgb(0xfff0f4), rgb(0xf0c040)); }
  /* 송진 방울 (송진 슬라임): 겉에 맺혀 흘러내리는 호박빛 방울 */
  SEED = 121;
  for (let i = 0; i < 10; i++) { const a = rnd() * 6.28, e = .1 + rnd() * 1.1, { p, n } = surf(a, e, 0), q = add(p, [0, -.05 - rnd() * .08, 0]); P(C('root', p, q, .025, .04, { g: 'amber', k: .02, c: (x, y, z) => cm(rgb(0xc86a10), rgb(0xffb840), clamp((y - q[1]) * 8, 0, 1)) })); }

  /* ===================== 몸 속에 떠 있는 삼킨 것 ===================== */
  const IVORY = (x, y, z) => ck(rgb(0xe8dcc0), .85 + .15 * vnoise(x * 90, y * 90, z * 90));
  /* 뼈: 곧은 대롱에 양 끝 두 혹 */
  { const a = [-.15, .3, .12], b = [.14, .34, .02]; P(C('root', a, b, .022, .02, { g: 'bone', c: IVORY })); for (const e of [a, b]) for (const s of [-1, 1]) P(E('root', add(e, [0, s * .022, s * .01]), [.032, .03, .03], { g: 'bone', k: .02, c: IVORY })); }
  /* 작은 짐승 해골 */
  { const c = [.18, .32, -.22], R = [0, .7, 0]; P(E('root', c, [.07, .06, .075], { g: 'skull', c: IVORY })); P(C('root', add(c, [-.02, -.01, .05]), add(c, [-.055, -.035, .14]), .04, .022, { g: 'skull', k: .03, c: IVORY }));
    for (const s of [-1, 1]) P(E('root', add(c, [s * .035 - .02, .012, .07]), [.022, .02, .02], { g: 'skull', sub: true, k: .008 }));
    P(C('root', add(c, [0, -.06, .02]), add(c, [-.04, -.055, .13]), .018, .012, { g: 'skull', c: IVORY })); }
  /* 동전 셋 */
  { const GOLD = (x, y, z) => ck(rgb(0xe8b84a), .8 + .2 * vnoise(x * 120, y * 120, z * 120)); const coin = (c, n) => { n = norm(n); P(F('root', [c[0] - .06, c[1] - .06, c[2] - .06, c[0] + .06, c[1] + .06, c[2] + .06], (x, y, z) => { const r = sub([x, y, z], c), h = dot(r, n), q = Math.hypot(...sub(r, scl(n, h))); return smax(q - .042, Math.abs(h) - .006 - .002 * sstep(.036, .03, q), .002); }, { g: 'coins', c: GOLD })); };
    coin([-.22, .2, -.08], [.3, 1, .2]); coin([-.17, .25, -.16], [-.5, 1, .4]); coin([-.1, .55, .08], [.8, .4, .2]); }
  /* 둥근 조약돌 */
  SEED = 131; for (let i = 0; i < 4; i++) { const c = [rnd() * .4 - .2, .2 + rnd() * .35, rnd() * .4 - .2]; P(E('root', c, [.06, .035, .045], { g: 'pebbles', rot: [rnd() * 3, rnd() * 3, 0], c: ck(rgb([0x8a8478, 0x6a645a, 0xa89a80, 0x5a5650][i]), 1) })); }
  /* 물고기 뼈 */
  { const h = [.2, .4, .05], t = [-.18, .36, -.05]; P(C('root', h, t, .008, .005, { g: 'fishbone', c: IVORY })); P(E('root', add(h, [.04, 0, .01]), [.05, .035, .02], { g: 'fishbone', c: IVORY, rot: [0, -.25, 0] }));
    for (let k = 1; k < 8; k++) { const p = add(h, scl(sub(t, h), k / 9)), L = .05 * Math.sin(k / 9 * Math.PI) + .015; for (const s of [-1, 1]) P(C('root', p, add(p, [-.012, s * L, .006]), .004, .002, { g: 'fishbone', c: IVORY })); }
    for (const s of [-1, 1]) P(plate('root', add(t, [-.03, s * .02, 0]), [0, 0, 1], [-1, s * 1.2, 0], .025, .004, .035, { g: 'fishbone', col: () => rgb(0xd8ccb0) })); }
  /* 조개 */
  { const c = [-.16, .24, .2], n = norm([.2, 1, .3]); P(F('root', [c[0] - .1, c[1] - .1, c[2] - .1, c[0] + .1, c[1] + .1, c[2] + .1], (x, y, z) => { const r = sub([x, y, z], c), h = dot(r, n), q = sub(r, scl(n, h)), rr = Math.hypot(...q), an = Math.atan2(q[2], q[0]); return smax(smax(Math.abs(h - .3 * rr * rr * 4 + .004 * Math.sin(an * 14)) - .006, rr - .07, .004), -q[0] - .02, .004); }, { g: 'shell', c: (x, y, z) => cm(rgb(0xe8b8a0), rgb(0xfff0e0), .5 + .5 * Math.sin((x * 3 + z * 2) * 90)) })); }
  /* 숯불 덩이 (빛남) */
  SEED = 141; for (let i = 0; i < 4; i++) { const c = [rnd() * .36 - .18, .2 + rnd() * .35, rnd() * .36 - .18]; P(E('root', c, [.055, .045, .05], { g: 'coal', rot: [rnd() * 3, rnd() * 3, 0], c: (x, y, z) => { const v = vnoise(x * 50, y * 50, z * 50); return v > .1 ? rgb(0x2a1208) : cm(rgb(0xff4a10), rgb(0xffb030), clamp(-v * 3, 0, 1)); }, disp: (x, y, z) => .008 * vnoise(x * 40, y * 40, z * 40), amp: .008 })); }
  /* 딱정벌레 (송진 속에 갇힌) */
  { const c = [.05, .45, .1]; P(E('root', c, [.035, .025, .055], { g: 'beetle', c: (x, y, z) => cm(rgb(0x1a2a1a), rgb(0x3a6a3a), clamp((y - c[1]) * 30, 0, 1)) })); P(E('root', add(c, [0, -.004, .06]), [.022, .018, .02], { g: 'beetle', c: rgb(0x141a14) }));
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const a = add(c, [s * .025, -.01, .03 - k * .03]), m = add(a, [s * .035, -.01, .01 - k * .006]); P(C('root', a, m, .004, .003, { g: 'beetle', c: rgb(0x101410) })); P(C('root', m, add(m, [s * .01, -.03, 0]), .003, .002, { g: 'beetle', c: rgb(0x101410) })); } }
  /* 몸 속 작은 수정 */
  SEED = 151; for (let i = 0; i < 4; i++) { const a = [rnd() * .3 - .15, .22 + rnd() * .2, rnd() * .3 - .15]; P(crystal('root', a, [rnd() - .5, 1, rnd() - .5], .14, .035, { g: 'cryin', c: (x, y, z) => cm(rgb(0x8a5ad0), rgb(0xf0e0ff), clamp((y - .2) * 3, 0, 1)) })); }
  /* 몸 속 잎 한 장 */
  P(plate('root', [.1, .5, -.1], [.3, 1, .5], [1, .2, -.3], .06, .006, .13, { g: 'leafin', cu: -.8, col: leafCol(rgb(0x4a7a2a), rgb(0x9ab04a), 1) }));

  const G = ['thorn', 'bark', 'moss', 'leaf', 'rot', 'ice', 'snow', 'crystal', 'crust', 'crack', 'stones', 'sand', 'mud', 'weed', 'puff', 'flower', 'amber', 'bone', 'skull', 'coins', 'pebbles', 'fishbone', 'shell', 'coal', 'beetle', 'cryin', 'leafin'];
  const T = { thorn: 1400, bark: 2400, moss: 1600, leaf: 1200, rot: 1400, ice: 900, snow: 1500, crystal: 700, crust: 2600, crack: 1400, stones: 1600, sand: 1800, mud: 1600, weed: 1000, puff: 1400, flower: 1200, amber: 500, bone: 300, skull: 400, coins: 300, pebbles: 200, fishbone: 500, shell: 300, coal: 400, beetle: 300, cryin: 240, leafin: 160 };
  const gopt = {}, mats = {};
  for (const g of G) { gopt[g] = { tris: T[g], h: g === 'bark' || g === 'crust' || g === 'crack' || g === 'sand' || g === 'mud' || g === 'snow' ? .006 : .004, noLo: 1, aoS: .012, aoK: 1.6 }; mats[g] = { r: .8 }; }
  Object.assign(mats, { ice: { r: .12, m: .05, tr: .85 }, crystal: { r: .12, m: .1, tr: .85 }, cryin: { r: .15, m: .1 }, crack: { glow: 1 }, coal: { glow: 1 }, coins: { r: .3, m: .8 }, amber: { r: .15, tr: .8 }, puff: { r: 1, tr: .75 }, shell: { r: .4 }, beetle: { r: .25, m: .3 }, flower: { r: .7 } });
  return { aoSelf: true, prims, bones: [{ n: 'root', o: [0, 0, 0], tip: [0, 1, 0] }], h: 1, size: 1, anim: {}, mats, gopt };
}
module.exports = { TYPES: { slimedeco: deco } };
