'use strict';
// 무작위 봇으로 여러 판을 돌려 예외/무한루프를 찾는 테스트
const G = require('../game');
const { has } = G._internal;
const sample = (a) => a[Math.floor(Math.random() * a.length)];

function tryAll(fn, cands) {
  for (const c of cands.sort(() => Math.random() - 0.5)) { try { fn(c); return true; } catch (e) { /* 다음 후보 */ } }
  return false;
}

const EXPECT_KIND = { 1: 'start', 5: 'mid', 10: 'end' };
function pickPhase(g) {
  const pk = g.pick; const sub = pk.sub;
  if (EXPECT_KIND[g.round] !== pk.kind) throw new Error(`라운드 ${g.round} 선택 종류가 ${pk.kind}`);
  Object.values(pk.opts || {}).forEach((l) => l.forEach((o) => { const c = G.BY_ID[o.id].cat; if (c !== 'gen' && c !== pk.kind) throw new Error(`${pk.kind} 선택창에 ${o.id}(${c}) 등장`); }));
  if (pk.stage === 'choose') {
    const who = Object.keys(pk.left).map(Number).filter((i) => pk.left[i] > 0 && g.players[i].alive && !g.players[i].out);
    if (!who.length) throw new Error('선택할 사람이 없는데 단계가 안 넘어감');
    const q = g.players[sample(who)];
    return G.actPick(g, q, sample(pk.opts[q.idx].filter((o) => !o.locked)).id);
  }
  if (sub && sub.type === 'guess') { const q = g.players[sample(sub.pending)]; return G.actGuess(g, q, Math.floor(Math.random() * 4)); }
  if (sub && sub.type === 'vote') {
    const q = g.players[sample(sub.pending)];
    return G.actVote(g, q, sample(g.players.filter((x) => x.alive && !x.out && x !== q)).idx);
  }
  const p = g.players[pk.cur];
  if (sub) {
    switch (sub.type) {
      case 'player': return G.actSub(g, p, sample(g.players.filter((q) => q.alive && !q.out && q !== p)).idx);
      case 'augment': return G.actSub(g, p, sample(G.AUGMENTS.filter((a) => a.cat !== 'hidden')).id);
      case 'owned': return G.actSub(g, p, sample(sub.list));
      case 'fold': return G.actSub(g, p, sample(['R', 'L', 'T', 'B']));
      case 'spin': return G.actSub(g, p, sample(sub.respun ? ['keep'] : ['keep', 'respin']));
      case 'rank': return G.actSub(g, p, sample(g.players.filter((q) => !sub.picks.includes(q.idx))).idx);
      default: throw new Error('알 수 없는 sub ' + sub.type);
    }
  }
  throw new Error('공개 단계인데 처리할 sub가 없음');
}

function stepBot(g) {
  if (g.phase === 'pick') return pickPhase(g);
  const p = g.players[g.cur];
  const tn = g.tn;
  // 가끔 능력 사용
  if (Math.random() < 0.3) {
    const mine = p.pieces.filter((x) => !x.done);
    const board = mine.filter((x) => x.pos > 0);
    const foes = g.players.filter((q) => q !== p && q.alive && !q.out);
    const dead = g.players.filter((q) => !q.alive);
    const tries = [];
    board.forEach((x) => {
      tries.push(['shield', { pid: x.id }], ['sacrifice', { pid: x.id }], ['timetravel', { pid: x.id, target: 0 }],
        ['truck', { pid: x.id }], ['combo', { pid: x.id }], ['domain', { pid: x.id }]);
      foes.forEach((q) => q.pieces.filter((y) => !y.done && y.pos > 0).forEach((y) => tries.push(['flick', { pid: x.id, tpid: y.id }])));
    });
    mine.forEach((x) => {
      tries.push(['goblin', { pid: x.id, dir: Math.random() < 0.5 ? 1 : -1 }]);
      for (let k = 0; k < 3; k++) tries.push(['cannon', { pid: x.id, node: 1 + Math.floor(Math.random() * 28) }]);
    });
    tries.push(['sniper', { node: 1 + Math.floor(Math.random() * 28) }]);
    tries.push(['baduk', {}], ['handfast', {}], ['chalice', {}], ['lastdance', {}], ['fog', {}]);
    foes.forEach((q) => tries.push(['aim', { target: q.idx }]));
    dead.forEach((q) => tries.push(['necro', { target: q.idx }]));
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
  if (!ok) throw new Error('유효한 이동이 없는데 턴이 안 넘어감: queue=' + tn.queue + ' phase=' + g.phase + ' augs=' + p.augs);
}

module.exports = { stepBot };
if (require.main === module) {
const N = Number(process.argv[2] || 300);
let ended = 0, stuck = 0; const reasons = {}; const used = {};
for (let i = 0; i < N; i++) {
  const g = G.createGame('TEST');
  const n = 2 + (i % 5);
  for (let k = 0; k < n; k++) G.addPlayer(g, 'P' + k, 't' + k);
  g.chaos = i % 2 === 0;
  g.ranking = i % 4 >= 2;
  G.startGame(g);
  let steps = 0;
  try {
    while (g.phase !== 'ended' && steps < 30000) { stepBot(g); steps++; }
  } catch (e) { console.log('예외 발생 (판', i, ', 단계', steps, '):', e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); }
  g.players.forEach((p) => p.augs.forEach((a) => { used[a] = (used[a] || 0) + 1; }));
  if (g.phase === 'ended') { ended++; reasons[g.reason] = (reasons[g.reason] || 0) + 1; } else {
    stuck++; console.log('미종료 게임: round', g.round, 'phase', g.phase, 'ranking', g.ranking, g.players.map((p) => `${p.name}:${p.alive ? 'alive' : 'dead'}${p.out ? '/out' : ''}:${p.augs}`).join(' | '));
  }
}
console.log(`게임 ${N}판: 종료 ${ended}, 미종료 ${stuck}`);
console.log(reasons);
const never = G.AUGMENTS.filter((a) => a.cat !== 'hidden' && !used[a.id]).map((a) => a.name);
console.log('한 번도 안 뽑힌 증강:', never.length ? never.join(', ') : '없음');
}
