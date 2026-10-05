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
  const TOWN_R = 27;                                // 도시 안전 지대 반지름
  const PIT = { x: -64, z: 10, r: 12, depth: 3.6 }; // 폐허 석굴 입구
  const DUN = { x: 0, z: 422, R: 14, corZ0: 394, corZ1: 409, corW: 3.2 };
  const BOSS_HOME = { x: 0, z: 421 };

  function zoneAt(x, z) {
    if (z > 300) return 'dungeon';
    if (x > ROAD.x0 && x < ROAD.x1 && Math.abs(z) < 12 && Math.hypot(x - C2.x, z - C2.z) > R2 - 2) return 'road';
    const d2 = Math.hypot(x - C2.x, z - C2.z);
    if (x > 150) {
      if (d2 < TOWN_R) return 'town';
      const a = Math.atan2(z - C2.z, x - C2.x);
      if (d2 >= 80) return Math.abs(a) > 1.9 ? 'waste' : 'abyss';
      if (Math.abs(a) > 2.36) return 'waste';
      if (a < -0.785 && a >= -2.36) return 'snow';
      if (a > 0.785 && a <= 2.36) return 'grave';
      return 'volcano';
    }
    const d = Math.hypot(x, z);
    if (d < 26) return 'village';
    const a = Math.atan2(z, x) + Math.sin(d * 0.11) * 0.12;
    if (a >= -0.75 * PI && a < -0.25 * PI) return 'forest';
    if (a >= -0.25 * PI && a < 0.25 * PI) return 'plains';
    if (a >= 0.25 * PI && a < 0.75 * PI) return 'swamp';
    return 'ruins';
  }
  const SAFE = { village: 1, town: 1 };

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
    dog:      { name: '들개', build: 'quad', color: 0x7a5a3a, hpM: 0.8, atkM: 1 },
    bandit:   { name: '산적', build: 'biped', color: 0x6b4a2e, hpM: 1, atkM: 1.05, sword: true },
    // 황야
    scorpion: { name: '전갈', build: 'quad', color: 0xb07a3a, hpM: 1.1, atkM: 1.1, tail: true, scale: 1.1 },
    sandslime:{ name: '모래 슬라임', build: 'slime', color: 0xc9a46a, hpM: 1.2, atkM: 0.9, scale: 1.3 },
    // 설원
    whitewolf:{ name: '흰 늑대', build: 'quad', color: 0xe8eef2, hpM: 0.9, atkM: 1.15 },
    yeti:     { name: '예티', build: 'biped', color: 0xf0f4f6, hpM: 1.6, atkM: 1.2, scale: 1.6, club: true },
    iceslime: { name: '얼음 슬라임', build: 'slime', color: 0x9fd8f0, hpM: 1.1, atkM: 1, scale: 1.4, glow: 0x3a88b0 },
    // 묘지
    ghoul:    { name: '구울', build: 'biped', color: 0x6f7f62, hpM: 1.1, atkM: 1.15 },
    wraith:   { name: '망령', build: 'biped', color: 0x9a86c8, hpM: 0.8, atkM: 1.3, ghost: true },
    boneknight:{ name: '해골 기사', build: 'biped', color: 0xd8d0bc, hpM: 1.4, atkM: 1.15, bone: true, sword: true, scale: 1.2 },
    // 화산
    fireslime:{ name: '불꽃 정령', build: 'slime', color: 0xff8a3a, hpM: 1, atkM: 1.25, scale: 1.3, glow: 0xff5a10 },
    lavagiant:{ name: '용암 거인', build: 'biped', color: 0x5a2a22, hpM: 1.8, atkM: 1.25, scale: 2.1, club: true, glow: 0xb03010 },
    salamander:{ name: '불도마뱀', build: 'biped', color: 0xb8402a, hpM: 1.1, atkM: 1.2, tail: true },
    // 심연
    voidslime:{ name: '공허 슬라임', build: 'slime', color: 0x5a3a8a, hpM: 1.3, atkM: 1.2, scale: 1.6, glow: 0x6020a0 },
    shadowwolf:{ name: '그림자 늑대', build: 'quad', color: 0x2a2433, hpM: 1.1, atkM: 1.35, scale: 1.2 },
    fallen:   { name: '타락한 기사', build: 'biped', color: 0x2b2633, hpM: 1.7, atkM: 1.3, scale: 1.35, sword: true, glow: 0x7020c0 },
    // 석굴
    kingslime:{ name: '킹 슬라임', lv: 20, fixed: { hp: 16000, atk: 70, def: 14, exp: 4500 }, gold: 1500, build: 'slime', color: 0x56c860, scale: 4.2, boss: true },
    slimelet: { name: '킹 슬라임 조각', build: 'slime', color: 0x7fe07a, hpM: 0.5, atkM: 0.8, scale: 1.1 },
  };
  function monStats(ty, lv) {
    const D = MON[ty];
    if (D.fixed) return { ...D.fixed, lv: D.lv };
    const L = lv;
    return {
      lv: L,
      hp: Math.round((12 * Math.pow(L, 1.25) + 15) * (D.hpM || 1)),
      atk: Math.round((5 + 2.4 * Math.pow(L, 1.1)) * (D.atkM || 1)),
      def: Math.round(L * 0.9 * (D.defM || 1)),
      exp: Math.round(6 * Math.pow(L, 1.3) * (0.5 + 0.5 * (D.hpM || 1))),
    };
  }
  const ZONE_MON = {
    forest: ['slime', 'slime', 'wolf'], plains: ['boar', 'goblin'], swamp: ['toad', 'lizard'], ruins: ['skeleton', 'skeleton', 'ogre'],
    road: ['dog', 'bandit'], waste: ['scorpion', 'bandit', 'sandslime'], snow: ['whitewolf', 'yeti', 'iceslime'],
    grave: ['ghoul', 'wraith', 'boneknight'], volcano: ['fireslime', 'lavagiant', 'salamander'], abyss: ['voidslime', 'shadowwolf', 'fallen'],
  };
  const ZONE_COUNT = { forest: 10, plains: 9, swamp: 8, ruins: 7, road: 5, waste: 11, snow: 10, grave: 10, volcano: 10, abyss: 13 };
  // 지역별 레벨: 두 번째 지역은 도시에서 멀수록 강하다
  function levelAt(zone, x, z) {
    const d2 = Math.hypot(x - C2.x, z - C2.z);
    const f = (a, b, lo, hi) => Math.round(lo + (hi - lo) * clampN((d2 - a) / (b - a), 0, 1));
    switch (zone) {
      case 'road': return 12 + Math.round(clampN((x - ROAD.x0) / (ROAD.x1 - ROAD.x0), 0, 1) * 4);
      case 'waste': return d2 >= 80 ? f(138, 80, 15, 20) : f(80, 27, 20, 25);
      case 'snow': return f(27, 80, 25, 40);
      case 'grave': return f(27, 80, 40, 55);
      case 'volcano': return f(27, 80, 55, 70);
      case 'abyss': return f(80, 138, 70, 100);
      default: return 1;
    }
  }
  const ZONE_LEVELS = { village: [0, 0], forest: [1, 4], plains: [4, 7], swamp: [7, 11], ruins: [11, 15], dungeon: [18, 22], road: [12, 16], town: [0, 0], waste: [15, 25], snow: [25, 40], grave: [40, 55], volcano: [55, 70], abyss: [70, 100] };

  const api = { R1, C2, R2, ROAD, TOWN_R, PIT, DUN, BOSS_HOME, zoneAt, SAFE, roomClamp, worldClamp, keepOutOfSafe, MON, monStats, ZONE_MON, ZONE_COUNT, levelAt, ZONE_LEVELS, smooth: sm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OR = api;
})(typeof self !== 'undefined' ? self : this);
