/*
 * 탈것 늑대 생김새 (거리 함수로 한 덩어리로 빚는다)
 * 좌표: y 위, z 앞. 발바닥 y=0, 어깨 높이 .7쯤 (게임이 1.9배로 키운다). 옛 늑대(quadInstance)와 등 높이·다리 자리를 맞췄다.
 * 무리: body(털: 꼭짓점 색 = [그늘, 밝은 털, 어두운 털] → 게임이 털빛으로 칠한다), mane(꼬리·목털 더미: 그늘만), nose(코·발바닥), eye, saddle(깔개·뱃대끈)
 * 뼈 이름은 말과 같다 (root·neck·head·t1·t2·fLa…hRc) → 같은 움직임 코드를 쓴다.
 */
'use strict';
const { clamp, mix, sstep, smax, rgb, csc, fbm, vnoise, E, C, B, T: Ring, F, makeField, capD, ellD } = require('./lib');
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const pitchTo = a => Math.atan2(-a[1], a[2]);

function wolf() {
  const prims = [], P = p => { prims.push(p); return p; };
  /* 머리 틀: 정수리 H0 에서 앞(A)·위(U) */
  const H0 = [0, .86, .52], b = .22, A = [0, -Math.sin(b), Math.cos(b)], U = [0, Math.cos(b), Math.sin(b)];
  const pt = (t, u, x = 0) => add(add(add(H0, scl(A, t)), scl(U, u)), [x, 0, 0]);
  const HR = [b, 0, 0];
  const hl = (x, y, z) => [(y - H0[1]) * A[1] + (z - H0[2]) * A[2], (y - H0[1]) * U[1] + (z - H0[2]) * U[2]];
  /* 털 색: 배·목·주둥이 아래·볼·다리 안쪽은 밝고, 등(안장 무늬)·꼬리 끝·귀 뒤는 어둡다 */
  const coat = (x, y, z, nx, ny, nz) => {
    const s = .95 + .05 * fbm(x * 9, y * 9, z * 9, 3);
    let light = sstep(-.1, -.7, ny) * .9;                                   // 아래를 보는 면
    light = Math.max(light, sstep(.5, .4, y) * .75 * (Math.abs(x) < .09 ? 1 : .6));   // 다리 아래
    { const [t, u] = hl(x, y, z); light = Math.max(light, sstep(.02, .09, t) * sstep(-.0, -.05, u) * .95 * sstep(.4, .46, z)); }   // 주둥이 아래·볼
    light = Math.max(light, .85 * sstep(.15, .6, nz - .3 * ny) * sstep(.36, .44, z) * sstep(.82, .7, y));   // 목 앞·가슴 (앞을 보는 면만, 부드럽게)
    let dark = sstep(.2, .7, ny) * sstep(.62, .72, y) * (z < .38 ? 1 : .4) * .85;   // 등 안장 무늬
    if (z > .45) { const [t, u] = hl(x, y, z); if (t > .26) dark = Math.max(dark, .0); }
    return [s, light * s, dark * s];
  };
  /* 털 결: 이어지는 잔물결 (끊기지 않게) */
  const fur = k => (x, y, z) => k * (.7 * vnoise(x * 85, y * 22, z * 85) + .3 * vnoise(x * 190, y * 50, z * 190));   // 아래로 흐르는 털 줄기

  /* ================= 몸통 ================= */
  const kB = .07;
  P(E('root', [0, .57, .2], [.145, .2, .2], { k: kB, c: coat, disp: fur(.004), amp: .01 }));        // 가슴통 (깊다)
  P(E('root', [0, .6, -.0], [.135, .16, .26], { k: kB, c: coat }));                                     // 갈비
  P(E('root', [0, .62, -.22], [.11, .11, .15], { k: kB, c: coat }));                                     // 허리 (잘록)
  P(E('root', [0, .62, -.34], [.125, .13, .13], { k: kB, c: coat }));                                    // 엉덩이
  P(E('root', [0, .7, .1], [.1, .07, .3], { k: kB, c: coat }));                                          // 등 윗선
  for (const s of [-1, 1]) {
    P(E('root', [s * .085, .62, .28], [.06, .15, .09], { k: .05, c: coat, rot: [-.35, 0, 0] }));          // 어깨
    P(E('root', [s * .075, .54, -.33], [.065, .14, .1], { k: .05, c: coat, rot: [.2, 0, 0] }));            // 넓적다리
  }
  /* 목·목털(러프): 굵고 털이 부푼 목 */
  P(E('neck', [0, .72, .38], [.125, .15, .13], { k: .08, c: coat, rot: [pitchTo(norm([0, .5, .8])), 0, 0], disp: fur(.005), amp: .01, lab: 'neck' }));
  P(E('neck', [0, .64, .4], [.13, .13, .12], { k: .08, c: coat, disp: fur(.006), amp: .01 }));          // 목 앞 털
  for (const s of [-1, 1]) P(E('neck', [s * .08, .72, .42], [.06, .12, .1], { k: .06, c: coat, disp: fur(.006), amp: .01 }));   // 목 옆 털 뭉치

  /* ================= 머리 ================= */
  const head = [], HP = p => { head.push(p); return P(p); };
  HP(E('head', pt(.06, 0), [.095, .08, .1], { k: .05, c: coat, rot: HR }));                  // 머리통
  for (const s of [-1, 1]) HP(E('head', pt(.07, -.04, s * .065), [.06, .06, .07], { k: .05, c: coat, rot: HR, disp: fur(.006), amp: .01 }));   // 볼 털
  HP(C('head', pt(.12, -.015), pt(.29, -.035), .055, .03, { k: .05, c: coat }));          // 주둥이
  HP(E('head', pt(.18, .01), [.04, .03, .07], { k: .04, c: coat, rot: HR }));               // 콧등
  HP(C('head', pt(.1, -.075), pt(.26, -.07), .038, .022, { k: .04, c: coat }));           // 아래턱
  for (const s of [-1, 1]) HP(E('head', pt(.09, .035, s * .055), [.025, .018, .035], { k: .03, c: coat, rot: HR }));   // 눈두덩
  HP(E('head', pt(.21, -.058), [.05, .005, .08], { k: .005, c: coat, rot: HR, sub: true }));   // 입 선
  /* 코 */
  P(E('head', pt(.3, -.025), [.026, .02, .02], { g: 'nose', c: rgb(0x161210), rot: HR }));
  /* 귀: 곧추선 세모 귀, 안쪽은 오목 */
  for (const s of [-1, 1]) {
    const base = pt(-.01, .065, s * .055), dir = norm([s * .25, .95, .08]), rx = pitchTo(dir);
    const L = .13, W = .05, side = norm([1, -s * .25, 0]), fw = norm([side[1] * dir[2] - side[2] * dir[1], side[2] * dir[0] - side[0] * dir[2], side[0] * dir[1] - side[1] * dir[0]]);
    const fwd = fw[2] < 0 ? scl(fw, -1) : fw;
    const tri = (dep, th, sh) => (x, y, z) => { const r = sub([x, y, z], base), t = dot(r, dir), w = dot(r, side), d = dot(r, fwd) - sh, hw = Math.max(W * (1 - t / L), 0) * (1 - .25 * (t / L) * (t / L));
      return smax(smax(Math.abs(w) - hw, Math.abs(d) - th * (1 - .6 * t / L), .012), smax(-t - dep, t - L, .006), .01); };
    const ebb = [base[0] - .08, base[1] - .04, base[2] - .08, base[0] + .08, base[1] + .16, base[2] + .08];
    P(F('head', ebb, tri(.04, .018, 0), { k: .025, c: (x, y, z, nx, ny, nz) => { const c = coat(x, y, z, nx, ny, nz), r = sub([x, y, z], base), tt = dot(r, dir) / L, back = dot([nx, ny, nz], fwd) < 0 ? .75 : sstep(.75, .95, tt) * .6; return [c[0], c[1] * .4, Math.max(c[2], back * c[0])]; } }));   // 곧추선 세모 귀
    P(F('head', ebb, (x, y, z) => tri(-.01, .01, .016)(x, y, z) + .006, { k: .006, sub: true }));   // 귀 안쪽 오목
  }
  /* 눈 (호박빛, 가운데 검은 눈동자) */
  for (const s of [-1, 1]) {
    const ec = pt(.105, .03, s * .07);
    P(E('head', ec, [.016, .014, .018], { g: 'eye', c: (x, y, z) => { const f = dot(sub([x, y, z], ec), norm([s * .7, .1, .7])); return f > .013 ? rgb(0x100a06) : rgb(0xd89a30); }, rot: [b, s * .5, 0] }));
  }

  /* ================= 다리 (발가락으로 선다) ================= */
  const pawC = rgb(0x1e1814);
  const leg = (s, front) => {
    const q = (front ? 'f' : 'h') + (s < 0 ? 'L' : 'R'), a = q + 'a', bb = q + 'b', cc = q + 'c';
    if (front) {
      const x = s * .085, z = .3;
      P(E(a, [x, .4, z - .04], [.04, .05, .045], { k: .04, c: coat }));                            // 팔꿈치
      P(C(a, [x, .45, z], [x, .14, z + .01], .045, .027, { k: .04, c: coat }));                     // 아래팔
      P(C(bb, [x, .13, z + .01], [x, .045, z + .03], .025, .022, { k: .02, c: coat }));             // 앞발목
      P(E(cc, [x, .028, z + .05], [.034, .026, .045], { k: .02, c: coat, disp: fur(.003), amp: .006 }));   // 발
      for (let i = 0; i < 4; i++) { const tx = x + (i - 1.5) * .016; P(E(cc, [tx, .016, z + .085 - Math.abs(i - 1.5) * .008], [.011, .013, .014], { k: .008, c: coat })); P(E(cc, [tx, .006, z + .095 - Math.abs(i - 1.5) * .008], [.005, .005, .008], { g: 'nose', c: pawC })); }
    } else {
      const x = s * .085, z = -.32;
      P(E(a, [x + s * .01, .46, z + .05], [.04, .05, .045], { k: .05, c: coat }));                 // 무릎
      P(C(a, [x, .47, z + .03], [x, .2, z - .07], .05, .028, { k: .04, c: coat, disp: fur(.003), amp: .006 }));   // 종아리
      P(E(bb, [x, .2, z - .075], [.026, .03, .03], { k: .02, c: coat }));                           // 비절
      P(C(bb, [x, .2, z - .07], [x, .045, z - .03], .024, .021, { k: .02, c: coat }));              // 뒷발목
      P(E(cc, [x, .028, z - .01], [.033, .026, .045], { k: .02, c: coat, disp: fur(.003), amp: .006 }));
      for (let i = 0; i < 4; i++) { const tx = x + (i - 1.5) * .016; P(E(cc, [tx, .016, z + .025 - Math.abs(i - 1.5) * .008], [.011, .013, .014], { k: .008, c: coat })); P(E(cc, [tx, .006, z + .035 - Math.abs(i - 1.5) * .008], [.005, .005, .008], { g: 'nose', c: pawC })); }
    }
  };
  for (const s of [-1, 1]) { leg(s, true); leg(s, false); }
  P(F('fLc', [-1, -.1, -1, 1, .05, 1], (x, y) => -y, { g: 'body', inter: true, c: coat }));   // 발바닥은 평평하게

  /* ================= 꼬리 (북슬한 털, mane 무리) ================= */
  const tS = (x, y, z) => { const v = .88 + .12 * vnoise(x * 40, y * 20, z * 40), tip = sstep(.4, .3, y); return [v * (1 - tip * .55), v * (1 - tip * .55), v * (1 - tip * .55)]; };
  P(C('t1', [0, .66, -.44], [0, .55, -.56], .035, .06, { g: 'mane', c: tS, k: .03, disp: fur(.006), amp: .01 }));
  P(C('t2', [0, .55, -.56], [0, .4, -.62], .06, .065, { g: 'mane', c: tS, k: .05, disp: fur(.006), amp: .01 }));
  P(C('t2', [0, .4, -.62], [0, .27, -.62], .065, .02, { g: 'mane', c: tS, k: .05, disp: fur(.006), amp: .01 }));

  /* ================= 깔개 (탈 때) ================= */
  const fBody = makeField(prims.filter(p => p.g === 'body' && (p.b === 'root' || p.b === 'neck')));
  const shell = (f, off, th) => (x, y, z) => Math.abs(f(x, y, z) - off) - th;
  const boxR = (c, h) => (x, y, z) => { const qx = Math.abs(x - c[0]) - h[0], qy = Math.abs(y - c[1]) - h[1], qz = Math.abs(z - c[2]) - h[2]; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0); };
  const bbB = (c, h, m = .05) => [c[0] - h[0] - m, c[1] - h[1] - m, c[2] - h[2] - m, c[0] + h[0] + m, c[1] + h[1] + m, c[2] + h[2] + m];
  {
    const g = 'saddle', LEA = rgb(0x4a2a18), LEA2 = rgb(0x2a1a10), RED = rgb(0x6a2a24), BR = rgb(0xb88a44);
    /* 털가죽 깔개: 등에 붙은 두툼한 천, 가장자리 테 */
    const pc = [0, .71, .0], ph = [.18, .14, .2], padR = (x, y, z) => Math.max(boxR(pc, [.3, ph[1] - .04, ph[2] - .04])(x, y, z) - .04, .6 - y), trim = (x, y, z) => y < .625 || Math.abs(z) > .176;
    const seatR = (x, y, z) => smax(ellD(x, y - .77, (z + .01) * (z < -.01 ? .9 : 1.15), .13, .09, .13), .7 - y, .02);
    const sCol = (x, y, z) => fBody(x, y, z) > .03 && seatR(x, y, z) < .004 ? LEA : trim(x, y, z) ? BR : RED;   // 어느 도형이 그리든 같은 색
    P(F('root', bbB(pc, ph), (x, y, z) => smax(shell(fBody, .01, .012)(x, y, z), padR(x, y, z), .006), { g, c: sCol }));
    /* 가죽 자리: 아랫면은 깔개 속에 묻는다 (겹친 면 없음) */
    const sc = [0, .78, -.01];
    P(F('root', bbB(sc, [.16, .1, .16]), (x, y, z) => smax(shell(fBody, .036, .022)(x, y, z) - .012 * sstep(.0, -.1, z) * sstep(.04, .1, Math.abs(z + .01)), seatR(x, y, z), .015), { g, c: sCol }));
    P(E('root', [0, .79, .12], [.045, .03, .028], { g, c: LEA, k: .03 }));   // 앞 손잡이
    /* 뱃대끈·가슴띠 */
    P(F('root', bbB([0, .5, .1], [.25, .25, .03]), (x, y, z) => Math.max(shell(fBody, .006, .006)(x, y, z), boxR([0, .5, .1], [.25, .25, .022])(x, y, z)), { g, c: LEA2 }));
  }

  /* ================= 뼈 ================= */
  const bones = [
    { n: 'root', o: [0, .58, 0], tip: [0, .58, .3] },
    { n: 'neck', p: 'root', o: [0, .66, .3], tip: H0, bw: .07, rad: .26 },
    { n: 'head', p: 'neck', o: H0, tip: pt(.3, 0), bw: .05, rad: .18 },
    { n: 't1', p: 'root', o: [0, .66, -.44], tip: [0, .55, -.56], bw: .03, rad: .09 },
    { n: 't2', p: 't1', o: [0, .55, -.56], tip: [0, .27, -.62], bw: .05, rad: .12 },
  ];
  for (const s of [-1, 1]) {
    const q = s < 0 ? 'L' : 'R', x = s * .085;
    bones.push({ n: 'f' + q + 'a', p: 'root', o: [x, .5, .29], tip: [x, .14, .31], bw: .07, rad: .1 });
    bones.push({ n: 'f' + q + 'b', p: 'f' + q + 'a', o: [x, .135, .31], tip: [x, .04, .33], bw: .025, rad: .05 });
    bones.push({ n: 'f' + q + 'c', p: 'f' + q + 'b', o: [x, .04, .33], tip: [x, .02, .38], bw: .02, rad: .06 });
    bones.push({ n: 'h' + q + 'a', p: 'root', o: [x, .56, -.3], tip: [x, .2, -.395], bw: .08, rad: .13 });
    bones.push({ n: 'h' + q + 'b', p: 'h' + q + 'a', o: [x, .2, -.395], tip: [x, .04, -.35], bw: .025, rad: .05 });
    bones.push({ n: 'h' + q + 'c', p: 'h' + q + 'b', o: [x, .04, -.35], tip: [x, .02, -.3], bw: .02, rad: .06 });
  }
  return {
    prims, bones, h: .9, size: 1, anim: { H0, b, knobs: { nose: [], collar: [] }, leg: .66 },
    mats: { body: { r: .9 }, mane: { r: .9 }, nose: { r: .4 }, eye: { r: .12 }, saddle: { r: .7 } },
    gopt: { body: { tris: 14000, h: .005 }, mane: { tris: 3500, h: .004, loK: .2 }, nose: { tris: 400, h: .0025, loK: .4 }, eye: { tris: 160, h: .002, noLo: 1 }, saddle: { tris: 3000, h: .0035, loK: .25 } }
  };
}
module.exports = { wolf };
