/*
 * 얼음 구더기 어미 (허칠 동굴 끝 '어미의 둥지' 보스, Lv 100) — 거리 함수로 한 덩어리로 빚는다
 *
 * 좌표: y 위, z 앞(머리 쪽), 모델 1 = 게임 4m (size 4). 꼬리 끝 z -1.55 → 머리 끝 z 1.2 (게임에서 약 11m)
 * 생김새: 굴 끝에서 짐승을 먹고 알을 낳으며 살찐 거대한 구더기. 앞몸을 쳐든 채 엎드려 있다.
 *   - 몸: 마디마다 부푼 고리 살과 깊은 주름, 밀랍 같은 창백한 살갗에 보랏빛 핏줄이 비치고, 군데군데 고름 든 헌데. 등엔 서리가 엉겨 붙었다
 *   - 배: 노르스름하고 납작, 마디마다 갈고리 끝 작은 다리가 한 쌍씩 (17쌍)
 *   - 등: 반쯤 살에 묻힌 누런 알 무더기 (속에 검은 새끼가 비친다)
 *   - 머리: 눈 없는 뭉툭한 머리 위에 검은 구슬 눈이 한쪽으로 몰려 붙고, 앞은 네 갈래 꽃잎처럼 벌어지는 입술. 입술 안쪽과 목구멍엔 이빨이 겹겹이
 *   - 입 양옆: 마디진 긴 더듬이 다리 한 쌍 (끝이 갈고리)
 * 뼈: root(몸 가운데) → f1 → f2 → f3 → head (앞몸), root → r1 → r2 → r3 (뒷몸), head → lip0..3 (입술), head → fL1·fL2 / fR1·fR2 (더듬이 다리)
 */
'use strict';
const { clamp, mix, sstep, rgb, cmix, csc, vnoise, fbm, ellD, capD, E, C, F, smin } = require('./lib');

const Z0 = -1.55, LEN = 2.75, TH = .93;   // 몸통 꼬리 끝, 길이, 몸통이 끝나고 머리가 붙는 자리
const zOf = t => Z0 + LEN * t;
const RP = [[0, .045], [.05, .13], [.16, .31], [.33, .415], [.48, .435], [.62, .385], [.76, .305], [.86, .275], [.93, .265]];
function R0(t) { t = clamp(t, 0, TH); for (let i = 0; i + 1 < RP.length; i++) { const [a, ra] = RP[i], [b, rb] = RP[i + 1]; if (t <= b) return mix(ra, rb, sstep(0, 1, (t - a) / (b - a))); } return RP[RP.length - 1][1]; }
const NSEG = 12;
const fold = t => Math.cos(2 * Math.PI * NSEG * (t - .05) / .85);   // 마디: 1 = 부푼 고리 가운데, -1 = 주름
function Rf(t) { const f = fold(t), on = sstep(.02, .08, t) * (1 - sstep(.86, .92, t)); return R0(t) * (1 + on * (.045 * f - .085 * Math.pow(Math.max(0, -f), 3))); }
const yc = t => R0(t) * .88 + .36 * sstep(.6, .95, t);   // 뒷몸은 바닥에 눕고 앞몸은 쳐들었다
const tOf = z => clamp((z - Z0) / LEN, 0, TH);
const axis = t => [0, yc(t), zOf(t)];

/* 살갗 잔결: 핏줄(도드라짐)·사마귀·헌데(움푹) */
const vein = (x, y, z) => { const wx = x + .08 * vnoise(x * 4, y * 4 + 3, z * 4), a = 1 - Math.abs(vnoise(wx * 7 + 1.3, y * 7, z * 7 - 2.1)), b = 1 - Math.abs(vnoise(wx * 16 - 4, y * 16 + 2, z * 16)); return Math.max(sstep(.93, .99, a), sstep(.955, .993, b) * .55); };
const sore = (x, y, z) => sstep(.6, .72, vnoise(x * 5.5 + 7, y * 5.5, z * 5.5 + 3));
function bodyRaw(x, y, z) {
  let t = tOf(z), dz = 0; const zf = zOf(TH); if (z < Z0) dz = z - Z0; else if (z > zf) dz = z - zf;
  let dy = y - yc(t); if (dy < 0) dy /= .78;   // 배는 납작하게
  return (Math.hypot(x, dy, dz) - Rf(t)) * .9;
}
function bodyD(x, y, z) {
  const d = bodyRaw(x, y, z); if (d > .05) return d;
  return d - .006 * fbm(x * 1.6, y * 1.6, z * 1.6, 2) + .008 * sore(x, y, z);   /* 잔 울퉁불퉁은 빼고 (줄이면 구겨져 보인다) 큰 물결과 헌데 자국만 */
}
/* 살갗 색 */
const C_SKIN = rgb(0xd9d0c2), C_SKIN2 = rgb(0xb9c2c8), C_PINK = rgb(0xc99a96), C_VEIN = rgb(0x4e2c52), C_FOLD = rgb(0x6e5a5a), C_BELLY = rgb(0xc9b688), C_FROST = rgb(0xeef5fb), C_SORE = rgb(0x6a1626), C_PUS = rgb(0xd0bc62), C_THROAT = rgb(0x4a0a16), C_GUM = rgb(0x8a2a38), C_DEEP = rgb(0x120206);
function skinC(x, y, z) {
  const t = tOf(z), R = R0(t), dy = (y - yc(t)) / R, f = fold(t);
  let c = cmix(C_SKIN, C_SKIN2, sstep(.35, .75, fbm(x * 3 + 2, y * 3, z * 3, 3) + .5) * .7);
  c = cmix(c, C_PINK, sstep(.72, .95, t) * .55 + sstep(.55, .7, fbm(x * 2, y * 2 + 9, z * 2, 2) + .5) * .25);
  c = cmix(c, C_BELLY, sstep(-.25, -.7, dy) * .85);
  c = cmix(c, C_FOLD, Math.pow(Math.max(0, -f), 4) * .75 * sstep(.03, .09, t) * (1 - sstep(.86, .92, t)));
  c = cmix(c, C_FROST, sstep(.45, .8, dy) * sstep(.58, .78, fbm(x * 4 + 5, y * 4, z * 4, 3) + .5) * .8);
  c = cmix(c, C_VEIN, vein(x, y, z) * (.42 + .25 * sstep(-.2, -.6, dy)));   /* 살갗 아래 비치는 핏줄 (배 쪽이 더 짙다) */
  const s = sore(x, y, z), s2 = sstep(.62, .78, vnoise(x * 5.5 + 7, y * 5.5, z * 5.5 + 3));
  c = cmix(c, C_PUS, s * (1 - s2) * .85); c = cmix(c, C_SORE, s2);
  c = csc(c, .93 + .14 * fbm(x * 30, y * 30, z * 30, 2));
  return c;
}

/* ---------- 뼈 ---------- */
const BT = { r3: .07, r2: .19, r1: .32, root: .45, f1: .58, f2: .7, f3: .82, head: .92 };
const SEG = [['r3', -1, .13], ['r2', .13, .255], ['r1', .255, .385], ['root', .385, .515], ['f1', .515, .64], ['f2', .64, .76], ['f3', .76, .87], ['head', .87, 2]];
const segOf = t => SEG.find(s => t < s[2])[0];

function hmother() {
  const prims = [];
  const zf = zOf(TH), yH = yc(.97), zH = zOf(.97);   // 머리 가운데
  /* 머리 끝 자리 (입) */
  const MZ = zH + .2, MY = yH - .03, MR = .155;
  const bones = [
    { n: 'root', o: axis(BT.root), tip: axis(BT.f1) },
    { n: 'f1', p: 'root', o: axis(BT.f1), tip: axis(BT.f2), bw: .1 },
    { n: 'f2', p: 'f1', o: axis(BT.f2), tip: axis(BT.f3), bw: .09 },
    { n: 'f3', p: 'f2', o: axis(BT.f3), tip: axis(BT.head), bw: .08 },
    { n: 'head', p: 'f3', o: axis(BT.head), tip: [0, MY, MZ], bw: .07 },
    { n: 'r1', p: 'root', o: axis(BT.r1), tip: axis(BT.r2), bw: .11 },
    { n: 'r2', p: 'r1', o: axis(BT.r2), tip: axis(BT.r3), bw: .1 },
    { n: 'r3', p: 'r2', o: axis(BT.r3), tip: [0, yc(0), Z0], bw: .08 },
  ];
  /* 몸통: 뼈마다 한 토막 (같은 몸을 z 칸으로 잘라 나눈다) */
  for (const [b, t0, t1] of SEG) {
    const za = t0 < 0 ? Z0 - .1 : zOf(t0), zb = t1 > 1 ? zf + .35 : zOf(t1);
    const Rm = .5;
    prims.push(F(b, [-Rm, -.05, za - .02, Rm, .95, zb + .02], (x, y, z) => Math.max(bodyD(x, y, z), za - z, z - zb), { c: skinC, lab: b }));
  }
  /* 머리: 뭉툭한 둥근 끝 (몸통 끝에 매끈하게 붙는다), 앞은 입 구멍 */
  const headD = (x, y, z) => { let d = ellD(x, y - yH, z - zH, .285, .27, .23); return d > .04 ? d : d - .004 * fbm(x * 2.5, y * 2.5, z * 2.5, 2); };
  const headC = (x, y, z) => { const r = Math.hypot(x, y - MY), inM = z > MZ - .25 && r < MR + .03; if (inM) { const k = sstep(MZ - .02, MZ - .22, z); return cmix(C_GUM, k > .6 ? C_DEEP : C_THROAT, k); } const c = skinC(x, y, z); return cmix(c, C_PINK, .35); };
  prims.push(F('head', [-.32, yH - .31, zH - .3, .32, yH + .31, zH + .3], headD, { c: headC, k: .07 }));
  /* 입 언저리: 두툼하게 말린 살 고리 */
  prims.push(F('head', [-.21, MY - .21, MZ - .1, .21, MY + .21, MZ + .06], (x, y, z) => Math.hypot(Math.hypot(x, y - MY) - MR - .025, (z - MZ + .03) * 1.2) - .045, { c: (x, y, z) => cmix(C_PINK, C_GUM, sstep(MR + .03, MR - .01, Math.hypot(x, y - MY))), k: .035 }));
  /* 입 구멍 (목구멍) */
  prims.push(F('head', [-.17, MY - .17, MZ - .34, .17, MY + .17, MZ + .1], (x, y, z) => ellD(x, y - MY, z - MZ + .05, MR, MR * .95, .26), { sub: true, k: .025 }));
  /* 목구멍 이빨: 두 고리, 안쪽·뒤로 굽어 꽂힌 바늘 이빨 */
  const TOOTH = (x, y, z) => cmix(rgb(0xece0c4), rgb(0x8a6a44), 0);
  const toothC = (base, tip) => (x, y, z) => { const k = clamp(Math.hypot(x - tip[0], y - tip[1], z - tip[2]) / (Math.hypot(base[0] - tip[0], base[1] - tip[1], base[2] - tip[2]) || 1), 0, 1); return cmix(rgb(0xf2ead6), rgb(0x7a5a3a), sstep(.55, 1, k)); };
  for (let ring = 0; ring < 2; ring++) { const n = ring ? 11 : 14, zz = MZ - .07 - ring * .08, rr = MR * (ring ? .82 : .95);
    for (let i = 0; i < n; i++) { const a = (i + ring * .5) / n * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a), L = .075 - ring * .015;
      const base = [cs * rr, MY + sn * rr, zz], tip = [cs * (rr - L), MY + sn * (rr - L), zz - L * .55];
      prims.push(C('head', base, tip, .013 - ring * .002, .0015, { g: 'teeth', c: toothC(base, tip) })); } }
  /* 입술 네 갈래: 닫으면 앞으로 모여 뾰족한 꽃봉오리. 안쪽엔 이빨이 두 줄 */
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, cs = Math.cos(a), sn = Math.sin(a), b = 'lip' + k;
    const H = [cs * (MR + .02), MY + sn * (MR + .02), MZ - .02], T = [cs * .02, MY + sn * .02, MZ + .2];
    const w = [T[0] - H[0], T[1] - H[1], T[2] - H[2]], wl = Math.hypot(...w), W = w.map(v => v / wl);
    let V = [cs, sn, 0]; const dv = V[0] * W[0] + V[1] * W[1] + V[2] * W[2]; V = V.map((v, i) => v - dv * W[i]); const vl = Math.hypot(...V); V = V.map(v => v / vl);
    const U = [V[1] * W[2] - V[2] * W[1], V[2] * W[0] - V[0] * W[2], V[0] * W[1] - V[1] * W[0]];
    const M = [(H[0] + T[0]) / 2, (H[1] + T[1]) / 2, (H[2] + T[2]) / 2], hl = wl / 2;
    const loc = (x, y, z) => { const dx = x - M[0], dy = y - M[1], dz = z - M[2]; return [dx * U[0] + dy * U[1] + dz * U[2], dx * V[0] + dy * V[1] + dz * V[2], dx * W[0] + dy * W[1] + dz * W[2]]; };
    /* 꽃잎 하나: 바깥으로 둥글게 휜 두꺼운 살 조각 (끝이 뾰족) */
    const lipD = (x, y, z) => { const [u, v, w2] = loc(x, y, z), s = clamp((w2 + hl) / (2 * hl), 0, 1), half = .11 * Math.pow(Math.sin(Math.PI * Math.min(1, s * .92 + .08)), .7) + .012, bend = -.05 * (1 - Math.pow(2 * s - 1, 2)) + .03 * u * u / .012, th = .03 * (1 - .55 * s) + .008, r = .016;
      const qu = Math.abs(u) - half + r, qv = Math.abs(v - bend) - th + r, qw = Math.abs(w2) - hl + r;
      return (Math.hypot(Math.max(qu, 0), Math.max(qv, 0), Math.max(qw, 0)) + Math.min(Math.max(qu, qv, qw), 0) - r) * .8; };   /* 끝이 뾰족해지는 두꺼운 살 꽃잎 (둥근 모서리) */
    const lipC = (x, y, z) => { const [u, v] = loc(x, y, z); const inner = sstep(.004, -.012, v); return cmix(cmix(cmix(C_PINK, C_SKIN, .3 + .3 * (fbm(x * 12, y * 12, z * 12, 2) + .5)), C_VEIN, vein(x * 1.5, y * 1.5, z * 1.5) * .5), cmix(C_GUM, C_THROAT, .35), inner); };
    prims.push(F(b, [M[0] - .2, M[1] - .2, M[2] - .2, M[0] + .2, M[1] + .2, M[2] + .2], lipD, { c: lipC, k: .03 }));
    bones.push({ n: b, p: 'head', o: H, tip: T, bw: .03, rad: .2 });
    /* 이빨: 꽃잎 안쪽에 두 줄, 입 가운데 쪽으로 */
    for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
      const s = .22 + i * .15 + r * .07, uu = (i - 2) * .036 * (1 - s * .5) * (r ? .7 : 1), wv = -hl + 2 * hl * s, vb = -.05 * (1 - Math.pow(2 * s - 1, 2)) + .045 * uu * uu / .015 - .018;
      const P = (u, v, w2) => [M[0] + U[0] * u + V[0] * v + W[0] * w2, M[1] + U[1] * u + V[1] * v + W[1] * w2, M[2] + U[2] * u + V[2] * v + W[2] * w2];
      const L = .05 - r * .012 - Math.abs(i - 2) * .006, base = P(uu, vb, wv), tip = P(uu * .8, vb - L, wv - L * .35);
      prims.push(C(b, base, tip, .0085, .0012, { g: 'teeth', c: toothC(base, tip) })); }
  }
  /* 구슬 눈: 머리 위 한쪽으로 몰려 붙은 검은 알 (크기가 제각각) */
  const EYES = [[.07, .2, .09, .034], [.13, .17, .05, .026], [.02, .23, .03, .022], [.15, .21, -.03, .019], [.09, .25, -.02, .017], [-.05, .21, .07, .02], [.19, .13, .08, .016], [-.01, .25, -.07, .014], [.11, .12, .14, .015]];
  for (const [ex, ey, ez, r] of EYES) { const c = [ex, yH + ey, zH + ez]; prims.push(E('head', c, [r, r * .92, r], { g: 'eye', c: (x, y, z) => cmix(rgb(0x2a0c0c), rgb(0x050203), sstep(r * .2, r * .9, Math.hypot(x - c[0] - r * .3, y - c[1] - r * .4, z - c[2] - r * .3))) }));
    prims.push(F('head', [c[0] - r * 1.6, c[1] - r * 1.6, c[2] - r * 1.6, c[0] + r * 1.6, c[1] + r * 1.6, c[2] + r * 1.6], (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r * 1.12, { c: C_PINK, k: .03 })); }   /* 눈두덩: 눈 둘레 살이 부풀어 감싼다 */
  /* 더듬이 다리: 입 양옆 아래에서 앞으로 뻗은 마디 다리 (끝은 갈고리) */
  const CHI = rgb(0x3a2a26), CHI2 = rgb(0xa89070);
  const chiC = (x, y, z) => cmix(CHI, CHI2, sstep(.4, .75, fbm(x * 20, y * 20, z * 20, 2) + .5) * .35);
  for (const s of [-1, 1]) { const k = s < 0 ? 'L' : 'R';
    const p0 = [s * .2, yH - .14, zH + .1], p1 = [s * .34, yH - .2, zH + .26], p2 = [s * .37, yH - .34, zH + .42], p3 = [s * .32, yH - .4, zH + .5];
    bones.push({ n: 'f' + k + '1', p: 'head', o: p0, tip: p1, bw: .025, rad: .1 }, { n: 'f' + k + '2', p: 'f' + k + '1', o: p1, tip: p2, bw: .02, rad: .08 });
    prims.push(C('f' + k + '1', p0, p1, .034, .024, { g: 'legs', c: chiC, k: .03 }));
    prims.push(E('f' + k + '1', p1, [.03, .03, .03], { g: 'legs', c: CHI2, k: .012 }));
    prims.push(C('f' + k + '2', p1, p2, .024, .016, { g: 'legs', c: chiC, k: .012 }));
    prims.push(C('f' + k + '2', p2, p3, .016, .003, { g: 'legs', c: (x, y, z) => cmix(CHI, rgb(0x0c0806), .7), k: .01 }));
    for (let i = 0; i < 4; i++) { const u = .2 + i * .2, b0 = [mix(p1[0], p2[0], u), mix(p1[1], p2[1], u), mix(p1[2], p2[2], u)], tip = [b0[0] - s * .008, b0[1] + .03, b0[2] - .02]; prims.push(C('f' + k + '2', b0, tip, .006, .001, { g: 'legs', c: CHI })); }   /* 다리 안쪽 잔가시 */
  }
  /* 배 다리: 마디마다 한 쌍, 갈고리 끝 (뒤쪽 마디는 바닥을 짚고, 쳐든 앞몸 것은 허공에 꼼지락) */
  for (let i = 0; i < 17; i++) {
    const t = .13 + i * .044, R = R0(t), y0 = yc(t), z0 = zOf(t), b = segOf(t), lift = sstep(.6, .9, t);
    for (const s of [-1, 1]) {
      const base = [s * R * .7, y0 - R * .5, z0], knee = [s * (R * .7 + .07), base[1] - .03 + .02 * lift, z0 + .015], foot = [s * (R * .66 + .06), Math.max(.012, knee[1] - .13 + .05 * lift), z0 + .03], hook = [s * (R * .6 + .05), Math.max(.004, foot[1] - .02), z0 + .065];
      prims.push(C(b, base, knee, .026, .018, { g: 'legs', c: (x, y, z) => cmix(C_BELLY, CHI2, .5), k: .02 }));
      prims.push(C(b, knee, foot, .017, .01, { g: 'legs', c: chiC, k: .008 }));
      prims.push(C(b, foot, hook, .009, .002, { g: 'legs', c: rgb(0x140c08), k: .004 }));
    }
  }
  /* 알 무더기: 등 뒤쪽 절반에 반쯤 살에 묻혀 있다. 누런 껍질 속에 검은 새끼가 비친다 */
  { let sd = 91; const rr = (a, b) => a + ((sd = (sd * 16807) % 2147483647) / 2147483647) * (b - a);
    const CL = [[.18, -.25], [.27, .35], [.36, -.1], [.46, .3], [.52, -.45], [.22, .8], [.41, -.75]];   /* 알이 몰려 붙은 자리 (몸 길이, 등 둘레 각) */
    for (let i = 0; i < 46; i++) { const cl = CL[i % CL.length], t = cl[0] + rr(-.045, .045), th = cl[1] + rr(-.3, .3), R = Rf(t), r = rr(.045, .1) * (1 - Math.abs(th) * .22), y0 = yc(t), z0 = zOf(t);
      const c = [Math.sin(th) * (R + r * .25), y0 + Math.cos(th) * (R + r * .25), z0 + rr(-.02, .02)], nrm = [Math.sin(th), Math.cos(th), 0];
      const eggC = (x, y, z) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2], o = dx * nrm[0] + dy * nrm[1], core = 1 - sstep(r * .25, r * .8, Math.hypot(dx - nrm[0] * r * .2, dy - nrm[1] * r * .2, dz * 1.4));
        let col = cmix(rgb(0xd8d09a), rgb(0xa8a054), sstep(.3, .8, fbm(x * 9, y * 9, z * 9, 2) + .5)); col = cmix(col, rgb(0x2a2012), core * .85 * sstep(-r * .2, r * .5, o)); col = cmix(col, rgb(0x6a2a3a), vein(x * 2.5, y * 2.5, z * 2.5) * .45); return col; };
      prims.push(E(segOf(t), c, [r, r * .9, r * 1.25], { g: 'eggs', c: eggC, k: .02 }));
      prims.push(F(segOf(t), [c[0] - r * 1.5, c[1] - r * 1.5, c[2] - r * 1.5, c[0] + r * 1.5, c[1] + r * 1.5, c[2] + r * 1.5], (x, y, z) => Math.max(Math.hypot(x - c[0], y - c[1], z - c[2]) - r * 1.08, bodyRaw(x, y, z) - .02), { c: skinC, k: .03 })); }   /* 알을 감싼 살 언저리 */
  }
  return {
    bones, prims, h: 1.25, size: 4,
    anim: { MZ, MY, zH, yH, BT, Z0, LEN },
    mats: { body: { r: .38 }, legs: { r: .46 }, teeth: { r: .3 }, eye: { r: .06, m: .25 }, eggs: { r: .12, tr: .93 } },
    gopt: { body: { tris: 30000, loK: .18 }, legs: { tris: 5200, h: .0045, loK: .25 }, teeth: { tris: 2400, h: .0025, loK: .3 }, eye: { tris: 600, h: .0025, noLo: 1 }, eggs: { tris: 5200, h: .005, loK: .3 } },
  };
}

module.exports = { hmother };
