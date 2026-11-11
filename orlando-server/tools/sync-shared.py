#!/usr/bin/env python3
"""shared.js·sim.js 를 고친 뒤 게임 페이지(public/index.html) 안 사본에 똑같이 옮긴다.
   쓰는 법: python3 orlando-server/tools/sync-shared.py <고치기 전 shared.js> <고치기 전 sim.js>
   (고치기 전 파일은 git show HEAD:orlando-server/shared.js 처럼 받는다) """
import sys, os
D = os.path.join(os.path.dirname(__file__), '..')
P = os.path.join(D, 'public', 'index.html')
s = open(P, encoding='utf-8').read()
for name, old in (('shared.js', sys.argv[1]), ('sim.js', sys.argv[2])):
    cut = lambda t: t[t.index('(function (root) {'):t.rindex('})(typeof self')]
    o, n = cut(open(old, encoding='utf-8').read()), cut(open(os.path.join(D, name), encoding='utf-8').read())
    assert s.count(o) == 1, name + ': 게임 페이지 안 사본이 고치기 전 파일과 다르다'
    s = s.replace(o, n)
open(P, 'w', encoding='utf-8').write(s)
print('옮김')
