'use strict';
// 무작위 봇으로 여러 판을 돌려 예외/무한루프를 찾는 테스트
const G = require('../game');
const { has } = G._internal;
const sample = (a) => a[Math.floor(Math.random() * a.length)];

function tryAll(fn, cands) {
  for (const c of cands.sort(() => Math.random() - 0.5)) { try { fn(c); return true; } catch (e) { /* 다음 후보 */ } }
  return false;
}

function stepBot(g) {
  if (g.phase === 'pick') {
    const pk = g.pick; const p = g.players[pk.order[pk.pos]];
    if (pk.sub) {
      if (pk.sub.type === 'player') return G.actSub(g, p, sample(g.players.filter((q) => q.alive && q !== p)).idx);
      return G.actSub(g, p, sample(G.AUGMENTS).id);
    }
    return G.actPick(g, p, sample(pk.options.filter((o) => !o.locked)).id);
  }
  const p = g.players[g.cur];
  const tn = g.tn;
  // 가끔 능력 사용
  if (Math.random() < 0.25) {
    const board = p.pieces.filter((x) => !x.done && x.pos > 0);
    const tries = [];
    if (board.length) {
      board.forEach((x) => { tries.push(['shield', { pid: x.id }], ['sacrifice', { pid: x.id }], ['timetravel', { pid: x.id, target: 0 }]); });
      tries.push(['sniper', { node: 1 + Math.floor(Math.random() * 28) }]);
    }
    tries.push(['baduk', {}], ['handfast', {}], ['chalice', {}], ['lastdance', {}]);
    const [a, o] = sample(tries);
    if (p.augs.includes(a)) { try { G.actAbility(g, p, a, o); return; } catch (e) { /* 무시 */ } }
  }
  if (tn.throws > 0) {
    const o = {};
    if (p.st.nextChoose) o.choose = sample(G.RES); else if (has(p, 'dogpig')) o.choose = sample(['도', '개']);
    if (has(p, 'doberman') && p.st.coins >= 2 && Math.random() < 0.5) o.coin = true;
    return G.actThrow(g, p, o);
  }
  const cands = [];
  tn.queue.forEach((r, ri) => p.pieces.forEach((x) => { if (!x.done) cands.push([ri, x.id]); }));
  const ok = tryAll(([ri, pid]) => G.actMove(g, p, ri, pid), cands);
  if (!ok) throw new Error('유효한 이동이 없는데 턴이 안 넘어감: queue=' + tn.queue + ' phase=' + g.phase);
}

const N = Number(process.argv[2] || 300);
let ended = 0, stuck = 0; const reasons = {}; const augWins = {};
for (let i = 0; i < N; i++) {
  const g = G.createGame('TEST');
  const n = 2 + (i % 3);
  for (let k = 0; k < n; k++) G.addPlayer(g, 'P' + k, 't' + k);
  g.chaos = i % 2 === 0;
  G.startGame(g);
  let steps = 0;
  while (g.phase !== 'ended' && steps < 20000) { stepBot(g); steps++; }
  if (g.phase === 'ended') { ended++; reasons[g.reason] = (reasons[g.reason] || 0) + 1; } else { stuck++; console.log('미종료 게임: round', g.round, 'phase', g.phase); }
}
console.log(`게임 ${N}판: 종료 ${ended}, 미종료 ${stuck}`);
console.log(reasons);
