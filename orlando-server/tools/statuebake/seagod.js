/*
 * 엑시즈 중앙 광장 분수 꼭대기 넵투누스 석상 (거리 함수로 한 덩어리로 빚는다)
 * 좌표는 게임의 buildSeaGod 과 같다: 발바닥 y=0, +z 가 얼굴이 보는 쪽, -x 가 석상의 오른쪽(삼지창 든 손).
 * 자세: 오른다리에 몸무게를 싣고 왼발은 바위에 올린다. 오른손은 높이 세운 삼지창을 쥐고, 왼손은 앞으로 내밀어 물결을 잠재운다.
 * 무리: marble(몸·머리·옷·망토·돌고래), rock(받침 바위), gold(왕관·삼지창·걸쇠)
 */
'use strict';
const { clamp, mix, sstep, smin, rgb, cmix, csc, vnoise, fbm, rot, E, C, L, B, T: Ring, F, makeField, capD, ellD } = require('../monbake/lib');

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const PI = Math.PI;

/* 매끈한 곡선(카트멀-롬) 위의 점들 */
function crv(pts, n) {
  const out = [];
  const P = i => pts[clamp(i, 0, pts.length - 1)];
  for (let s = 0; s <= n; s++) {
    const u = s / n * (pts.length - 1), i = Math.min(Math.floor(u), pts.length - 2), t = u - i;
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t2 = t * t, t3 = t2 * t;
    out.push([0, 1, 2].map(a => .5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
  }
  return out;
}
/* 곡선을 따라 굵기가 바뀌는 관 (rf: 0~1 → 반지름). 마디끼리는 그냥 이어(부풀지 않게) 도형 하나로 만든다 */
function tube(b, pts, n, rf, o = {}) {
  const P = crv(pts, n), rs = P.map((_, i) => rf(i / n)), S = [];
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[i][a] - rs[i]); hi[a] = Math.max(hi[a], P[i][a] + rs[i]); }
  for (let i = 0; i < n; i++) S.push([...P[i], ...P[i + 1], rs[i], rs[i + 1]]);
  const d = (x, y, z) => { let m = 1e9; for (const q of S) { const v = capD(x, y, z, q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7]); if (v < m) m = v; } return m; };
  return [F(b, [...lo, ...hi], d, o)];
}
/* 여러 도형을 하나로 묶는다 (안에서 따로 이어 붙이고, 밖에서는 k 로 이어 붙인다). c·e: 묶음을 옮기고 돌리기 */
function grp(b, prims, o = {}) {
  const f = makeField(prims);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of prims) if (!p.sub && !p.inter) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.bb[a]); hi[a] = Math.max(hi[a], p.bb[a + 3]); }
  const po = { k: o.k || 0, c: o.col || prims[0].c };
  if (!o.at) return F(b, [...lo, ...hi], f, po);
  const R = rot(...(o.e || [0, 0, 0])), c = o.at, sc = o.s || 1;
  for (let a = 0; a < 3; a++) { lo[a] *= sc; hi[a] *= sc; }
  const bl = [1e9, 1e9, 1e9], bh = [-1e9, -1e9, -1e9];
  for (let m = 0; m < 8; m++) {
    const p = [m & 1 ? hi[0] : lo[0], m & 2 ? hi[1] : lo[1], m & 4 ? hi[2] : lo[2]];
    const w = [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + c[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + c[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + c[2]];
    for (let a = 0; a < 3; a++) { bl[a] = Math.min(bl[a], w[a]); bh[a] = Math.max(bh[a], w[a]); }
  }
  const d = (x, y, z) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2]; return f((R[0] * dx + R[3] * dy + R[6] * dz) / sc, (R[1] * dx + R[4] * dy + R[7] * dz) / sc, (R[2] * dx + R[5] * dy + R[8] * dz) / sc) * sc; };
  return F(b, [...bl, ...bh], d, po);
}
/* 묶음 좌표 → 세상 좌표 (grp 의 c·e 와 같은 옮김) */
const xf = (c, e) => { const R = rot(...e); return p => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + c[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + c[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + c[2]]; };

/* ---------- 색 ---------- */
const MARB = rgb(0xf4efe6), DRAPE = rgb(0xefe6d6), ROCK = rgb(0xcfc6b4), GOLD = rgb(0xe0b850);
const marble = (base, k = 1) => (x, y, z) => {   // 엷은 잿빛 결이 지나가는 대리석
  const v = Math.abs(Math.sin((x * 3.1 + y * 1.7 + z * 2.3) * 6 + fbm(x * 4, y * 4, z * 4, 4) * 7));
  const vein = Math.pow(1 - v, 14) * .13 * k, mott = fbm(x * 11, y * 11, z * 11, 3) * .035;
  return csc(base, 1 - vein + mott);
};
const cM = marble(MARB), cD = marble(DRAPE, .6), cR = (x, y, z) => csc(ROCK, 1 + fbm(x * 9, y * 9, z * 9, 3) * .18), cG = GOLD;

/* ===================================================================
   몸
   =================================================================== */
function body() {
  const P = [], c = cM;
  /* 골반·배·가슴통: 허리는 잘록하고 가슴은 두껍게. 오른다리에 무게가 실려 골반 오른쪽이 조금 높다 */
  P.push(E('root', [0, 1.57, -.01], [.185, .135, .135], { c, rot: [0, 0, -.06] }));
  P.push(E('root', [0, 1.83, .01], [.158, .2, .118], { c, k: .08 }));
  P.push(E('root', [0, 2.12, -.01], [.205, .25, .148], { c, k: .08, rot: [-.06, 0, .04] }));
  P.push(E('root', [0, 2.34, -.035], [.25, .1, .12], { c, k: .07 }));   /* 어깨 너비 */
  for (const s of [-1, 1]) {
    P.push(E('root', [s * .1, 2.255, .098], [.128, .078, .05], { c, k: .05, rot: [-.1, s * .3, s * .2] }));   /* 큰가슴근 */
    P.push(E('root', [s * .135, 1.8, .02], [.062, .14, .085], { c, k: .05, rot: [0, 0, -s * .18] }));   /* 배 빗근 */
    P.push(E('root', [s * .158, 1.645, .03], [.045, .06, .07], { c, k: .05, rot: [0, 0, -s * .5] }));   /* 엉덩뼈 위 */
    P.push(E('root', [s * .14, 2.12, -.085], [.09, .2, .07], { c, k: .06, rot: [0, 0, -s * .12] }));   /* 넓은 등근 */
    P.push(E('root', [s * .1, 2.42, -.06], [.11, .05, .07], { c, k: .05, rot: [0, 0, s * .38] }));   /* 등세모근 */
    for (let r = 0; r < 3; r++) P.push(E('root', [s * .168 - s * r * .006, 2.08 - r * .055, .09 - r * .006], [.02, .022, .016], { c, k: .03, rot: [0, 0, s * .5] }));   /* 톱니근 */
    P.push(E('root', [s * .085, 1.5, -.115], [.105, .12, .07], { c, k: .06 }));   /* 엉덩이 */
    P.push(C('root', [s * .045, 2.36, .095], [s * .2, 2.4, .06], .016, .02, { c, k: .03 }));   /* 빗장뼈 */
  }
  /* 배 근육 여섯 + 아랫배 + 배꼽 */
  for (let r = 0; r < 3; r++) for (const s of [-1, 1]) P.push(E('root', [s * .043, 1.885 + r * .072, .108 + r * .009], [.04, .032, .02], { c, k: .028 }));
  P.push(E('root', [0, 1.775, .104], [.075, .045, .02], { c, k: .035 }));
  P.push(E('root', [0, 1.84, .127], [.009, .012, .01], { c, sub: true, k: .008 }));
  P.push(C('root', [0, 2.17, .145], [0, 2.32, .14], .012, .012, { c, sub: true, k: .02 }));   /* 가슴 가운데 골 */
  /* 목: 목통 + 비스듬한 목빗근 둘 */
  P.push(C('root', [0, 2.38, -.03], [0, 2.64, .0], .088, .074, { c, k: .05 }));
  for (const s of [-1, 1]) P.push(C('root', [s * .055, 2.62, -.02], [s * .03, 2.42, .075], .025, .02, { c, k: .03 }));
  return P;
}

/* ---------- 팔 ---------- */
function arm(S, El, W, s) {
  const P = [], c = cM, up = norm(sub(El, S)), fo = norm(sub(W, El));
  P.push(E('root', add(S, [s * .03, .0, 0]), [.105, .1, .1], { c, k: .05 }));   /* 어깨세모근 */
  P.push(C('root', S, El, .085, .06, { c, k: .04 }));
  /* 두갈래근·세갈래근: 팔 앞뒤로 */
  const side = norm(cross(up, [0, 0, 1])), fr = norm(cross(side, up));
  P.push(E('root', add(lerp3(S, El, .52), scl(fr, .03)), [.058, len(sub(El, S)) * .3, .058], { c, k: .04, rot: eulerFromY(up) }));
  P.push(E('root', add(lerp3(S, El, .42), scl(fr, -.035)), [.056, len(sub(El, S)) * .33, .056], { c, k: .04, rot: eulerFromY(up) }));
  P.push(E('root', El, [.06, .06, .06], { c, k: .03 }));
  P.push(C('root', El, W, .066, .042, { c, k: .03 }));
  P.push(E('root', lerp3(El, W, .27), [.06, len(sub(W, El)) * .24, .05], { c, k: .04, rot: eulerFromY(fo) }));   /* 아래팔 위쪽 살 */
  P.push(E('root', W, [.045, .038, .03], { c, k: .025, rot: eulerFromY(fo) }));
  return P;
}
/* y축을 d 로 돌리는 오일러 (XYZ) */
function eulerFromY(d) {
  d = norm(d);
  // y축을 d 로: 먼저 x 둘레로 기울이고 z 둘레로 돌린다 → R=Rz*Ry*Rx 에서 ry=0
  const rx = Math.atan2(d[2], Math.hypot(d[0], d[1])), rz = Math.atan2(-d[0], d[1]);
  return [rx, 0, rz];
}

/* 펴서 아래로 향한 왼손 (손 좌표: 손목이 원점, +z 손끝 쪽, +y 손등, +x 엄지 반대쪽) */
function openHand() {
  const P = [], c = cM;
  P.push(B('root', [0, 0, .055], [.038, .013, .05], .012, { c, k: .02 }));
  P.push(E('root', [-.032, -.004, .04], [.02, .016, .035], { c, k: .02 }));   /* 엄지 두덩 */
  const fl = [.075, .088, .083, .065], fx = [.028, .009, -.01, -.028];
  for (let i = 0; i < 4; i++) {
    const sp = (i - 1.5) * .07, a = [fx[i], .002, .1], l = fl[i];
    const p1 = add(a, [Math.sin(sp) * l * .42, -l * .06, Math.cos(sp) * l * .42]);
    const p2 = add(p1, [Math.sin(sp) * l * .32, -l * .14, Math.cos(sp) * l * .3]);
    const p3 = add(p2, [Math.sin(sp) * l * .24, -l * .16, Math.cos(sp) * l * .2]);
    P.push(...L('root', [a, p1, p2, p3], [.0125, .011, .0095, .008], { c, k: .012, kj: 0 }));
  }
  P.push(...L('root', [[-.035, -.006, .03], [-.06, -.012, .07], [-.072, -.016, .105], [-.078, -.02, .13]], [.014, .012, .01, .0085], { c, k: .014, kj: 0 }));   /* 엄지 */
  return P;
}
/* 자루를 쥔 오른손 (손 좌표: 자루가 y축, 원점이 주먹 가운데) */
function fist() {
  const P = [], c = cM;
  P.push(E('root', [.0, 0, -.04], [.04, .055, .03], { c }));   /* 손바닥 쪽 */
  for (let k = 0; k < 4; k++) {   /* 자루를 감은 손가락: 반쯤 감은 고리 */
    const y = -.042 + k * .028, r = .027;
    const pts = []; for (let i = 0; i <= 6; i++) { const a = -PI * .95 + i / 6 * PI * 1.25; pts.push([Math.cos(a) * r * 1.1, y + (i * .0007), Math.sin(a) * r]); }
    P.push(...L('root', pts, pts.map((_, i) => .0125 - i * .0005), { c, k: .01, kj: 0 }));
  }
  P.push(...L('root', [[-.025, .03, -.035], [-.03, .05, -.005], [-.012, .058, .022], [.008, .056, .03]], [.015, .013, .011, .009], { c, k: .012 }));   /* 엄지 */
  return P;
}

/* ---------- 다리 ---------- */
function leg(hip, knee, ank, toe, s) {
  const P = [], c = cM, th = norm(sub(knee, hip)), cf = norm(sub(ank, knee));
  P.push(C('root', hip, knee, .135, .078, { c, k: .07 }));
  const lt = len(sub(knee, hip)), lc = len(sub(ank, knee));
  P.push(E('root', add(lerp3(hip, knee, .42), [s * .01, 0, .035]), [.085, lt * .36, .07], { c, k: .05, rot: eulerFromY(th) }));   /* 넙다리 앞 */
  P.push(E('root', add(lerp3(hip, knee, .82), [-s * .035, 0, .025]), [.045, lt * .13, .04], { c, k: .04, rot: eulerFromY(th) }));   /* 안쪽 넓은근 (무릎 위 물방울) */
  P.push(E('root', add(lerp3(hip, knee, .5), [s * .045, 0, -.01]), [.05, lt * .34, .06], { c, k: .05, rot: eulerFromY(th) }));   /* 바깥 넓은근 */
  P.push(E('root', add(lerp3(hip, knee, .45), [0, 0, -.045]), [.07, lt * .33, .06], { c, k: .05, rot: eulerFromY(th) }));   /* 넙다리 뒤 */
  P.push(E('root', add(knee, scl(norm(cross([1, 0, 0], cf)), -.0)), [.062, .064, .06], { c, k: .03 }));
  P.push(E('root', add(knee, [0, -.0, .052]), [.034, .04, .022], { c, k: .025, rot: eulerFromY(cf) }));   /* 무릎뼈 */
  P.push(C('root', knee, ank, .072, .045, { c, k: .03 }));
  P.push(E('root', add(lerp3(knee, ank, .3), [-s * .012, 0, -.04]), [.058, lc * .22, .05], { c, k: .045, rot: eulerFromY(cf) }));   /* 장딴지 */
  P.push(E('root', add(lerp3(knee, ank, .3), [s * .02, 0, -.035]), [.05, lc * .19, .045], { c, k: .04, rot: eulerFromY(cf) }));
  P.push(C('root', add(lerp3(knee, ank, .1), [0, 0, .045]), add(lerp3(knee, ank, .8), [0, 0, .03]), .022, .016, { c, k: .03 }));   /* 정강이 뼈 */
  for (const q of [-1, 1]) P.push(E('root', add(ank, [q * .028, .0, -.005]), [.017, .02, .017], { c, k: .015 }));   /* 복사뼈 */
  P.push(C('root', ank, add(ank, [0, -.05, -.04]), .04, .035, { c, k: .02 }));   /* 뒤꿈치 */
  /* 발: 발등 + 발가락 다섯 */
  const fd = norm([toe[0] - ank[0], 0, toe[2] - ank[2]]), fs = [fd[2], 0, -fd[0]];
  const base = [ank[0], toe[1], ank[2]];
  P.push(C('root', add(base, [0, .035, -.02]), add(toe, scl(fd, -.05)), .045, .03, { c, k: .03 }));
  P.push(E('root', add(lerp3(base, toe, .55), [0, .012, 0]), [.045, .024, .07], { c, k: .03, rot: [0, Math.atan2(fd[0], fd[2]), 0] }));
  const tl = [.034, .028, .024, .021, .018], tr = [.0135, .0105, .0098, .009, .0082];
  for (let i = 0; i < 5; i++) {
    const off = (i - 1.3) * .0215 * s, a = add(add(toe, scl(fs, off)), scl(fd, -.042 - Math.abs(i - .5) * .006));
    const b = add(a, add(scl(fd, tl[i]), [0, -.004, 0]));
    P.push(C('root', a, b, tr[i], tr[i] * .85, { c, k: .006 }));
  }
  return P;
}

/* ===================================================================
   머리 (머리 좌표: 원점=머리 가운데, +z 얼굴, +y 위)
   =================================================================== */
function head() {
  const P = [], c = cM;
  P.push(E('root', [0, .03, -.012], [.112, .128, .132], { c }));   /* 머리통 */
  P.push(E('root', [0, -.055, .03], [.084, .098, .092], { c, k: .05 }));   /* 얼굴·턱 */
  P.push(E('root', [0, .042, .086], [.088, .026, .036], { c, k: .03 }));   /* 이마 아래 눈썹 뼈 */
  for (const s of [-1, 1]) {
    P.push(E('root', [s * .04, .014, .116], [.024, .014, .024], { c, sub: true, k: .012 }));   /* 눈 우묵 */
    P.push(E('root', [s * .04, .012, .103], [.019, .016, .016], { c, k: .005 }));   /* 눈알 */
    P.push(C('root', [s * .023, .023, .113], [s * .058, .02, .104], .0065, .005, { c, k: .006 }));   /* 윗눈꺼풀 */
    P.push(C('root', [s * .025, .003, .11], [s * .056, .004, .102], .004, .0035, { c, k: .006 }));   /* 아랫눈꺼풀 */
    P.push(C('root', [s * .012, .04, .121], [s * .066, .037, .104], .008, .006, { c, k: .018 }));   /* 눈썹 결 (찌푸림) */
    P.push(E('root', [s * .062, -.012, .082], [.028, .022, .03], { c, k: .025 }));   /* 광대 */
    P.push(E('root', [s * .015, -.031, .137], [.011, .009, .011], { c, k: .008 }));   /* 콧방울 */
    P.push(E('root', [s * .118, .0, -.005], [.016, .03, .022], { c, k: .015 }));   /* 귀 */
  }
  P.push(C('root', [0, .04, .115], [0, -.02, .148], .011, .014, { c, k: .015 }));   /* 콧등 */
  P.push(E('root', [0, -.027, .146], [.014, .012, .013], { c, k: .01 }));   /* 코끝 */
  P.push(E('root', [0, -.075, .118], [.024, .009, .011], { c, k: .008 }));   /* 아랫입술 */
  P.push(E('root', [0, -.064, .112], [.04, .022, .024], { c, k: .012 }));   /* 입 둘레 (콧수염 밑 빈 곳을 메운다) */
  /* 콧수염: 코 밑에서 입꼬리를 덮고 수염으로 흘러든다 */
  for (const s of [-1, 1]) {
    P.push(...tube('root', [[s * .003, -.044, .15], [s * .03, -.051, .146], [s * .056, -.068, .128], [s * .066, -.095, .105], [s * .062, -.12, .1]], 8, t => .017 * (1 - t * .45), { c, k: .008 }));
    P.push(...tube('root', [[s * .012, -.047, .143], [s * .042, -.062, .134], [s * .052, -.09, .12]], 5, t => .009 * (1 - t * .4), { c, k: .008 }));
  }
  return P;
}
/* 수염: 볼과 턱을 덮는 덩이 위로 굵은 곱슬 타래가 흘러내리고, 끝은 두 갈래로 갈라져 말린다 */
function beard() {
  const P = [], c = cM;
  P.push(E('root', [0, -.1, .055], [.082, .08, .07], { c }));
  P.push(E('root', [0, -.16, .058], [.068, .075, .058], { c, k: .04 }));
  for (const s of [-1, 1]) P.push(E('root', [s * .078, -.055, .045], [.03, .06, .045], { c, k: .03 }));   /* 구레나룻 */
  /* 곱슬 타래: 얼굴 둘레에서 시작해 아래로 흐르며 끝이 말린다 */
  const lock = (st, dir, L0, r0, curlS) => {
    const pts = [st]; let p = st, d = norm(dir);
    for (let i = 1; i <= 4; i++) { p = add(p, scl(d, L0 / 4)); pts.push(p); d = norm(add(d, [Math.sin(i * 1.7 + st[0] * 40) * .25, 0, 0])); }
    // 끝: 바깥으로 말린 고리
    const e = pts[pts.length - 1], no = norm([e[0], 0, e[2] - .02]), rr = r0 * 1.15;
    for (let i = 1; i <= 5; i++) { const a = i / 5 * PI * 1.25; pts.push(add(e, add(scl(d, Math.sin(a) * rr), scl(no, -(1 - Math.cos(a)) * rr)))); }
    return tube('root', pts, 18, t => r0 * (1 - t * .5), { c, k: .006 });
  };
  for (let k = 0; k < 13; k++) {
    const a = -1.25 + k * (2.5 / 12), s = Math.sign(a) || 1;
    const st = [Math.sin(a) * .085, -.06 - Math.cos(a) * .035, .05 + Math.cos(a) * .065];
    const dir = [Math.sin(a) * .25, -1, Math.cos(a) * .25];
    P.push(...lock(st, dir, .11 + Math.cos(a) * .05, .019, s));
  }
  for (let k = 0; k < 9; k++) {   /* 둘째 줄 (턱 아래) */
    const a = -1.0 + k * (2 / 8), s = Math.sign(a + .001);
    const st = [Math.sin(a) * .07, -.14 - Math.cos(a) * .02, .055 + Math.cos(a) * .055];
    P.push(...lock(st, [Math.sin(a) * .35, -1, Math.cos(a) * .15], .1 + Math.cos(a) * .06, .017, s));
  }
  /* 끝 두 갈래 */
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const st = [s * (.012 + k * .013), -.2, .085 - k * .012];
    P.push(...tube('root', [st, add(st, [s * .01, -.05, -.005]), add(st, [-s * .004, -.1, -.012]), add(st, [s * .016, -.15, -.02]), add(st, [s * .04, -.17, -.012]), add(st, [s * .045, -.15, .0])], 14, t => .016 * (1 - t * .55), { c, k: .012 }));
  }
  return P;
}
/* 머리카락: 머리통을 덮는 덩이, 정수리에서 사방으로 뻗는 물결 타래, 이마 위 곱슬, 어깨로 흘러내리는 뒷머리 */
function hair() {
  const P = [], c = cM;
  P.push(E('root', [0, .035, -.03], [.123, .125, .135], { c }));
  /* 정수리에서 퍼지는 물결 타래 */
  for (let k = 0; k < 26; k++) {
    const a = PI * .22 + k / 26 * PI * 1.56 + .03;   /* 앞(얼굴)쪽 둘레는 비운다 */
    const dx = Math.sin(a), dz = Math.cos(a);
    const pts = [[dx * .02, .14, -.02 + dz * .02], [dx * .085, .118, -.03 + dz * .09], [dx * .128, .05, -.03 + dz * .125], [dx * .14, -.04, -.035 + dz * .13]];
    const back = dz < -.2;
    if (back) { pts.push([dx * .13, -.14, -.04 + dz * .13], [dx * .14, -.25, -.03 + dz * .14], [dx * (.17 + .02 * Math.sin(k)), -.33, -.02 + dz * .15]); }
    else pts.push([dx * .15, -.08, -.03 + dz * .13]);
    const n = back ? 20 : 12;
    P.push(...tube('root', pts.map((p, i) => add(p, [Math.sin(i * 2.1 + k) * .008, 0, Math.cos(i * 1.7 + k) * .008])), n, t => (.026 + .006 * Math.sin(k * 1.3)) * (1 - t * .5), { c, k: .014 }));
  }
  /* 이마 위 굵은 곱슬 (왕관 아래로 삐져나온다) */
  for (let k = 0; k < 9; k++) {
    const a = -.95 + k * (1.9 / 8), dx = Math.sin(a), dz = Math.cos(a);
    const o = [dx * .112, .085 - Math.abs(a) * .02, .015 + dz * .085];
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6 * PI * 1.5; pts.push(add(o, [Math.cos(a) * Math.sin(t) * .02 + dx * .01 * i / 6, -Math.sin(t) * .02 - (1 - Math.cos(t)) * .004, -Math.sin(a) * Math.sin(t) * .02 + dz * (1 - Math.cos(t)) * .012])); }
    P.push(...tube('root', pts, 10, t => .016 * (1 - t * .45), { c, k: .01 }));
  }
  /* 관자놀이 곱슬 */
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const o = [s * .118, .04 - k * .045, .04 - k * .012];
    P.push(...tube('root', [o, add(o, [s * .012, -.02, .01]), add(o, [s * .008, -.04, -.004]), add(o, [s * .018, -.05, -.018])], 8, t => .017 * (1 - t * .4), { c, k: .012 }));
  }
  return P;
}
/* 금 왕관 (머리 좌표): 띠 + 살 아홉 끝에 구슬 */
function crown() {
  const P = [], c = cG, yc = .11, R0 = .133;
  P.push(F('root', [-.16, yc - .04, -.17, .16, yc + .04, .16], (x, y, z) => {
    const r = Math.hypot(x, (z + .012) / 1.06);
    const band = Math.max(Math.abs(r - R0) - .007, Math.abs(y - yc) - .024);
    return band;
  }, { c }));
  for (const yy of [yc - .024, yc + .024]) P.push(F('root', [-.16, yy - .02, -.17, .16, yy + .02, .16], (x, y, z) => Math.hypot(Math.hypot(x, (z + .012) / 1.06) - R0 - .003, y - yy) - .0065, { c, k: .006 }));
  for (let k = 0; k < 9; k++) {
    const a = (k - 4) * .36, dx = Math.sin(a), dz = Math.cos(a) * 1.06;
    const b = [dx * R0, yc + .02, -.012 + dz * R0], t = [dx * (R0 + .012), yc + .085, -.012 + dz * (R0 + .012)];
    P.push(C('root', b, t, .016, .004, { c, k: .006 }));
    P.push(E('root', add(t, [0, .008, 0]), [.0095, .0095, .0095], { c, k: .004 }));
    P.push(E('root', [dx * (R0 + .006), yc, -.012 + dz * (R0 + .006)], [.008, .008, .006], { c, k: .004, rot: [0, a, 0] }));   /* 띠의 박힌 구슬 */
  }
  return P;
}

/* ===================================================================
   옷: 허리에 두른 주름 옷 (오른다리 앞은 높이 걷히고, 왼쪽은 무릎 위까지 깊게 흘러내린다)
   =================================================================== */
function loin() {
  const P = [], c = cD;
  const top = a => 1.8 + .03 * Math.cos(a - .6), lift = a => .5 + .5 * Math.cos(a - PI * .72), bot = a => 1.16 + .34 * lift(a) * lift(a) + .025 * Math.sin(a * 7);
  /* 한 장 천: 허리에서 아래로 퍼지는 통 모양, 둥근 주름 사이로 날카롭게 접힌 골. 아래 단은 오른 앞이 걷혀 올라간다 */
  P.push(F('root', [-.42, 1.05, -.4, .42, 1.86, .4], (x, y, z) => {
    const zz = (z - .01) / .82, a = Math.atan2(zz, x), r = Math.hypot(x, zz), ca = Math.cos(a), sa = Math.sin(a);
    const T = top(a), Bt = bot(a), t = clamp((T - y) / (T - Bt), 0, 1.1), lf = lift(a);
    const R = mix(.205, .25 + .06 * (1 - lf), Math.pow(t, .8));
    const ph = fbm(ca * 1.3 + 3, sa * 1.3, t * 1.2, 2) * 2.2;
    const fold = (.006 + .034 * t) * (Math.abs(Math.sin(a * 6.5 + ph)) * 2 - 1);
    const sh = Math.abs(r - (R + fold)) * .85 - .014;
    return Math.max(sh, y - T, Bt - y);
  }, { c, k: .02 }));
  /* 말아 올린 허리 단 + 매듭 + 늘어진 끝자락 */
  P.push(F('root', [-.3, 1.74, -.25, .3, 1.88, .25], (x, y, z) => {
    const r = Math.hypot(x, z / .8), yy = y - (1.81 + .012 * Math.cos(Math.atan2(z, x) * 3));
    return Math.hypot(r - .21, yy * 1.2) - .028 - .004 * Math.sin(Math.atan2(z, x) * 14 + y * 30);
  }, { c, k: .02 }));
  P.push(E('root', [.19, 1.77, .12], [.045, .04, .035], { c, k: .02 }));
  for (let k = 0; k < 3; k++) P.push(...tube('root', [[.19 + k * .02, 1.76, .13 - k * .03], [.265 + k * .02, 1.5, .15 - k * .03], [.3 + k * .025, 1.2, .1 - k * .03], [.32 + k * .02, .98, .06 - k * .03]], 12, t => .032 - k * .005 - t * .01, { c, k: .02 }));
  return P;
}
/* 망토: 왼어깨 금 걸쇠에서 등을 덮고 넘어가, 바람에 부풀어 깊은 주름으로 오른쪽 뒤 아래로 흘러내린다.
   주름 하나하나를 굵은 관으로 놓고 부드럽게 이어 붙여 한 장 천처럼 만든다 */
function cloak() {
  const P = [], c = cD, N = 13;
  for (let k = 0; k < N; k++) {
    const u = k / (N - 1);   /* 0: 왼쪽(걸쇠 쪽) ~ 1: 오른쪽 */
    const sx = mix(.24, -.26, u), sy = 2.38 + .03 * Math.sin(u * PI), sz = mix(.02, -.16, Math.min(1, u * 1.6));
    const pts = [[sx, sy, sz]];
    const W = mix(.32, -.62, u), Zb = -.32 - .22 * Math.sin(u * PI) - .08 * u;
    for (let i = 1; i <= 6; i++) {
      const t = i / 6, wav = Math.sin(u * PI * 5.5 + t * 2.5) * .05 * t;
      pts.push([mix(sx, W, Math.pow(t, 1.2)) + wav * .5, mix(sy, .32 + .2 * (1 - u) + .12 * Math.sin(u * 7), Math.pow(t, .95)), mix(sz, Zb, Math.pow(t, .7)) - .2 * Math.sin(t * PI) * (.3 + u * .4) + wav]);
    }
    P.push(...tube('root', pts, 18, t => .03 + .035 * t + .008 * Math.sin(k * 1.9), { c, k: .05 }));
  }
  /* 왼어깨 위로 넘어온 자락 */
  P.push(...tube('root', [[.3, 2.28, .13], [.31, 2.43, .05], [.22, 2.48, -.08], [.06, 2.45, -.17]], 10, t => .042 - t * .008, { c, k: .03 }));
  return P;
}

/* ===================================================================
   바위 받침과 돌고래
   =================================================================== */
function rocks() {
  const P = [], c = cR;
  const disp = s => (x, y, z) => fbm(x * s, y * s, z * s, 4) * .045;
  for (const [x, z, r, h] of [[0, 0, .62, .16], [-.4, .3, .4, .2], [.35, -.35, .42, .18], [-.35, -.38, .38, .22], [.5, .15, .34, .15], [.05, .5, .32, .13]])
    P.push(E('root', [x, h * .3, z], [r, h, r * .92], { c, k: .08, disp: disp(7), amp: .05 }));
  P.push(E('root', [.23, .2, .34], [.25, .22, .23], { c, k: .06, disp: disp(9), amp: .05 }));   /* 왼발 올린 바위 */
  return P;
}
/* 돌고래: 곡선 머리→꼬리, s 굵기, up 등 쪽 */
function dolphin(pts, s, up) {
  const P = [], c = cM, B0 = crv(pts, 24), n = B0.length - 1;
  const rf = t => s * (t < .25 ? .6 + .4 * Math.sin(t / .25 * PI / 2) : 1 - .86 * Math.pow((t - .25) / .75, 1.15));
  for (let i = 0; i < n; i++) P.push(C('root', B0[i], B0[i + 1], rf(i / n), rf((i + 1) / n), { c, k: i ? .02 : 0 }));
  const h = B0[0], tg = norm(sub(B0[0], B0[1])), upN = norm(sub(up, scl(tg, up[0] * tg[0] + up[1] * tg[1] + up[2] * tg[2]))), sd = norm(cross(tg, upN));
  P.push(E('root', add(h, scl(upN, s * .2)), [s * .55, s * .5, s * .55], { c, k: .04 }));   /* 둥근 이마 */
  P.push(C('root', add(h, scl(tg, s * .3)), add(h, add(scl(tg, s * 1.15), scl(upN, -s * .1))), s * .3, s * .14, { c, k: .03 }));   /* 주둥이 */
  P.push(C('root', add(h, add(scl(tg, s * .55), scl(upN, -s * .12))), add(h, add(scl(tg, s * 1.1), scl(upN, -s * .14))), s * .02, s * .02, { c, sub: true, k: .01 }));   /* 입 */
  for (const q of [-1, 1]) P.push(E('root', add(h, add(scl(sd, q * s * .38), add(scl(upN, s * .12), scl(tg, s * .15)))), [s * .07, s * .06, s * .06], { c, sub: true, k: .015 }));   /* 눈 */
  /* 꼬리지느러미: 꼬리 끝에서 양옆으로 넓적하게 */
  const T = B0[n], tt = norm(sub(B0[n], B0[n - 1])), tu = norm(sub(up, scl(tt, up[0] * tt[0] + up[1] * tt[1] + up[2] * tt[2]))), ts = norm(cross(tt, tu));
  for (const q of [-1, 1]) P.push(C('root', T, add(T, add(scl(ts, q * s * .75), scl(tt, s * .35))), s * .14, s * .03, { c, k: .03 }));
  /* 등지느러미·가슴지느러미 */
  const m = B0[Math.round(n * .38)], mt = norm(sub(B0[Math.round(n * .38) + 1], m));
  P.push(C('root', add(m, scl(tu, s * .6)), add(m, add(scl(tu, s * 1.2), scl(mt, s * .45))), s * .22, s * .02, { c, k: .04 }));
  const f = B0[Math.round(n * .2)];
  for (const q of [-1, 1]) P.push(C('root', add(f, scl(sd, q * s * .5)), add(f, add(scl(sd, q * s * 1.0), add(scl(upN, -s * .45), scl(tg, -s * .3)))), s * .14, s * .03, { c, k: .03 }));
  return P;
}

/* ===================================================================
   삼지창 (금)
   =================================================================== */
const TX = -.66, TZ = .1;
function trident() {
  const P = [], c = cG;
  P.push(C('root', [TX, .1, TZ], [TX, 3.6, TZ], .027, .025, { c }));
  for (const y of [.4, 1.2, 2.2, 2.62, 3.25]) P.push(Ring('root', [TX, y, TZ], .03, .011, { c, k: .006 }));
  /* 장식 목: 볼록한 마디들 */
  P.push(E('root', [TX, 3.55, TZ], [.05, .03, .05], { c, k: .01 }));
  P.push(E('root', [TX, 3.62, TZ], [.04, .05, .04], { c, k: .01 }));
  P.push(E('root', [TX, 3.69, TZ], [.06, .028, .06], { c, k: .01 }));
  /* 휜 가로대 */
  P.push(...tube('root', [[TX - .23, 3.86, TZ], [TX - .12, 3.73, TZ], [TX, 3.7, TZ], [TX + .12, 3.73, TZ], [TX + .23, 3.86, TZ]], 12, t => .022 + .008 * Math.sin(t * PI), { c, k: .008 }));
  /* 날: 가운데 곧은 날, 양옆 휜 날. 끝은 납작한 잎 모양 날 + 거꾸로 난 미늘 */
  const blade = (base, dir, side) => {
    const tip = add(base, scl(dir, .2));
    P.push(F('root', [Math.min(base[0], tip[0]) - .06, Math.min(base[1], tip[1]) - .06, base[2] - .06, Math.max(base[0], tip[0]) + .06, Math.max(base[1], tip[1]) + .06, base[2] + .06], (x, y, z) => {
      const d = capD(x, y, z * 2.6, base[0], base[1], base[2] * 2.6, tip[0], tip[1], tip[2] * 2.6, .042, .002);
      return d / 2.2;
    }, { c, k: .006 }));
    const bb = add(base, scl(dir, .03)), bt = add(bb, add(scl(side, .07), scl(dir, -.06)));
    P.push(C('root', bb, bt, .016, .002, { c, k: .006 }));
  };
  P.push(C('root', [TX, 3.7, TZ], [TX, 4.15, TZ], .022, .02, { c, k: .006 }));
  blade([TX, 4.13, TZ], [0, 1, 0], [-1, 0, 0]);
  for (const s of [-1, 1]) {
    const pts = crv([[TX + s * .23, 3.86, TZ], [TX + s * .26, 3.98, TZ], [TX + s * .21, 4.1, TZ]], 6);
    P.push(...tube('root', pts, 6, () => .02, { c, k: .006 }));
    blade([TX + s * .21, 4.09, TZ], norm([-s * .25, 1, 0]), [s, 0, 0]);
  }
  return P;
}

/* ===================================================================
   모두 맞추기
   =================================================================== */
function seaGod() {
  const marbleP = [], rockP = rocks(), goldP = [];
  marbleP.push(grp('root', body()));
  /* 다리 */
  marbleP.push(grp('root', leg([-.12, 1.49, 0], [-.145, .86, .035], [-.155, .135, -.02], [-.165, .04, .15], -1), { k: .04 }));
  marbleP.push(grp('root', leg([.12, 1.49, 0], [.22, 1.02, .34], [.225, .5, .26], [.235, .41, .38], 1), { k: .04 }));
  /* 팔 */
  const RS = [-.31, 2.37, -.01], RE = [-.56, 2.56, -.03], RW = [-.635, 2.87, .065];
  const LS = [.31, 2.37, -.01], LE = [.52, 2.19, .22], LW = [.62, 2.11, .48];
  marbleP.push(grp('root', arm(RS, RE, RW, -1), { k: .05 }));
  marbleP.push(grp('root', arm(LS, LE, LW, 1), { k: .05 }));
  /* 손 */
  marbleP.push(grp('root', fist(), { at: [TX, 2.95, TZ], e: [0, -.5, 0], k: .03, s: 1.15 }));
  { const fw = norm(sub(LW, LE)); const ry = Math.atan2(fw[0], fw[2]), rx = -Math.asin(clamp(fw[1], -1, 1));
    marbleP.push(grp('root', openHand(), { at: add(LW, scl(fw, -.01)), e: [rx, ry, -.25], k: .03, s: 1.22 })); }
  /* 머리: 머리 묶음 하나로 옮기고 돌린다 (조금 숙이고 왼쪽 앞을 본다) */
  const HC = [0, 2.77, .03], HE = [.1, .32, 0];
  marbleP.push(grp('root', [...head(), grp('root', beard(), { k: .02 }), grp('root', hair(), { k: .02 })], { at: HC, e: HE, k: .05 }));
  goldP.push(grp('root', crown(), { at: HC, e: HE }));
  /* 옷·망토 */
  marbleP.push(grp('root', loin(), { k: .02 }));
  marbleP.push(grp('root', cloak(), { k: .03 }));
  /* 받침 노릇을 하는 돌고래: 오른다리 뒤에서 몸을 감고 머리를 바위로 처박는다 */
  marbleP.push(grp('root', dolphin([[-.14, .24, -.36], [-.42, .5, -.32], [-.36, .85, -.16], [-.22, 1.1, -.12], [-.16, 1.25, -.18]], .13, [-.7, .2, -.7]), { k: .03 }));
  /* 금 */
  goldP.push(grp('root', trident()));
  goldP.push(E('root', [.255, 2.31, .15], [.042, .042, .02], { c: cG }));   /* 망토 걸쇠 */
  goldP.push(Ring('root', [.255, 2.31, .162], .04, .01, { c: cG, rot: [PI / 2, 0, 0] }));

  const prims = [];
  for (const p of marbleP) { p.g = 'marble'; prims.push(p); }
  for (const p of rockP) { p.g = 'rock'; prims.push(p); }
  for (const p of goldP) { p.g = 'gold'; prims.push(p); }
  return {
    bones: [{ n: 'root', o: [0, 0, 0] }], prims, h: 4.3,
    mats: { marble: { r: .42 }, rock: { r: .85 }, gold: { r: .3, m: .75 } },
    gopt: { marble: { tris: 40000, loK: .15, aoS: .02, aoK: 2.2 }, rock: { tris: 2500, h: .012, loK: .3 }, gold: { tris: 6000, h: .004, loK: .25, aoK: 1.2 } },
  };
}

module.exports = { seaGod };
