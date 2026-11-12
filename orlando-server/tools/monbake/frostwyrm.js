/*
 * 서리 용 글라키에스 (허칠 동굴 끝 '얼음 용의 잠자리' 보스, Lv 100) — 거리 함수로 한 덩어리로 빚는다
 *
 * 좌표: y 위, z 앞(머리 쪽), 모델 1 = 게임 4m (size 4). 꼬리 끝 z -1.6 → 코끝 z 1.4 (게임에서 약 12m)
 * 생김새: 얼음 굴 가장 깊은 곳에서 오래 잠들어 있던 늙은 용. 네 발로 버티고 서서 반쯤 편 날개를 치켜들었다.
 *   - 몸: 등은 짙은 강철빛 푸른 비늘, 옆구리로 갈수록 옅어지고, 배는 서리 낀 흰 판비늘이 가로로 겹쳤다. 등과 어깨엔 하얀 서리가 엉겼다
 *   - 등줄기: 머리 뒤에서 꼬리 끝까지 맑은 얼음 결정 가시가 한 줄로 솟았다 (어깨가 가장 크다). 꼬리 끝은 얼음 결정 뭉치
 *   - 머리: 길쭉한 쐐기 머리, 눈두덩이 툭 튀어나왔고 눈은 차가운 푸른빛. 뒤로 휜 큰 뿔 한 쌍과 뺨을 따라 작은 뿔이 줄지어 났다
 *   - 입: 위턱·아래턱이 따로 (아래턱 뼈로 벌린다), 바늘 같은 이빨이 줄지어 났다
 *   - 다리: 굵은 앞다리·뒷다리, 발가락마다 검푸른 갈고리 발톱
 *   - 날개: 팔 뼈 셋 마디(위팔·아래팔·손), 손가락 셋 사이에 얇은 막. 막 끝은 손가락 사이로 오목하게 패였다
 * 뼈: root(엉덩이) → spine(가슴) → n1 → n2 → n3 → head → jaw / root → t1..t6 (꼬리) / spine → aL1 aL2 aL3, aR… (앞다리)
 *     root → lL1 lL2 lL3, lR… (뒷다리) / spine → wL1 wL2 wL3, wR… (날개)
 */
'use strict';
const { clamp, mix, sstep, smin, rgb, cmix, csc, vnoise, fbm, ellD, capD, E, C, F } = require('./lib');

/* 삼각형까지 거리 (얇은 막을 빚을 때 쓴다) */
function triD(px, py, pz, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const p = [px, py, pz], ba = sub(b, a), pa = sub(p, a), cb = sub(c, b), pb = sub(p, b), ac = sub(a, c), pc = sub(p, c), nor = cross(ba, ac);
  const sg = v => v >= 0 ? 1 : -1;
  const inside = sg(dot(cross(ba, nor), pa)) + sg(dot(cross(cb, nor), pb)) + sg(dot(cross(ac, nor), pc)) < 2;
  if (inside) {
    const seg = (e, q) => { const t = clamp(dot(e, q) / dot(e, e), 0, 1); const r = [e[0] * t - q[0], e[1] * t - q[1], e[2] * t - q[2]]; return dot(r, r); };
    return Math.sqrt(Math.min(seg(ba, pa), seg(cb, pb), seg(ac, pc)));
  }
  return Math.sqrt(dot(nor, pa) * dot(nor, pa) / dot(nor, nor));
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const bbOfPts = (pts, r) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i] - r); hi[i] = Math.max(hi[i], p[i] + r); } return [...lo, ...hi]; };

/* ---------- 색 ---------- */
const C_BACK = rgb(0x2c4a66), C_BACK2 = rgb(0x1c3048), C_FLANK = rgb(0x6c8eaa), C_FLANK2 = rgb(0x5a7a98), C_BELLY = rgb(0xc4d4de), C_BELLY2 = rgb(0x9ab0c0);
const C_FROST = rgb(0xeef6fb), C_STRIPE = rgb(0x16243a), C_SCAR = rgb(0x8aa4b8);
const C_HORN = rgb(0xd8dcd6), C_HORN2 = rgb(0x6a7a88), C_ICE = rgb(0xbfe6fa), C_ICE2 = rgb(0x5aa6d8), C_CLAW = rgb(0x1a2232), C_TOOTH = rgb(0xeef0ea);
const C_MEM = rgb(0x8ab0cc), C_MEM2 = rgb(0x4a6e90), C_MEMV = rgb(0x22405e), C_GUM = rgb(0x3a2a44), C_THROAT = rgb(0x0a1420);
/* 비늘 몸 색: 등(법선 위)은 짙고, 옆은 옅고, 배는 흰 판비늘. 서리는 위를 보는 면에 엉긴다 */
function scaleC(x, y, z, nx, ny, nz) {
  ny = ny || 0;
  const n1 = fbm(x * 3.1 + 4, y * 3.1, z * 3.1, 3) + .5, n2 = fbm(x * 9 - 2, y * 9 + 5, z * 9, 2) + .5;
  let c = cmix(C_FLANK, C_FLANK2, sstep(.35, .75, n1));
  c = cmix(c, cmix(C_BACK, C_BACK2, sstep(.4, .7, n2)), sstep(-.1, .55, ny));
  /* 등의 짙은 줄무늬: 몸을 가로지르는 띠 몇 개 (얼룩처럼 끊긴다) */
  c = cmix(c, C_STRIPE, sstep(.3, .75, ny) * sstep(.72, .9, Math.sin(z * 26 + 3 * vnoise(x * 4, y * 4, z * 2)) * .5 + .5) * sstep(.45, .6, n1) * .6);
  c = cmix(c, cmix(C_BELLY, C_BELLY2, sstep(.4, .8, n2) * .6), sstep(-.2, -.6, ny));
  c = cmix(c, C_FROST, sstep(.45, .9, ny) * sstep(.6, .78, fbm(x * 5 + 9, y * 5, z * 5, 3) + .5) * .85);
  c = cmix(c, C_SCAR, sstep(.7, .8, vnoise(x * 7 + 11, y * 7, z * 7)) * .35);
  return csc(c, .94 + .1 * vnoise(x * 40, y * 40, z * 40));
}

/* ---------- 몸 뼈대 자리 ---------- */
const HIP = [0, .56, -.4], CHEST = [0, .62, .26];
const NECK = [[0, .68, .46], [0, .8, .64], [0, .93, .8], [0, 1.0, .93]];
const NR = [.155, .12, .1, .088];
const HEAD = [0, 1.02, 1.02];
const TAIL = [[0, .54, -.58], [0, .45, -.82], [.05, .33, -1.05], [.17, .21, -1.27], [.35, .12, -1.44], [.57, .075, -1.55], [.79, .06, -1.57]];
const TR = [.15, .115, .088, .066, .048, .034, .018];

function hwyrm() {
  const prims = [], bones = [];
  bones.push({ n: 'root', o: HIP, tip: CHEST });
  bones.push({ n: 'spine', p: 'root', o: [0, .6, -.06], tip: NECK[0], bw: .14 });
  for (let i = 0; i < 3; i++) bones.push({ n: 'n' + (i + 1), p: i ? 'n' + i : 'spine', o: NECK[i], tip: NECK[i + 1], bw: .07 - i * .01 });
  bones.push({ n: 'head', p: 'n3', o: NECK[3], tip: [0, .98, 1.4], bw: .06 });
  bones.push({ n: 'jaw', p: 'head', o: [0, .975, 1.0], tip: [0, .91, 1.3], bw: .02, rad: .14 });
  for (let i = 0; i < 6; i++) bones.push({ n: 't' + (i + 1), p: i ? 't' + i : 'root', o: TAIL[i], tip: TAIL[i + 1], bw: .09 - i * .012 });

  /* ===== 몸통: 가슴·배·엉덩이 덩어리를 매끈하게 잇는다. 배는 가로 판비늘로 살짝 도드라진다 ===== */
  const belly = (x, y, z, d) => { if (d > .03) return d; const u = sstep(.53, .38, y); return d - .006 * u * Math.pow(Math.max(0, Math.cos(z * 62)), 3); };
  prims.push(F('spine', [-.32, .28, -.12, .32, .95, .62], (x, y, z) => belly(x, y, z, smin(ellD(x, y - .63, z - .27, .235, .27, .3), ellD(x, y - .57, z - .02, .23, .245, .28), .12)), { c: scaleC, k: .1 }));
  prims.push(F('root', [-.3, .26, -.72, .3, .86, .12], (x, y, z) => belly(x, y, z, smin(ellD(x, y - .56, z + .38, .2, .21, .25), ellD(x, y - .55, z + .14, .215, .225, .22), .1)), { c: scaleC, k: .1 }));
  /* 어깨 근육 */
  for (const s of [-1, 1]) prims.push(E('spine', [s * .15, .63, .3], [.12, .17, .15], { c: scaleC, k: .07 }));
  /* 목: 마디마다 굵기가 줄어드는 S자 */
  for (let i = 0; i < 3; i++) prims.push(C('n' + (i + 1), NECK[i], NECK[i + 1], NR[i], NR[i + 1], { c: scaleC, k: .06 }));
  prims.push(C('n1', CHEST, NECK[0], .2, NR[0], { c: scaleC, k: .08 }));
  /* 목 아래 판비늘 (멱): 가로로 겹친 판 */
  for (let i = 0; i < 9; i++) { const t = i / 8, a = i < 4 ? lerp3(NECK[0], NECK[2], t * 2) : lerp3(NECK[1], NECK[3], (t - .5) * 2), r = mix(NR[0], NR[3], t) * .7, b = i < 3 ? 'n1' : i < 6 ? 'n2' : 'n3';
    prims.push(E(b, add(a, [0, -mix(NR[0], NR[3], t) * .62, .0]), [r * .95, .02, .03], { c: (x, y, z) => cmix(C_BELLY, C_BELLY2, sstep(.4, .7, vnoise(x * 30, y * 30, z * 30))), k: .03, rot: [-.5 - t * .4, 0, 0] })); }
  /* 꼬리 */
  for (let i = 0; i < 6; i++) prims.push(C('t' + (i + 1), TAIL[i], TAIL[i + 1], TR[i], TR[i + 1], { c: scaleC, k: i ? .05 : .09 }));

  /* ===== 머리 ===== */
  const headC = (x, y, z, nx, ny) => { let c = scaleC(x, y, z, nx, ny); c = cmix(c, C_BACK2, sstep(1.05, 1.1, y) * .4); return c; };
  /* 머리뼈: 뒤는 넓고 앞으로 좁아지는 쐐기 (눈 뒤가 가장 넓다) */
  const SK = [[.95, 1.03, .1, .085, .09], [1.07, 1.02, .088, .072, .08], [1.17, 1.005, .07, .058, .07], [1.27, .99, .056, .048, .06], [1.35, .985, .045, .04, .045]];
  const skullD = (x, y, z) => { let d = 1e9; for (const [zc, yc, w, h, l] of SK) d = smin(d, ellD(x, y - yc, z - zc, w, h, l), .06); return d; };
  prims.push(F('head', [-.14, .92, .84, .14, 1.13, 1.42], skullD, { c: headC, k: .04 }));
  prims.push(E('head', [0, 1.02, .97], [.1, .085, .1], { c: headC, k: .05 }));
  /* 위턱 아래쪽은 평평하게 깎는다 (입 틈) */
  prims.push(F('head', [-.12, .86, 1.0, .12, .955, 1.45], (x, y, z) => .952 - y, { sub: true, k: .008 }));
  /* 눈두덩: 눈 위로 툭 튀어나온 뼈 */
  for (const s of [-1, 1]) {
    prims.push(C('head', [s * .055, 1.075, 1.13], [s * .085, 1.085, .99], .026, .03, { c: headC, k: .025 }));
    prims.push(C('head', [s * .045, 1.02, 1.32], [s * .06, 1.06, 1.17], .018, .022, { c: headC, k: .03 }));   /* 콧등 마루 */
    /* 콧구멍 */
    prims.push(E('head', [s * .022, 1.0, 1.375], [.011, .009, .016], { sub: true, k: .006 }));
  }
  /* 아래턱: 따로 된 뼈 (벌어진다). 뒤는 귀 밑에서 경첩 */
  const JW = [[1.0, .945, .082, .036, .07], [1.1, .935, .068, .03, .07], [1.2, .928, .052, .026, .06], [1.28, .925, .038, .022, .04]];
  const jawD = (x, y, z) => { let d = 1e9; for (const [zc, yc, w, h, l] of JW) d = smin(d, ellD(x, y - yc, z - zc, w, h, l), .05); return d; };
  prims.push(F('jaw', [-.12, .88, .9, .12, .98, 1.33], (x, y, z) => Math.max(jawD(x, y, z), y - .943), { c: (x, y, z, nx, ny) => cmix(headC(x, y, z, nx, ny), C_BELLY, sstep(-.1, -.6, ny) * .7), k: .015 }));
  /* 입 안: 잇몸·목구멍 색 (입 틈 안쪽) */
  prims.push(F('jaw', [-.08, .925, .98, .08, .946, 1.27], (x, y, z) => { const t = clamp((z - .98) / .29, 0, 1), w = mix(.06, .024, t); return Math.max(Math.abs(x) - w, Math.abs(y - .936) - .009, Math.abs(z - 1.125) - .145); }, { c: (x, y, z) => cmix(C_THROAT, C_GUM, sstep(1.0, 1.2, z)), k: .01, hard: 1 }));
  /* 이빨: 위턱 가장자리에서 아래로, 아래턱에서 위로. 송곳니는 길다 */
  const toothC = (base, tip) => (x, y, z) => { const L = Math.hypot(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]) || 1, k = clamp(Math.hypot(x - base[0], y - base[1], z - base[2]) / L, 0, 1); return cmix(rgb(0xb8c4c8), C_TOOTH, sstep(.1, .6, k)); };
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    const t = i / 8, z = mix(1.34, 1.02, t), w = mix(.038, .085, Math.pow(t, .9)) - .004, fang = i === 1 || i === 4, L = fang ? .034 : .016 + .008 * Math.sin(i * 2.3);
    const b1 = [s * w, .956, z], t1 = [s * (w - .004), .956 - L, z + .004];
    prims.push(C('head', b1, t1, fang ? .0075 : .0055, .001, { g: 'teeth', c: toothC(b1, t1) }));
    const zj = mix(1.29, 1.0, t), wj = mix(.032, .08, Math.pow(t, .9)) - .006, Lj = (i === 2 ? .028 : .013 + .006 * Math.sin(i * 1.7)), b2 = [s * wj, .94, zj], t2 = [s * (wj - .003), .94 + Lj, zj - .003];
    prims.push(C('jaw', b2, t2, i === 2 ? .007 : .005, .001, { g: 'teeth', c: toothC(b2, t2) }));
  }
  /* 눈: 차가운 푸른 빛 (눈동자는 세로로 찢어졌다) */
  for (const s of [-1, 1]) { const c = [s * .074, 1.05, 1.08];
    prims.push(E('head', c, [.014, .016, .022], { g: 'eye', rot: [0, s * .5, 0], c: (x, y, z) => { const dx = (x - c[0]) * s, dy = y - c[1]; return Math.abs(dx * .2 + (z - c[2]) * .4) < .003 && Math.abs(dy) < .012 ? rgb(0x02060c) : cmix(rgb(0xe8fbff), rgb(0x3aa0e0), sstep(.004, .016, Math.hypot(dy, z - c[2]))); } })); }
  /* 큰 뿔 한 쌍: 머리 뒤에서 뒤로 휘며 솟는다. 마디진 고리 결, 끝은 얼음빛 */
  const hornC = (a, b) => (x, y, z) => { const k = clamp(Math.hypot(x - a[0], y - a[1], z - a[2]) / Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0, 1); let c = cmix(C_HORN2, C_HORN, sstep(.05, .45, k)); c = cmix(c, C_ICE, sstep(.65, 1, k) * .8); return csc(c, .85 + .2 * (Math.sin((x + y + z) * 160) * .5 + .5) * (1 - k)); };
  for (const s of [-1, 1]) {
    const P = [[s * .062, 1.095, .98], [s * .1, 1.15, .88], [s * .14, 1.2, .76], [s * .155, 1.25, .63], [s * .15, 1.29, .52]], R = [.034, .028, .021, .013, .003], tip = P[4];
    for (let i = 0; i < 4; i++) prims.push(C('head', P[i], P[i + 1], R[i], R[i + 1], { g: 'horn', c: hornC(P[0], tip), k: i ? .012 : 0 }));
    /* 뺨을 따라 뒤로 뻗은 작은 뿔 셋 */
    for (let k = 0; k < 3; k++) { const b0 = [s * (.088 - k * .004), 1.0 - k * .022, .99 - k * .03], t0 = [s * (.15 + k * .01), 1.02 - k * .045, .86 - k * .05];
      prims.push(C('head', b0, t0, .013 - k * .002, .002, { g: 'horn', c: hornC(b0, t0) })); }
    /* 아래턱 끝 뒤로 뻗은 수염 가시 */
    { const b0 = [s * .07, .925, 1.0], t0 = [s * .1, .89, .9]; prims.push(C('jaw', b0, t0, .01, .002, { g: 'horn', c: hornC(b0, t0) })); }
  }

  /* ===== 다리 ===== */
  const clawC = (a, b) => (x, y, z) => { const k = clamp(Math.hypot(x - a[0], y - a[1], z - a[2]) / Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0, 1); return cmix(rgb(0x3a4a5e), C_CLAW, sstep(.2, .8, k)); };
  const legC = (x, y, z, nx, ny, nz) => { let c = scaleC(x, y, z, nx, ny, nz); return cmix(c, C_BACK2, sstep(.25, .06, y) * .45); };
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    /* 앞다리: 어깨 → 팔꿈치(뒤로) → 손목 → 발 */
    const sh = [s * .19, .6, .33], el = [s * .27, .36, .23], wr = [s * .27, .1, .35], pa = [s * .275, .045, .41];
    bones.push({ n: 'a' + k + '1', p: 'spine', o: sh, tip: el, bw: .07, rad: .22 }, { n: 'a' + k + '2', p: 'a' + k + '1', o: el, tip: wr, bw: .05, rad: .14 }, { n: 'a' + k + '3', p: 'a' + k + '2', o: wr, tip: pa, bw: .03, rad: .14 });
    prims.push(E('a' + k + '1', lerp3(sh, el, .45), [.085, .15, .1], { c: legC, k: .06, rot: [.35, 0, s * .2] }));
    prims.push(C('a' + k + '1', sh, el, .085, .06, { c: legC, k: .05 }));
    prims.push(C('a' + k + '2', el, wr, .06, .042, { c: legC, k: .04 }));
    prims.push(E('a' + k + '2', lerp3(el, wr, .3), [.058, .1, .06], { c: legC, k: .04, rot: [-.4, 0, 0] }));
    prims.push(C('a' + k + '3', wr, pa, .045, .04, { c: legC, k: .03 }));
    prims.push(E('a' + k + '3', [s * .275, .04, .43], [.06, .034, .07], { c: legC, k: .03 }));
    for (let j = 0; j < 4; j++) { const dx = (j - 1.5) * .028, b0 = [s * .275 + dx, .036, .46], t0 = [s * .275 + dx * 1.5, .028, .53 - Math.abs(j - 1.5) * .012], c0 = [t0[0] + dx * .2, .004, t0[2] + .035];
      if (j === 0) { prims.push(C('a' + k + '3', [s * (.275 - s * .02), .06, .4], [s * (.275 - s * .06), .035, .39], .014, .01, { c: legC, k: .01 })); continue; }   /* 안쪽 엄지는 짧다 */
      prims.push(C('a' + k + '3', b0, t0, .018, .015, { c: legC, k: .015 }));
      prims.push(C('a' + k + '3', t0, c0, .013, .002, { g: 'teeth', c: clawC(t0, c0) })); }
    /* 뒷다리: 굵은 넓적다리 → 무릎(앞으로) → 발목(뒤로) → 발 */
    const hp = [s * .2, .55, -.38], kn = [s * .29, .32, -.22], hk = [s * .29, .14, -.47], ft = [s * .29, .035, -.38];
    bones.push({ n: 'l' + k + '1', p: 'root', o: hp, tip: kn, bw: .08, rad: .26 }, { n: 'l' + k + '2', p: 'l' + k + '1', o: kn, tip: hk, bw: .05, rad: .14 }, { n: 'l' + k + '3', p: 'l' + k + '2', o: hk, tip: ft, bw: .035, rad: .14 });
    prims.push(E('l' + k + '1', [s * .23, .44, -.33], [.12, .19, .17], { c: legC, k: .07, rot: [-.5, 0, s * .1] }));
    prims.push(C('l' + k + '1', hp, kn, .1, .065, { c: legC, k: .05 }));
    prims.push(C('l' + k + '2', kn, hk, .062, .04, { c: legC, k: .04 }));
    prims.push(E('l' + k + '2', lerp3(kn, hk, .35), [.055, .1, .065], { c: legC, k: .04, rot: [.9, 0, 0] }));
    prims.push(C('l' + k + '3', hk, ft, .042, .038, { c: legC, k: .03 }));
    prims.push(E('l' + k + '3', [s * .29, .035, -.35], [.058, .032, .075], { c: legC, k: .03 }));
    for (let j = 0; j < 3; j++) { const dx = (j - 1) * .03, b0 = [s * .29 + dx, .032, -.31], t0 = [s * .29 + dx * 1.6, .026, -.24 - (j === 1 ? .015 : 0)], c0 = [t0[0] + dx * .2, .004, t0[2] + .038];
      prims.push(C('l' + k + '3', b0, t0, .02, .016, { c: legC, k: .015 }));
      prims.push(C('l' + k + '3', t0, c0, .014, .002, { g: 'teeth', c: clawC(t0, c0) })); }
    /* 발뒤꿈치 가시 */
    { const b0 = [s * .29, .13, -.48], t0 = [s * .3, .12, -.56]; prims.push(C('l' + k + '2', b0, t0, .018, .002, { g: 'teeth', c: clawC(b0, t0) })); }
  }

  /* ===== 날개: 팔 마디 셋, 손가락 셋 사이에 막 ===== */
  const memC = (W, tips) => { const VEIN = []; for (let i = 0; i < tips.length - 1; i++) for (const u of [.33, .66]) VEIN.push(lerp3(tips[i], tips[i + 1], u)); return (x, y, z) => {
    /* 막: 손목에서 손가락 사이로 퍼지는 핏줄, 가장자리는 서리가 끼어 하얗다 */
    const dx = x - W[0], dy = y - W[1], dz = z - W[2], r = Math.hypot(dx, dy, dz);
    let c = cmix(C_MEM, C_MEM2, sstep(.3, .8, fbm(x * 6, y * 6, z * 6, 2) + .5));
    let vd = 1e9; for (const P of VEIN) vd = Math.min(vd, capD(x, y, z, W[0], W[1], W[2], P[0], P[1], P[2], 0, 0) + .004 * vnoise(x * 20, y * 20, z * 20));
    c = cmix(c, C_MEMV, sstep(.009, .003, vd) * .6 * sstep(.05, .2, r));
    c = cmix(c, C_FROST, sstep(.5, .9, r / .75) * sstep(.55, .8, fbm(x * 8 + 3, y * 8, z * 8, 2) + .5) * .6);
    return csc(c, .92 + .1 * vnoise(x * 30, y * 30, z * 30));
  }; };
  const boneC = (x, y, z, nx, ny, nz) => cmix(scaleC(x, y, z, nx, ny, nz), C_BACK2, .3);
  const WINGS = {};
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = [s * .15, .78, .25], el = [s * .47, 1.0, .12], wr = [s * .76, 1.24, -.1];
    const f1 = [s * 1.26, 1.03, -.26], f2 = [s * 1.07, .74, -.52], f3 = [s * .78, .56, -.7], at = [s * .17, .62, -.46];   /* 손가락 끝 셋, 막이 몸에 붙는 자리 */
    WINGS[k] = { sh, el, wr, f1, f2, f3, at };
    bones.push({ n: 'w' + k + '1', p: 'spine', o: sh, tip: el, bw: .06, rad: .5 }, { n: 'w' + k + '2', p: 'w' + k + '1', o: el, tip: wr, bw: .05, rad: .5 }, { n: 'w' + k + '3', p: 'w' + k + '2', o: wr, tip: f2, bw: .045, rad: .8 });
    prims.push(E('w' + k + '1', sh, [.07, .07, .08], { c: boneC, k: .05 }));
    prims.push(C('w' + k + '1', sh, el, .055, .036, { c: boneC, k: .04 }));
    prims.push(C('w' + k + '2', el, wr, .036, .026, { c: boneC, k: .02 }));
    prims.push(E('w' + k + '2', wr, [.032, .032, .032], { c: boneC, k: .015 }));
    /* 엄지 발톱 (손목 앞) */
    { const t0 = add(wr, [s * .03, .06, .06]); prims.push(C('w' + k + '2', wr, t0, .016, .003, { g: 'teeth', c: clawC(wr, t0) })); }
    /* 손가락: 손목에서 끝으로 가늘어진다, 끝은 작은 갈고리 */
    for (const f of [f1, f2, f3]) { const m = lerp3(wr, f, .45); m[1] += .03;
      prims.push(C('w' + k + '3', wr, m, .022, .016, { c: boneC, k: .012 }), C('w' + k + '3', m, f, .016, .005, { c: boneC, k: .008 })); }
    /* 막: 삼각형 판 (두께 .011). 손가락 사이 가장자리는 오목하게 깎는다 */
    const TH = .0105;
    const mem = (b, A, B2, Cc, scal) => {
      const bb = bbOfPts([A, B2, Cc], .05), cut = scal ? (() => { const m = lerp3(B2, Cc, .5), L = Math.hypot(Cc[0] - B2[0], Cc[1] - B2[1], Cc[2] - B2[2]), o = [m[0] - A[0], m[1] - A[1], m[2] - A[2]], ol = Math.hypot(...o), R0 = L * 1.1, ctr = add(m, o.map(v => v / ol * R0)), r = R0 + L * .16; return (x, y, z) => Math.hypot(x - ctr[0], y - ctr[1], z - ctr[2]) - r; })() : null;
      const d = (x, y, z) => { let v = triD(x, y, z, A, B2, Cc) - TH; if (cut) v = Math.max(v, -cut(x, y, z)); return v; };
      prims.push(F(b, bb, d, { g: 'wing', c: memC(wr, [f1, f2, f3, at]), k: .006 }));
    };
    mem('w' + k + '3', wr, f1, f2, 1);
    mem('w' + k + '3', wr, f2, f3, 1);
    mem('w' + k + '3', wr, f3, at, 1);
    mem('w' + k + '2', el, wr, at, 0);
    mem('w' + k + '1', sh, el, at, 0);
    /* 앞쪽 막 (어깨와 손목 사이의 얇은 띠) */
    mem('w' + k + '2', sh, el, wr, 0);
  }

  /* ===== 얼음 결정 가시: 등줄기를 따라 한 줄 (어깨가 가장 크다), 꼬리 끝은 결정 뭉치 ===== */
  const iceC = (a, b) => (x, y, z) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, k = clamp(Math.hypot(x - a[0], y - a[1], z - a[2]) / L, 0, 1); return cmix(C_ICE2, C_ICE, sstep(.0, .7, k)); };
  /* 결정 하나: 여섯 모 기둥에 뾰족한 끝 */
  const crystal = (b, base, dir, len, rad, o = {}) => {
    const l = Math.hypot(...dir), W = dir.map(v => v / l); let U = Math.abs(W[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const dv = U[0] * W[0] + U[1] * W[1] + U[2] * W[2]; U = [U[0] - W[0] * dv, U[1] - W[1] * dv, U[2] - W[2] * dv]; const ul = Math.hypot(...U); U = U.map(v => v / ul);
    const V = [W[1] * U[2] - W[2] * U[1], W[2] * U[0] - W[0] * U[2], W[0] * U[1] - W[1] * U[0]], tip = add(base, W.map(v => v * len));
    const d = (x, y, z) => { const px = x - base[0], py = y - base[1], pz = z - base[2], h = px * W[0] + py * W[1] + pz * W[2], a = px * U[0] + py * U[1] + pz * U[2], c = px * V[0] + py * V[1] + pz * V[2];
      const k = clamp((h - len * .62) / (len * .38), 0, 1), r = rad * (1 - k) * (h < 0 ? 1 : 1);
      const ang = Math.atan2(c, a), hexR = Math.hypot(a, c) * Math.cos(((ang % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6);
      return Math.max(hexR - r, -h - .01, h - len) * .8; };
    prims.push(F(b, bbOfPts([base, tip], rad + .02), d, Object.assign({ g: 'ice', c: iceC(base, tip), k: .004 }, o)));
  };
  /* 등줄기 자리: 몸 등 위 한 점 (z 로) */
  const SPN = [[1.0, 1.085, .96, 'head', .045], [.86, .99, .82, 'n3', .06], [.73, .91, .68, 'n2', .07], [.6, .82, .55, 'n1', .08], [.47, .87, .44, 'n1', .095], [.33, .9, .33, 'spine', .13], [.2, .9, .2, 'spine', .15], [.07, .86, .06, 'spine', .14], [-.06, .82, -.06, 'spine', .12],
    [-.19, .79, -.2, 'root', .11], [-.32, .77, -.33, 'root', .1], [-.45, .75, -.46, 'root', .09], [-.6, .69, -.6, 't1', .08], [-.75, .6, -.75, 't1', .07], [-.9, .5, -.9, 't2', .06], [-1.03, .41, -1.03, 't3', .05], [-1.16, .32, -1.16, 't3', .042], [-1.28, .24, -1.28, 't4', .034], [-1.38, .18, -1.38, 't5', .028]];
  for (const [z0, y0, , b, len] of SPN) { const xo = b[0] === 't' ? (z0 < -1.0 ? mix(.05, .35, sstep(-1.0, -1.4, z0)) : 0) : 0;
    crystal(b, [xo, y0 - .035, z0], [0, 1, -.5 - (b[0] === 't' ? .4 : 0)], len * 1.55, len * .3);
    if (len > .055) for (const s of [-1, 1]) crystal(b, [s * len * .4, y0 - .05, z0 + .03], [s * .5, 1, -.6], len * .8, len * .17); }
  /* 꼬리 끝 결정 뭉치 */
  { const tip = TAIL[6], base = TAIL[5]; const dirs = [[1, .35, -.1], [.8, .9, .1], [.9, -.1, .45], [.7, .6, -.6], [1, .1, .2], [.5, 1, -.2], [.6, .2, .8]];
    dirs.forEach((dd, i) => crystal('t6', lerp3(base, tip, .35 + i * .08), dd, .12 + .05 * Math.sin(i * 2.1 + 1), .026 + .006 * (i % 3))); }
  /* 어깨·옆구리에 돋은 작은 서리 결정 */
  { let sd = 17; const rr = (a, b) => a + ((sd = (sd * 16807) % 2147483647) / 2147483647) * (b - a);
    for (let i = 0; i < 26; i++) { const z = rr(-.5, .4), s = rr(0, 1) < .5 ? -1 : 1, th = rr(.5, 1.1), cy = z > .1 ? .63 : .56, R = z > .1 ? .25 : .22, base = [s * Math.sin(th) * R * .92, cy + Math.cos(th) * R * .95, z];
      crystal(z > -.08 ? 'spine' : 'root', base, [s * Math.sin(th), Math.cos(th) + .4, -.3], rr(.025, .05), rr(.007, .012)); } }

  return {
    bones, prims, h: 1.3, size: 4,
    anim: { mouth: [0, .95, 1.38], head: HEAD, wings: WINGS },
    mats: { body: { r: .42 }, wing: { r: .5 }, ice: { r: .06, m: .1, tr: .88 }, horn: { r: .35 }, teeth: { r: .28 }, eye: { r: .1 } },
    gopt: { body: { tris: 42000, loK: .18 }, wing: { tris: 9000, h: .0045, loK: .25 }, ice: { tris: 7000, h: .0035, loK: .3 }, horn: { tris: 2600, h: .003, loK: .3 }, teeth: { tris: 3600, h: .0022, loK: .3 }, eye: { tris: 500, h: .002, noLo: 1 } },
  };
}

module.exports = { hwyrm };
