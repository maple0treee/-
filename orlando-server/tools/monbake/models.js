/*
 * 사람 모양 몬스터 생김새 (거리 함수로 빚는다)
 * 좌표: y 위, z 앞(몬스터가 보는 쪽), x+ 가 오른손(무기 든 손) 쪽. 발바닥 y=0, 키는 2m 안팎 (게임이 MON.scale 로 키운다)
 * 뼈: root·hip·spine·head·jaw / shL·elL·haL / shR·elR·haR / thL·knL·ftL / thR·knR·ftR (+꼬리 t1..)
 */
'use strict';
const { clamp, mix, sstep, rgb, cmix, csc, vnoise, fbm, rot, E, C, L, B, T: Ring, F, capD, ellD, smin } = require('./lib');

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const X = (p, s) => [p[0] * s, p[1], p[2]];
const mot = (c, k, f = 9) => (x, y, z) => csc(c, 1 + k * fbm(x * f, y * f, z * f, 3));   // 얼룩

/* ===================================================================
   몸 뼈대 (자세: 팔을 조금 벌리고 늘어뜨린 채 선 모습)
   =================================================================== */
function rig(P) {
  const hunch = P.hunch || 0, wY = P.waistY;
  const U = p => { const dy = p[1] - wY, dz = p[2]; if (dy <= 0) return p; const c = Math.cos(hunch), s = Math.sin(hunch); return [p[0], wY + dy * c - dz * s, dz * c + dy * s]; };
  const J = {};
  J.hip = [0, P.hipY, 0];
  J.waist = [0, wY, 0];
  J.neck = U([0, P.neckY, P.neckZ || 0]);
  J.head = add(J.neck, P.headOff);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = U([s * P.shW, P.shY, P.shZ || 0]);
    const out = P.armOut || .16, fw = P.armFwd || .1;
    const el = add(sh, [s * Math.sin(out) * P.upL, -Math.cos(out) * P.upL, Math.sin(fw * .5) * P.upL]);
    const wr = add(el, [s * Math.sin(out * .7) * P.foL, -Math.cos(out * .7) * P.foL * .97, Math.sin(fw * 1.6) * P.foL]);
    J['sh' + k] = sh; J['el' + k] = el; J['wr' + k] = wr;
    const th = [s * P.hipW, P.hipY - .02, 0], kn = [s * (P.hipW + (P.kneeOut || .005)), P.kneeY, .02], an = [s * (P.hipW + (P.ankleOut || .01)), P.ankleY, -.005];
    J['th' + k] = th; J['kn' + k] = kn; J['an' + k] = an;
  }
  const bones = [
    { n: 'root', o: [0, 0, 0], tip: J.hip },
    { n: 'hip', p: 'root', o: J.hip, tip: J.waist },
    { n: 'spine', p: 'hip', o: J.waist, tip: J.neck, bw: P.waistBw || .08 },
    { n: 'head', p: 'spine', o: J.neck, tip: J.head, bw: .05, rad: .2 },
  ];
  for (const k of ['L', 'R']) {
    const lr = P.armR || .08;
    bones.push({ n: 'sh' + k, p: 'spine', o: J['sh' + k], tip: J['el' + k], bw: lr * .9, rad: lr * 2.6 });
    bones.push({ n: 'el' + k, p: 'sh' + k, o: J['el' + k], tip: J['wr' + k], bw: lr * .6, rad: lr * 2 });
    bones.push({ n: 'ha' + k, p: 'el' + k, o: J['wr' + k], tip: add(J['wr' + k], [0, -.1, 0]), bw: lr * .3, rad: lr * 1.6 });
    const t = P.thR || .1;
    bones.push({ n: 'th' + k, p: 'hip', o: J['th' + k], tip: J['kn' + k], bw: t * .85, rad: t * 2.4 });
    bones.push({ n: 'kn' + k, p: 'th' + k, o: J['kn' + k], tip: J['an' + k], bw: t * .55, rad: t * 1.8 });
    bones.push({ n: 'ft' + k, p: 'kn' + k, o: J['an' + k], tip: add(J['an' + k], [0, -.05, .1]), bw: t * .35, rad: t * 1.6 });
  }
  return { J, U, bones, hunch };
}

/* 근육 진 팔 한쪽: 어깨 세모근·위팔 두갈래근·세갈래근·아래팔·손 (주먹 또는 편 손) */
function arm(R, s, P, o) {
  const k = s < 0 ? 'L' : 'R', sh = R.J['sh' + k], el = R.J['el' + k], wr = R.J['wr' + k], r = P.armR, c = o.skin, out = [];
  const up = norm(sub(sh, el)), fo = norm(sub(el, wr));
  const dl = o.disp;
  out.push(E('sh' + k, add(sh, [s * r * .25, -r * .35, 0]), [r * 1.3, r * 1.45, r * 1.25], { k: r * .5, c, disp: dl, amp: o.amp }));                      // 어깨
  out.push(C('sh' + k, add(sh, scl(up, -r * .5)), add(el, scl(up, r * .3)), r * 1.02, r * .82, { k: r * .5, c, disp: dl, amp: o.amp }));                  // 위팔
  out.push(E('sh' + k, add(lerp3(sh, el, .45), [0, 0, r * .45]), [r * .78, r * 1.6, r * .7], { k: r * .5, c, rot: [0, 0, s * (P.armOut || .16)], disp: dl, amp: o.amp }));   // 두갈래근
  out.push(E('sh' + k, add(lerp3(sh, el, .4), [s * r * .1, 0, -r * .45]), [r * .8, r * 1.7, r * .72], { k: r * .5, c, rot: [0, 0, s * (P.armOut || .16)], disp: dl, amp: o.amp }));   // 세갈래근
  out.push(E('el' + k, el, [r * .85, r * .85, r * .85], { k: r * .4, c, disp: dl, amp: o.amp }));                                                            // 팔꿈치
  out.push(C('el' + k, el, add(wr, scl(fo, r * .2)), r * .92, r * .62, { k: r * .4, c, disp: dl, amp: o.amp }));                                              // 아래팔
  out.push(E('el' + k, add(lerp3(el, wr, .28), [s * r * .2, 0, r * .15]), [r * .85, r * 1.5, r * .78], { k: r * .5, c, rot: [0, 0, s * (P.armOut || .16) * .7], disp: dl, amp: o.amp }));   // 아래팔 근육
  // 손
  const hs = P.handS * r, hc = add(wr, [0, -hs * .9, hs * .1]);
  if (o.fist) {
    // 쥔 주먹: 손바닥 덩이 + 네 손가락 마디 + 엄지 (손잡이를 감싼다, 손잡이 축은 o.fistAx)
    out.push(E('ha' + k, hc, [hs * .72, hs * 1.0, hs * .9], { k: hs * .4, c, rot: [.1, 0, 0] }));
    const ax = o.fistAx || [0, -.25, 1], A = norm(ax);
    for (let i = 0; i < 4; i++) {
      const t = (i - 1.5) / 1.5, base = add(hc, add(scl(A, t * hs * .6), [s * hs * .55, -hs * .45, 0]));
      out.push(E('ha' + k, base, [hs * .32, hs * .36, hs * .3], { k: hs * .18, c }));                                                       // 주먹 마디
      out.push(E('ha' + k, add(base, [-s * hs * .45, -hs * .38, 0]), [hs * .3, hs * .3, hs * .28], { k: hs * .2, c }));                     // 접힌 손가락
    }
    out.push(C('ha' + k, add(hc, [-s * hs * .2, hs * .2, hs * .55]), add(hc, [-s * hs * .05, -hs * .35, hs * .85]), hs * .32, hs * .24, { k: hs * .2, c }));   // 엄지
  } else {
    // 편 손: 손바닥 + 살짝 구부린 손가락 넷 + 엄지 (손톱 o.nail)
    out.push(E('ha' + k, hc, [hs * .38, hs * .95, hs * .78], { k: hs * .35, c, rot: [0, 0, s * .1] }));
    for (let i = 0; i < 4; i++) {
      const t = (i - 1.5) / 1.5, len = hs * (o.claw ? 1.35 : 1.05) * (1 - Math.abs(t) * .18);
      const a = add(hc, [s * hs * .05, -hs * .75, t * hs * .55]), b = add(a, [s * hs * .1, -len * .55, hs * .12]), cc = add(b, [-s * hs * .05, -len * .45, hs * .28]);
      out.push(...L('ha' + k, [a, b, cc], [hs * .2, hs * .18, hs * .14], { k: hs * .15, kj: hs * .08, c }));
      if (o.nail) out.push(E('ha' + k, add(cc, [0, -hs * .1, hs * .06]), [hs * .1, hs * .2, hs * .12], { k: 0, c: o.nail, hard: 1, rot: [.5, 0, 0] }));
    }
    out.push(...L('ha' + k, [add(hc, [s * hs * .05, -hs * .2, hs * .6]), add(hc, [-s * hs * .1, -hs * .55, hs * .95]), add(hc, [-s * hs * .12, -hs * .85, hs * 1.05])], [hs * .26, hs * .21, hs * .16], { k: hs * .2, kj: hs * .08, c }));
  }
  return out;
}

/* 다리 한쪽: 넓적다리 근육·무릎·종아리·발 (맨발이면 발가락) */
function leg(R, s, P, o) {
  const k = s < 0 ? 'L' : 'R', th = R.J['th' + k], kn = R.J['kn' + k], an = R.J['an' + k], r = P.thR, c = o.skin, out = [], dl = o.disp;
  out.push(C('th' + k, th, kn, r * 1.05, r * .72, { k: r * .5, c, disp: dl, amp: o.amp }));
  out.push(E('th' + k, add(lerp3(th, kn, .45), [s * r * .1, 0, r * .3]), [r * .82, r * 1.9, r * .78], { k: r * .5, c, disp: dl, amp: o.amp }));          // 넓적다리 앞 근육
  out.push(E('th' + k, add(lerp3(th, kn, .35), [-s * r * .25, 0, -r * .15]), [r * .75, r * 1.7, r * .8], { k: r * .5, c, disp: dl, amp: o.amp }));
  out.push(E('kn' + k, add(kn, [0, 0, r * .25]), [r * .62, r * .66, r * .55], { k: r * .35, c, disp: dl, amp: o.amp }));                                // 무릎
  out.push(C('kn' + k, kn, add(an, [0, r * .3, 0]), r * .72, r * .46, { k: r * .4, c, disp: dl, amp: o.amp }));
  out.push(E('kn' + k, add(lerp3(kn, an, .3), [0, 0, -r * .32]), [r * .62, r * 1.45, r * .62], { k: r * .45, c, disp: dl, amp: o.amp }));            // 종아리
  // 발
  const fs = P.footS * r, fc = add(an, [0, -P.ankleY * .55, fs * .55]);
  if (o.boot) {
    out.push(...o.boot(k, an, fc, fs));
  } else {
    out.push(E('ft' + k, add(an, [0, -P.ankleY * .2, -fs * .1]), [fs * .45, P.ankleY * .7, fs * .5], { k: fs * .3, c }));   // 발뒤꿈치
    out.push(E('ft' + k, fc, [fs * .5, P.ankleY * .55, fs * 1.0], { k: fs * .35, c }));
    for (let i = 0; i < (o.toes || 4); i++) {
      const t = (i - ((o.toes || 4) - 1) / 2) / 1.8, tp = add(fc, [t * fs * .55, -P.ankleY * .1, fs * .95 - Math.abs(t) * fs * .2]);
      out.push(E('ft' + k, tp, [fs * .17, fs * .15, fs * .25], { k: fs * .12, c }));
      if (o.nail) out.push(E('ft' + k, add(tp, [0, fs * .03, fs * .18]), [fs * .12, fs * .08, fs * .12], { k: 0, c: o.nail, hard: 1 }));
    }
  }
  return out;
}

/* 몸통: 골반·배·가슴·등·승모근·목 (o.belly: 배 크기) */
function torso(R, P, o) {
  const c = o.skin, out = [], U = R.U, dl = o.disp, h = R.hunch, W = P.chestW, D = P.chestD;
  const cy = P.chestY, wy = P.waistY, hy = P.hipY;
  out.push(E('hip', [0, hy + .03, -.01], [W * .78, .13, D * .78], { k: .05, c, disp: dl, amp: o.amp }));                                   // 골반
  for (const s of [-1, 1]) out.push(E('hip', [s * W * .36, hy - .02, -D * .45], [W * .42, .13, D * .5], { k: .06, c, disp: dl, amp: o.amp }));   // 엉덩이
  out.push(E('spine', U([0, wy + .05, .01]), [W * .74, .14, D * .8], { k: .07, c, rot: [h, 0, 0], disp: dl, amp: o.amp }));               // 허리
  out.push(E('spine', U([0, cy, 0]), [W, P.chestH, D], { k: .08, c, rot: [h, 0, 0], disp: dl, amp: o.amp }));                              // 가슴통
  for (const s of [-1, 1]) {
    out.push(E('spine', U([s * W * .45, cy + P.chestH * .3, D * .55]), [W * .5, P.chestH * .42, D * .42], { k: .05, c, rot: [h - .15, 0, s * .15], disp: dl, amp: o.amp }));   // 가슴 근육
    out.push(E('spine', U([s * W * .55, cy - P.chestH * .1, -D * .3]), [W * .45, P.chestH * .8, D * .5], { k: .06, c, rot: [h, 0, s * .1], disp: dl, amp: o.amp }));          // 등 넓은근
    out.push(E('spine', U([s * W * .38, P.shY + .02, -D * .15]), [W * .45, .09, D * .6], { k: .06, c, rot: [h, 0, -s * .35], disp: dl, amp: o.amp }));                       // 승모근
  }
  if (o.abs) for (let i = 0; i < 3; i++) for (const s of [-1, 1]) out.push(E('spine', U([s * W * .17, wy + .1 + i * P.chestH * .32, D * .72]), [W * .16, P.chestH * .16, D * .2], { k: .04, c, rot: [h, 0, 0] }));
  if (o.belly) { const b = o.belly; out.push(E('spine', U([0, wy + .06, D * .35]), [W * .85 * b, .19 * b, D * .95 * b], { k: .1, c: o.bellyC || c, rot: [h * .5, 0, 0], disp: dl, amp: o.amp })); }
  out.push(C('head', U([0, P.shY - .02, -.02]), add(R.J.neck, [0, .06, .01]), P.neckR, P.neckR * .85, { k: .07, c, disp: dl, amp: o.amp }));   // 목
  return out;
}

/* ---------- 무늬·결 ---------- */
const stoneDisp = (amp, f) => (x, y, z) => amp * (Math.abs(fbm(x * f, y * f, z * f, 3)) * 2 - .5);
const furDisp = (amp, f) => (x, y, z) => -amp * Math.pow(.5 + .5 * Math.sin(x * f * 2.4 + z * f * 1.3 + fbm(x * 4, y * 2.5, z * 4, 2) * 6), 1.6) - amp * .3 * vnoise(x * f * 3, y * f, z * f * 3);   // 아래로 늘어진 털 다발
const furCol = (c, f) => (x, y, z) => csc(c, .72 + .4 * Math.pow(.5 + .5 * Math.sin(x * f * 2.4 + z * f * 1.3 + fbm(x * 4, y * 2.5, z * 4, 2) * 6), .7));
const plateN = (x, y, z) => Math.abs(fbm(x * 4.5 + 7.3, y * 4.5, z * 4.5 - 2.1, 3));                    // 돌 판 사이 금
const rockDisp = (x, y, z) => .014 * clamp(1 - plateN(x, y, z) / .045, 0, 1) + .005 * fbm(x * 16, y * 16, z * 16, 2);
const barkDisp = (amp, f) => (x, y, z) => { const a = Math.atan2(z, x); return -amp * Math.pow(Math.abs(Math.sin(a * 7 + fbm(x * 3, y * f * .15, z * 3, 2) * 5)), 3); };
const crack = (f, w) => (x, y, z) => { const n = Math.abs(fbm(x * f, y * f, z * f, 3)); return n < w; };

/* ---------- 무기 ---------- */
function weaponGrip(R, k) { const wr = R.J['wr' + k]; return wr; }
/* 큰 몽둥이: 손잡이(가죽 감김) + 굵어지는 머리 + 박힌 쇠못 / 돌 */
function club(R, P, o) {
  const out = [], hs = P.handS * P.armR, G = add(R.J.wrR, [0, -hs * .95, hs * .15]), A = norm(o.ax || [0, -.12, 1]);
  const a = add(G, scl(A, -hs * 1.6)), e = add(G, scl(A, o.len || 1.0));
  const wood = o.wood || [.36, .24, .14];
  const grain = (x, y, z) => { const n = fbm(x * 18, y * 18, z * 4, 2); return csc(wood, .82 + .3 * n); };
  out.push(C('haR', a, add(G, scl(A, hs * 1.4)), o.r0 || .032, o.r0 || .032, { k: 0, c: (x, y, z) => { const t = Math.sin((x * A[0] + y * A[1] + z * A[2]) * 160); return t > .3 ? csc(o.wrap || [.3, .2, .12], 1.1) : csc(o.wrap || [.3, .2, .12], .75); }, hard: 1 }));
  out.push(C('haR', add(G, scl(A, hs * 1.2)), e, (o.r0 || .032) * 1.05, o.r1 || .1, { k: .02, c: grain, disp: o.knot ? (x, y, z) => -.012 * Math.abs(Math.sin(fbm(x * 9, y * 9, z * 9) * 9)) : null, amp: .012 }));
  out.push(E('haR', add(G, scl(A, (o.len || 1) - .02)), [(o.r1 || .1) * 1.05, (o.r1 || .1) * 1.05, (o.r1 || .1) * 1.25], { k: .04, c: grain, rot: [Math.atan2(-A[1], A[2]) - Math.PI / 2, 0, 0] }));
  if (o.studs) {   // 쇠못
    for (let i = 0; i < o.studs; i++) {
      const t = .55 + .42 * ((i * .618) % 1), ang = i * 2.4, rr = (o.r0 || .032) + ((o.r1 || .1) - (o.r0 || .032)) * t;
      const cpt = add(G, scl(A, (o.len || 1) * t)), side = norm([Math.cos(ang), Math.sin(ang) * A[2], -Math.sin(ang) * A[1]]);
      out.push(C('haR', add(cpt, scl(side, rr * .7)), add(cpt, scl(side, rr + .045)), .016, .004, { g: 'metal', k: 0, c: [.55, .56, .58] }));
    }
  }
  if (o.rocks) for (let i = 0; i < o.rocks; i++) {   // 박힌 돌 (돌 몽둥이)
    const t = .6 + .38 * ((i * .618) % 1), ang = i * 2.1, rr = (o.r1 || .1) * .85;
    const cpt = add(G, scl(A, (o.len || 1) * t)), side = norm([Math.cos(ang), Math.sin(ang) * A[2], -Math.sin(ang) * A[1]]);
    out.push(E('haR', add(cpt, scl(side, rr)), [.05, .042, .055], { k: .01, c: mot(o.rockC || [.42, .41, .4], .3, 20), rot: [ang, ang * .7, 0], disp: stoneDisp(.008, 30), amp: .01 }));
  }
  return out;
}
/* 큰 돌 망치: 나무 자루 + 끈으로 묶은 네모진 바윗덩이 */
function maul(R, P, o) {
  const out = [], hs = P.handS * P.armR, G = add(R.J.wrR, [0, -hs * .95, hs * .15]), A = norm(o.ax || [0, -.1, 1]);
  const len = o.len || 1.05, wood = o.wood || [.38, .27, .16];
  out.push(C('haR', add(G, scl(A, -hs * 1.8)), add(G, scl(A, len)), .034, .036, { k: 0, c: (x, y, z) => csc(wood, .82 + .3 * fbm(x * 16, y * 16, z * 3, 2)) }));
  const hc = add(G, scl(A, len - .06)), up = norm([0, A[2], -A[1]]);
  const rx = Math.atan2(-A[1], A[2]);
  out.push(B('haR', hc, [o.hw || .12, o.hh || .105, o.hd || .14], .05, { k: 0, rot: [rx, 0, 0], c: mot(o.stoneC || [.46, .45, .43], .35, 14), disp: stoneDisp(.012, 11), amp: .015 }));
  for (const t of [-.08, .08]) out.push(Ring('haR', add(hc, scl(A, t)), (o.hw || .12) + .01, .011, { k: 0, rot: [rx + Math.PI / 2, 0, 0], sy: (o.hh || .105) / (o.hw || .12) * 1.15, c: [.32, .22, .13] }));   // 묶은 끈
  return out;
}

/* ---------- 눈 ---------- */
function eyes(J, o) {
  const out = [];
  for (const s of [-1, 1]) {
    const p = add(J.head, [s * o.x, o.y, o.z]);
    out.push(E('head', p, [o.r, o.r * (o.sq || .8), o.r * .7], { g: o.glow ? 'glow' : 'eye', k: 0, c: o.c, noAO: 1, rot: [0, s * .35, 0] }));
    if (o.pupil) out.push(E('head', add(p, [s * o.r * .2, 0, o.r * .55]), [o.r * .45, o.r * .45 * (o.sq || .8), o.r * .25], { g: 'eye', k: 0, c: o.pupil, noAO: 1, pri: .01 }));
  }
  return out;
}

/* ===================================================================
   거인: 사람에 가깝지만 크고 묵직한 몸, 짙은 눈썹뼈, 수염, 털 망토, 가죽 치마, 묶은 정강이, 큰 돌 망치
   =================================================================== */
function giant(Q) {
  const P = { hipY: .98, waistY: 1.16, chestY: 1.38, chestW: .27, chestD: .18, chestH: .2, shY: 1.56, shW: .33, neckY: 1.62, neckR: .095, headOff: [0, .2, .03],
    upL: .34, foL: .31, armR: .085, handS: 1.25, armOut: .2, armFwd: .12, hipW: .12, thR: .115, kneeY: .55, ankleY: .09, footS: 1.15, hunch: .06 };
  const R = rig(P), J = R.J, out = [];
  const skinC = Q.skin, sk = Q.rocky ? mot(skinC, .22, 3.5) : mot(skinC, .1, 5);
  const disp = Q.rocky ? rockDisp : null, amp = Q.rocky ? .016 : 0;
  // 피부: 돌 피부면 판 사이 금을 파고 어둡게, 판마다 빛깔이 조금씩 다르다 (불의 거인은 금이 빛난다)
  const skin = Q.rocky ? (x, y, z) => { const n = plateN(x, y, z), base = csc(sk(x, y, z), .92 + .16 * vnoise(x * 9, y * 9, z * 9)); return csc(base, .55 + .45 * clamp(n / .06, 0, 1)); } : (x, y, z) => cmix(sk(x, y, z), csc(skinC, 1.12), clamp(vnoise(x * 3, y * 3, z * 3), 0, 1) * .3);
  out.push(...torso(R, P, { skin, disp, amp, abs: 1, belly: Q.belly || 0 }));
  for (const s of [-1, 1]) { out.push(...arm(R, s, P, { skin, disp, amp, fist: s > 0, fistAx: [0, -.12, 1], nail: Q.nail })); out.push(...leg(R, s, P, { skin, disp, amp, boot: Q.wraps ? footWrap(Q) : null, nail: Q.nail })); }
  // 머리: 큰 턱, 튀어나온 눈썹뼈, 굵은 코, 귀
  const H = J.head, hc = (x, y, z) => skin(x, y, z);
  const hd = Q.rocky ? (x, y, z) => rockDisp(x, y, z) * .6 : null;
  out.push(E('head', add(H, [0, .025, -.015]), [.14, .155, .15], { k: .03, c: hc, disp: hd, amp }));                        // 머리통
  out.push(E('head', add(H, [0, -.075, .045]), [.135, .095, .12], { k: .06, c: hc, disp: hd, amp }));                       // 넓은 턱
  out.push(E('head', add(H, [0, .05, .112]), [.13, .04, .055], { k: .03, c: hc, disp: hd, amp }));                           // 튀어나온 눈썹뼈
  out.push(E('head', add(H, [0, .09, .08]), [.11, .05, .06], { k: .05, c: hc, disp: hd, amp }));                             // 이마
  for (const s of [-1, 1]) {
    out.push(E('head', add(H, [s * .085, -.01, .105]), [.045, .034, .04], { k: .03, c: hc }));                              // 광대
    out.push(E('head', add(H, [s * .14, .0, -.005]), [.024, .05, .034], { k: .015, c: hc, rot: [0, s * .3, 0] }));          // 귀
    out.push(E('head', add(H, [s * .05, .02, .132]), [.034, .022, .034], { sub: 1, k: .014 }));                                 // 깊은 눈 자리
    out.push(E('head', add(H, [s * .024, -.035, .182]), [.018, .016, .018], { k: .012, c: hc }));                           // 콧방울
  }
  out.push(C('head', add(H, [0, .045, .148]), add(H, [0, -.025, .19]), .02, .03, { k: .025, c: hc }));                      // 굵은 코
  out.push(E('head', add(H, [0, -.072, .145]), [.046, .007, .025], { sub: 1, k: .006 }));                                    // 입
  out.push(E('head', add(H, [0, -.085, .15]), [.04, .014, .02], { k: .012, c: csc(Q.skin, .8) }));                         // 아랫입술
  out.push(...eyes(J, { x: .05, y: .019, z: .118, r: .015, c: Q.eyeGlow ? (Q.eyeC || [1, .7, .3]) : [.06, .05, .04], glow: Q.eyeGlow, sq: .62 }));
  const nSkin = out.length;
  // 수염
  const beardC = Q.beard;
  if (beardC) {
    const bc = furCol(beardC, 26), bd = furDisp(.008, 26);
    out.push(E('head', add(H, [0, -.11, .1]), [.125, .1, .075], { k: .03, c: bc, disp: bd, amp: .01, soft: .006 }));
    out.push(E('head', add(H, [0, -.22, .115]), [.095, .13, .06], { k: .05, c: bc, disp: bd, amp: .01, rot: [-.25, 0, 0], soft: .006 }));
    if (Q.braid) for (const s of [-1, 1]) {   // 땋은 두 갈래
      for (let i = 0; i < 4; i++) out.push(E('head', add(H, [s * .035, -.27 - i * .045, .115 - i * .008]), [.022, .028, .02], { k: .008, c: bc, soft: .006 }));
      out.push(Ring('head', add(H, [s * .035, -.265, .115]), .022, .006, { c: Q.ring || [.6, .5, .3], g: 'metal' }));
    }
    for (const s of [-1, 1]) out.push(E('head', add(H, [s * .045, -.055, .165]), [.05, .018, .022], { k: .02, c: bc, rot: [0, 0, s * .35], soft: .006 }));   // 콧수염
  }
  // 머리카락: 갈기처럼 뒤로 넘긴 머리 / 돌 볏 / 얼음 가시
  if (Q.hair) {
    const hcol = furCol(Q.hair, 22), hd = furDisp(.009, 22);
    out.push(E('head', add(H, [0, .08, -.03]), [.15, .11, .15], { k: .02, c: hcol, disp: hd, amp: .012, soft: .006 }));
    out.push(E('head', add(H, [0, -.04, -.11]), [.145, .17, .075], { k: .05, c: hcol, disp: hd, amp: .012, soft: .006 }));
    out.push(E('spine', R.U([0, P.shY - .02, -.12]), [.15, .12, .06], { k: .06, c: hcol, disp: hd, amp: .01, soft: .006 }));
  }
  if (Q.crest) for (let i = 0; i < 5; i++) out.push(E('head', add(H, [0, .13 - i * .012, .06 - i * .05]), [.025, .05, .035], { k: .02, c: Q.crest, rot: [-.5 - i * .15, 0, 0], disp: stoneDisp(.006, 20), amp: .008 }));
  if (Q.icicles) for (let i = 0; i < 9; i++) { const s = i % 2 ? 1 : -1, a = .4 + i * .09; out.push(C('spine', R.U([s * (.12 + i * .02), P.shY + .03, -.06 + (i % 3) * .05]), R.U([s * (.15 + i * .025), P.shY + .17 + (i % 3) * .04, -.09 + (i % 3) * .05]), .028, .002, { g: 'ice', k: 0, c: [.78, .9, .98], noAO: 1 })); }
  // 옷: 털 망토(어깨) · 가죽 치마 · 넓은 띠와 버클 · 팔 가죽 덧댐
  if (Q.mantle) {
    const mc = furCol(Q.mantle, 18), md = furDisp(.016, 18);
    for (const s of [-1, 1]) out.push(E('spine', R.U([s * .2, P.shY + .01, -.02]), [.2, .085, .2], { k: .04, c: mc, disp: md, amp: .014, rot: [0, 0, -s * .3], soft: .006 }));
    out.push(E('spine', R.U([0, P.shY - .1, -.14]), [.3, .2, .08], { k: .05, c: mc, disp: md, amp: .014, soft: .006 }));
    out.push(E('spine', R.U([0, P.chestY - .05, -.16]), [.27, .28, .05], { k: .06, c: mc, disp: md, amp: .014, soft: .006 }));
    if (Q.skull) out.push(E('spine', R.U([.22, P.shY + .06, .02]), [.05, .055, .06], { k: .01, c: [.86, .82, .72] }));   // 어깨 위 짐승 머리뼈
  }
  const leather = Q.leather || [.36, .25, .16];
  const lc = (x, y, z) => csc(leather, .85 + .2 * fbm(x * 25, y * 25, z * 25, 2));
  // 치마: 허리에 두른 가죽 (아래로 벌어지고 주름), 앞뒤 자락
  out.push(F('hip', [-.36, P.hipY - .22, -.3, .36, P.hipY + .16, .3], (x, y, z) => {
    const y1 = P.hipY + .14, y0 = P.hipY - .18, t = clamp((y1 - y) / (y1 - y0), 0, 1), a = Math.atan2(z, x);
    const R0 = 1.0 + t * .42 + .05 * t * Math.sin(a * 9 + Math.sin(a * 3) * 1.5), r = Math.hypot(x / (P.chestW * .86), z / (P.chestD * .98));
    return Math.max(Math.abs(r - R0) * P.chestW * .86 - .011, y - y1, y0 - .02 * Math.sin(a * 5) - y);
  }, { k: 0, c: lc, own: .02 }));
  out.push(F('spine', [-.3, 1.02, -.25, .3, 1.2, .25], (x, y, z) => { const r = Math.hypot(x / (P.chestW * .82), z / (P.chestD * .95)); return Math.max(Math.abs(r - 1) * .17 - .018, Math.abs(y - (P.hipY + .14)) - .035); }, { k: .004, c: csc(leather, .55) }));   // 넓은 띠
  out.push(B('spine', [0, P.hipY + .14, P.chestD * .92 + .02], [.05, .04, .015], .008, { g: 'metal', k: 0, c: Q.buckle || [.55, .45, .25] }));            // 버클
  for (const s of [-1, 1]) {   // 팔목 가죽
    const k = s < 0 ? 'L' : 'R', el = J['el' + k], wr = J['wr' + k];
    out.push(C('el' + k, lerp3(el, wr, .45), lerp3(el, wr, .92), P.armR * .82, P.armR * .7, { k: .005, c: lc, disp: (x, y, z) => -.003 * Math.abs(Math.sin(y * 90)), amp: .004 }));
  }
  // 무기
  if (Q.weapon === 'maul') out.push(...maul(R, P, { stoneC: Q.stoneC, len: 1.05 }));
  else out.push(...club(R, P, { len: 1.0, r1: .11, wood: Q.wood, rocks: Q.clubRocks || 0, studs: Q.studs || 0, knot: 1, rockC: Q.stoneC }));
  if (Q.lava) {
    lavaify(out, 5, .07, nSkin);
    for (let i = 0; i < 9; i++) { const a = -1.2 + i * .3, h0 = add(H, [Math.sin(a) * .1, .12 - Math.abs(a) * .03, -.03 + Math.cos(a) * .02]); out.push(C('head', h0, add(h0, [Math.sin(a) * .05, .1 + (i % 3) * .05, -.08]), .035, .002, { g: 'glow', k: .02, c: (x, y, z) => cmix([1, .35, .05], [1, .85, .4], clamp((y - h0[1]) / .15, 0, 1)), noAO: 1 })); }   // 불꽃 머리
  }
  // 정강이 감은 천
  return finish(R, out, Q, { h: 2.0 });
}
function footWrap(Q) {
  const wc = Q.wrapC || [.5, .44, .34], fur = Q.bootFur;
  return (k, an, fc, fs) => {
    const out = [], c = (x, y, z) => csc(wc, .8 + .25 * (.5 + .5 * Math.sin(y * 110 + x * 20)));
    out.push(E('ft' + k, add(an, [0, -.03, -.01]), [.07, .07, .08], { k: .03, c }));
    out.push(E('ft' + k, fc, [.07, .05, .135], { k: .04, c: fur ? (x, y, z) => csc(fur, .8 + .3 * Math.abs(Math.sin(x * 80 + z * 60))) : c, disp: fur ? furDisp(.006, 25) : null, amp: .007 }));
    out.push(C('kn' + k, add(an, [0, .05, 0]), add(an, [0, .3, .01]), .068, .078, { k: .01, c, disp: (x, y, z) => -.004 * Math.abs(Math.sin(y * 70 + x * 12)), amp: .005 }));
    return out;
  };
}

/* ===================================================================
   오우거: 커다란 배, 짧고 굵은 다리, 어깨에 묻힌 작은 머리, 아래로 튀어나온 엄니, 상투, 허리띠와 가죽 덧댐, 쇠못 몽둥이
   =================================================================== */
function ogre(Q) {
  const P = { hipY: .86, waistY: 1.02, chestY: 1.3, chestW: .3, chestD: .22, chestH: .22, shY: 1.5, shW: .36, neckY: 1.55, neckZ: .04, neckR: .1, headOff: [0, .13, .1],
    upL: .32, foL: .3, armR: .095, handS: 1.25, armOut: .3, armFwd: .2, hipW: .14, thR: .13, kneeY: .48, ankleY: .09, footS: 1.1, hunch: .14 };
  const R = rig(P), J = R.J, out = [], sk = mot(Q.skin, .14, 6);
  const skin = Q.warts ? (x, y, z) => { const n = vnoise(x * 40, y * 40, z * 40); return n > .55 ? csc(sk(x, y, z), .82) : sk(x, y, z); } : sk;
  const disp = Q.warts ? (x, y, z) => -.006 * clamp(vnoise(x * 40, y * 40, z * 40) * 2 - 1.1, 0, 1) : null;
  out.push(...torso(R, P, { skin, belly: 1.35, bellyC: (x, y, z) => cmix(skin(x, y, z), csc(Q.skin, 1.18), clamp(z * 3, 0, .5)), disp, amp: .006 }));
  out.push(E('spine', [0, P.waistY + .02, .2], [.004, .02, .02], { sub: 1, k: .01 }));   // 배꼽
  for (const s of [-1, 1]) { out.push(...arm(R, s, P, { skin, fist: s > 0, fistAx: [0, -.15, 1], nail: [.82, .78, .62] })); out.push(...leg(R, s, P, { skin, toes: 3, nail: [.82, .78, .62] })); }
  const H = J.head, hc = skin;
  out.push(E('head', add(H, [0, .03, -.02]), [.12, .11, .12], { k: .03, c: hc }));
  out.push(E('head', add(H, [0, -.05, .045]), [.14, .085, .11], { k: .06, c: hc }));                 // 넓은 아래턱
  out.push(E('head', add(H, [0, .04, .085]), [.115, .028, .05], { k: .03, c: hc }));                 // 눈썹뼈
  out.push(E('head', add(H, [0, -.005, .13]), [.045, .035, .035], { k: .03, c: hc }));               // 납작코
  for (const s of [-1, 1]) {
    out.push(E('head', add(H, [s * .02, -.01, .158]), [.01, .008, .01], { sub: 1, k: .004 }));         // 콧구멍
    out.push(E('head', add(H, [s * .045, .018, .105]), [.024, .016, .025], { sub: 1, k: .01 }));
    out.push(C('head', add(H, [s * .118, .01, -.005]), add(H, [s * .17, .05, -.04]), .03, .01, { k: .02, c: hc }));   // 뾰족한 귀
    out.push(C('head', add(H, [s * .055, -.07, .125]), add(H, [s * .065, .0, .14]), .016, .006, { g: 'tooth', k: 0, c: [.92, .88, .74], hard: 1 }));   // 엄니
  }
  out.push(E('head', add(H, [0, -.065, .135]), [.07, .008, .025], { sub: 1, k: .006 }));
  out.push(...eyes(J, { x: .045, y: .017, z: .098, r: .014, c: Q.eyeC || [.95, .7, .2], glow: 1, sq: .7 }));
  // 상투
  if (Q.topknot) { out.push(E('head', add(H, [0, .13, -.04]), [.035, .05, .035], { k: .02, c: Q.topknot, disp: furDisp(.005, 30), amp: .006 })); out.push(Ring('head', add(H, [0, .1, -.035]), .03, .009, { c: [.5, .35, .2] })); out.push(C('head', add(H, [0, .17, -.05]), add(H, [0, .1, -.16]), .03, .012, { k: .02, c: Q.topknot, disp: furDisp(.005, 30), amp: .006 })); }
  // 허리 천 (앞자락이 무릎까지)
  const cl = Q.cloth, cc = (x, y, z) => csc(cl, .85 + .2 * fbm(x * 20, y * 20, z * 20, 2));
  out.push(F('hip', [-.36, .6, -.3, .36, 1.0, .32], (x, y, z) => { const r = Math.hypot(x / (P.chestW * .98), z / (P.chestD * 1.12)); return Math.max(Math.abs(r - 1) * .2 - .012, Math.abs(y - (P.hipY + .04)) - .1); }, { k: .004, c: cc, own: .02 }));
  out.push(F('hip', [-.15, .45, .15, .15, .95, .35], (x, y, z) => { const zz = P.chestD * 1.08 + (P.hipY - y) * .08 + .01 * Math.sin(x * 40); return Math.max(Math.abs(z - zz) - .012, Math.abs(x) - (.12 - (P.hipY - y) * .06), y - (P.hipY + .02), (P.hipY - .4) - y); }, { k: .01, c: cc, own: .02 }));
  out.push(F('hip', [-.15, .5, -.35, .15, .95, -.15], (x, y, z) => { const zz = -P.chestD * 1.05 - (P.hipY - y) * .1; return Math.max(Math.abs(z - zz) - .012, Math.abs(x) - .12, y - (P.hipY + .02), (P.hipY - .32) - y); }, { k: .01, c: cc, own: .02 }));
  out.push(Ring('spine', [0, P.hipY + .14, .02], P.chestW * .93, .022, { c: [.4, .27, .15], sy: P.chestD / P.chestW * 1.2 }));   // 밧줄 띠
  // 어깨 끈과 가죽 덧댐 (오른 어깨)
  out.push(F('spine', [-.4, 1.0, -.35, .4, 1.6, .4], (x, y, z) => { const p = R.U([0, 0, 0]); const u = (x - y * .75 + .85); const r = Math.hypot(x / (P.chestW * 1.08), z / (P.chestD * 1.2)); return Math.max(Math.abs(u) - .035, Math.abs(r - 1) * .2 - .01, Math.abs(y - P.chestY) - .3); }, { k: .004, c: [.33, .22, .12] }));
  out.push(E('shR', add(J.shR, [.04, .03, 0]), [.13, .07, .13], { k: .01, c: mot(Q.pad || [.42, .3, .18], .2, 20), rot: [0, 0, -.5] }));
  for (let i = 0; i < 3; i++) out.push(E('shR', add(J.shR, [.06 + i * .03, .07 - i * .02, -.05 + i * .05]), [.012, .012, .012], { g: 'metal', k: 0, c: [.6, .6, .62] }));
  // 팔목·정강이 띠
  for (const s of [-1, 1]) { const k = s < 0 ? 'L' : 'R'; out.push(Ring('el' + k, lerp3(J['el' + k], J['wr' + k], .8), P.armR * .78, .014, { c: [.36, .24, .14], rot: [0, 0, s * .2] })); }
  out.push(...club(R, P, { len: .95, r1: .12, wood: Q.wood || [.34, .22, .12], studs: 12, knot: 1 }));
  return finish(R, out, Q, { h: 1.85, heavy: 1 });
}

/* ===================================================================
   트롤: 마르고 길쭉한 몸, 굽은 등, 무릎까지 내려오는 긴 팔과 큰 손톱, 길게 처진 코·귀, 아래 엄니, 성긴 머리카락, 넝마 허리천
   =================================================================== */
function troll(Q) {
  const P = { hipY: .9, waistY: 1.07, chestY: 1.3, chestW: .22, chestD: .15, chestH: .2, shY: 1.48, shZ: .0, shW: .27, neckY: 1.52, neckZ: .05, neckR: .07, headOff: [0, .1, .17],
    upL: .38, foL: .38, armR: .065, handS: 1.65, armOut: .14, armFwd: .35, hipW: .11, thR: .085, kneeY: .5, ankleY: .08, footS: 1.5, hunch: .5, kneeOut: .03, waistBw: .1 };
  const R = rig(P), J = R.J, out = [];
  const sk = mot(Q.skin, .18, 7), skin = (x, y, z) => { const n = vnoise(x * 35, y * 35, z * 35); return n > .5 ? cmix(sk(x, y, z), Q.wart || csc(Q.skin, .78), .6) : sk(x, y, z); };
  const disp = (x, y, z) => -.006 * clamp(vnoise(x * 35, y * 35, z * 35) * 2 - 1, 0, 1), amp = .007;
  const ribs = (x, y, z) => disp(x, y, z) - .006 * Math.max(0, Math.sin(y * 70)) * clamp(1 - Math.abs(x) * 5, 0, 1) * clamp(z * 20, 0, 1) * 0;
  out.push(...torso(R, P, { skin, disp: ribs, amp, belly: Q.belly || 0 }));
  for (const s of [-1, 1]) { out.push(...arm(R, s, P, { skin, disp, amp, fist: s > 0 && Q.weapon, fistAx: [0, -.3, 1], claw: 1, nail: [.25, .2, .16] })); out.push(...leg(R, s, P, { skin, disp, amp, toes: 3, nail: [.25, .2, .16] })); }
  // 척추 마디가 드러난 굽은 등 (여기까지와 머리가 살갗)
  for (let i = 0; i < 6; i++) out.push(E('spine', R.U([0, P.waistY + .05 + i * .07, -P.chestD * .95]), [.022, .02, .018], { k: .025, c: skin }));
  const H = J.head, hc = skin;
  out.push(E('head', add(H, [0, .03, -.03]), [.1, .1, .115], { k: .03, c: hc, disp, amp }));
  out.push(E('head', add(H, [0, -.055, .03]), [.105, .06, .1], { k: .05, c: hc, disp, amp }));          // 넓은 입
  out.push(E('head', add(H, [0, .045, .065]), [.095, .025, .05], { k: .03, c: hc }));                   // 눈썹뼈
  out.push(...L('head', [add(H, [0, .03, .1]), add(H, [0, -.01, .16]), add(H, [0, -.05, .2]), add(H, [0, -.08, .205])], [.022, .026, .022, .016], { k: .02, kj: .01, c: hc }));   // 길게 처진 코
  for (const s of [-1, 1]) {
    out.push(...L('head', [add(H, [s * .09, .02, -.01]), add(H, [s * .16, .03, -.05]), add(H, [s * .23, .0, -.09])], [.032, .022, .006], { k: .015, kj: .01, c: hc }));   // 처진 귀
    out.push(E('head', add(H, [s * .04, .02, .088]), [.022, .016, .022], { sub: 1, k: .01 }));
    out.push(C('head', add(H, [s * .05, -.085, .09]), add(H, [s * .058, -.03, .115]), .012, .004, { g: 'tooth', k: 0, c: [.86, .8, .6], hard: 1 }));   // 아래 엄니
  }
  out.push(E('head', add(H, [0, -.075, .1]), [.07, .006, .03], { sub: 1, k: .006 }));
  out.push(...eyes(J, { x: .04, y: .018, z: .082, r: .015, c: Q.eyeC || [.95, .85, .2], glow: 1, sq: .75 }));
  const nSkin = out.length;
  // 성긴 머리카락 다발 (이끼·마른 풀 빛)
  if (Q.hair) {
    const hcol = (x, y, z) => csc(Q.hair, .75 + .4 * vnoise(x * 60, y * 20, z * 60));
    for (let i = 0; i < 7; i++) { const a = -1.3 + i * .43, base = add(H, [Math.sin(a) * .08, .1 - Math.abs(a) * .02, -.02 + Math.cos(a) * .02 - .03]); out.push(...L('head', [base, add(base, [Math.sin(a) * .05, -.04, -.08]), add(base, [Math.sin(a) * .08, -.14 - (i % 3) * .03, -.12])], [.022, .014, .004], { k: .02, kj: .01, c: hcol, soft: .006 })); }
  }
  if (Q.beard) for (let i = 0; i < 5; i++) { const x0 = (i - 2) * .025; out.push(...L('head', [add(H, [x0, -.08, .09]), add(H, [x0 * 1.3, -.15, .1]), add(H, [x0 * 1.5, -.25 - (i % 2) * .04, .08])], [.018, .012, .003], { k: .02, kj: .01, c: Q.beard, soft: .006 })); }
  if (Q.moss) for (let i = 0; i < 6; i++) { const s = i % 2 ? 1 : -1; out.push(E(i < 2 ? 'head' : 'spine', i < 2 ? add(H, [s * .05, .1, -.04]) : R.U([s * (.08 + i * .015), P.shY - .02 - i * .03, -P.chestD * .8]), [.06, .025, .05], { k: .02, c: (x, y, z) => csc(Q.moss, .7 + .5 * vnoise(x * 80, y * 80, z * 80)), disp: (x, y, z) => -.006 * vnoise(x * 70, y * 70, z * 70), amp: .006, rot: [.3, i, 0] })); }
  // 넝마 허리천: 찢긴 끝
  const cl = Q.cloth, cc = (x, y, z) => csc(cl, .8 + .25 * fbm(x * 25, y * 25, z * 25, 2));
  out.push(F('hip', [-.3, .55, -.28, .3, 1.02, .3], (x, y, z) => {
    const r = Math.hypot(x / (P.chestW * .98), z / (P.chestD * 1.15)), a = Math.atan2(z, x);
    const bottom = P.hipY - .12 - .08 * Math.abs(Math.sin(a * 5)) - .05 * Math.abs(Math.sin(a * 11 + 1));
    return Math.max(Math.abs(r - 1 - (P.hipY + .05 - y) * .5) * .18 - .011, y - (P.hipY + .07), bottom - y, -(Math.abs(Math.cos(a)) - .3) * .1);   // 옆은 트여서 다리가 드나든다
  }, { k: .004, c: cc, own: .02 }));
  out.push(Ring('hip', [0, P.hipY + .06, 0], P.chestW * .93, .016, { c: [.3, .22, .14], sy: P.chestD / P.chestW * 1.15 }));
  // 목걸이 (뼈 조각)
  /* (목걸이는 가슴에 또 하나의 입처럼 보여서 뺐다) */
  if (Q.weapon) out.push(...club(R, P, { len: .95, r1: .085, r0: .028, wood: Q.wood || [.42, .36, .28], knot: 1, ax: [0, -.35, 1], rocks: Q.clubRocks || 0, rockC: Q.stoneC }));
  if (Q.lava) lavaify(out, 6, .07, nSkin);
  return finish(R, out, Q, { h: 1.75, hunch: P.hunch });
}

/* ===================================================================
   나무 거인: 껍질 결이 진 줄기 몸, 가지 팔과 뿌리 발, 머리 위에 잎 무더기, 옹이 속 초록 눈
   =================================================================== */
function treant(Q) {
  const P = { hipY: .95, waistY: 1.12, chestY: 1.38, chestW: .26, chestD: .21, chestH: .26, shY: 1.58, shW: .32, neckY: 1.66, neckR: .12, headOff: [0, .16, .04],
    upL: .36, foL: .34, armR: .085, handS: 1.3, armOut: .22, armFwd: .1, hipW: .13, thR: .12, kneeY: .55, ankleY: .1, footS: 1.3, hunch: .1 };
  const R = rig(P), J = R.J, out = [];
  const bark = Q.skin, bd = barkDisp(.018, 10);
  const bc = (x, y, z) => { const a = Math.atan2(z, x), g = Math.pow(Math.abs(Math.sin(a * 7 + fbm(x * 3, y * 1.5, z * 3, 2) * 5)), 3); return cmix(csc(bark, 1.15), csc(bark, .45), g * .8 + .2 * vnoise(x * 30, y * 30, z * 30)); };
  out.push(...torso(R, P, { skin: bc, disp: bd, amp: .02 }));
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    out.push(...arm(R, s, P, { skin: bc, disp: bd, amp: .02, claw: 1 }));
    out.push(...leg(R, s, P, { skin: bc, disp: bd, amp: .02, toes: 0, boot: (k2, an, fc, fs) => {   // 뿌리 발
      const o2 = [E('ft' + k2, add(an, [0, -.03, .02]), [.1, .09, .12], { k: .04, c: bc, disp: bd, amp: .02 })];
      const sd = k2 === 'L' ? -1 : 1;
      for (const a of [-.35, .25, .85, 1.5, 2.7]) { o2.push(...L('ft' + k2, [add(an, [0, -.04, .02]), add(an, [sd * Math.sin(a) * .1, -.07, Math.cos(a) * .11 + .03]), add(an, [sd * Math.sin(a) * .19, -.085, Math.cos(a) * .2 + .03])], [.045, .03, .008], { k: .03, kj: .02, c: bc })); }
      return o2; } }));
    // 팔에서 돋은 잔가지
    for (let i = 0; i < 2; i++) { const p0 = lerp3(J['sh' + k], J['el' + k], .4 + i * .4); out.push(...L(i ? 'el' + k : 'sh' + k, [p0, add(p0, [s * .09, .05, -.04]), add(p0, [s * .16, .14, -.05])], [.022, .012, .004], { k: .02, kj: .01, c: bc })); }
  }
  const H = J.head;
  out.push(E('head', add(H, [0, 0, 0]), [.14, .16, .13], { k: .04, c: bc, disp: bd, amp: .02 }));
  out.push(E('head', add(H, [0, .045, .1]), [.13, .035, .05], { k: .03, c: bc }));
  for (const s of [-1, 1]) out.push(E('head', add(H, [s * .05, .01, .12]), [.035, .032, .04], { sub: 1, k: .015 }));
  out.push(E('head', add(H, [0, -.07, .12]), [.055, .02, .04], { sub: 1, k: .015 }));      // 입 옹이
  out.push(...L('head', [add(H, [0, .02, .125]), add(H, [.0, -.02, .17]), add(H, [.01, -.05, .19])], [.022, .016, .008], { k: .02, kj: .01, c: bc }));   // 옹이 코
  out.push(...eyes(J, { x: .05, y: .012, z: .108, r: .02, c: Q.eyeC || [.6, 1, .35], glow: 1, sq: .8 }));
  // 머리·어깨 위 가지와 잎 무더기
  const lf = Q.leaf, lc = (x, y, z) => cmix(csc(lf, .65), csc(lf, 1.25), clamp(.5 + 2.2 * fbm(x * 14, y * 14, z * 14, 2), 0, 1));
  const leafD = (x, y, z) => .022 * (fbm(x * 22, y * 22, z * 22, 2) * 2);
  const crown = [[0, .2, -.02, .16], [.13, .16, -.05, .11], [-.13, .17, -.04, .12], [.05, .27, -.06, .1], [-.07, .26, .02, .09], [0, .12, -.15, .12]];
  for (const [x, y, z, r] of crown) out.push(E('head', add(H, [x, y, z]), [r, r * .8, r], { g: 'leaf', k: .05, c: lc, disp: leafD, amp: .03 }));
  for (const s of [-1, 1]) { out.push(E('spine', R.U([s * .24, P.shY + .08, -.04]), [.12, .08, .12], { g: 'leaf', k: .04, c: lc, disp: leafD, amp: .03 })); out.push(...L('spine', [R.U([s * .18, P.shY - .02, -.05]), R.U([s * .24, P.shY + .12, -.1]), R.U([s * .27, P.shY + .26, -.16])], [.035, .02, .006], { k: .03, kj: .015, c: bc })); }
  // 이끼 덩이 (어깨·가슴·허리에 몇 군데)
  const mc = (x, y, z) => csc(Q.moss || [.32, .45, .18], .65 + .55 * vnoise(x * 70, y * 70, z * 70)), mdp = (x, y, z) => -.008 * vnoise(x * 60, y * 60, z * 60);
  for (const [x, y, z, r] of [[.17, P.shY - .05, .12, .08], [-.12, P.chestY + .02, .17, .07], [.05, P.waistY + .03, .19, .06], [-.2, P.waistY + .12, -.12, .08], [.12, P.chestY - .02, -.19, .07]]) out.push(E('spine', R.U([x, y, z]), [r, r * .55, r * .7], { k: .025, c: mc, disp: mdp, amp: .01, rot: [0, Math.atan2(x, z), 0] }));
  return finish(R, out, Q, { h: 2.1 });
}

/* ===================================================================
   예티: 온몸을 덮은 긴 흰 털 (결 따라 갈래), 앞으로 굽은 큰 몸, 털 없는 푸른 얼굴과 손발, 머리 위 짧은 뿔
   =================================================================== */
function yeti(Q) {
  const P = { hipY: .95, waistY: 1.12, chestY: 1.4, chestW: .34, chestD: .27, chestH: .27, shY: 1.6, shW: .4, neckY: 1.65, neckZ: .08, neckR: .13, headOff: [0, .1, .14],
    upL: .38, foL: .36, armR: .125, handS: 1.15, armOut: .24, armFwd: .25, hipW: .14, thR: .13, kneeY: .52, ankleY: .09, footS: 1.25, hunch: .32, waistBw: .1 };
  const R = rig(P), J = R.J, out = [];
  const fur = Q.fur, furD = csc(fur, .78), face = Q.face;
  /* 아래로 늘어진 털 다발: 옆으로는 촘촘한 갈래, 위아래로는 층층이 겹친 다발 끝 */
  const strand = (x, y, z) => { const a = Math.atan2(x, z) * 9 + x * 30 + fbm(x * 5, y * 1.6, z * 5, 2) * 5; return .5 + .5 * Math.sin(a); };
  const tier = (x, y, z) => Math.pow(.5 + .5 * Math.sin((y * 9 + fbm(x * 6, y * 2, z * 6, 2) * 1.6) * Math.PI * 2), 2.5);   // 층층이 겹친 다발 끝 (이어지게)
  const fc = (x, y, z) => cmix(furD, fur, clamp(strand(x, y, z) * .8 + tier(x, y, z) * .2, 0, 1));
  const fd = (x, y, z) => -.02 * Math.pow(1 - strand(x, y, z), 1.4) - .004 * tier(x, y, z) - .008 * vnoise(x * 14, y * 4, z * 14);
  out.push(...torso(R, P, { skin: fc, disp: fd, amp: .02, belly: .6 }));
  out.push(E('spine', R.U([0, P.shY + .04, -.08]), [.28, .16, .2], { k: .1, c: fc, disp: fd, amp: .02, rot: [R.hunch, 0, 0] }));   // 솟은 어깨 털
  for (const s of [-1, 1]) {
    out.push(...arm(R, s, P, { skin: fc, disp: fd, amp: .02, claw: 1, nail: [.2, .2, .24] }));
    out.push(...leg(R, s, P, { skin: fc, disp: fd, amp: .02, toes: 4, nail: [.2, .2, .24] }));
  }
  // 손·발의 맨살 (털 위에 덧칠): 색으로만 — 손과 발 아래쪽을 얼굴빛으로
  const H = J.head;
  out.push(E('head', add(H, [0, .03, -.04]), [.14, .14, .14], { k: .04, c: fc, disp: fd, amp: .02 }));
  out.push(E('head', add(H, [0, -.01, .065]), [.095, .095, .07], { k: .03, c: face, pri: .01 }));          // 털 없는 얼굴
  out.push(E('head', add(H, [0, -.065, .1]), [.075, .045, .055], { k: .03, c: face, pri: .01 }));          // 주둥이
  out.push(E('head', add(H, [0, .045, .11]), [.085, .022, .04], { k: .02, c: face }));                     // 눈썹뼈
  out.push(E('head', add(H, [0, -.02, .155]), [.03, .02, .02], { k: .015, c: csc(face, .6) }));             // 코
  out.push(E('head', add(H, [0, -.085, .145]), [.05, .007, .03], { sub: 1, k: .006 }));
  for (const s of [-1, 1]) {
    out.push(E('head', add(H, [s * .035, .02, .128]), [.02, .014, .02], { sub: 1, k: .008 }));
    out.push(C('head', add(H, [s * .07, .1, -.0]), add(H, [s * .12, .2, -.06]), .022, .004, { g: 'tooth', k: .01, c: [.78, .72, .6] }));   // 짧은 뿔
    out.push(C('head', add(H, [s * .03, -.1, .14]), add(H, [s * .033, -.055, .15]), .009, .003, { g: 'tooth', k: 0, c: [.95, .94, .9], hard: 1 }));   // 송곳니
  }
  // 얼굴 둘레 갈기
  for (let i = 0; i < 9; i++) { const a = -1.6 + i * .4; out.push(...L('head', [add(H, [Math.sin(a) * .12, .05 + Math.cos(a) * .06, .03]), add(H, [Math.sin(a) * .17, -.02 + Math.cos(a) * .04, -.02]), add(H, [Math.sin(a) * .2, -.1, -.04])], [.03, .02, .005], { k: .03, kj: .01, c: fc })); }
  out.push(...eyes(J, { x: .035, y: .018, z: .12, r: .013, c: Q.eyeC || [.5, .85, 1], glow: 1, sq: .8 }));
  // 맨살 손바닥과 발바닥: 앞쪽 손가락·발가락에 얼굴빛을 칠한다
  out.forEach(p => { if (/^ha|^ft/.test(p.b) && !p.sub && p.g === 'body') { const c0 = p.c; p.c = (x, y, z, nx, ny, nz) => { const b = R.J[p.b.startsWith('ha') ? 'wr' + p.b[2] : 'an' + p.b[2]]; const t = clamp((b[1] - y) / (p.b.startsWith('ha') ? .1 : .06), 0, 1); return cmix(typeof c0 === 'function' ? c0(x, y, z) : c0, face, t * .85); }; } });
  return finish(R, out, Q, { h: 2.1, hunch: P.hunch, heavy: 1 });
}

/* ===================================================================
   산적: 두건 달린 망토, 얼굴 가리개, 가죽 웃옷과 띠·주머니, 장화, 휜 칼
   =================================================================== */
function bandit(Q) {
  const P = { hipY: .93, waistY: 1.1, chestY: 1.31, chestW: .17, chestD: .115, chestH: .16, shY: 1.47, shW: .2, neckY: 1.52, neckR: .05, headOff: [0, .17, .02],
    upL: .29, foL: .26, armR: .05, handS: 1.2, armOut: .16, armFwd: .15, hipW: .085, thR: .075, kneeY: .5, ankleY: .08, footS: 1.25, hunch: .04 };
  const R = rig(P), J = R.J, out = [];
  const skin = Q.skin, cloth = Q.cloth, leather = Q.leather, cape = Q.cape;
  const tc = (c, f = 30) => (x, y, z) => csc(c, .86 + .18 * fbm(x * f, y * f, z * f, 2));
  // 몸은 웃옷 빛, 팔은 소매, 손은 살빛 → 도형마다 색을 바꾸려고 일단 같은 뼈대를 빚고 색을 고친다
  const body = [...torso(R, P, { skin: tc(cloth) })];
  body.forEach(p => { if (p.b === 'hip') p.c = tc(Q.pants); });
  out.push(...body);
  for (const s of [-1, 1]) {
    const a = arm(R, s, P, { skin: tc(cloth), fist: 1, fistAx: [0, -.2, 1] });
    a.forEach(p => { if (p.b.startsWith('ha')) p.c = skin; });
    out.push(...a);
    out.push(...leg(R, s, P, { skin: tc(Q.pants), boot: (k, an, fc, fs) => [
      E('ft' + k, add(an, [0, -.03, .0]), [.05, .06, .06], { k: .03, c: tc(leather) }),
      E('ft' + k, fc, [.048, .04, .1], { k: .03, c: tc(leather) }),
      C('kn' + k, add(an, [0, .02, 0]), add(an, [0, .3, .01]), .052, .06, { k: .01, c: tc(leather) }),
      Ring('kn' + k, add(an, [0, .3, .01]), .062, .01, { c: csc(leather, .7) })] }));
  }
  // 가죽 웃옷 (가슴 덧댐)·띠·주머니
  out.push(F('spine', [-.25, 1.05, -.2, .25, 1.5, .2], (x, y, z) => { const p = R.U([0, P.chestY, 0]); const r = Math.hypot(x / (P.chestW * 1.08), (y - p[1]) / (P.chestH * 1.25), (z - p[2]) / (P.chestD * 1.15)) - 1; return Math.max(Math.abs(r) * .18 - .008, y - (P.shY - .02), (P.waistY + .02) - y); }, { k: .004, c: tc(leather, 40) }));
  for (let i = 0; i < 4; i++) out.push(E('spine', R.U([.0, P.waistY + .07 + i * .07, P.chestD * 1.12]), [.01, .008, .006], { g: 'metal', k: 0, c: [.5, .48, .45] }));
  out.push(Ring('spine', [0, P.hipY + .13, 0], P.chestW * .95, .02, { c: csc(leather, .6), sy: P.chestD / P.chestW * 1.18 }));
  out.push(B('spine', [0, P.hipY + .13, P.chestD * 1.1 + .01], [.025, .022, .008], .004, { g: 'metal', k: 0, c: [.6, .55, .4] }));
  out.push(E('hip', [-.15, P.hipY + .07, .06], [.045, .05, .03], { k: .01, c: tc(leather) }));   // 주머니
  // 머리: 얼굴(살빛) + 가리개 + 두건
  const H = J.head;
  out.push(E('head', add(H, [0, .0, 0]), [.088, .105, .095], { k: .02, c: skin }));
  out.push(E('head', add(H, [0, .03, .07]), [.08, .02, .04], { k: .02, c: skin }));
  for (const s of [-1, 1]) out.push(E('head', add(H, [s * .03, .012, .088]), [.018, .012, .02], { sub: 1, k: .008 }));
  out.push(...eyes(J, { x: .03, y: .012, z: .08, r: .011, c: [.15, .1, .07], sq: .75 }));
  out.push(E('head', add(H, [0, .036, .088]), [.07, .008, .02], { k: .005, c: Q.hair || [.18, .12, .08] }));   // 눈썹
  out.push(F('head', [H[0] - .13, H[1] - .17, H[2] - .13, H[0] + .13, H[1] + .02, H[2] + .14], (x, y, z) => { const q = [x - H[0], y - H[1], z - H[2]]; const r = ellD(q[0], q[1] + .03, q[2] - .008, .098, .1, .104); return Math.max(Math.abs(r + .004) - .007, q[1] + .004, -(q[1] + .16)); }, { k: .003, c: tc(Q.mask, 40) }));   // 얼굴 가리개
  out.push(F('head', [H[0] - .17, H[1] - .16, H[2] - .2, H[0] + .17, H[1] + .17, H[2] + .14], (x, y, z) => { const q = [x - H[0], y - H[1], z - H[2]]; const r = ellD(q[0], q[1] - .012, q[2] + .012, .118, .13, .124);
    const face = ellD(q[0], q[1] + .005, q[2] - .1, .078, .085, .09); return Math.max(Math.abs(r - .006) - .009, -face, -(q[1] + .13)); }, { k: .003, c: tc(cape) }));   // 두건
  out.push(E('head', add(H, [0, .0, -.13]), [.07, .09, .04], { k: .04, c: tc(cape), rot: [.3, 0, 0] }));
  // 망토: 어깨에서 등 뒤로 늘어진 천 (주름)
  out.push(F('spine', [-.3, .7, -.35, .3, 1.55, .05], (x, y, z) => {
    const p = R.U([0, P.shY, -P.chestD * .7]); const t = clamp((p[1] - y) / .8, 0, 1), w = .18 + t * .06;
    const zz = p[2] - .03 - t * .12 + (x * x) * 1.1 * (.6 + t) + .028 * t * Math.sin(x * 26 + t * 1.5) + .01 * Math.sin(x * 61);   // 몸을 감싸며 아래로 갈수록 깊어지는 주름
    const hem = (p[1] - .8) + .05 * Math.cos(x * 7) + .02 * Math.sin(x * 23);
    return Math.max(Math.abs(z - zz) * .8 - .009, Math.abs(x) - w, y - (p[1] + .05), hem - y);
  }, { k: .03, c: tc(cape), own: .03 }));
  for (const s of [-1, 1]) out.push(E('spine', R.U([s * .14, P.shY + .015, -.01]), [.11, .04, .11], { k: .03, c: tc(cape), rot: [0, 0, -s * .3] }));
  // 휜 칼
  const hs = P.handS * P.armR, G = add(J.wrR, [0, -hs * .95, hs * .15]), A = norm([0, -.15, 1]);
  out.push(C('haR', add(G, scl(A, -.07)), add(G, scl(A, .06)), .016, .016, { k: 0, c: [.25, .16, .1] }));
  out.push(B('haR', add(G, scl(A, .075)), [.055, .012, .012], .004, { g: 'metal', k: 0, c: [.55, .5, .35], rot: [Math.atan2(-A[1], A[2]), 0, 0] }));
  for (let i = 0; i < 10; i++) {   // 휜 날: 마디 열 개 (끝으로 갈수록 좁고 위로 휜다)
    const t0 = .09 + i * .065, t1 = t0 + .065, cur = t => .1 * Math.pow((t - .09) / .65, 2), p0 = add(add(G, scl(A, t0)), [0, cur(t0), 0]), p1 = add(add(G, scl(A, t1)), [0, cur(t1), 0]);
    const d = sub(p1, p0), mid = lerp3(p0, p1, .5), w = .024 * (1 - Math.pow(i / 10, 2) * .75), ang = Math.atan2(-d[1], d[2]);
    out.push(B('haR', mid, [.003, w, Math.hypot(d[1], d[2]) * .55], .0025, { g: 'metal', k: .004, c: [.78, .8, .83], rot: [ang, 0, 0] }));
  }
  return finish(R, out, Q, { h: 1.8 });
}

/* ===================================================================
   불도마뱀 전사 (도마뱀 사람): 비늘 몸, 긴 주둥이, 등 볏, 꼬리 끝 불꽃, 창
   =================================================================== */
function lizardman(Q) {
  const P = { hipY: .92, waistY: 1.08, chestY: 1.3, chestW: .19, chestD: .15, chestH: .18, shY: 1.48, shW: .23, neckY: 1.53, neckZ: .04, neckR: .065, headOff: [0, .1, .1],
    upL: .3, foL: .28, armR: .055, handS: 1.35, armOut: .18, armFwd: .2, hipW: .1, thR: .09, kneeY: .52, ankleY: .1, footS: 1.5, hunch: .22 };
  const R = rig(P), J = R.J, out = [];
  const sc = Q.skin, belly = Q.belly;
  const scale = (x, y, z) => { const u = Math.sin(x * 95 + Math.sin(y * 95) * 1.3) * Math.sin(y * 95 + z * 40); return u > .4 ? .82 : 1; };
  const skin = (x, y, z, nx, ny, nz) => { let c = csc(sc, scale(x, y, z) * (.9 + .2 * vnoise(x * 20, y * 20, z * 20))); if (nz !== undefined && y < 1.52 && y > .84) c = cmix(c, belly, sstep(.35, .75, nz) * sstep(.17, .08, Math.abs(x)) * sstep(.84, .9, y) * sstep(1.52, 1.45, y) * .9); return c; };
  out.push(...torso(R, P, { skin }));
  for (const s of [-1, 1]) { out.push(...arm(R, s, P, { skin, fist: s > 0, fistAx: [0, .1, 1], claw: 1, nail: [.15, .12, .1] })); out.push(...leg(R, s, P, { skin, toes: 3, nail: [.15, .12, .1] })); }
  const H = J.head;
  out.push(E('head', add(H, [0, .03, -.02]), [.085, .08, .1], { k: .03, c: skin }));
  out.push(C('head', add(H, [0, .0, .04]), add(H, [0, -.02, .23]), .07, .04, { k: .04, c: skin }));            // 주둥이
  out.push(C('head', add(H, [0, -.05, .03]), add(H, [0, -.06, .2]), .05, .03, { k: .03, c: skin }));           // 아래턱
  out.push(E('head', add(H, [0, -.04, .2]), [.04, .006, .06], { sub: 1, k: .005 }));
  for (const s of [-1, 1]) { out.push(E('head', add(H, [s * .05, .05, .06]), [.04, .03, .04], { k: .02, c: skin })); out.push(E('head', add(H, [s * .012, .01, .245]), [.006, .005, .008], { sub: 1, k: .003 })); }
  out.push(...eyes(J, { x: .058, y: .052, z: .075, r: .02, c: Q.eyeC || [1, .8, .2], glow: 1, sq: .9 }));
  // 볏: 머리부터 등까지
  for (let i = 0; i < 9; i++) { const p = i < 3 ? add(H, [0, .1 - i * .01, .02 - i * .06]) : R.U([0, P.shY + .02 - (i - 3) * .09, -P.chestD * .95]); out.push(C(i < 3 ? 'head' : 'spine', p, add(p, [0, .07 - i * .004, -.05]), .02, .003, { k: .015, c: Q.crest || csc(sc, .6) })); }
  // 꼬리 (세 마디 뼈)
  const t0 = [0, P.hipY - .02, -P.chestD * .9], t1 = add(t0, [0, -.18, -.32]), t2 = add(t1, [0, -.2, -.32]), t3 = add(t2, [0, -.1, -.3]);
  const bones = R.bones;
  bones.push({ n: 't1', p: 'hip', o: t0, tip: t1, bw: .06, rad: .2 }, { n: 't2', p: 't1', o: t1, tip: t2, bw: .05, rad: .16 }, { n: 't3', p: 't2', o: t2, tip: t3, bw: .04, rad: .12 });
  out.push(C('t1', t0, t1, .1, .075, { k: .05, c: skin }), C('t2', t1, t2, .075, .045, { k: .03, c: skin }), C('t3', t2, t3, .045, .012, { k: .02, c: skin }));
  // 허리천·어깨 가죽
  out.push(F('hip', [-.25, .6, -.2, .25, 1.0, .25], (x, y, z) => { const r = Math.hypot(x / (P.chestW * 1.02), z / (P.chestD * 1.2)); return Math.max(Math.abs(r - 1) * .17 - .01, Math.abs(y - (P.hipY + .0)) - .1, -(Math.abs(Math.cos(Math.atan2(z, x))) - .35) * .1); }, { k: .004, c: (x, y, z) => csc(Q.cloth, .85 + .2 * fbm(x * 25, y * 25, z * 25)) }));
  out.push(Ring('hip', [0, P.hipY + .1, 0], P.chestW * .95, .015, { c: [.28, .18, .1], sy: P.chestD / P.chestW * 1.2 }));
  // 창
  const hs = P.handS * P.armR, G = add(J.wrR, [0, -hs * .95, hs * .15]), A = norm([0, .1, 1]);
  out.push(C('haR', add(G, scl(A, -.6)), add(G, scl(A, .9)), .018, .018, { k: 0, c: (x, y, z) => csc([.38, .27, .16], .85 + .2 * fbm(x * 20, y * 20, z * 4)) }));
  out.push(F('haR', bbBox(add(G, scl(A, 1.02)), .16), (x, y, z) => { const q = sub([x, y, z], add(G, scl(A, .9))); const t = q[1] * A[1] + q[2] * A[2]; const w = .045 * (1 - clamp(t / .24, 0, 1)) * clamp(t / .03, 0, 1) + .002; const rr = [q[0], q[1] - t * A[1], q[2] - t * A[2]]; return Math.max(Math.abs(rr[0]) - .005 - w * .1, Math.hypot(rr[1], rr[2]) - w, -t, t - .24); }, { g: 'metal', k: 0, c: [.7, .7, .72] }));
  return finish(R, out, Q, { h: 1.8, tail: 1, hunch: P.hunch });
}
const bbBox = (c, r) => [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r];

/* 용암 몸: 살갗에 갈라진 골을 파고, 그 아래에 빛나는 속살을 깐다 */
function lavaify(out, f, w, n = out.length) {
  const groove = (x, y, z) => { const n = Math.abs(fbm(x * f + 3.1, y * f, z * f - 1.7, 3)); return .022 * clamp(1 - n / w, 0, 1); };
  const core = [];
  for (const p of out.slice(0, n)) {
    if (p.sub || p.inter || p.g !== 'body' || p.b === 'haR' || p.noLava) continue;
    const d0 = p.d; p.d = (x, y, z) => d0(x, y, z) + groove(x, y, z); p.bb = p.bb.map((v, i) => v);
    core.push(Object.assign({}, p, { g: 'glow', d: (x, y, z) => Math.max(d0(x, y, z) + .01, (Math.abs(fbm(x * f + 3.1, y * f, z * f - 1.7, 3)) - w * 1.25) * .4), c: (x, y, z) => cmix([1, .32, .05], [1, .82, .35], clamp(1 - Math.abs(fbm(x * f + 3.1, y * f, z * f - 1.7, 3)) / w, 0, 1)), noAO: 1, hard: 1 }));
  }
  out.push(...core);
}

/* 마무리: 재질·움직임 값 */
function finish(R, prims, Q, o) {
  return { bones: R.bones, prims, h: o.h, size: Q.size || 1, anim: { hunch: o.hunch || 0, heavy: o.heavy || 0, tail: o.tail || 0, J: { shR: R.J.shR, wrR: R.J.wrR } },
    mats: { body: { r: Q.rough ?? .82 }, metal: { r: .38, m: .65 }, eye: { r: .2 }, glow: { glow: 1 }, tooth: { r: .45 }, ice: { r: .1, m: .1, tr: .85 }, leaf: { r: .9 } },
    gopt: { body: { tris: 11000 }, metal: { tris: 900, h: .004, loK: .3 }, eye: { tris: 160, h: .003, noLo: 1 }, glow: { tris: 1500, h: .006, noAO: 1, loK: .35 }, tooth: { tris: 220, h: .003, noLo: 1 }, ice: { tris: 500, h: .005 }, leaf: { tris: 2600, loK: .25 } } };
}

/* ===================================================================
   종류마다 (MON 의 색과 이름에 맞춘다)
   =================================================================== */
const c = rgb;
const TYPES = {
  /* 거인 */
  redgiant: () => giant({ skin: c(0x7a3a2a), rocky: 1, beard: null, crest: c(0x4a2a24), eyeC: [1, .65, .2], eyeGlow: 1, weapon: 'club', clubRocks: 6, stoneC: c(0x5a3028), leather: c(0x3a2418), wraps: 1, wrapC: c(0x5a4030) }),
  cliffgiant: () => giant({ skin: c(0x6e6a66), rocky: 1, crest: c(0x5a5652), beard: c(0x6a6560), eyeC: [.35, .7, 1], eyeGlow: 1, weapon: 'maul', stoneC: c(0x5e5a56), leather: c(0x4a3a2a), mantle: c(0x7a6a58), wraps: 1, wrapC: c(0x6a5e50), bootFur: c(0x8a7a66) }),
  frostgiant: () => giant({ skin: c(0x9ab4c8), beard: c(0xeef4fa), braid: 1, ring: [.7, .75, .8], hair: c(0xe4ecf4), eyeC: [.6, .9, 1], eyeGlow: 1, icicles: 1, weapon: 'club', wood: [.42, .4, .38], studs: 0, leather: c(0x5a6a7a), mantle: c(0xf0f2f4), wraps: 1, wrapC: c(0x8a96a2), bootFur: c(0xf0f2f4), buckle: [.7, .74, .8] }),
  hillgiant: () => giant({ skin: c(0xb08a68), beard: c(0x5a3a22), hair: c(0x4a2e1a), eyeC: [.1, .07, .05], weapon: 'club', wood: [.4, .28, .16], clubRocks: 0, leather: c(0x5a4028), mantle: c(0x6a4a30), skull: 1, wraps: 1, wrapC: c(0x7a6448), bootFur: c(0x6a4a30), belly: .7 }),
  peakgiant: () => giant({ skin: c(0x8a8a94), rocky: 1, beard: c(0xd8dce0), hair: c(0xc8ccd2), eyeC: [.75, .9, 1], eyeGlow: 1, weapon: 'maul', stoneC: c(0x9a9aa2), leather: c(0x4a4a50), mantle: c(0xe6e8ea), wraps: 1, wrapC: c(0x6a6a70), bootFur: c(0xe6e8ea), icicles: 1 }),
  firegiant: () => giant({ skin: c(0x4a2018), rocky: 1, lava: 1, beard: null, crest: c(0x2a1410), eyeC: [1, .8, .3], eyeGlow: 1, weapon: 'maul', stoneC: c(0x2a2222), leather: c(0x2a1810), wraps: 1, wrapC: c(0x3a2418), buckle: [.8, .5, .2] }),
  /* 오우거 */
  valleyogre: () => ogre({ skin: c(0x9a7a5a), cloth: c(0x6a5038), topknot: c(0x2a1a10), warts: 1 }),
  rockogre: () => ogre({ skin: c(0x8a8478), cloth: c(0x4a4038), topknot: c(0x3a3630), warts: 1, pad: c(0x5a5650) }),
  fieldogre: () => ogre({ skin: c(0xa88a60), cloth: c(0x7a6a3a), topknot: c(0x6a4a20), warts: 1 }),
  gorgeogre: () => ogre({ skin: c(0x8a6a50), cloth: c(0x5a3a2a), topknot: c(0x1a1410), warts: 1, pad: c(0x3a2a20) }),
  flameogre: () => ogre({ skin: c(0x8a3a24), cloth: c(0x2a1a14), topknot: c(0xd86a20), warts: 1, eyeC: [1, .85, .3], wood: [.18, .12, .1] }),
  /* 트롤 */
  woodtroll: () => troll({ skin: c(0x5a6a42), hair: c(0x3a4a22), moss: c(0x4a6a2a), cloth: c(0x4a3a24), weapon: 1, wood: [.36, .28, .18] }),
  pinetroll: () => troll({ skin: c(0x4a5a3c), hair: c(0x2a3a1a), moss: c(0x3a5a26), cloth: c(0x3a2e20), weapon: 1, wood: [.3, .22, .14] }),
  hilltroll: () => troll({ skin: c(0x7a8a5a), hair: c(0x5a4a2a), cloth: c(0x6a5a3a), weapon: 1, wood: [.45, .36, .24], clubRocks: 3, stoneC: c(0x6a665e) }),
  oldtroll: () => troll({ skin: c(0x5a6a5a), hair: c(0xc8ccc0), beard: c(0xd8dcd0), moss: c(0x5a6a3a), cloth: c(0x4a4438), weapon: 1, wood: [.38, .32, .24], belly: .5 }),
  cavetroll: () => troll({ skin: c(0x6a6a74), wart: c(0x4a4a54), hair: c(0x2a2a30), cloth: c(0x3a3630), eyeC: [.7, .95, 1], weapon: 1, wood: [.7, .66, .58], clubRocks: 4, stoneC: c(0x4a4a50) }),
  lavatroll: () => troll({ skin: c(0x3a2620), wart: c(0x2a1a16), hair: c(0x1a1210), cloth: c(0x2a1a14), eyeC: [1, .7, .2], lava: 1, weapon: 1, wood: [.16, .12, .1], clubRocks: 4, stoneC: c(0x2a2220) }),
  /* 나무 거인 */
  treant: () => treant({ skin: c(0x6a4a2a), leaf: c(0x4a7a2a), moss: c(0x5a7a2a), eyeC: [.7, 1, .4] }),
  /* 예티 */
  yeti: () => yeti({ fur: c(0xeef2f4), face: c(0x7a94a8) }),
  snowyeti: () => yeti({ fur: c(0xe9edf0), face: c(0x6a8090), eyeC: [.6, .85, 1], size: 1.4 }),   /* 허칠 설인은 예전처럼 크게 (MON.scale 이 없다) */
  /* 사람 */
  bandit: () => bandit({ skin: c(0xd9a882), cloth: c(0x6a5a44), pants: c(0x3a3a40), leather: c(0x4a3020), cape: c(0x3a2a1c), mask: c(0x6a2a20), hair: c(0x2a1a10) }),
  /* 도마뱀 사람 */
  salamander: () => lizardman({ skin: c(0xb8402a), belly: c(0xf0b060), crest: c(0xffa040), cloth: c(0x4a2a1a), eyeC: [1, .85, .3] }),
};

module.exports = { TYPES };
