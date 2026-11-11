/*
 * 말 생김새 (거리 함수로 한 덩어리로 빚는다) — 탈것 말, 마차 끄는 말, 성 마구간 말, 귀족이 탄 말이 모두 이 모양을 쓴다
 * 좌표: y 위, z 앞(말이 보는 쪽). 발굽 바닥 y=0, 기갑(어깨 꼭대기) 높이 1쯤. 게임이 2.1배(탈것)·1.55배(마차)로 키운다.
 * 옛 말(quadInstance 의 모난 통 말)과 안장 높이·다리 자리·고삐 고리 자리를 맞췄다.
 *
 * 무리(재질):
 *   coat  털 (꼭짓점 색 = [그늘, 밝은 털 비율, 어두운 털 비율] → 게임이 털빛마다 칠한다)
 *   mane  갈기·앞머리·꼬리털 (꼭짓점 색 = 그늘, 게임이 갈기 색을 곱한다)
 *   hoof  발굽, eye 눈
 *   saddle 탈 때 마구(안장·깔개·등자·굴레·고삐), harness 마차 마구(목사리·등띠·굴레·눈가리개)
 * 뼈: root / neck·head / t1·t2 (꼬리) / fLa·fLb·fLc, fRa… (앞다리: 어깨~무릎, 정강이, 발목 아래) / hLa·hLb·hLc, hRa… (뒷다리: 엉덩이~비절, 정강이, 발목 아래)
 */
'use strict';
const { clamp, mix, sstep, rgb, cmix, csc, fbm, vnoise, E, C, B, T: Ring, F, makeField, capD, ellD } = require('./lib');

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
/* 축 a 를 따라 놓인 타원체를 돌릴 각 (yz 평면 안의 방향만): 도형의 z 축 → a */
const pitchTo = a => Math.atan2(-a[1], a[2]);
const bbB0 = (c, h) => [c[0] - h[0], c[1] - h[1], c[2] - h[2], c[0] + h[0], c[1] + h[1], c[2] + h[2]];

function horse() {
  const prims = [];
  const P = p => { prims.push(p); return p; };

  /* ---------- 털 색: [그늘, 밝은 털, 어두운 털(다리 끝·주둥이)] ---------- */
  const coatC = (x, y, z, nx, ny) => {
    const s = .965 + .035 * fbm(x * 6, y * 6, z * 6, 3);
    let light = sstep(-.15, -.85, ny) * sstep(.66, .5, y) * .75;   // 배 아래
    light = Math.max(light, sstep(.6, .45, y) * sstep(.02, .09, -Math.abs(x) + .14) * .0);
    let dark = sstep(.36, .2, y);   // 다리 끝 (흑점)
    return [s, light * s, dark * s];
  };
  const C_COAT = coatC;

  /* ================= 몸통 (root) ================= */
  const kB = .085;
  const body = [];
  const BP = p => { body.push(p); return P(p); };
  BP(E('root', [0, .78, -.03], [.205, .225, .4], { k: kB, c: C_COAT }));                 // 통 (갈비)
  BP(E('root', [0, .78, .2], [.19, .25, .25], { k: kB, c: C_COAT }));                    // 앞 갈비·가슴통
  BP(E('root', [0, .73, .4], [.15, .2, .14], { k: kB, c: C_COAT }));                     // 가슴
  for (const s of [-1, 1]) {
    BP(E('root', [s * .065, .65, .44], [.068, .1, .075], { k: .05, c: C_COAT }));           // 가슴 근육
    BP(E('root', [s * .11, .84, .33], [.075, .19, .12], { k: .07, c: C_COAT, rot: [-.42, 0, s * .06] }));   // 어깨뼈 근육
    BP(E('root', [s * .1, .7, -.4], [.1, .18, .15], { k: .07, c: C_COAT, rot: [.15, 0, 0] }));   // 넓적다리
  }
  BP(E('root', [0, .975, .3], [.055, .075, .15], { k: .07, c: C_COAT }));                // 기갑
  BP(E('root', [0, .9, .0], [.15, .1, .3], { k: kB, c: C_COAT }));                       // 등
  BP(E('root', [0, .925, -.33], [.17, .115, .2], { k: kB, c: C_COAT }));                 // 허리·엉덩이 윗선
  BP(E('root', [0, .82, -.36], [.2, .2, .2], { k: kB, c: C_COAT }));                     // 엉덩이
  BP(E('root', [0, .83, -.49], [.15, .14, .085], { k: .07, c: C_COAT }));                // 궁둥이
  BP(E('root', [0, .645, -.05], [.165, .1, .3], { k: kB, c: C_COAT }));                   // 배
  /* 엉덩이 가운데 골 (두 볼기 사이) */
  BP(E('root', [0, .9, -.55], [.018, .12, .05], { k: .03, c: C_COAT, sub: true }));

  /* ================= 목 (neck) ================= */
  const NK = [[0, .86, .43], [0, 1.0, .53], [0, 1.13, .62], [0, 1.24, .69]];
  const neckR = [[.135, .21], [.115, .165], [.092, .125], [.08, .1]];   // [옆, 위아래] 반지름
  const neckB = [];
  for (let i = 0; i < NK.length; i++) {
    const a = norm(sub(NK[Math.min(i + 1, NK.length - 1)], NK[Math.max(0, i - 1)]));
    const len = i === 0 ? .13 : .1;
    neckB.push(P(E(i === 0 ? 'root' : 'neck', NK[i], [neckR[i][0], neckR[i][1], len], { k: .07, c: C_COAT, rot: [pitchTo(a), 0, 0], lab: 'neck' })));
  }
  /* 목덜미 윗선(갈기 자리 아래 두툼한 살) */
  P(E('neck', [0, 1.13, .55], [.055, .07, .2], { k: .06, c: C_COAT, rot: [pitchTo(norm([0, .4, .3])) + .35, 0, 0] }));
  /* 목 밑 (숨관) 줄 */
  P(C('neck', [0, .86, .56], [0, 1.1, .77], .055, .045, { k: .06, c: C_COAT }));

  /* ================= 머리 (head) ================= */
  const H0 = [0, 1.275, .735], b = .9, A = [0, -Math.sin(b), Math.cos(b)], U = [0, Math.cos(b), Math.sin(b)];
  const pt = (t, u, x = 0) => add(add(add(H0, scl(A, t)), scl(U, u)), [x, 0, 0]);
  const HR = [b, 0, 0];
  const head = [];
  const HP = p => { head.push(p); return P(p); };
  HP(E('head', pt(.065, .0), [.082, .075, .1], { k: .05, c: C_COAT, rot: HR }));            // 머리통·이마
  HP(E('head', pt(.115, -.07), [.092, .085, .1], { k: .06, c: C_COAT, rot: HR }));          // 볼(턱뼈 둥근 자리)
  HP(E('head', pt(.245, -.015), [.056, .06, .16], { k: .05, c: C_COAT, rot: HR }));         // 콧등
  HP(E('head', pt(.385, -.03), [.064, .066, .072], { k: .045, c: C_COAT, rot: HR }));       // 주둥이
  HP(E('head', pt(.425, -.065), [.054, .036, .045], { k: .025, c: C_COAT, rot: HR }));      // 윗입술
  HP(E('head', pt(.39, -.105), [.038, .028, .048], { k: .025, c: C_COAT, rot: HR }));       // 아랫입술·턱
  for (const s of [-1, 1]) {
    HP(E('head', pt(.415, .0, s * .034), [.026, .032, .036], { k: .02, c: C_COAT, rot: HR }));   // 콧방울
    HP(E('head', pt(.1, .04, s * .066), [.03, .022, .042], { k: .03, c: C_COAT, rot: HR }));    // 눈두덩
    HP(C('head', pt(.13, -.035, s * .074), pt(.26, -.045, s * .05), .014, .01, { k: .03, c: C_COAT }));   // 광대 줄
  }
  /* 콧구멍·입 선 */
  for (const s of [-1, 1]) HP(E('head', pt(.432, .006, s * .04), [.011, .024, .016], { k: .008, c: C_COAT, rot: [b - .25, s * .35, 0], sub: true }));
  HP(E('head', pt(.405, -.083), [.062, .006, .05], { k: .006, c: C_COAT, rot: HR, sub: true }));
  /* 목과 머리를 잇는 목구멍 */
  P(E('head', pt(.04, -.12), [.07, .07, .09], { k: .06, c: C_COAT, rot: [b + .6, 0, 0] }));
  /* 귀 */
  for (const s of [-1, 1]) {
    const base = pt(-.005, .045, s * .045), dir = norm([s * .3, .92, -.22]), tip = add(base, scl(dir, .13));
    const rx = pitchTo(dir);
    const ear = E('head', lerp3(base, tip, .45), [.027, .019, .068], { k: .025, c: C_COAT, rot: [rx, s * .3, 0], pri: .004 });
    P(ear);
    /* 귀 안쪽 오목 (앞·바깥을 본다) */
    P(E('head', add(lerp3(base, tip, .55), [s * .006, 0, .012]), [.016, .01, .05], { k: .01, c: C_COAT, rot: [rx, s * .3, 0], sub: true }));
  }
  /* ================= 눈 ================= */
  for (const s of [-1, 1]) {
    P(E('head', pt(.118, .022, s * .083), [.019, .022, .027], { g: 'eye', c: rgb(0x120a06), rot: [b, s * .25, 0] }));
  }

  /* ================= 다리 ================= */
  const legPrims = (s, front) => {
    const k = (front ? 'f' : 'h') + (s < 0 ? 'L' : 'R'), out = [];
    const a = k + 'a', bb = k + 'b', cc = k + 'c';
    if (front) {
      const x = s * .108;
      out.push(E(a, [x + s * .012, .555, .335], [.052, .06, .06], { k: .04, c: C_COAT }));                  // 팔꿈치
      out.push(C(a, [x, .6, .38], [x, .31, .392], .062, .037, { k: .05, c: C_COAT }));                     // 아래팔
      out.push(E(a, [x + s * .006, .47, .395], [.048, .11, .052], { k: .035, c: C_COAT }));               // 아래팔 근육
      out.push(E(bb, [x, .29, .394], [.038, .045, .04], { k: .025, c: C_COAT }));                        // 무릎(완골)
      out.push(C(bb, [x, .28, .392], [x, .11, .386], .027, .025, { k: .02, c: C_COAT }));                  // 정강이
      out.push(E(bb, [x, .19, .366], [.019, .08, .018], { k: .015, c: C_COAT }));                          // 힘줄
      out.push(E(cc, [x, .09, .38], [.033, .034, .041], { k: .02, c: C_COAT }));                           // 구절(발목)
      out.push(C(cc, [x, .085, .386], [x, .04, .408], .027, .03, { k: .02, c: C_COAT }));                  // 발목 아래
      out.push(E(cc, [x, .044, .41], [.041, .016, .041], { k: .015, c: C_COAT }));                         // 관부
      out.push(C(cc, [x, .006, .421], [x, .042, .411], .044, .035, { g: 'hoof', c: hoofC, k: .006 }));      // 발굽
    } else {
      const x = s * .114;
      out.push(E(a, [x + s * .012, .56, -.3], [.042, .05, .04], { k: .06, c: C_COAT }));                  // 무릎(슬관절)
      out.push(C(a, [x + s * .006, .56, -.34], [x, .33, -.462], .07, .038, { k: .05, c: C_COAT }));        // 정강이 위(종아리)
      out.push(E(a, [x + s * .006, .45, -.385], [.05, .1, .062], { k: .04, c: C_COAT, rot: [-.5, 0, 0] }));   // 종아리 근육
      out.push(E(bb, [x, .31, -.462], [.037, .05, .048], { k: .025, c: C_COAT }));                         // 비절
      out.push(E(bb, [x, .345, -.503], [.022, .034, .026], { k: .02, c: C_COAT }));                        // 비절 끝
      out.push(C(bb, [x, .3, -.458], [x, .11, -.455], .03, .026, { k: .02, c: C_COAT }));                  // 정강이
      out.push(E(bb, [x, .2, -.478], [.019, .085, .018], { k: .015, c: C_COAT }));                         // 힘줄
      out.push(E(cc, [x, .09, -.458], [.033, .034, .041], { k: .02, c: C_COAT }));                         // 구절
      out.push(C(cc, [x, .085, -.454], [x, .04, -.436], .027, .03, { k: .02, c: C_COAT }));                // 발목 아래
      out.push(E(cc, [x, .044, -.434], [.04, .016, .04], { k: .015, c: C_COAT }));                         // 관부
      out.push(C(cc, [x, .006, -.425], [x, .042, -.433], .043, .034, { g: 'hoof', c: hoofC, k: .006 }));    // 발굽
    }
    return out;
  };
  const hoofC = (x, y, z) => csc(rgb(0x2c2622), .85 + .3 * sstep(.0, .045, y) * (.6 + .4 * vnoise(x * 300, 0, z * 300)));
  for (const s of [-1, 1]) for (const fr of [true, false]) for (const p of legPrims(s, fr)) P(p);
  /* 발굽 바닥은 평평하게 */
  P(F('fLc', [-1, -.1, -1, 1, .05, 1], (x, y) => -y, { g: 'hoof', inter: true, c: rgb(0x2c2622) }));

  /* ================= 꼬리 (살) ================= */
  P(C('t1', [0, .985, -.5], [0, .93, -.585], .05, .042, { k: .05, c: C_COAT }));
  P(C('t1', [0, .93, -.585], [0, .8, -.625], .042, .03, { k: .03, c: C_COAT }));

  /* ================= 갈기·앞머리·꼬리털 (mane) ================= */
  const maneS = (x, y, z) => { const v = .86 + .14 * vnoise(x * 40, y * 10, z * 40); return [v, v, v]; };
  /* 갈기: 목 윗선을 따라 한쪽(+x)으로 넘어가 늘어진 털 */
  const crest = [[0, 1.31, .705], [0, 1.25, .64], [0, 1.18, .575], [0, 1.11, .5], [0, 1.05, .43], [0, 1.01, .36], [0, .995, .32]];
  const crestD = norm(sub(crest[crest.length - 1], crest[0]));
  const groove = (x, y, z) => { const s = x * 0 + dot([x, y, z], crestD); return .0045 * Math.sin(s * 210 + 3 * vnoise(x * 30, y * 30, z * 30)) + .003 * vnoise(x * 80, y * 20, z * 80); };
  /* 목 살갗 위에 얹힌 털 껍질: 목덜미 꼭대기는 두툼하고, +x 쪽으로 넘어가며 얇아져 들쭉날쭉한 끝으로 끝난다 */
  const fNeck = makeField(prims.filter(p => p.g === 'body' && !p.sub));
  const crestAt = (x, y, z) => { let d = 1e9, tt = 0; for (let i = 0; i + 1 < crest.length; i++) { const v = capD(x, y, z, ...crest[i], ...crest[i + 1], 0, 0); if (v < d) { d = v; tt = i + .5; } } return [d, tt / (crest.length - 1)]; };
  P(F('neck', [-.14, .8, .22, .24, 1.42, .84], (x, y, z) => {
    const [d, t] = crestAt(x, y, z);
    const fall = .085 + .1 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + .02 * vnoise(z * 45, y * 45, 0);
    const reach = x < 0 ? .03 : fall, th = .004 + .016 * clamp(1 - d / reach, 0, 1);
    return Math.max(Math.abs(fNeck(x, y, z) - th) - th + groove(x, y, z) * Math.min(1, th / .012), d - reach);
  }, { g: 'mane', c: maneS }));
  /* 앞머리: 두 귀 사이에서 이마로 */
  {
    const fH = makeField(head.filter(p => !p.sub)), a0 = pt(-.03, .06), a1 = pt(.13, .07);
    P(F('head', bbB0(lerp3(a0, a1, .5), [.14, .14, .14]), (x, y, z) => {
      const d = capD(x, y, z, ...a0, ...a1, 0, 0), reach = .032 + .012 * vnoise(x * 60, y * 60, z * 60), th = .003 + .011 * clamp(1 - d / reach, 0, 1);
      return Math.max(Math.abs(fH(x, y, z) - th) - th + groove(x, y, z) * Math.min(1, th / .012), d - reach);
    }, { g: 'mane', c: maneS }));
  }
  /* 꼬리털: 꼬리 뿌리에서 늘어져 아래로 조금 퍼진다 */
  const tg = (x, y, z) => .008 * Math.sin(x * 240 + 4 * vnoise(x * 20, y * 6, z * 20)) + .004 * vnoise(x * 90, y * 12, z * 90);
  P(C('t1', [0, .975, -.545], [0, .81, -.655], .055, .075, { g: 'mane', c: maneS, k: .03, disp: tg, amp: .012 }));
  P(C('t2', [0, .81, -.655], [0, .55, -.7], .075, .082, { g: 'mane', c: maneS, k: .05, disp: tg, amp: .012 }));
  P(C('t2', [0, .55, -.7], [0, .32, -.69], .082, .045, { g: 'mane', c: maneS, k: .05, disp: tg, amp: .012 }));

  /* ================= 마구 ================= */
  const fBody = makeField(prims.filter(p => p.g === 'body' && (p.b === 'root' || p.lab === 'neck' || p.b === 'neck')));
  const fHead = makeField(head);
  const shell = (f, off, th) => (x, y, z) => Math.abs(f(x, y, z) - off) - th;
  const boxR = (c, h) => (x, y, z) => { const qx = Math.abs(x - c[0]) - h[0], qy = Math.abs(y - c[1]) - h[1], qz = Math.abs(z - c[2]) - h[2]; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0); };
  const bbB = (c, h, m = .05) => [c[0] - h[0] - m, c[1] - h[1] - m, c[2] - h[2] - m, c[0] + h[0] + m, c[1] + h[1] + m, c[2] + h[2] + m];
  const LEA = rgb(0x4a2416), LEA2 = rgb(0x2e160c), BRASS = rgb(0xc89a48), IRON = rgb(0x8a8a90);
  /* 몸에 붙인 띠 하나: 몸 겉면에서 off 만큼 띄운 두께 th 의 껍질을 상자 c±h 로 자른다 */
  const strap = (g, bone, f, off, th, c, h, col, o = {}) => P(F(bone, bbB(c, h), (x, y, z) => Math.max(shell(f, off, th)(x, y, z), boxR(c, h)(x, y, z) - .002), Object.assign({ g, c: col, k: 0 }, o)));
  /* 머리 띠: 머리 겉면 껍질을 판 하나(점 c, 법선 nrm, 두께 w)로 자른다 */
  const band = (g, f, off, th, c, nrm, w, col, lim) => P(F('head', bbB(c, [.12, .12, .12]), (x, y, z) => {
    const d = Math.abs((x - c[0]) * nrm[0] + (y - c[1]) * nrm[1] + (z - c[2]) * nrm[2]) - w;
    let v = Math.max(shell(f, off, th)(x, y, z), d); if (lim) v = Math.max(v, lim(x, y, z)); return v;
  }, { g, c: col, k: 0 }));
  const bridle = g => {
    /* 코끈 */
    band(g, fHead, .007, .0055, pt(.33, -.02), A, .012, LEA2);
    /* 이마끈 */
    /* 정수리끈 (귀 뒤) */
    band(g, fHead, .007, .005, pt(-.015, 0), A, .011, LEA2);
    /* 볼끈: 귀 뒤에서 입가로 */
    for (const s of [-1, 1]) {
      const a0 = pt(-.01, -.01, s * .085), a1 = pt(.37, -.06, s * .062);
      /* 옆에서 본 선(x 는 따지지 않는다)으로 잘라 볼을 타고 끊김 없이 이어지게 */
      P(F('head', bbB(lerp3(a0, a1, .5), [.12, .2, .2]), (x, y, z) => Math.max(shell(fHead, .007, .005)(x, y, z), capD(0, y, z, 0, a0[1], a0[2], 0, a1[1], a1[2], .011, .011), .03 - s * x), { g, c: LEA2 }));
      P(Ring('head', pt(.395, -.07, s * .06), .018, .0045, { g, c: IRON, rot: [0, 0, Math.PI / 2] }));   // 재갈 고리
    }
  };

  /* ---- 탈 때 마구 (saddle) ---- */
  {
    const g = 'saddle';
    const red = rgb(0x8a2a2a), gold = rgb(0xc89a48);
    /* 깔개: 등에 붙은 천 (가장자리 금빛 테) */
    const pc = [0, .86, -.01], ph = [.26, .16, .225], padR = (x, y, z) => Math.max(boxR(pc, [ph[0] - .04, ph[1] - .04, ph[2] - .04])(x, y, z) - .04, .78 - y);
    P(F('root', bbB(pc, ph), (x, y, z) => Math.max(shell(fBody, .008, .007)(x, y, z), padR(x, y, z)), {
      g, c: (x, y, z) => padR(x, y, z) > -.022 ? gold : red
    }));
    /* 안장: 깔개 위 가죽 자리 (앞이 높은 안장머리, 뒤가 둥근 뒷턱) */
    const sc = [0, .93, -.01], sh = [.2, .12, .17];
    P(F('root', bbB(sc, sh), (x, y, z) => Math.max(shell(fBody, .03, .018)(x, y, z), ellD(x - sc[0], y - .95, z - sc[2], .23, .16, .185), .86 - y), { g, c: LEA, k: 0 }));
    P(E('root', [0, 1.045, .15], [.075, .045, .04], { g, c: LEA, k: .04, rot: [-.3, 0, 0] }));   // 안장머리
    P(E('root', [0, 1.06, .175], [.022, .03, .02], { g, c: LEA2, k: .02 }));
    P(E('root', [0, 1.045, -.16], [.12, .045, .035], { g, c: LEA, k: .04, rot: [.35, 0, 0] }));  // 뒷턱
    /* 옆 날개 (다리가 닿는 가죽판) */
    const fc = [0, .82, .04], fh = [.3, .1, .11];
    P(F('root', bbB(fc, fh), (x, y, z) => Math.max(shell(fBody, .02, .006)(x, y, z), ellD(x, y - .86, z - .05, .4, .17, .12), .73 - y), { g, c: LEA, k: 0 }));
    /* 뱃대끈 */
    const gc = [0, .7, .13], gh = [.3, .2, .028];
    strap(g, 'root', fBody, .006, .006, gc, gh, LEA2);
    for (const s of [-1, 1]) {
      /* 등자 끈·등자 */
      P(C('root', [s * .2, .93, .07], [s * .225, .6, .08], .008, .008, { g, c: LEA2 }));
      P(Ring('root', [s * .228, .57, .08], .034, .0065, { g, c: IRON, rot: [Math.PI / 2, 0, 0], sy: 1.25 }));
      P(B('root', [s * .228, .538, .08], [.012, .006, .03], .004, { g, c: IRON }));
    }
    bridle(g);
    /* 고삐: 재갈에서 안장머리로, 목 옆으로 늘어진다 */
    for (const s of [-1, 1]) {
      const a0 = pt(.395, -.07, s * .066), m1 = [s * .125, 1.0, .8], m2 = [s * .15, .99, .58], e = [s * .085, 1.05, .2];
      P(C('neck', a0, m1, .0055, .0055, { g, c: LEA2 }));
      P(C('neck', m1, m2, .0055, .0055, { g, c: LEA2, k: .01 }));
      P(C('neck', m2, e, .0055, .0055, { g, c: LEA2, k: .01 }));
    }
  }

  /* ---- 마차 마구 (harness) ---- */
  {
    const g = 'harness';
    /* 목사리: 목 뿌리를 두르는 두툼한 가죽 고리 (위아래로 긴 달걀꼴), 앞쪽에 놋쇠 멍에 테 */
    const cc = [0, .985, .5], ca = norm([0, .62, .78]), cr = [Math.atan2(ca[2], ca[1]), 0, 0];
    P(Ring('neck', cc, .152, .042, { g, c: LEA, rot: cr, sy: 1.4, k: 0 }));
    P(Ring('neck', add(cc, scl(ca, .03)), .175, .013, { g, c: BRASS, rot: cr, sy: 1.4, k: 0 }));
    for (const s of [-1, 1]) P(E('neck', [s * .19, .99, .5], [.022, .026, .022], { g, c: BRASS }));
    /* 등띠·뱃대끈 */
    const pc = [0, .95, .02], ph = [.2, .08, .09];
    P(F('root', bbB(pc, ph), (x, y, z) => Math.max(shell(fBody, .015, .014)(x, y, z), boxR(pc, ph)(x, y, z) - .01, .88 - y), { g, c: LEA, k: 0 }));
    strap(g, 'root', fBody, .006, .007, [0, .72, .02], [.3, .22, .03], LEA2);
    /* 옆끈 (목사리 → 엉덩이) */
    for (const s of [-1, 1]) P(F('root', [-.4, .6, -.6, .4, 1, .6], (x, y, z) => Math.max(shell(fBody, .006, .006)(x, y, z), capD(x, y, z, s * .2, .8, .44, s * .2, .78, -.36, .016, .016)), { g, c: LEA2 }));
    bridle(g);
    /* 눈가리개 */
    for (const s of [-1, 1]) { const ec = pt(.11, .02, s * .1); P(F('head', bbB(ec, [.08, .08, .08]), (x, y, z) => Math.max(shell(fHead, .024, .004)(x, y, z), Math.hypot(x - ec[0], y - ec[1], z - ec[2]) - .042, .06 - s * x), { g, c: LEA2 })); }
  }

  /* ================= 뼈 ================= */
  const bones = [
    { n: 'root', o: [0, .75, 0], tip: [0, .75, .3] },
    { n: 'neck', p: 'root', o: [0, .9, .44], tip: [0, 1.27, .73], bw: .07, rad: .32 },
    { n: 'head', p: 'neck', o: H0, tip: pt(.42, 0), bw: .05, rad: .2 },
    { n: 't1', p: 'root', o: [0, .985, -.5], tip: [0, .82, -.635], bw: .03, rad: .1 },
    { n: 't2', p: 't1', o: [0, .82, -.635], tip: [0, .34, -.66], bw: .06, rad: .12 },
  ];
  for (const s of [-1, 1]) {
    const q = s < 0 ? 'L' : 'R', fx = s * .108, hx = s * .114;
    bones.push({ n: 'f' + q + 'a', p: 'root', o: [s * .12, .72, .38], tip: [fx, .3, .394], bw: .09, rad: .13 });
    bones.push({ n: 'f' + q + 'b', p: 'f' + q + 'a', o: [fx, .3, .394], tip: [fx, .09, .38], bw: .035, rad: .07 });
    bones.push({ n: 'f' + q + 'c', p: 'f' + q + 'b', o: [fx, .09, .382], tip: [fx, 0, .415], bw: .03, rad: .07 });
    bones.push({ n: 'h' + q + 'a', p: 'root', o: [s * .12, .75, -.4], tip: [hx, .31, -.462], bw: .1, rad: .17 });
    bones.push({ n: 'h' + q + 'b', p: 'h' + q + 'a', o: [hx, .31, -.462], tip: [hx, .09, -.458], bw: .04, rad: .07 });
    bones.push({ n: 'h' + q + 'c', p: 'h' + q + 'b', o: [hx, .09, -.458], tip: [hx, 0, -.43], bw: .03, rad: .07 });
  }
  /* 고삐·봇줄을 이을 자리 (뼈 이름, 자리) — 게임이 쓴다 */
  const knobs = { nose: [['head', pt(.395, -.07, -.075)], ['head', pt(.395, -.07, .075)]], collar: [['neck', [-.2, .99, .5]], ['neck', [.2, .99, .5]]] };

  return {
    prims, bones, h: 1.3, size: 1, anim: { knobs, H0, b },
    mats: { body: { r: .78 }, mane: { r: .7 }, hoof: { r: .55 }, eye: { r: .15 }, saddle: { r: .7 }, harness: { r: .65 } },
    gopt: {
      body: { tris: 14000 }, mane: { tris: 6000, h: .0045, loK: .18 }, hoof: { tris: 600, h: .004, loK: .3 }, eye: { tris: 160, h: .0025, noLo: 1 },
      saddle: { tris: 4500, h: .004, loK: .25 }, harness: { tris: 4500, h: .004, loK: .25 }
    }
  };
}

module.exports = { TYPES: { horse } };
