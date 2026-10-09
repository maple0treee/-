/* 오를란도 공용 데이터: 게임(브라우저)과 서버가 똑같이 쓰는 지도·지역·몬스터 정보 */
(function (root) {
  'use strict';
  const PI = Math.PI;
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const sm = (e0, e1, x) => { const t = clampN((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- 지도 ----------
  const R1 = 103;                                   // 첫 지역(마을 주변) 반지름
  const C2 = { x: 360, z: 0 }, R2 = 138;            // 두 번째 지역(도시 주변)
  const ROAD = { x0: 95, x1: 226, half: 4.5 };      // 두 지역을 잇는 길 (z≈0)
  const TOWN_R = 40;                                // 도시 안전 지대 반지름
  const TOWN_BLD = { x: 18, z: -21, w: 16, d: 12 }; // 도시 기록관 (3층, 들어갈 수 있다) - 도시 중심 기준
  const PIT = { x: -64, z: 10, r: 12, depth: 3.6 }; // 폐허 석굴 입구
  const DUN = { x: 0, z: 422, R: 14, corZ0: 394, corZ1: 409, corW: 3.2 };
  const BOSS_HOME = { x: 0, z: 421 };
  const LAIR = { x: 470, z: 0, r: 18 };              // 심연 끝 붉은 용의 둥지
  const HALL = { x: 0, z: -500, R: 24 };             // 동쪽 황야 끝 포탈 너머: 왕국의 지하실 (둥근 방, 천장이 막혀 있다)
  const EPORTAL = { x: 484, z: 24 };                 // 동쪽 황야 끝 포탈

  function zoneAt(x, z) {
    if (z > 300) return 'dungeon';
    if (z < -300) return 'hall';
    if (x > ROAD.x0 && x < ROAD.x1 && Math.abs(z) < 12 && Math.hypot(x - C2.x, z - C2.z) > R2 - 2) return 'road';
    const d2 = Math.hypot(x - C2.x, z - C2.z);
    if (x > 150) {
      if (d2 < TOWN_R) return 'town';
      // 도시를 중심으로 네 방향 황야 (북쪽 = -z)
      const a = Math.atan2(z - C2.z, x - C2.x);
      if (Math.abs(a) <= PI / 4) return 'weast';
      if (Math.abs(a) >= PI * 3 / 4) return 'wwest';
      return a < 0 ? 'wnorth' : 'wsouth';
    }
    const d = Math.hypot(x, z);
    if (d < 26) return 'village';
    const a = Math.atan2(z, x) + Math.sin(d * 0.11) * 0.12;
    if (a >= -0.75 * PI && a < -0.25 * PI) return 'forest';
    if (a >= -0.25 * PI && a < 0.25 * PI) return 'plains';
    if (a >= 0.25 * PI && a < 0.75 * PI) return 'swamp';
    return 'ruins';
  }
  const SAFE = { village: 1, town: 1, hall: 1 };

  // 걸어 다닐 수 있는 곳 안으로 붙잡는다 (첫 지역 원, 길, 두 번째 지역 원, 석굴)
  function roomClamp(p, rad) {
    const R = DUN.R - rad, d = Math.hypot(p.x - DUN.x, p.z - DUN.z);
    const x0 = DUN.x - DUN.corW + rad, x1 = DUN.x + DUN.corW - rad, z0 = DUN.corZ0 + 0.6 + rad, z1 = DUN.corZ1 + 2;
    if (d <= R || (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1)) return;
    const k = R / Math.max(d, 1e-4), ax = DUN.x + (p.x - DUN.x) * k, az = DUN.z + (p.z - DUN.z) * k;
    const bx = clampN(p.x, x0, x1), bz = clampN(p.z, z0, z1);
    if (Math.hypot(p.x - ax, p.z - az) <= Math.hypot(p.x - bx, p.z - bz)) { p.x = ax; p.z = az; } else { p.x = bx; p.z = bz; }
  }
  function worldClamp(p, rad) {
    if (p.z > 300) return roomClamp(p, rad);
    if (p.z < -300) { const d = Math.hypot(p.x - HALL.x, p.z - HALL.z), r = HALL.R - rad; if (d > r) { p.x = HALL.x + (p.x - HALL.x) * r / d; p.z = HALL.z + (p.z - HALL.z) * r / d; } return; }
    const d1 = Math.hypot(p.x, p.z), d2 = Math.hypot(p.x - C2.x, p.z - C2.z);
    const r1 = R1 - rad, r2 = R2 - rad, hw = ROAD.half - rad;
    if (d1 <= r1 || d2 <= r2 || (p.x >= ROAD.x0 && p.x <= ROAD.x1 && Math.abs(p.z) <= hw)) return;
    const c = [];
    c.push({ x: p.x * r1 / d1, z: p.z * r1 / d1 });
    c.push({ x: C2.x + (p.x - C2.x) * r2 / d2, z: C2.z + (p.z - C2.z) * r2 / d2 });
    c.push({ x: clampN(p.x, ROAD.x0, ROAD.x1), z: clampN(p.z, -hw, hw) });
    let best = c[0], bd = 1e9;
    for (const q of c) { const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < bd) { bd = dd; best = q; } }
    p.x = best.x; p.z = best.z;
  }
  // 몬스터가 들어가면 안 되는 안전 지대 밖으로 밀어낸다
  function keepOutOfSafe(p, rad) {
    const d1 = Math.hypot(p.x, p.z);
    if (d1 < 28 + rad) { const k = (28 + rad) / Math.max(d1, 1e-4); p.x *= k; p.z *= k; }
    const d2 = Math.hypot(p.x - C2.x, p.z - C2.z);
    if (d2 < TOWN_R + 2 + rad) { const k = (TOWN_R + 2 + rad) / Math.max(d2, 1e-4); p.x = C2.x + (p.x - C2.x) * k; p.z = C2.z + (p.z - C2.z) * k; }
  }

  // ---------- 몬스터 ----------
  // fixed: 첫 지역의 손으로 정한 능력치 / 나머지는 레벨 공식(hpM·atkM·defM 배율)
  const MON = {
    slime:    { name: '슬라임', lv: 1, fixed: { hp: 26, atk: 6, def: 1, exp: 9 }, build: 'slime', color: 0x7fd067 },
    wolf:     { name: '회색 늑대', lv: 3, fixed: { hp: 38, atk: 8, def: 2, exp: 14 }, build: 'quad', color: 0x8d8f92 },
    boar:     { name: '멧돼지', lv: 4, fixed: { hp: 58, atk: 11, def: 4, exp: 22 }, build: 'quad', color: 0x6e4b31, tusk: true },
    goblin:   { name: '고블린', lv: 6, fixed: { hp: 54, atk: 13, def: 4, exp: 26 }, build: 'biped', color: 0x6f9440, scale: 0.8, ears: true },
    toad:     { name: '독두꺼비', lv: 8, fixed: { hp: 84, atk: 16, def: 6, exp: 38 }, build: 'slime', color: 0x6a7a2c, toad: true, scale: 1.2 },
    lizard:   { name: '리자드맨', lv: 10, fixed: { hp: 104, atk: 19, def: 8, exp: 50 }, build: 'biped', color: 0x3f7d60, tail: true },
    skeleton: { name: '스켈레톤', lv: 12, fixed: { hp: 120, atk: 23, def: 9, exp: 64 }, build: 'biped', color: 0xe0d8c5, bone: true },
    ogre:     { name: '오우거', lv: 15, fixed: { hp: 200, atk: 29, def: 12, exp: 98 }, build: 'biped', color: 0x8e7050, scale: 1.75, club: true },
    // 길
    dog:      { name: '들개', lv: 12, build: 'quad', color: 0x7a5a3a, hpM: 0.8, atkM: 1 },
    bandit:   { name: '산적', lv: 16, build: 'biped', color: 0x6b4a2e, hpM: 1, atkM: 1.05, sword: true },
    // 서쪽 황야 (Lv 20–30)
    jackal:   { name: '자칼', lv: 22, build: 'quad', color: 0xa88a5a, hpM: 0.85, atkM: 1 },
    sandslime:{ name: '모래 슬라임', lv: 27, build: 'slime', color: 0xc9a46a, hpM: 1.2, atkM: 0.9, scale: 1.3 },
    // 북쪽 황야 (Lv 28–40)
    hyena:    { name: '하이에나', lv: 31, build: 'quad', color: 0x8a7a5a, hpM: 0.95, atkM: 1.1, scale: 1.05 },
    rockslime:{ name: '바위 슬라임', lv: 35, build: 'slime', color: 0x8a8478, hpM: 1.4, atkM: 0.95, scale: 1.4 },
    nomad:    { name: '황야 약탈자', lv: 39, build: 'biped', color: 0x5a4a3a, hpM: 1.05, atkM: 1.15, sword: true },
    // 남쪽 황야 (Lv 38–50)
    scorpion: { name: '전갈', lv: 42, build: 'quad', color: 0xb07a3a, hpM: 1.1, atkM: 1.1, tail: true, scale: 1.1 },
    salamander:{ name: '불도마뱀', lv: 45, build: 'biped', color: 0xb8402a, hpM: 1.1, atkM: 1.2, tail: true },
    duneogre: { name: '모래 오우거', lv: 49, build: 'biped', color: 0xa08060, hpM: 1.6, atkM: 1.2, scale: 1.7, club: true },
    // 동쪽 황야 (Lv 48–60)
    redlizard:{ name: '붉은 리자드맨', lv: 52, build: 'biped', color: 0x9a4a32, hpM: 1.1, atkM: 1.2, tail: true, sword: true },
    emberslime:{ name: '불씨 슬라임', lv: 56, build: 'slime', color: 0xd8702a, hpM: 1.1, atkM: 1.2, scale: 1.4, glow: 0xff5a10 },
    redgiant: { name: '붉은 바위 거인', lv: 59, build: 'biped', color: 0x7a3a2a, hpM: 1.8, atkM: 1.25, scale: 2.1, club: true },
    // 석굴
    kingslime:{ name: '킹 슬라임', lv: 20, fixed: { hp: 16000, atk: 70, def: 14, exp: 4500 }, gold: 1500, build: 'slime', color: 0x56c860, scale: 4.2, boss: true },
    slimelet: { name: '킹 슬라임 조각', lv: 18, build: 'slime', color: 0x7fe07a, hpM: 0.5, atkM: 0.8, scale: 1.1 },
    // 심연 끝
    reddragon:{ name: '붉은 용 이그니스', lv: 100, fixed: { hp: 450000, atk: 900, def: 60, exp: 80000 }, gold: 80000, build: 'dragon', color: 0xa8231a, scale: 1, dragon: true },
  };
  const HP_MUL = 1.6, EXP_MUL = 1.25;
  function monStats(ty, lv) {
    const D = MON[ty];
    // 모든 몬스터: HP 1.6배, 대신 경험치 1.25배
    if (D.fixed) return { ...D.fixed, hp: Math.round(D.fixed.hp * HP_MUL), exp: Math.round(D.fixed.exp * EXP_MUL), lv: D.lv };
    const L = lv;
    return {
      lv: L,
      hp: Math.round((12 * Math.pow(L, 1.25) + 15) * (D.hpM || 1) * HP_MUL),
      atk: Math.round((5 + 2.4 * Math.pow(L, 1.1)) * (D.atkM || 1)),
      def: Math.round(L * 0.9 * (D.defM || 1)),
      exp: Math.round(6 * Math.pow(L, 1.3) * (0.5 + 0.5 * (D.hpM || 1)) * EXP_MUL),
    };
  }
  const ZONE_MON = {
    forest: ['slime', 'slime', 'wolf'], plains: ['boar', 'goblin'], swamp: ['toad', 'lizard'], ruins: ['skeleton', 'skeleton', 'ogre'],
    road: ['dog', 'bandit'],
    wwest: ['jackal', 'bandit', 'sandslime'], wnorth: ['hyena', 'rockslime', 'nomad'], wsouth: ['scorpion', 'salamander', 'duneogre'], weast: ['redlizard', 'emberslime', 'redgiant'],
  };
  const ZONE_COUNT = { forest: 20, plains: 19, swamp: 17, ruins: 14, road: 14, wwest: 33, wnorth: 33, wsouth: 33, weast: 33 };
  // 지역별 레벨: 두 번째 지역은 도시에서 멀수록 강하다
  function levelAt(zone, x, z) {
    const d2 = Math.hypot(x - C2.x, z - C2.z);
    const f = (a, b, lo, hi) => Math.round(lo + (hi - lo) * clampN((d2 - a) / (b - a), 0, 1));
    switch (zone) {
      case 'road': return 12 + Math.round(clampN((x - ROAD.x0) / (ROAD.x1 - ROAD.x0), 0, 1) * 4);
      case 'wwest': return f(138, TOWN_R, 20, 30);   // 길에서 들어오는 쪽이 약하다
      case 'wnorth': return f(TOWN_R, 138, 28, 40);
      case 'wsouth': return f(TOWN_R, 138, 38, 50);
      case 'weast': return f(TOWN_R, 138, 48, 60);
      default: return 1;
    }
  }
  const ZONE_LEVELS = { village: [0, 0], forest: [1, 4], plains: [4, 7], swamp: [7, 11], ruins: [11, 15], dungeon: [18, 22], road: [12, 16], town: [0, 0], hall: [60, 60], wwest: [20, 30], wnorth: [28, 40], wsouth: [38, 50], weast: [48, 60] };

  // ---------- 의뢰 게시판 포스터 ----------
  // 의뢰를 주는 NPC마다 게시판이 따로 있다. 포스터는 마을 사람(실제 NPC)이 이유를 적어 붙인 것
  // {m}: 몬스터 이름, {z}: 지역 이름
  const G = (n, r, why) => ({ n, r, why });
  const BOARDS = {
    marta: { title: '파르보스 의뢰 게시판', cap: 5, zones: ['forest', 'plains', 'swamp', 'ruins', 'road'], givers: [
      G('마르타', '파르보스 의뢰인', ['나무꾼들이 {z}에 들어가질 못하고 있어요. {m} 때문에 겨울 땔감이 모자랄 지경이에요.', '아이들이 {z} 쪽 들판으로 놀러 갔다가 {m}에게 쫓겨 왔어요. 다시는 그런 일이 없게 해 주세요.']),
      G('엘리스', '순간이동 술사', ['별빛 길을 여는 수정을 {z}에 두고 왔는데, {m}이(가) 그 주변에 진을 쳤어요. 길을 터 주면 수정을 찾으러 갈게요.']),
      G('토르간', '하레나 대장장이', ['파르보스에서 오는 숯 마차가 {z}에서 {m}에게 습격당했어. 불이 꺼지면 망치도 멈춘다고.']),
      G('리안', '음유시인', ['{z}에서 노래할 거리를 찾다가 {m}에게 혼쭐이 났어요. 그 녀석들을 혼내 주면 당신 노래를 지어 드릴게요.'])] },
    kyle: { title: '사냥꾼 길드 게시판', cap: 9, zones: ['wwest', 'wnorth', 'wsouth', 'weast'], givers: [
      G('카일', '사냥꾼 길드장', ['{z}의 {m} 무리가 길드 사냥꾼 둘을 다치게 했다. 무리의 수를 확 줄여 놓게.', '{z}에 {m}이(가) 부쩍 늘었다. 이대로 두면 하레나 성벽까지 내려올 거다.']),
      G('브론', '무기상', ['칼날 재료를 실은 상단이 {z}에서 {m}에게 습격당했소. 길이 안전해져야 좋은 무기를 들여올 수 있지.']),
      G('미나', '잡화상', ['{z}에서 나는 약초를 받아 와야 포션을 만들 수 있는데, {m} 때문에 채집꾼들이 다 돌아왔어요.']),
      G('베른', '지도 제작자', ['{z}의 지도를 마저 그려야 하는데 {m}이(가) 측량대를 쫓아냈어! 한동안 조용하게 만들어 줘.']),
      G('세라', '현자', ['{z}에서 이상한 기운이 느껴집니다. {m}이(가) 그 기운에 끌려 모여드는 것 같아요. 수를 줄여 주면 원인을 살펴보겠습니다.']),
      G('로웬', '경비대장', ['{z}에서 {m}이(가) 무리를 지어 성벽 쪽으로 오고 있다. 경비대만으로는 모자라니 힘을 보태라.', '어젯밤 {z} 감시탑이 {m}에게 습격당했다. 감시탑을 다시 세울 수 있게 주변을 쓸어 버려라.']),
      G('한나', '여관 주인', ['손님들이 {z}를 지나오다 {m}에게 짐을 다 잃었대요. 여관 손님이 끊기면 저도 큰일이에요.', '{z}에서 오는 식재료 마차가 {m} 때문에 사흘째 안 와요. 수프 냄비가 비어 가요!']),
      G('티모', '아이', ['아빠가 {z}로 장 보러 갔는데 {m}이(가) 무섭대요… 아빠가 무사히 돌아오게 해 주세요!']),
      G('나그네', '두건 쓴 여행자', ['…{z}를 지나야 하는데 {m}이(가) 길을 막고 있다. 대가는 넉넉히 치르지.'])] },
  };
  const BOARD_CAP = {}; for (const k in BOARDS) BOARD_CAP[k] = BOARDS[k].cap;
  function makePoster(board, rnd, id) {
    const B = BOARDS[board]; const zone = B.zones[Math.floor(rnd() * B.zones.length)];
    const L = ZONE_LEVELS[zone]; const tys = [...new Set(ZONE_MON[zone])];
    const lv = Math.round(L[0] + rnd() * (L[1] - L[0]));
    // 무거운 의뢰: 한 종류를 많이, 또는 두 종류를 함께
    const two = tys.length > 1 && rnd() < 0.45, rare = rnd() < 0.15;
    const pick = tys.slice().sort(() => rnd() - 0.5).slice(0, two ? 2 : 1);
    const goals = pick.map((ty, k) => ({ ty, need: (two ? 12 : 22) + Math.floor(rnd() * (two ? 10 : 16)) - (k ? 4 : 0), have: 0 }));
    let exp = 0; for (const g of goals) { const L2 = MON[g.ty].fixed ? MON[g.ty].lv : lv; exp += monStats(g.ty, L2).exp * g.need; }
    const tot = goals.reduce((a, g) => a + g.need, 0);
    const gv = B.givers[Math.floor(rnd() * B.givers.length)];
    const why = gv.why[Math.floor(rnd() * gv.why.length)];
    return { id, board, zone, lv, goals, ty: goals[0].ty, exp: Math.round(exp * (rare ? 1.9 : 1.4)), gold: Math.round(lv * tot * (rare ? 20 : 11)), rare: rare ? 1 : 0,
      giver: gv.n, role: gv.r, why, at: Date.now() };
  }
  const api = { R1, C2, R2, ROAD, TOWN_R, TOWN_BLD, PIT, DUN, BOSS_HOME, LAIR, HALL, EPORTAL, zoneAt, SAFE, roomClamp, worldClamp, keepOutOfSafe, MON, monStats, ZONE_MON, ZONE_COUNT, levelAt, ZONE_LEVELS, smooth: sm, BOARDS, BOARD_CAP, makePoster };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OR = api;
})(typeof self !== 'undefined' ? self : this);
