'use strict';
// 새 증강들이 의도대로 동작하는지 확인하는 시나리오 테스트
const G = require('../game');
const assert = require('assert');

function setup(n, augsByPlayer, opts) {
  const g = G.createGame('UT');
  for (let i = 0; i < n; i++) G.addPlayer(g, 'P' + i, 't' + i);
  Object.assign(g, opts || {});
  G.startGame(g);
  // 증강 선택 단계를 건너뛰고 직접 부여
  g.pick = null; g.phase = 'turn'; g.round = 2; g.cur = 0;
  g.tn = { queue: [], throws: 1, counts: {}, thrown: false, second: false };
  g.players.forEach((p, i) => { p.augs = augsByPlayer[i] || []; });
  return g;
}
const put = (p, k, pos, route) => { p.pieces[k].pos = pos; p.pieces[k].route = route || (pos >= 25 ? 'B' : pos >= 20 ? 'A' : 'main'); };
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };

t('8톤 트럭: 막히기 전까지 직선 이동하고 차례 소모', () => {
  const g = setup(2, [['truck'], []]);
  put(g.players[0], 0, 3); put(g.players[0], 1, 3); put(g.players[1], 0, 9);
  G.actAbility(g, g.players[0], 'truck', { pid: '0_0' });
  assert.strictEqual(g.players[0].pieces[0].pos, 8);   // 9번 칸의 적에게 막혀 8번까지
  assert.strictEqual(g.players[0].pieces[1].pos, 8);
  assert.strictEqual(g.players[1].pieces[0].pos, 9);   // 적은 안 잡힘
  assert.strictEqual(g.cur, 1);                        // 차례가 소모되어 다음 사람에게 넘어감
});

t('8톤 트럭: 말 1개짜리는 사용 불가', () => {
  const g = setup(2, [['truck'], []]);
  put(g.players[0], 0, 3);
  assert.throws(() => G.actAbility(g, g.players[0], 'truck', { pid: '0_0' }), /2개 이상/);
});

t('3단 합체: 다른 말뭉치 전부 사망', () => {
  const g = setup(2, [['combo'], []]);
  [0, 1, 2].forEach((k) => put(g.players[0], k, 7)); put(g.players[0], 3, 12);
  put(g.players[1], 0, 14); put(g.players[1], 1, 16);
  G.actAbility(g, g.players[0], 'combo', { pid: '0_0' });
  assert.deepStrictEqual(g.players[0].pieces.map((x) => x.pos), [7, 7, 7, 0]);
  assert.deepStrictEqual(g.players[1].pieces.map((x) => x.pos), [0, 0, 0, 0]);
});

t('게임 접어라(오른쪽→왼쪽): 접힌 말이 반대편 적을 잡음', () => {
  const g = setup(2, [['fold'], []]);
  put(g.players[0], 0, 2);   // x=90 (오른쪽) → 13
  put(g.players[1], 0, 13);  // x=10 (왼쪽)
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1], pos: 0, left: { 0: 0, 1: 1 }, banned: [], options: [], sub: { type: 'fold' } };
  G.actSub(g, g.players[0], 'R');
  assert.strictEqual(g.players[0].pieces[0].pos, 13);
  assert.strictEqual(g.players[1].pieces[0].pos, 0);
});

t('돌림판: 90° 회전하면 모든 말이 5칸 이동', () => {
  const g = setup(2, [['spinwheel'], []]);
  put(g.players[0], 0, 3); put(g.players[1], 0, 22); put(g.players[1], 1, 20);
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1], pos: 0, left: { 0: 0, 1: 1 }, banned: [], options: [], sub: { type: 'spin', k: 1, respun: false } };
  G.actSub(g, g.players[0], 'keep');
  assert.strictEqual(g.players[0].pieces[0].pos, 8);
  assert.strictEqual(g.players[1].pieces[0].pos, 22);
  assert.strictEqual(g.players[1].pieces[1].pos, 25);
});

t('포: 넘을 말이 없거나 둘 이상이면 불가', () => {
  const g = setup(2, [['cannon'], []]);
  g.players[0].pieces[0].type = 'cannon'; put(g.players[0], 0, 1); put(g.players[1], 0, 20, 'A');
  assert.throws(() => G.actAbility(g, g.players[0], 'cannon', { pid: '0_0', node: 4 }), /정확히 하나/);
  put(g.players[1], 0, 3); put(g.players[1], 1, 5);
  assert.throws(() => G.actAbility(g, g.players[0], 'cannon', { pid: '0_0', node: 7 }), /정확히 하나/);
});

t('포: 정확히 하나를 넘어 적을 잡음', () => {
  const g = setup(2, [['cannon'], []]);
  g.players[0].pieces[0].type = 'cannon'; put(g.players[0], 0, 1); put(g.players[1], 0, 3); put(g.players[1], 1, 6);
  G.actAbility(g, g.players[0], 'cannon', { pid: '0_0', node: 6 });
  assert.strictEqual(g.players[0].pieces[0].pos, 6);
  assert.strictEqual(g.players[1].pieces[1].pos, 0);
});

t('폰: 던질 때마다 자동 전진, 직접 조작 불가', () => {
  const g = setup(2, [['pawn'], []]);
  g.players[0].pieces[0].type = 'pawn';
  G.actThrow(g, g.players[0], {});
  assert.strictEqual(g.players[0].pieces[0].pos, 1);
  assert.throws(() => G.actMove(g, g.players[0], 0, '0_0'), /./);
});

t('도깨비: 던지기와 별개로 1칸 앞/뒤 이동, 턴당 1회', () => {
  const g = setup(2, [['goblin'], []]);
  g.players[0].pieces[0].type = 'goblin'; put(g.players[0], 0, 5, 'main');
  G.actAbility(g, g.players[0], 'goblin', { pid: '0_0', dir: -1 });
  assert.strictEqual(g.players[0].pieces[0].pos, 4);
  assert.throws(() => G.actAbility(g, g.players[0], 'goblin', { pid: '0_0', dir: 1 }), /이미/);
});

t('천마군림보: 던진 결과가 반대로 적용 (도 → 한 칸 뒤)', () => {
  const g = setup(2, [['tianma'], []]);
  put(g.players[0], 0, 5, 'main'); g.tn.throws = 0; g.tn.queue = ['도'];
  G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.players[0].pieces[0].pos, 4);
});

t('말이오? 파티: 함정에 걸리면 죽고 설치자는 면역', () => {
  const g = setup(2, [['party'], []]);
  g.party = [{ node: 2, kind: 'kill', owner: 0 }];
  g.players[1].pieces[0].pos = 1; g.players[1].pieces[0].route = 'main'; g.cur = 1; g.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  G.actMove(g, g.players[1], 0, '1_0');
  assert.strictEqual(g.players[1].pieces[0].pos, 0);
  const g2 = setup(2, [['party'], []]);
  g2.party = [{ node: 2, kind: 'kill', owner: 0 }];
  put(g2.players[0], 0, 1); g2.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  G.actMove(g2, g2.players[0], 0, '0_0');
  assert.strictEqual(g2.players[0].pieces[0].pos, 2);
});

t('거머리: 말을 넘겨주고 상대가 지면 함께 탈락', () => {
  const g = setup(3, [['leech'], [], []]);
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1, 2], pos: 0, left: { 0: 0 }, banned: [], options: [], sub: { type: 'player', aug: 'leech' } };
  G.actSub(g, g.players[0], 1);
  assert.strictEqual(g.players[0].pieces.length, 3);
  assert.strictEqual(g.players[1].pieces.length, 5);
});

t('내려: 최다 득표자(주인 2표) 차례 건너뜀', () => {
  const g = setup(3, [['vote'], [], []]);
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1, 2], pos: 0, left: { 0: 0, 1: 1, 2: 1 }, banned: [], options: [], sub: { type: 'vote', aug: 'vote', pending: [0, 1, 2], votes: {} } };
  G.actVote(g, g.players[0], 1); G.actVote(g, g.players[1], 2); G.actVote(g, g.players[2], 0);
  assert.strictEqual(g.players[1].st.skip, 1);   // P1 득표 2 (주인 표), P2 1, P0 1
});

t('나 누구게?: 못 맞추면 차례 한 번 건너뜀', () => {
  const g = setup(3, [['whoami'], [], []]);
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1, 2], pos: 0, left: { 0: 0, 1: 1, 2: 1 }, banned: [], options: [], sub: { type: 'guess', aug: 'whoami', pending: [1, 2], answered: {} } };
  G.actGuess(g, g.players[1], 1); G.actGuess(g, g.players[2], 0);
  assert.strictEqual(g.players[1].st.skip, 0);
  assert.strictEqual(g.players[2].st.skip, 1);
});

t('중전마마: 죽으면 탈락, 12번 던지면 승리', () => {
  const g = setup(2, [['queen'], []]);
  const q = g.players[0].pieces[0]; q.type = 'queen'; q.pos = 10;
  put(g.players[1], 0, 9); g.cur = 1; g.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  G.actMove(g, g.players[1], 0, '1_0');
  assert.strictEqual(g.phase, 'ended'); assert.strictEqual(g.winner, 1);
  const g2 = setup(2, [['queen'], []]);
  g2.players[0].pieces[0].type = 'queen'; g2.players[0].pieces[0].pos = 10; g2.players[0].st.queenThrows = 11;
  G.actThrow(g2, g2.players[0], {});
  assert.strictEqual(g2.winner, 0);
});

t('살인: 체력이 0이 되면 탈락', () => {
  const g = setup(2, [['murder'], []]);
  g.hpOn = true; g.players.forEach((p) => { p.hp = 1; });
  put(g.players[0], 0, 1); put(g.players[1], 0, 2); g.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.winner, 0);
});

t('카니발리즘: 내 말을 잡고 한 번 더 던짐', () => {
  const g = setup(2, [['cannibal'], []]);
  put(g.players[0], 0, 1); put(g.players[0], 1, 2); g.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.players[0].pieces[1].pos, 0);
  assert.strictEqual(g.tn.throws, 1);
});

t('승부다!: 상대가 완주하면 도전자가 탈락', () => {
  const g = setup(2, [['duel'], []]);
  g.duels = [{ ch: 0, t: 1, left: 3, base: 0 }];
  put(g.players[1], 0, 19); g.cur = 1; g.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  G.actMove(g, g.players[1], 0, '1_0');
  assert.strictEqual(g.players[0].alive, false);
});

t('순위전: 동메달은 3위 확정', () => {
  const g = setup(4, [['bronze'], [], [], []], { ranking: true });
  g.phase = 'pick'; g.pick = { kind: 'end', order: [0, 1, 2, 3], pos: 0, left: { 0: 1 }, banned: [], options: [{ id: 'bronze', locked: false }], sub: null };
  g.players[0].augs = [];
  G.actPick(g, g.players[0], 'bronze');
  assert.strictEqual(g.players[0].out, true);
  assert.strictEqual(g.players[0].fixedRank, 3);
});

t('메아리의 형상: 같은 플레이어가 두 번 연속 차례', () => {
  const g = setup(2, [['echo'], []]); g.echo = true;
  put(g.players[0], 0, 1); g.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.cur, 0); assert.strictEqual(g.tn.second, true);
  g.tn.throws = 0; g.tn.queue = ['도']; G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.cur, 1);
});

t('착각: 3라운드 뒤 원래 증강으로 복구', () => {
  const g = setup(2, [['mistake'], ['friendshield']]);
  g.phase = 'pick'; g.round = 6;
  g.pick = { kind: 'mid', order: [0, 1], pos: 0, left: { 0: 0, 1: 1 }, banned: [], options: [], sub: { type: 'owned', aug: 'mistake', target: 1, list: ['friendshield'] } };
  G.actSub(g, g.players[0], 'friendshield');
  assert.deepStrictEqual(g.players[1].augs, ['cat_dis']);
});

t('선택 라운드는 1/5/10, 1라운드 선택창에는 범용+시작 증강만', () => {
  assert.deepStrictEqual(G.ROUND_PICKS, { 1: 'start', 5: 'mid', 10: 'end' });
  for (let trial = 0; trial < 300; trial++) {
    const g = G.createGame('X'); G.addPlayer(g, 'a', 'a'); G.addPlayer(g, 'b', 'b'); g.ranking = trial % 2 === 0; G.startGame(g);
    assert.strictEqual(g.round, 1); assert.strictEqual(g.pick.kind, 'start');
    g.pick.options.forEach((o) => assert(['gen', 'start'].includes(G.BY_ID[o.id].cat), o.id));
  }
});

t('웅녀: 지나치면 위치만 드러나고 정확히 멈춰야 획득', () => {
  const g = setup(2, [['garlic'], []]);
  const p = g.players[0]; p.st.garlic = [2, 3, 9]; p.st.garlicGot = []; p.st.garlicSeen = [];
  put(p, 0, 1); g.tn = { queue: ['개'], throws: 0, counts: {}, thrown: true, second: false };
  G.actMove(g, p, 0, '0_0');   // 1 → 3 (2번 칸 통과, 3번 칸에 정지)
  assert.deepStrictEqual(p.st.garlicGot, [3]);
  assert.deepStrictEqual(p.st.garlicSeen, [2]);
  const v = G.viewFor(g, p).players[0].st;
  assert.deepStrictEqual(v.garlic, [2]);                   // 내 화면엔 발견한 위치만
  assert.strictEqual(G.viewFor(g, g.players[1]).players[0].st.garlic, 3); // 남에게는 개수만
  g.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  g.cur = 0; g.phase = 'turn'; g.tn = { queue: ['도'], throws: 0, counts: {}, thrown: true, second: false };
  put(p, 1, 8); G.actMove(g, p, 0, '0_1');                 // 8 → 9 정지: 획득
  assert.deepStrictEqual(p.st.garlicGot.sort(), [3, 9]);
});

t('등가교환: 말 -1, 윷 +1 / 짐덩이와 복덩이: 말 +1, 윷 -1', () => {
  const g = setup(2, [[], []]);
  const p = g.players[0]; const q = g.players[1];
  p.augs = []; g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1], pos: 0, left: { 0: 1, 1: 1 }, banned: [], options: [{ id: 'equal', locked: false }], sub: null };
  G.actPick(g, p, 'equal');
  assert.strictEqual(p.pieces.length, 3); assert.strictEqual(p.sticks, 5);
  g.pick = { kind: 'start', order: [0, 1], pos: 1, left: { 0: 0, 1: 1 }, banned: [], options: [{ id: 'burden', locked: false }], sub: null };
  G.actPick(g, q, 'burden');
  assert.strictEqual(q.pieces.length, 5); assert.strictEqual(q.sticks, 3);
});

t('모 아니면 도: 모 약 40%, 도 약 60%', () => {
  const g = setup(2, [['modo'], []]);
  let mo = 0; const N = 4000;
  for (let i = 0; i < N; i++) { g.tn = { queue: [], throws: 1, counts: {}, thrown: false, second: false }; g.players[0].pieces.forEach((x) => { x.pos = 0; }); G.actThrow(g, g.players[0], {}); const r = g.tn && g.tn.queue.length ? g.tn.queue[0] : null; if (r === '모') mo++; g.cur = 0; g.phase = 'turn'; }
  assert(Math.abs(mo / N - 0.4) < 0.04, '모 비율 ' + mo / N);
});

t('이도류: 모가 도로 바뀌었다고 로그에 남김', () => {
  const g = setup(2, [['twin'], []]);
  const orig = Math.random; let seq = 0;
  Math.random = () => 0.9;  // 윷 4개 모두 뒷면(0.9 >= 0.5) → 앞면 0개 = 모
  try { G.actThrow(g, g.players[0], {}); } finally { Math.random = orig; }
  assert(g.log.some((l) => l.includes('이도류!') && l.includes('도로 바뀝니다')));
  assert(g.tn.queue.every((r) => r === '도'));
});

t('6명까지 입장 가능, 7번째는 거절', () => {
  const g = G.createGame('S');
  for (let i = 0; i < 6; i++) G.addPlayer(g, 'P' + i, 't' + i);
  assert.throws(() => G.addPlayer(g, 'X', 'x'), /최대 6명/);
  G.startGame(g);
  assert.strictEqual(new Set(g.players.map((p) => p.color)).size, 6);
});

t('윷 3개: 걸이 없고 앞면 2개는 개', () => {
  const g = setup(2, [['burden'], []]); const p = g.players[0]; p.sticks = 3;
  const cnt = {}; const N = 20000;
  for (let i = 0; i < N; i++) { g.tn = { queue: [], throws: 1, counts: {}, thrown: false, second: false }; p.pieces.forEach((x) => { x.pos = 0; }); g.cur = 0; g.phase = 'turn'; G.actThrow(g, p, {}); const r = g.tn.queue[0]; cnt[r] = (cnt[r] || 0) + 1; }
  assert(!cnt['걸'], '걸이 나옴');
  assert(Math.abs(cnt['개'] / N - 0.375) < 0.02, '개 비율 ' + cnt['개'] / N);
  assert(Math.abs(cnt['윷'] / N - 0.125) < 0.02);
});

console.log(pass + '개 통과');
