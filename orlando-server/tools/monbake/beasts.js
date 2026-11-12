/*
 * 네발 몬스터 생김새 (거리 함수로 한 덩어리로 빚는다): 곰·멧돼지·들양
 * 좌표: y 위, z 앞. 발바닥 y=0. 늑대(wolf.js)와 뼈 이름을 맞췄다 (root·neck·head·jaw·t1·t2·fLa…hRc) → 같은 움직임 코드를 쓴다.
 * 무리: body·jaw(털: 꼭짓점 색 = [그늘, 밝은 털, 어두운 털] → 게임이 종류마다 털빛으로 칠한다),
 *       mane(갈기·털 더미: 그늘만, 게임이 갈기 색으로), nose(코·발톱·발굽), eye, mouth(입 안), tooth(이·엄니), horn(뿔)
 */
'use strict';
const { mix, sstep, smax, rgb, fbm, vnoise, E, C, F } = require('./lib');
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* 머리 틀: 정수리 H0 에서 앞(A)·위(U), 숙임 b */
function headFrame(H0, b) {
  const A = [0, -Math.sin(b), Math.cos(b)], U = [0, Math.cos(b), Math.sin(b)];
  const pt = (t, u, x = 0) => add(add(add(H0, scl(A, t)), scl(U, u)), [x, 0, 0]);
  const hl = (x, y, z) => [(y - H0[1]) * A[1] + (z - H0[2]) * A[2], (y - H0[1]) * U[1] + (z - H0[2]) * U[2]];
  return { A, U, pt, hl, HR: [b, 0, 0] };
}
const legBones = (bones, F0, H) => {
  for (const s of [-1, 1]) {
    const q = s < 0 ? 'L' : 'R', m = p => [s * p[0], p[1], p[2]];
    bones.push({ n: 'f' + q + 'a', p: 'root', o: m(F0[0]), tip: m(F0[1]), bw: F0[4] || .07, rad: F0[5] || .14 });
    bones.push({ n: 'f' + q + 'b', p: 'f' + q + 'a', o: m(F0[1]), tip: m(F0[2]), bw: .03, rad: .08 });
    bones.push({ n: 'f' + q + 'c', p: 'f' + q + 'b', o: m(F0[2]), tip: m(F0[3]), bw: .02, rad: .09 });
    bones.push({ n: 'h' + q + 'a', p: 'root', o: m(H[0]), tip: m(H[1]), bw: H[4] || .08, rad: H[5] || .18 });
    bones.push({ n: 'h' + q + 'b', p: 'h' + q + 'a', o: m(H[1]), tip: m(H[2]), bw: .03, rad: .08 });
    bones.push({ n: 'h' + q + 'c', p: 'h' + q + 'b', o: m(H[2]), tip: m(H[3]), bw: .02, rad: .09 });
  }
};
const EYE = (b, ec, dir, r, iris) => E(b, ec, [r, r * .9, r * 1.05], { g: 'eye', c: (x, y, z) => { const f = dot(sub([x, y, z], ec), dir); return f > r * .75 ? rgb(0x0c0806) : rgb(iris); } });

/* ================================ 곰 ================================ */
function bear() {
  const prims = [], P = p => { prims.push(p); return p; };
  const H0 = [0, .6, .7], b = .32, { pt, hl, HR } = headFrame(H0, b);
  /* 털: 북슬한 덩어리 (길게 흐르는 잔물결) */
  const fur = k => (x, y, z) => k * (.65 * vnoise(x * 60, y * 18, z * 60) + .35 * vnoise(x * 140, y * 45, z * 140));
  const coat = (x, y, z, nx, ny, nz) => {
    const s = .93 + .07 * fbm(x * 7, y * 7, z * 7, 3);
    let light = 0, dark = sstep(.34, .16, y) * .9;                        // 다리 아래·발은 짙게
    if (z > .62) { const [t, u] = hl(x, y, z); light = sstep(.1, .19, t) * .9; dark *= 1 - light; }   // 주둥이는 밝게
    light = Math.max(light, sstep(-.3, -.8, ny) * .25 * sstep(.3, .45, y));   // 배 아래 살짝
    dark = Math.max(dark, sstep(.5, .9, ny) * sstep(.7, .85, y) * .25);       // 등 위 살짝 짙게
    return [s, light * s, dark * s];
  };
  const kB = .09, fz = fur(.012), A = { k: kB, c: coat, disp: fz, amp: .015 };
  /* 몸통: 어깨 혹이 솟고, 엉덩이는 낮고 둥글다 */
  P(E('root', [0, .55, .22], [.24, .29, .3], A));                       // 가슴
  P(E('root', [0, .52, -.06], [.26, .27, .34], A));                     // 배
  P(E('root', [0, .55, -.36], [.23, .25, .22], A));                     // 엉덩이
  P(E('root', [0, .74, .2], [.16, .13, .22], A));                       // 어깨 혹
  for (const s of [-1, 1]) {
    P(E('root', [s * .15, .55, .3], [.1, .2, .14], A));                // 어깨 근육
    P(E('root', [s * .14, .48, -.38], [.12, .2, .16], A));              // 넓적다리
  }
  /* 목 */
  P(E('neck', [0, .63, .48], [.17, .19, .16], Object.assign({ rot: [.5, 0, 0] }, A)));
  /* 머리: 넓은 머리통, 짧고 굵은 주둥이, 둥근 귀 */
  const HA = { k: .06, c: coat, rot: HR, disp: fur(.006), amp: .01 };
  P(E('head', pt(.04, 0), [.15, .12, .13], HA));
  for (const s of [-1, 1]) P(E('head', pt(.03, -.03, s * .1), [.07, .08, .08], HA));   // 볼 털
  P(C('head', pt(.1, -.025), pt(.25, -.045), .075, .05, { k: .06, c: coat }));          // 주둥이
  P(E('head', pt(.16, .02), [.05, .03, .09], { k: .05, c: coat, rot: HR }));            // 콧등
  P(E('head', pt(.28, -.035), [.033, .025, .024], { g: 'nose', c: rgb(0x141010), rot: HR }));
  for (const s of [-1, 1]) {
    P(E('head', pt(.06, .055, s * .065), [.03, .02, .04], { k: .04, c: coat, rot: HR }));   // 눈두덩
    const ec = pt(.085, .035, s * .075);
    P(EYE('head', ec, [s * .55, .1, .8], .014, 0x4a2a10));
    const ea = pt(-.04, .11, s * .1);
    P(E('head', ea, [.05, .05, .022], { k: .04, c: coat, rot: [b - .3, s * .25, 0] }));       // 둥근 귀
    P(E('head', add(ea, [0, .005, .016]), [.032, .032, .012], { k: .008, sub: true, rot: [b - .3, s * .25, 0] }));
  }
  /* 아래턱·입 안·이 */
  P(C('jaw', pt(.04, -.1), pt(.24, -.085), .055, .035, { g: 'jaw', k: .04, c: coat }));
  P(E('head', pt(.18, -.07), [.045, .014, .085], { g: 'mouth', c: rgb(0x4a1618), rot: HR }));
  P(E('jaw', pt(.15, -.065), [.035, .012, .075], { g: 'mouth', c: rgb(0x7a3436), rot: HR }));
  const TW = rgb(0xe0d6c0);
  for (const s of [-1, 1]) {
    P(C('head', pt(.235, -.06, s * .035), pt(.24, -.105, s * .032), .011, .002, { g: 'tooth', c: TW }));
    P(C('jaw', pt(.22, -.08, s * .03), pt(.225, -.045, s * .03), .009, .002, { g: 'tooth', c: TW }));
  }
  /* 다리: 굵은 기둥, 앞발은 발가락 넷과 긴 발톱, 뒷발은 발바닥 전체로 딛는다 */
  const CL = rgb(0x1a1612);
  const claws = (bn, x, z, y0) => { for (let i = 0; i < 4; i++) { const tx = x + (i - 1.5) * .035; const zz = z - Math.abs(i - 1.5) * .012; P(C(bn, [tx, y0 + .02, zz], [tx, .006, zz + .045], .012, .003, { g: 'nose', c: CL })); } };
  for (const s of [-1, 1]) {
    const x = s * .15;
    P(C('fLa'.replace('L', s < 0 ? 'L' : 'R'), [x, .48, .3], [x, .2, .33], .1, .078, A));
    P(C('fLb'.replace('L', s < 0 ? 'L' : 'R'), [x, .2, .33], [x, .07, .35], .078, .07, { k: .05, c: coat, disp: fur(.006), amp: .01 }));
    P(E('fLc'.replace('L', s < 0 ? 'L' : 'R'), [x, .045, .39], [.08, .045, .09], { k: .04, c: coat }));
    claws(s < 0 ? 'fLc' : 'fRc', x, .45, .03);
    P(C(s < 0 ? 'hLa' : 'hRa', [x, .4, -.4], [x, .16, -.46], .095, .07, A));
    P(C(s < 0 ? 'hLb' : 'hRb', [x, .16, -.46], [x, .06, -.44], .07, .065, { k: .05, c: coat }));
    P(E(s < 0 ? 'hLc' : 'hRc', [x, .04, -.37], [.07, .04, .12], { k: .04, c: coat }));
    claws(s < 0 ? 'hLc' : 'hRc', x, -.27, .025);
  }
  P(F('fLc', [-1, -.1, -1, 1, .03, 1], (x, y) => -y, { inter: true, c: coat }));   // 발바닥 평평
  /* 꼬리 (짧은 뭉치) */
  P(E('t1', [0, .64, -.56], [.05, .05, .05], { k: .05, c: coat, disp: fur(.008), amp: .01 }));
  const bones = [
    { n: 'root', o: [0, .55, 0], tip: [0, .55, .3] },
    { n: 'neck', p: 'root', o: [0, .64, .36], tip: H0, bw: .09, rad: .3 },
    { n: 'head', p: 'neck', o: H0, tip: pt(.28, 0), bw: .06, rad: .22 },
    { n: 'jaw', p: 'head', o: pt(.04, -.09), tip: pt(.24, -.09) },
    { n: 't1', p: 'root', o: [0, .64, -.52], tip: [0, .6, -.6], bw: .03, rad: .08 },
    { n: 't2', p: 't1', o: [0, .6, -.6], tip: [0, .58, -.62] },
  ];
  legBones(bones, [[.15, .5, .3], [.15, .2, .33], [.15, .06, .35], [.15, .03, .42], .1, .2], [[.14, .46, -.38], [.14, .16, -.46], [.14, .06, -.44], [.14, .03, -.32], .11, .22]);
  return {
    prims, bones, h: .95, size: 1.45, anim: { H0, b, leg: .55, kind: 'bear', moon: [0, .5, .5] },
    mats: { body: { r: .95 }, jaw: { r: .95 }, nose: { r: .4 }, eye: { r: .15 }, mouth: { r: .5 }, tooth: { r: .35 } },
    gopt: { body: { tris: 10000, h: .0055, loK: .16 }, jaw: { tris: 900, h: .0045, loK: .3 }, nose: { tris: 700, h: .0025, loK: .3 }, eye: { tris: 120, h: .002, noLo: 1 }, mouth: { tris: 200, h: .003, noLo: 1 }, tooth: { tris: 200, h: .002, noLo: 1 } }
  };
}

/* ================================ 멧돼지 ================================ */
function boar() {
  const prims = [], P = p => { prims.push(p); return p; };
  const H0 = [0, .54, .54], b = .34, { pt, hl, HR } = headFrame(H0, b);
  const bristle = k => (x, y, z) => k * (.6 * vnoise(x * 120, y * 30, z * 50) + .4 * vnoise(x * 260, y * 70, z * 110));
  const coat = (x, y, z, nx, ny, nz) => {
    const s = .92 + .08 * fbm(x * 9, y * 9, z * 9, 3);
    let light = sstep(-.2, -.8, ny) * .5 * sstep(.25, .4, y);                 // 배
    let dark = sstep(.3, .14, y) * .9;                                         // 다리 아래
    dark = Math.max(dark, sstep(.4, .9, ny) * sstep(.62, .75, y) * .7);       // 등줄기
    if (z > .5) { const [t] = hl(x, y, z); dark = Math.max(dark, sstep(.15, .3, t) * .5); }   // 주둥이 끝
    return [s, light * s, dark * s];
  };
  const A = { k: .09, c: coat, disp: bristle(.006), amp: .01 };
  /* 몸통: 앞이 높고 두툼한 쐐기 */
  P(E('root', [0, .5, .18], [.2, .24, .3], A));
  P(E('root', [0, .47, -.1], [.19, .2, .32], A));
  P(E('root', [0, .46, -.34], [.17, .19, .19], A));
  P(E('root', [0, .64, .16], [.11, .1, .26], A));                       // 어깨 혹
  for (const s of [-1, 1]) { P(E('root', [s * .12, .44, .22], [.09, .17, .12], A)); P(E('root', [s * .11, .4, -.34], [.1, .17, .13], A)); }
  P(E('neck', [0, .52, .42], [.17, .2, .16], A));
  /* 머리: 길쭉한 쐐기, 끝에 납작한 코판 */
  const HA = { k: .07, c: coat, rot: HR };
  P(C('head', pt(-.02, -.01), pt(.36, -.05), .13, .06, { k: .07, c: coat, disp: bristle(.004), amp: .008 }));
  P(E('head', pt(.02, .02), [.14, .11, .13], HA));
  P(E('head', pt(.17, .02), [.07, .05, .14], HA));   // 콧등
  for (const s of [-1, 1]) P(E('head', pt(.07, -.05, s * .08), [.06, .07, .09], HA));   // 볼
  P(E('head', pt(.4, -.055), [.06, .052, .022], { g: 'nose', c: (x, y, z) => { const [t, u] = hl(x, y, z); const nn = Math.min(Math.hypot(x - .024, u + .045), Math.hypot(x + .024, u + .045)); return nn < .013 ? rgb(0x1a0e0c) : rgb(0x6a4a44); }, rot: HR }));
  for (const s of [-1, 1]) {
    P(E('head', pt(.07, .05, s * .07), [.03, .018, .035], { k: .03, c: coat, rot: HR }));   // 눈두덩
    P(EYE('head', pt(.08, .035, s * .082), [s * .7, .1, .7], .011, 0x3a1a0a));
    const ea = pt(-.08, .1, s * .07);
    P(E('head', ea, [.035, .075, .02], { k: .03, c: coat, rot: [b - .6, s * .5, s * -.4] }));   // 쫑긋한 귀
  }
  /* 아래턱·입 안·엄니 */
  P(C('jaw', pt(.04, -.1), pt(.32, -.095), .06, .035, { g: 'jaw', k: .04, c: coat }));
  P(E('head', pt(.22, -.085), [.04, .012, .1], { g: 'mouth', c: rgb(0x4a1a1a), rot: HR }));
  P(E('jaw', pt(.2, -.078), [.03, .011, .09], { g: 'mouth', c: rgb(0x7a3a38), rot: HR }));
  const IV = (x, y, z) => { const v = sstep(.42, .55, y); return [mix(.86, .96, v), mix(.8, .93, v), mix(.66, .84, v)]; };
  for (const s of [-1, 1]) {
    /* 엄니: 아래턱 옆에서 나와 위·바깥으로 휜다 */
    const p0 = pt(.27, -.1, s * .045), p1 = pt(.33, -.05, s * .075), p2 = pt(.32, .03, s * .1), p3 = pt(.27, .075, s * .105);
    P(C('jaw', p0, p1, .019, .016, { g: 'tooth', c: IV }));
    P(C('jaw', p1, p2, .016, .011, { g: 'tooth', c: IV, k: .01 }));
    P(C('jaw', p2, p3, .011, .002, { g: 'tooth', c: IV, k: .008 }));
    P(C('head', pt(.33, -.075, s * .05), pt(.35, -.04, s * .07), .011, .003, { g: 'tooth', c: IV }));   // 위 엄니
  }
  /* 등 갈기: 목에서 등까지 솟은 뻣뻣한 털 */
  const mz = (x, y, z) => .5 + .5 * vnoise(x * 300, y * 40, z * 200);
  for (let i = 0; i < 6; i++) {
    const z = .5 - i * .14, y = .72 - Math.max(0, i - 2) * .03 + (i === 0 ? -.03 : 0), h = .06 - i * .006;
    P(E(i === 0 ? 'neck' : 'root', [0, y, z], [.03, h, .09], { g: 'mane', k: .05, c: (x, yy, zz) => { const v = .75 + .3 * mz(x, yy, zz); return [v, v, v]; }, disp: (x, yy, zz) => -.012 * Math.abs(Math.sin(zz * 260 + x * 90)) - .006 * vnoise(x * 400, yy * 80, zz * 300), amp: .004 }));
  }
  /* 다리: 짧고 단단, 갈라진 발굽 */
  const HF = rgb(0x221a16);
  const hoof = (bn, x, z) => { for (const t of [-1, 1]) P(E(bn, [x + t * .017, .025, z], [.018, .026, .03], { g: 'nose', c: HF, k: .005 })); };
  for (const s of [-1, 1]) {
    const x = s * .12, q = s < 0 ? 'L' : 'R';
    P(C('f' + q + 'a', [x, .4, .25], [x, .16, .27], .07, .042, A));
    P(C('f' + q + 'b', [x, .16, .27], [x, .05, .28], .04, .03, { k: .03, c: coat }));
    hoof('f' + q + 'c', x, .29);
    P(C('h' + q + 'a', [x, .34, -.33], [x, .16, -.38], .075, .042, A));
    P(C('h' + q + 'b', [x, .16, -.38], [x, .05, -.36], .04, .03, { k: .03, c: coat }));
    hoof('h' + q + 'c', x, -.35);
  }
  P(C('t1', [0, .52, -.5], [0, .45, -.56], .018, .012, { k: .02, c: coat }));
  P(C('t2', [0, .45, -.56], [0, .36, -.57], .012, .008, { k: .01, c: coat }));
  P(E('t2', [0, .33, -.57], [.02, .04, .02], { g: 'mane', c: [.8, .8, .8], disp: bristle(.006), amp: .006 }));
  const bones = [
    { n: 'root', o: [0, .48, 0], tip: [0, .48, .3] },
    { n: 'neck', p: 'root', o: [0, .55, .3], tip: H0, bw: .08, rad: .3 },
    { n: 'head', p: 'neck', o: H0, tip: pt(.3, 0), bw: .05, rad: .2 },
    { n: 'jaw', p: 'head', o: pt(.04, -.1), tip: pt(.32, -.09) },
    { n: 't1', p: 'root', o: [0, .52, -.5], tip: [0, .45, -.56], bw: .02, rad: .05 },
    { n: 't2', p: 't1', o: [0, .45, -.56], tip: [0, .33, -.57], bw: .02, rad: .05 },
  ];
  legBones(bones, [[.12, .42, .25], [.12, .16, .27], [.12, .05, .28], [.12, .02, .32], .07, .15], [[.12, .4, -.32], [.12, .16, -.38], [.12, .05, -.36], [.12, .02, -.32], .08, .17]);
  return {
    prims, bones, h: .8, size: 1.55, anim: { H0, b, leg: .45, kind: 'boar' },
    mats: { body: { r: .92 }, jaw: { r: .92 }, mane: { r: .95 }, nose: { r: .5 }, eye: { r: .15 }, mouth: { r: .5 }, tooth: { r: .35 } },
    gopt: { body: { tris: 9000, h: .005, loK: .17 }, jaw: { tris: 800, h: .004, loK: .3 }, mane: { tris: 1500, h: .0035, loK: .25 }, nose: { tris: 500, h: .0025, loK: .3 }, eye: { tris: 100, h: .002, noLo: 1 }, mouth: { tris: 160, h: .003, noLo: 1 }, tooth: { tris: 600, h: .0025, loK: .4 } }
  };
}

/* ================================ 들양 (큰 뿔 숫양) ================================ */
function ram() {
  const prims = [], P = p => { prims.push(p); return p; };
  const H0 = [0, .9, .56], b = .95, { pt, hl, HR } = headFrame(H0, b);
  /* 털: 곱슬 양털 덩어리 */
  const wool = k => (x, y, z) => -k * (.5 + .5 * vnoise(x * 38, y * 38, z * 38)) - k * .25 * (.5 + .5 * vnoise(x * 95, y * 95, z * 95));
  /* 색: 양털=그늘, 얼굴·다리(짧은 털)=밝은 털(c2), 발목·코=어두운 털 */
  const coat = (x, y, z, nx, ny, nz) => {
    const s = .9 + .1 * fbm(x * 12, y * 12, z * 12, 2);
    return [s, 0, 0];
  };
  const hair = (x, y, z) => { const s = .95 + .05 * fbm(x * 20, y * 20, z * 20, 2); return [s, s * (y < .14 ? .2 : 1), s * sstep(.14, .06, y) * .9]; };
  const face = (x, y, z) => { const [t] = hl(x, y, z); const s = .95; return [s, s, s * sstep(.17, .26, t) * .6]; };
  const W = { k: .08, c: coat, disp: wool(.02), amp: .025 };
  P(E('root', [0, .64, .14], [.21, .23, .28], W));
  P(E('root', [0, .63, -.14], [.22, .23, .3], W));
  P(E('root', [0, .62, -.32], [.19, .21, .18], W));
  P(C('neck', [0, .66, .3], [0, .84, .46], .14, .1, W));
  /* 머리: 길쭉한 얼굴, 볼록한 코등 */
  P(C('head', pt(-.02, -.01), pt(.21, -.03), .08, .045, { k: .05, c: face }));
  P(E('head', pt(.02, .01), [.085, .075, .08], { k: .05, c: face, rot: HR }));
  P(E('head', pt(.12, .025), [.04, .03, .1], { k: .04, c: face, rot: HR }));    // 코등
  P(E('head', pt(-.04, .02), [.08, .07, .07], { k: .06, c: coat, rot: HR, disp: wool(.01), amp: .012 }));   // 정수리 털
  P(C('jaw', pt(.03, -.07), pt(.2, -.065), .045, .028, { g: 'jaw', k: .03, c: face }));
  P(E('head', pt(.15, -.055), [.03, .01, .06], { g: 'mouth', c: rgb(0x4a2020), rot: HR }));
  P(E('jaw', pt(.13, -.05), [.024, .009, .05], { g: 'mouth', c: rgb(0x7a4040), rot: HR }));
  P(E('head', pt(.23, -.025), [.035, .028, .018], { g: 'nose', c: (x, y, z) => { const [, u] = hl(x, y, z); return Math.min(Math.hypot(x - .016, u + .015), Math.hypot(x + .016, u + .015)) < .008 ? rgb(0x100a08) : rgb(0x3a2e2a); }, rot: HR }));
  for (const s of [-1, 1]) {
    P(E('head', pt(.05, .035, s * .05), [.022, .015, .03], { k: .02, c: face, rot: HR }));
    /* 눈: 가로로 긴 눈동자 */
    const ec = pt(.055, .02, s * .066), dir = [s * .85, .05, .5];
    P(E('head', ec, [.014, .013, .015], { g: 'eye', c: (x, y, z) => { const r = sub([x, y, z], ec), f = dot(r, dir); return f > .009 && Math.abs(r[1]) < .004 ? rgb(0x0a0806) : rgb(0xb8902a); } }));
    P(E('head', pt(.0, .0, s * .085), [.05, .016, .022], { k: .02, c: face, rot: [0, s * .9, s * -.35] }));   // 옆으로 난 귀
    /* 뿔: 머리 위에서 뒤로 넘어가 귀 둘레로 한 바퀴 말린다. 마디 골이 진다 */
    const c0 = pt(-.06, -.02, s * .1), R0 = .1, pts = [], rs = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, a = Math.PI * .55 + u * Math.PI * 1.75, r = R0 * (1 - .52 * u);
      pts.push([c0[0] + s * (.01 + u * .07), c0[1] + Math.sin(a) * r * 1.05, c0[2] + Math.cos(a) * r * -1]);
      rs.push(mix(.042, .012, Math.pow(u, .9)));
    }
    pts[0] = pt(-.0, .055, s * .045);
    const HC = (x, y, z) => { const v = .82 + .18 * Math.abs(Math.sin((y * 3 + z * 2) * 60)); return [.78 * v, .7 * v, .55 * v]; };
    for (let i = 0; i < pts.length - 1; i++) P(C('head', pts[i], pts[i + 1], rs[i], rs[i + 1], { g: 'horn', c: HC, k: i ? .012 : 0, disp: (x, y, z) => .003 * Math.sin((x * 1.3 + y * 2.1 + z * 1.7) * 150), amp: .004 }));
  }
  /* 다리: 가늘고 곧다, 무릎 아래는 짧은 털 */
  const HF = rgb(0x2a2420);
  const hoof = (bn, x, z) => { for (const t of [-1, 1]) P(E(bn, [x + t * .012, .022, z], [.013, .022, .022], { g: 'nose', c: HF, k: .004 })); };
  for (const s of [-1, 1]) {
    const x = s * .1, q = s < 0 ? 'L' : 'R';
    P(C('f' + q + 'a', [x, .5, .26], [x, .38, .27], .07, .05, W));
    P(C('f' + q + 'a', [x, .4, .27], [x, .17, .28], .036, .028, { k: .03, c: hair }));
    P(E('f' + q + 'a', [x, .2, .28], [.03, .03, .03], { k: .02, c: hair }));
    P(C('f' + q + 'b', [x, .18, .28], [x, .05, .29], .025, .022, { k: .02, c: hair }));
    hoof('f' + q + 'c', x, .3);
    P(E('h' + q + 'a', [x, .52, -.3], [.08, .14, .11], W));
    P(C('h' + q + 'a', [x, .44, -.3], [x, .22, -.38], .045, .03, { k: .03, c: hair }));
    P(C('h' + q + 'b', [x, .22, -.38], [x, .05, -.35], .025, .022, { k: .02, c: hair }));
    hoof('h' + q + 'c', x, -.34);
  }
  P(E('t1', [0, .64, -.5], [.05, .07, .05], { k: .05, c: coat, disp: wool(.01), amp: .012 }));
  const bones = [
    { n: 'root', o: [0, .6, 0], tip: [0, .6, .3] },
    { n: 'neck', p: 'root', o: [0, .66, .28], tip: H0, bw: .07, rad: .26 },
    { n: 'head', p: 'neck', o: H0, tip: pt(.23, 0), bw: .04, rad: .16 },
    { n: 'jaw', p: 'head', o: pt(.03, -.07), tip: pt(.2, -.065) },
    { n: 't1', p: 'root', o: [0, .66, -.46], tip: [0, .6, -.54], bw: .03, rad: .08 },
    { n: 't2', p: 't1', o: [0, .6, -.54], tip: [0, .58, -.56] },
  ];
  legBones(bones, [[.1, .5, .27], [.1, .18, .28], [.1, .05, .29], [.1, .02, .32], .07, .14], [[.1, .54, -.3], [.1, .22, -.38], [.1, .05, -.35], [.1, .02, -.3], .07, .16]);
  return {
    prims, bones, h: 1.05, size: 1.5, anim: { H0, b, leg: .5, kind: 'ram' },
    mats: { body: { r: .97 }, jaw: { r: .9 }, nose: { r: .45 }, eye: { r: .15 }, mouth: { r: .5 }, horn: { r: .55 } },
    gopt: { body: { tris: 9000, h: .0055, loK: .17, aoK: 1.6 }, jaw: { tris: 500, h: .004, loK: .3 }, nose: { tris: 300, h: .0025, loK: .3 }, eye: { tris: 100, h: .002, noLo: 1 }, mouth: { tris: 120, h: .003, noLo: 1 }, horn: { tris: 2400, h: .0035, loK: .25 } }
  };
}

module.exports = { TYPES: { qbear: bear, qboar: boar, qram: ram, qwolf: () => require('./wolf').wolf({ beast: true }), qhound: () => require('./wolf').wolf({ beast: true, hound: true }) } };
