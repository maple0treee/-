#!/usr/bin/env node
/*
 * 사람 모양 몬스터(거인·오우거·트롤·나무 거인·예티·산적·불도마뱀) 빚은 모양 굽기
 *
 * 몬스터를 거리 함수로 한 덩어리로 매끈하게 빚고(tools/monbake/models.js), 겉면을 뽑아 색·그늘을 칠하고,
 * 관절에서 부드럽게 휘도록 뼈 무게를 매기고, 면을 줄여 public/monbake/<종류>.json 에 굽는다.
 * 게임은 몬스터가 처음 나올 때 이 파일을 받아 원래 모양을 바꿔 입힌다 (monBake…, index.html).
 * 가까이 볼 때 모양(lod 0)과 멀리서 볼 때 모양(lod 1)을 같이 담는다.
 *
 * 쓰는 법:
 *   cd <아무 빈 폴더> && npm i meshoptimizer@0.21.0   # 한 번만
 *   NODE_PATH=<그 폴더>/node_modules node orlando-server/tools/monbake.js [종류 ...]
 *   (H=.006 처럼 빚는 칸 크기를 바꿀 수 있다. 작을수록 곱고 느리다)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const OUT = path.join(__dirname, '..', 'public', 'monbake');

if (process.argv[2] === '--one') {
  const TYPES = Object.assign({}, require('./monbake/models').TYPES, require('./monbake/horse').TYPES, require('./monbake/beasts').TYPES);
  const { bakeModel } = require('./monbake/bake');
  const t = process.argv[3];
  (async () => {
    const t0 = Date.now();
    const model = TYPES[t]();
    const r = await bakeModel(model, { h: +(process.env.H || .0065), log: !!process.env.LOG });
    r.t = t;
    fs.writeFileSync(path.join(OUT, t + '.json'), JSON.stringify(r));
    const tri = r.lod.map(l => l.reduce((s, p) => s + p.tri, 0));
    console.log(t, '면', tri.join(' / '), Math.round(fs.statSync(path.join(OUT, t + '.json')).size / 1024) + 'KB', ((Date.now() - t0) / 1000).toFixed(0) + '초');
  })().catch(e => { console.error(t, e); process.exit(1); });
} else {
  const TYPES = Object.assign({}, require('./monbake/models').TYPES, require('./monbake/horse').TYPES, require('./monbake/beasts').TYPES);
  fs.mkdirSync(OUT, { recursive: true });
  const list = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TYPES);
  const N = Math.max(1, Math.min(+(process.env.J || require('os').cpus().length), list.length));
  let i = 0, bad = 0;
  const next = () => { if (i >= list.length) return Promise.resolve(); const t = list[i++];
    return new Promise(ok => { const c = fork(__filename, ['--one', t], { stdio: 'inherit' }); c.on('exit', code => { if (code) bad++; ok(); }); }).then(next); };
  Promise.all(Array.from({ length: N }, next)).then(() => { if (bad) { console.error('실패', bad); process.exit(1); } });
}
