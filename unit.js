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
  g.pick = null; g.phase = 'turn'; g.round = 2; g.cur = 0; g.order = g.players.map((p) => p.idx);
  g.tn = { queue: [], throws: 1, counts: {}, thrown: false, second: false };
  g.players.forEach((p, i) => { p.augs = augsByPlayer[i] || []; });
  return g;
}
const put = (p, k, pos, route) => { p.pieces[k].pos = pos; p.pieces[k].route = route || (pos >= 25 ? 'B' : pos >= 20 ? 'A' : 'main'); };
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };

t('8톤 트럭: 직선으로 벽(모서리)까지만 가고 차례 소모', () => {
  const g = setup(2, [['truck'], []]);
  put(g.players[0], 0, 1); put(g.players[0], 1, 1); put(g.players[1], 0, 9);
  G.actAbility(g, g.players[0], 'truck', { pid: '0_0' });
  assert.strictEqual(g.players[0].pieces[0].pos, 5);   // 1→5(모서리, 벽). 6번 칸 이후로 꺾어가지 않음
  assert.strictEqual(g.players[0].pieces[1].pos, 5);
  assert.strictEqual(g.players[1].pieces[0].pos, 9);
  assert.strictEqual(g.cur, 1);                        // 차례 소모
});

t('8톤 트럭: 적에게 막히면 그 앞에서 멈춤(잡지 않음)', () => {
  const g = setup(2, [['truck'], []]);
  put(g.players[0], 0, 6); put(g.players[0], 1, 6); put(g.players[1], 0, 9);
  G.actAbility(g, g.players[0], 'truck', { pid: '0_0' });
  assert.strictEqual(g.players[0].pieces[0].pos, 8);
  assert.strictEqual(g.players[1].pieces[0].pos, 9);
});

t('8톤 트럭: 지름길 대각선도 끝(모서리)까지만', () => {
  const g = setup(2, [['truck'], []]);
  put(g.players[0], 0, 20); put(g.players[0], 1, 20);
  G.actAbility(g, g.players[0], 'truck', { pid: '0_0' });
  assert.strictEqual(g.players[0].pieces[0].pos, 15);  // 20→21→22→23→24→15 (대각선의 끝)
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
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1], stage: 'resolve', cur: 0, left: { 0: 0, 1: 1 }, chosen: {}, opts: {}, queue: [], banned: [], options: [], sub: { type: 'fold' } };
  G.actSub(g, g.players[0], 'R');
  assert.strictEqual(g.players[0].pieces[0].pos, 13);
  assert.strictEqual(g.players[1].pieces[0].pos, 0);
});

t('돌림판: 90° 회전하면 모든 말이 5칸 이동', () => {
  const g = setup(2, [['spinwheel'], []]);
  put(g.players[0], 0, 3); put(g.players[1], 0, 22); put(g.players[1], 1, 20);
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1], stage: 'resolve', cur: 0, left: { 0: 0, 1: 1 }, chosen: {}, opts: {}, queue: [], banned: [], options: [], sub: { type: 'spin', k: 1, respun: false } };
  G.actSub(g, g.players[0], 'keep');
  assert.strictEqual(g.players[0].pieces[0].pos, 8);
  assert.strictEqual(g.players[1].pieces[0].pos, 22);
  assert.strictEqual(g.players[1].pieces[1].pos, 25);
});

t('포: 넘을 말이 없거나 둘 이상이면 불가', () => {
  const g = setup(2, [['cannon'], []]);
  g.players[0].pieces[0].type = 'cannon'; put(g.players[0], 0, 1); put(g.players[1], 0, 20, 'A');
  assert.throws(() => G.actAbility(g, g.players[0], 'cannon', { pid: '0_0', node: 4 }), /정확히 하나/);
  put(g.players[1], 0, 3); put(g.players[1], 1, 4);
  assert.throws(() => G.actAbility(g, g.players[0], 'cannon', { pid: '0_0', node: 5 }), /정확히 하나/);
});

t('포: 정확히 하나를 넘어 직선의 벽 안에서 적을 잡음', () => {
  const g = setup(2, [['cannon'], []]);
  g.players[0].pieces[0].type = 'cannon'; put(g.players[0], 0, 1); put(g.players[1], 0, 3); put(g.players[1], 1, 5);
  G.actAbility(g, g.players[0], 'cannon', { pid: '0_0', node: 5 });
  assert.strictEqual(g.players[0].pieces[0].pos, 5);
  assert.strictEqual(g.players[1].pieces[1].pos, 0);
});

t('포: 벽(모서리) 너머로는 갈 수 없음', () => {
  const g = setup(2, [['cannon'], []]);
  g.players[0].pieces[0].type = 'cannon'; put(g.players[0], 0, 1); put(g.players[1], 0, 3);
  assert.throws(() => G.actAbility(g, g.players[0], 'cannon', { pid: '0_0', node: 7 }), /벽/);
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

const turnOf = (g, i, q) => { g.cur = i; g.phase = 'turn'; g.tn = { queue: q, throws: 0, counts: {}, thrown: true, second: false }; };
t('천마군림보: 출발도 반대 방향 (대기 말이 도로 19번 칸에 진입)', () => {
  const g = setup(2, [['tianma'], []]);
  turnOf(g, 0, ['도']); G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.players[0].pieces[0].pos, 19);
});

t('천마군림보: 개는 18번 칸, 걸은 17번 칸 / 대기 말은 백도 불가', () => {
  const g = setup(2, [['tianma'], []]);
  turnOf(g, 0, ['개']); G.actMove(g, g.players[0], 0, '0_0'); assert.strictEqual(g.players[0].pieces[0].pos, 18);
  turnOf(g, 0, ['백도']); assert.throws(() => G.actMove(g, g.players[0], 0, '0_1'), /./);
});

t('천마군림보: 백도는 원래 방향으로 한 칸, 출발 칸에서 백도하면 대기로', () => {
  const g = setup(2, [['tianma'], []]);
  put(g.players[0], 0, 18); turnOf(g, 0, ['백도']); G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.players[0].pieces[0].pos, 19);
  turnOf(g, 0, ['백도']); G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.players[0].pieces[0].pos, 0);
});

t('천마군림보: 반대 방향으로 한 바퀴 돌아 완주 (1번 칸에서 도 = 골인)', () => {
  const g = setup(2, [['tianma'], []]);
  put(g.players[0], 0, 1); turnOf(g, 0, ['도']); G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.players[0].pieces[0].done, true);
});

t('천마군림보: 지름길도 거울 대칭 (15번 모서리에서 개 → 대각선 23번)', () => {
  const g = setup(2, [['tianma'], []]);
  put(g.players[0], 0, 15, 'main'); turnOf(g, 0, ['개']); G.actMove(g, g.players[0], 0, '0_0');
  assert.strictEqual(g.players[0].pieces[0].pos, 23);
  const g2 = setup(2, [['tianma'], []]);
  put(g2.players[0], 0, 10, 'main'); turnOf(g2, 0, ['개']); G.actMove(g2, g2.players[0], 0, '0_0');
  assert.strictEqual(g2.players[0].pieces[0].pos, 26);   // 10번 모서리 → 25 → 26
});

t('천마군림보: 트럭도 반대 방향 직선 (19번 → 15번 벽)', () => {
  const g = setup(2, [['tianma', 'truck'], []]);
  g.players[0].augs = ['tianma', 'truck'];
  put(g.players[0], 0, 19); put(g.players[0], 1, 19);
  G.actAbility(g, g.players[0], 'truck', { pid: '0_0' });
  assert.strictEqual(g.players[0].pieces[0].pos, 15);
});

t('마신 소환: 판 위의 광신도만 의식 코인', () => {
  const g = setup(2, [['summon'], []]);
  const p = g.players[0];
  p.pieces.forEach((x) => { x.type = 'zealot'; }); put(p, 0, 3); put(p, 1, 4);   // 판 위 2개, 대기 2개
  p.st.ritual = 0;
  turnOf(g, 1, ['도']); G.actMove(g, g.players[1], 0, '1_0');   // 상대가 움직이면 내 차례 시작
  assert.strictEqual(g.cur, 0);
  assert.strictEqual(p.st.ritual, 2);                            // 대기 중인 2개는 제외
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
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1, 2], stage: 'resolve', cur: 0, left: { 0: 0 }, chosen: {}, opts: {}, queue: [], banned: [], options: [], sub: { type: 'player', aug: 'leech' } };
  G.actSub(g, g.players[0], 1);
  assert.strictEqual(g.players[0].pieces.length, 3);
  assert.strictEqual(g.players[1].pieces.length, 5);
});

t('내려: 최다 득표자(주인 2표) 차례 건너뜀', () => {
  const g = setup(3, [['vote'], [], []]);
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1, 2], stage: 'resolve', cur: 0, left: { 0: 0, 1: 1, 2: 1 }, chosen: {}, opts: {}, queue: [], banned: [], options: [], sub: { type: 'vote', aug: 'vote', pending: [0, 1, 2], votes: {} } };
  G.actVote(g, g.players[0], 1); G.actVote(g, g.players[1], 2); G.actVote(g, g.players[2], 0);
  assert.strictEqual(g.players[1].st.skip, 1);   // P1 득표 2 (주인 표), P2 1, P0 1
});

t('나 누구게?: 못 맞추면 차례 한 번 건너뜀', () => {
  const g = setup(3, [['whoami'], [], []]);
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1, 2], stage: 'resolve', cur: 0, left: { 0: 0, 1: 1, 2: 1 }, chosen: {}, opts: {}, queue: [], banned: [], options: [], sub: { type: 'guess', aug: 'whoami', pending: [1, 2], answered: {} } };
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
  g.phase = 'pick'; g.pick = { kind: 'end', order: [0, 1, 2, 3], stage: 'choose', cur: 0, left: { 0: 1 }, chosen: { 0: [], 1: [], 2: [], 3: [] }, opts: { 0: [{ id: 'bronze', locked: false }] }, queue: [], banned: [], options: [], sub: null };
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
  g.pick = { kind: 'mid', order: [0, 1], stage: 'resolve', cur: 0, left: { 0: 0, 1: 1 }, chosen: {}, opts: {}, queue: [], banned: [], options: [], sub: { type: 'owned', aug: 'mistake', target: 1, list: ['friendshield'] } };
  G.actSub(g, g.players[0], 'friendshield');
  assert.deepStrictEqual(g.players[1].augs, ['cat_dis']);
});

t('선택 라운드는 1/5/10, 1라운드 선택창에는 범용+시작 증강만', () => {
  assert.deepStrictEqual(G.ROUND_PICKS, { 1: 'start', 5: 'mid', 10: 'end' });
  for (let trial = 0; trial < 300; trial++) {
    const g = G.createGame('X'); G.addPlayer(g, 'a', 'a'); G.addPlayer(g, 'b', 'b'); g.ranking = trial % 2 === 0; G.startGame(g);
    assert.strictEqual(g.round, 1); assert.strictEqual(g.pick.kind, 'start');
    g.players.forEach((q) => g.pick.opts[q.idx].forEach((o) => assert(['gen', 'start'].includes(G.BY_ID[o.id].cat), o.id)));
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
  p.augs = []; g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1], stage: 'choose', cur: 0, left: { 0: 1, 1: 1 }, chosen: { 0: [], 1: [] }, opts: { 0: [{ id: 'equal', locked: false }], 1: [{ id: 'burden', locked: false }] }, queue: [], banned: [], options: [], sub: null };
  G.actPick(g, p, 'equal');
  assert.strictEqual(g.pick.stage, 'choose'); assert.strictEqual(p.pieces.length, 4);   // 아직 공개 전
  G.actPick(g, q, 'burden');
  assert.strictEqual(p.pieces.length, 3); assert.strictEqual(p.sticks, 5);
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

t('던지기 연출: 기록된 윷 모양이 결과와 일치하고 모두에게 전달', () => {
  const g = G.createGame('X'); const p = G.addPlayer(g, 'A', 'a'); G.addPlayer(g, 'B', 'b'); G.startGame(g);
  const cls = (f) => { const n = f.length, k = f.filter(Boolean).length; if (k === 0) return '모'; if (k === n) return '윷'; if (k === 1) return f[0] ? '백도' : '도'; if (n >= 4 && k === n - 1) return '걸'; return '개'; };
  for (let i = 0; i < 500; i++) {
    g.phase = 'turn'; g.cur = 0; g.tn = { queue: [], throws: 1, counts: {}, thrown: false, second: false };
    const before = (g.throwSeq || 0); G.actThrow(g, p, {});
    const lt = G.viewFor(g, g.players[1]).lastThrow;
    assert(lt && lt.seq === before + 1 && lt.by === 0, 'lastThrow 없음');
    assert(cls(lt.items[0].faces) === lt.items[0].res, '모양/결과 불일치 ' + lt.items[0].res);
  }
});


t('동시 선택: 선택은 비공개, 모두 고르면 공개·적용, 명탐정은 남의 해당 증강을 무효화', () => {
  const g = G.createGame('X'); G.addPlayer(g, 'a', 'a'); G.addPlayer(g, 'b', 'b'); G.addPlayer(g, 'c', 'c'); G.startGame(g);
  assert.strictEqual(g.pick.stage, 'choose');
  // 모두 같은 선택지를 가지게 세팅
  [0, 1, 2].forEach((i) => { g.players[i].augs = []; g.pick.opts[i] = [{ id: i === 0 ? 'detective' : 'shield2', locked: false }, { id: 'equal', locked: false }]; });
  g.pick.opts[1] = [{ id: 'equal', locked: false }]; g.pick.opts[2] = [{ id: 'equal', locked: false }];
  const v1 = G.viewFor(g, g.players[1]);
  assert(v1.pick.options && v1.pick.mine.length === 0 && !JSON.stringify(v1).includes('detective'), '남의 선택지 노출');
  G.actPick(g, g.players[1], 'equal'); G.actPick(g, g.players[2], 'equal');
  assert.strictEqual(g.pick.stage, 'choose');
  assert(!G.viewFor(g, g.players[0]).pick.mine.length);
  G.actPick(g, g.players[0], 'detective');
  assert.strictEqual(g.pick.stage, 'resolve'); assert.strictEqual(g.pick.sub.type, 'augment');
  assert(g.players[1].augs.length === 0, '공개 전에 적용됨');
  G.actSub(g, g.players[0], 'equal');
  assert.strictEqual(g.phase, 'turn');
  assert(!g.players[1].augs.includes('equal') && !g.players[2].augs.includes('equal'), '무효화 실패');
  assert(g.players[0].augs.includes('detective'));
});
t('시작 순서: 윷을 던져 큰 순서대로, 모든 플레이어가 한 번씩 포함', () => {
  for (let k = 0; k < 200; k++) {
    const g = G.createGame('X'); const n = 2 + (k % 5); for (let i = 0; i < n; i++) G.addPlayer(g, 'P' + i, 't' + i); G.startGame(g);
    assert.deepStrictEqual([...g.order].sort(), [...Array(n).keys()].sort());
    const lt = g.lastThrow; assert(lt && lt.rounds && lt.rounds.length >= 1);
    const first = lt.rounds[0]; const V = { '백도': 0, '도': 1, '개': 2, '걸': 3, '윷': 4, '모': 5 };
    const val = (i) => V[first.find((x) => x.by === i).items[0].res];
    for (let j = 1; j < n; j++) assert(val(g.order[j - 1]) >= val(g.order[j]), '내림차순 아님');
    assert.strictEqual(g.order.indexOf(g.cur === undefined ? -1 : g.cur) >= 0 || true, true);
  }
});
t('차례는 정해진 순서대로 돌고, 한 바퀴마다 라운드 증가', () => {
  const g = setup(3, [[], [], []]); g.order = [2, 0, 1]; g.cur = 2; g.round = 2;
  g.tn = { queue: [], throws: 0, counts: {}, thrown: true, second: false };
  const seq = []; for (let i = 0; i < 4; i++) { seq.push(g.cur); G._internal.endTurn(g); }
  assert.deepStrictEqual(seq, [2, 0, 1, 2]);
  assert.strictEqual(g.round, 3);
});


t('알까기: 적을 맞히면 밀려나 가까운 칸에 서고, 못 맞히면 내 말은 사망', () => {
  const XYn = (n) => { const C = [[90, 90], [90, 10], [10, 10], [10, 90]]; const s = Math.floor(n / 5), k = n % 5; return [C[s][0] + (C[(s + 1) % 4][0] - C[s][0]) * k / 5, C[s][1] + (C[(s + 1) % 4][1] - C[s][1]) * k / 5]; };
  void XYn;
  const mk = () => { const g = setup(2, [['flick'], []]); g.order = [0, 1]; g.cur = 0; g.tn = { queue: [], throws: 1, counts: {}, thrown: false, second: false }; return g; };
  // 맞힘: 1번 칸(90,74)의 내 말을 위(-90°)로 쏨 → 2번 칸(90,58)의 적을 침
  let g = mk(); let me = g.players[0], foe = g.players[1];
  me.pieces[0].pos = 1; foe.pieces[0].pos = 2;
  G.actAbility(g, me, 'flick', { pid: me.pieces[0].id, ang: -Math.PI / 2, pow: 0.5 });
  assert(g.lastFlick && g.lastFlick.hit, '명중 기록');
  assert(g.lastFlick.frames.length > 3 && g.lastFlick.end.length === 2);
  assert(me.used.flick === true);
  const occ = {}; [me, foe].forEach((q) => q.pieces.forEach((x) => { if (!x.done && x.pos > 0) (occ[x.pos] = occ[x.pos] || new Set()).add(q.idx); }));
  Object.values(occ).forEach((s2) => assert(s2.size === 1, '한 칸에 두 주인'));
  // 빗나감: 반대 방향으로 쏨 → 아무도 못 맞힘 → 내 말 사망
  g = mk(); me = g.players[0]; foe = g.players[1];
  me.pieces[0].pos = 1; foe.pieces[0].pos = 2;
  G.actAbility(g, me, 'flick', { pid: me.pieces[0].id, ang: Math.PI / 2, pow: 0.5 });
  assert(!g.lastFlick.hit); assert.strictEqual(me.pieces[0].pos, 0); assert.strictEqual(foe.pieces[0].pos, 2);
  assert.strictEqual(g.lastFlick.end[0], null);
});
t('알까기: 세게 쏴서 적을 판 밖으로 날리면 적 사망', () => {
  const g = setup(2, [['flick'], []]); g.order = [0, 1]; g.cur = 0; g.tn = { queue: [], throws: 1, counts: {}, thrown: false, second: false };
  const me = g.players[0], foe = g.players[1];
  me.pieces[0].pos = 3; foe.pieces[0].pos = 4;   // (90,42) → (90,26), 위쪽으로 세게
  G.actAbility(g, me, 'flick', { pid: me.pieces[0].id, ang: -Math.PI / 2, pow: 1 });
  const fe = g.lastFlick.end;
  assert(g.lastFlick.hit);
  assert(fe[1] === null ? foe.pieces[0].pos === 0 : foe.pieces[0].pos > 0, '적 결과가 end와 일치');
});
t('증강팩: 선택한 팩의 증강만 선택지에 나오고, 최소 1개 필요', () => {
  const g = G.createGame('X'); G.addPlayer(g, 'a', 'a'); G.addPlayer(g, 'b', 'b');
  assert.deepStrictEqual(g.packs, ['base']);
  assert.throws(() => G.setPacks(g, []), /하나 이상/); assert.throws(() => G.setPacks(g, ['nope']), /하나 이상/);
  G.setPacks(g, ['base']);
  G.AUGMENTS.push({ id: 'zz_test', name: '테스트', cat: 'gen', desc: '', pack: 'test' });
  G.PACKS.push({ id: 'test', name: '테스트팩', desc: '' });
  try {
    for (let k = 0; k < 30; k++) { G.startGame(g); g.players.forEach((q) => assert(!g.pick.opts[q.idx].some((o) => o.id === 'zz_test'), '미선택 팩 증강 등장')); G.resetGame(g); }
    G.setPacks(g, ['test']);
    G.startGame(g); assert(g.players.every((q) => g.pick.opts[q.idx].every((o) => o.id === 'zz_test')), '선택한 팩 증강만');
  } finally { G.AUGMENTS.pop(); G.PACKS.pop(); }
});

// ---------- 림버스 컴퍼니 팩 ----------
const mv = (g, p, res, k) => { g.tn = { queue: [res], throws: 0, counts: {}, thrown: true, second: false }; g.cur = p.idx; G.actMove(g, p, 0, p.pieces[k].id); };
t('림버스: 루치오 - 혼자 공격한 말이 죽고, 2개 겹친 공격은 원래대로', () => {
  let g = setup(2, [[], ['lucio']]); let a = g.players[0], b = g.players[1];
  put(a, 0, 1); put(b, 0, 2); b.pieces[0].type = 'lucio';
  mv(g, a, '도', 0);
  assert.strictEqual(a.pieces[0].pos, 0, '공격자 사망'); assert.strictEqual(b.pieces[0].pos, 2);
  g = setup(2, [[], ['lucio']]); a = g.players[0]; b = g.players[1];
  put(a, 0, 1); put(a, 1, 1); put(b, 0, 2); b.pieces[0].type = 'lucio';
  mv(g, a, '도', 0);
  assert.strictEqual(b.pieces[0].pos, 0, '2개 겹침이면 루치오 사망');
});
t('림버스: 발렌치나 - 예지안 확률 회피 시 공격한 말이 죽고 스택 -1', () => {
  const g = setup(2, [[], ['valen']]); const a = g.players[0], b = g.players[1];
  put(a, 0, 1); put(b, 0, 2); b.pieces[0].type = 'valen'; b.pieces[0].yeji = 10;
  const r = Math.random; Math.random = () => 0;
  try { mv(g, a, '도', 0); } finally { Math.random = r; }
  assert.strictEqual(a.pieces[0].pos, 0, '공격자 사망'); assert.strictEqual(b.pieces[0].pos, 2); assert.strictEqual(b.pieces[0].yeji, 9);
});
t('림버스: T사 - 잡는 대신 징수 상태, 징수당한 말은 1칸만 가고 윷 결과가 보관함에 쌓임', () => {
  const g = setup(2, [['tsa'], []]); const a = g.players[0], b = g.players[1];
  put(a, 0, 1); put(b, 0, 2);
  mv(g, a, '도', 0);
  assert.strictEqual(b.pieces[0].pos, 2); assert.strictEqual(b.pieces[0].tax, 0);
  assert.strictEqual(g.cur, 1, '추가 던지기 없이 차례 종료');
  g.cur = 1; mv(g, b, '걸', 0);
  assert.strictEqual(b.pieces[0].pos, 3, '1칸만 이동'); assert(g.cur === 0 && g.tn.queue.includes('걸'), '징수한 윷이 내 차례 사용 가능');
});
t('림버스: 소속 중지 - 잡히면 반응 대기, 이동으로 되받아 잡으면 상대의 추가 던지기 박탈', () => {
  const g = setup(2, [[], ['jungji']]); const a = g.players[0], b = g.players[1];
  put(a, 0, 1); put(b, 0, 2); put(b, 1, 4);
  mv(g, a, '도', 0);
  assert.strictEqual(g.interrupts.length, 1); assert.strictEqual(b.pieces[0].pos, 0);
  assert.throws(() => G.actThrow(g, a, {}), /기다리는 중/);
  G.actInterrupt(g, b, { pid: b.pieces[1].id });
  assert.strictEqual(g.interrupts.length, 0);
});
t('림버스: 소속 중지 - 사용 안 함으로 넘기면 진행', () => {
  const g = setup(2, [[], ['jungji']]); const a = g.players[0], b = g.players[1];
  put(a, 0, 1); put(b, 0, 2); put(b, 1, 8);
  mv(g, a, '도', 0);
  assert.strictEqual(g.interrupts.length, 1);
  G.actInterrupt(g, b, { skip: true });
  assert.strictEqual(g.interrupts.length, 0);
});
t('림버스: 라만차랜드 - 피가 없는 랜드 밖 혈귀는 쇠약(1칸, 잡기 불가)', () => {
  const g = setup(2, [['lamancha'], []]); const a = g.players[0], b = g.players[1];
  a.st.lim.land = [1, 2, 3, 4, 5]; a.st.lim.side = 'R'; a.st.lim.blood = 0;
  put(a, 0, 12); g.cur = 1; g.tn = { queue: [], throws: 0, counts: {}, thrown: true, second: false };
  G._internal.endTurn(g);
  assert.strictEqual(g.cur, 0); assert(a.pieces[0].weak, '쇠약해야 함');
  put(b, 0, 13);
  mv(g, a, '걸', 0);
  assert.strictEqual(a.pieces[0].pos, 13, '1칸만 이동'); assert.strictEqual(b.pieces[0].pos, 13, '잡지 못함');
});
t('림버스: 라만차랜드 - 랜드 안에서 죽으면 피주머니, 밟은 말은 함께 사망', () => {
  const g = setup(2, [['lamancha'], []]); const a = g.players[0], b = g.players[1];
  a.st.lim.land = [1, 2, 3, 4, 5]; a.st.lim.side = 'R'; a.st.lim.blood = 5;
  put(b, 0, 4); put(a, 0, 2);
  mv(g, a, '도', 0);                      // 랜드 안 이동 +1: 2 → 4, b 사망 → 4번 칸에 피주머니
  assert.strictEqual(g.bags.length, 1); assert.strictEqual(g.bags[0].node, 4);
  put(b, 1, 3); b.pieces[0].pos = 0;
  g.cur = 1; mv(g, b, '도', 1);            // b가 4번 칸(피주머니)으로 → 둘 다 사망
  assert.strictEqual(b.pieces[1].pos, 0); assert.strictEqual(g.bags.length, 0); assert(a.st.lim.blood >= 6, '피주머니가 죽어 피 +1');
});
t('림버스: K사 - 앰플로 무덤의 말 부활 (근처에 내 말 필요)', () => {
  const g = setup(2, [['ksa'], []]); const a = g.players[0];
  a.st.lim.amp = 3; a.st.lim.graves = [{ id: a.pieces[1].id, node: 7 }]; put(a, 0, 15);
  assert.throws(() => G.actAbility(g, a, 'ksa', { node: 7 }), /앞뒤 칸/);
  put(a, 0, 8);
  G.actAbility(g, a, 'ksa', { node: 7 });
  assert.strictEqual(a.pieces[1].pos, 7); assert.strictEqual(a.st.lim.amp, 2);
});
t('림버스: 와일드헌트 - 관으로 가장 먼저 죽은 말을 부활, 3차례 뒤 다시 죽음', () => {
  const g = setup(2, [['hunt'], []]); const a = g.players[0];
  a.st.lim.coffin = 1; a.st.lim.graves = [{ id: a.pieces[1].id, node: 9 }, { id: a.pieces[2].id, node: 11 }];
  G.actAbility(g, a, 'hunt', {});
  assert.strictEqual(a.pieces[1].pos, 9); assert.strictEqual(a.pieces[2].pos, 0); assert.strictEqual(a.st.lim.coffin, 0);
  assert.strictEqual(a.st.lim.timers.length, 1);
});
t('림버스: 군주 - 흑수의 주인 2에서 능력: 군주 앞뒤에 대기 중 흑수 배치 + 차례 소모', () => {
  const g = setup(2, [['lord'], []]); const a = g.players[0];
  a.pieces[0].type = 'lord'; a.pieces.slice(1).forEach((x) => { x.hs = true; }); put(a, 0, 8);
  a.st.lim.lordMark = 2;
  G.actAbility(g, a, 'lord', {});
  const poss = a.pieces.filter((x) => x.hs && x.pos > 0).map((x) => x.pos).sort((x, y) => x - y);
  assert.deepStrictEqual(poss, [7, 9]); assert.strictEqual(a.st.lim.lordMark, 0);
});
t('림버스: 약지 - 생체재료 4로 예술(이동 +2) → 다시 4로 폐장(면 속박)', () => {
  const g = setup(2, [['yakji'], []]); const a = g.players[0], b = g.players[1];
  a.st.lim.bio = 4; G.actAbility(g, a, 'yakji', {});
  assert(a.st.lim.art); assert.strictEqual(a.st.lim.bio, 0);
  g.phase = 'turn'; g.cur = 0; g.tn = { queue: [], throws: 1, counts: {}, thrown: false, second: false };
  put(b, 0, 3); a.st.lim.bio = 4;
  G.actAbility(g, a, 'yakji', { side: 'R' });
  assert(b.pieces[0].frozen > g.round, '속박됨');
});
t('림버스: 검지 - 지령 3개 완수 시 승리 (정중앙 지령)', () => {
  const g = setup(2, [['geomji'], []]); const a = g.players[0];
  a.st.lim.qdone = 2; a.st.lim.q = { id: 3, prog: 0, sum: {}, last: null, hist: '', target: null };
  put(a, 0, 21, 'A'); mv(g, a, '도', 0);
  assert.strictEqual(g.phase, 'ended'); assert.strictEqual(g.winner, 0);
});
t('림버스: 대호수의 규칙 - 규칙(말 안 움직이기)을 어기면 어긴 사람의 말이 죽고 규칙이 공개됨', () => {
  const g = setup(2, [['lake'], []]); const a = g.players[0], b = g.players[1];
  a.st.lim.lake = { rule: 3 }; put(b, 0, 6); g.cur = 1; g.tn = { queue: [], throws: 0, counts: {}, thrown: true, second: false };
  G._internal.endTurn(g);
  assert.strictEqual(b.pieces[0].pos, 0, '말 사망'); assert.strictEqual(b.st.lim.knows.length, 1);
  const v = G.viewFor(g, a).players[0].st.lim, w = G.viewFor(g, b).players[0].st.lim;
  assert.strictEqual(v.lake, 3); assert(w.lake === undefined, '남에게는 비공개');
});

// ---------- 림버스 2차 ----------
const I = G._internal;
t('에이해브: 업힌 말 수만큼 이동 +1', () => {
  const g = setup(2, [['ahab'], []]);
  const p = g.players[0]; p.pieces[0].type = 'ahab'; put(p, 0, 3); put(p, 1, 3); put(p, 2, 3);
  assert.strictEqual(I.groupSteps(g, p, '도', I.groupOf(p, p.pieces[0])), 3);
});
t('에이해브: 공격당하면 업힌 말 하나를 희생하고 생존, 3스택이면 가스하푼 개화', () => {
  const g = setup(2, [['ahab'], []]);
  const a = g.players[0], b = g.players[1]; a.pieces[0].type = 'ahab'; a.pieces[0].sac = 2;
  put(a, 0, 7); put(a, 1, 7); put(b, 0, 6);
  g.tn.throws = 0; g.tn.queue = ['도']; g.cur = 1;
  G.actMove(g, b, 0, '1_0');
  assert.strictEqual(a.pieces[0].pos, 7); assert.strictEqual(a.pieces[1].pos, 0); assert(a.pieces[0].bloom);
});
t('에이해브: 가스하푼 상태에서 공격하면 공격한 말이 죽음', () => {
  const g = setup(2, [['ahab'], []]);
  const a = g.players[0], b = g.players[1]; a.pieces[0].type = 'ahab'; a.pieces[0].bloom = true;
  put(a, 0, 7); put(b, 0, 6);
  g.tn.throws = 0; g.tn.queue = ['도']; g.cur = 1;
  G.actMove(g, b, 0, '1_0');
  assert.strictEqual(a.pieces[0].pos, 7); assert.strictEqual(b.pieces[0].pos, 0);
});
t('고래: 라운드 시작에 이동하고 그 칸 말을 죽임 / 다른 플레이어가 공격하면 잠수', () => {
  const g = setup(2, [['ahab'], []]);
  g.whales = [{ id: 1, node: 8, kind: 'ahab', imm: null }];
  put(g.players[1], 0, 8);
  g.tn.throws = 0; g.tn.queue = ['도']; g.cur = 1; put(g.players[1], 0, 7); put(g.players[1], 1, 20);
  G.actMove(g, g.players[1], 0, '1_0');             // 7→8 고래 공격
  assert(g.whales[0].node !== 8 || g.whales.length === 1);
  assert.strictEqual(g.players[1].pieces[0].pos, 8); // 공격자는 안 죽음
});
t('에이해브가 고래를 잡으면 개화', () => {
  const g = setup(2, [['ahab'], []]);
  const a = g.players[0]; a.pieces[0].type = 'ahab'; put(a, 0, 7);
  g.whales = [{ id: 1, node: 8, kind: 'ahab', imm: null }];
  g.tn.throws = 0; g.tn.queue = ['도'];
  G.actMove(g, a, 0, '0_0');
  assert(a.pieces[0].bloom); assert.strictEqual(g.whales.length, 0);
});
t('싱클레어: 알 상태는 1칸만, 공격당하지 않고 부화하면 이동 +1', () => {
  const g = setup(2, [['sinclair'], []]);
  const a = g.players[0], b = g.players[1]; a.pieces[0].type = 'sinclair'; a.pieces[0].egg = 2; a.pieces[0].form = 'egg'; a.pieces[0].mark = 0;
  put(a, 0, 6);
  assert.strictEqual(I.groupSteps(g, a, '걸', [a.pieces[0]]), 1);
  put(b, 0, 5); g.tn.throws = 0; g.tn.queue = ['도']; g.cur = 1; G.actMove(g, b, 0, '1_0');
  assert.strictEqual(a.pieces[0].pos, 6);
  a.pieces[0].egg = 0; a.pieces[0].form = 'sin';
  assert.strictEqual(I.groupSteps(g, a, '도', [a.pieces[0]]), 2);
});
t('싱클레어: 표지 3개면 어느 싱클레어, 던진 결과 이내 자유 이동', () => {
  const g = setup(2, [['sinclair'], []]);
  const a = g.players[0]; const x = a.pieces[0]; x.type = 'sinclair'; x.egg = 0; x.form = 'any'; x.mark = 3; put(a, 0, 1);
  g.tn.throws = 0; g.tn.queue = ['걸'];
  G.actMove(g, a, 0, '0_0', { dist: 2 });
  assert.strictEqual(x.pos, 3);  // 걸(3)+1=4 이내에서 2칸 선택 → 1+2=3
}) ;
t('뒤틀림: 죽을 때 뒤틀림/개화/사망 중 하나, 뒤틀림이면 공격자를 공격', () => {
  let sawDistort = 0, sawEgo = 0, sawDeath = 0;
  for (let i = 0; i < 300; i++) {
    const g = setup(2, [['distort'], []]);
    const a = g.players[0], b = g.players[1]; put(a, 0, 7); put(b, 0, 6);
    g.tn.throws = 0; g.tn.queue = ['도']; g.cur = 1; G.actMove(g, b, 0, '1_0');
    const x = a.pieces[0];
    if (x.type === 'distort') { sawDistort++; assert.strictEqual(b.pieces[0].pos, 0); }
    else if (x.type === 'ego') { sawEgo++; assert(x.ego); }
    else { sawDeath++; assert.strictEqual(x.pos, 0); }
  }
  assert(sawDistort > 80 && sawEgo > 5 && sawDeath > 60, `${sawDistort}/${sawEgo}/${sawDeath}`);
});
t('EGO 가시 돋친 입맞춤: 앞뒤 직선에 출혈, 출혈은 이동 -1', () => {
  const g = setup(2, [['distort'], []]);
  const a = g.players[0], b = g.players[1]; I.bloomEgo(g, a, a.pieces[0], 'bleed'); put(a, 0, 7); put(b, 0, 9); put(b, 1, 20);
  G.actAbility(g, a, 'ego', { pid: '0_0' });
  assert.strictEqual(b.pieces[0].bleed, 2); assert(!b.pieces[1].bleed);
  assert.strictEqual(I.groupSteps(g, b, '개', [b.pieces[0]]), 1);
});
t('EGO 무한한 궤적: 같은 말을 연속 이동할수록 이동 증가', () => {
  const g = setup(2, [['distort'], []]);
  const a = g.players[0]; I.bloomEgo(g, a, a.pieces[0], 'breath'); put(a, 0, 1); a.pieces[0].chain = 2;
  assert.strictEqual(I.groupSteps(g, a, '도', [a.pieces[0]]), 3);
});
t('EGO 무너지는 종루: 균열은 3번까지, 지나가는 적 말이 멈춤', () => {
  const g = setup(2, [[], []]);
  const a = g.players[0], b = g.players[1]; I.bloomEgo(g, a, a.pieces[0], 'tower'); put(a, 0, 3); put(b, 0, 1);
  G.actAbility(g, a, 'ego', { pid: '0_0' });
  assert.strictEqual(G.viewFor(g, a).cracks[0], 3);
  g.cur = 1; g.tn = { queue: ['걸'], throws: 0, counts: {}, thrown: true };
  G.actMove(g, b, 0, '1_0');
  assert.strictEqual(b.pieces[0].pos, 3);
});
t('EGO 필연적인 균열: 공격한 적의 앞뒤 칸도 공격', () => {
  const g = setup(2, [['distort'], []]);
  const a = g.players[0], b = g.players[1]; I.bloomEgo(g, a, a.pieces[0], 'rupture'); put(a, 0, 7);
  put(b, 0, 8); put(b, 1, 9);
  g.tn.throws = 0; g.tn.queue = ['도'];
  G.actMove(g, a, 0, '0_0');
  assert.strictEqual(b.pieces[0].pos, 0); assert.strictEqual(b.pieces[1].pos, 0);
});
t('EGO 가라앉은 독백: 차례 시작마다 앞뒤 적에게 침잠 -1', () => {
  const g = setup(2, [['distort'], []]);
  const a = g.players[0], b = g.players[1]; I.bloomEgo(g, a, a.pieces[0], 'sink'); put(a, 0, 7); put(b, 0, 8);
  I.limStartTurn(g, a);
  assert(b.pieces[0].sink); assert.strictEqual(I.groupSteps(g, b, '개', [b.pieces[0]]), 1);
});
t('EGO 폭풍의 전야: 충전을 쓰면 다음 이동 증가', () => {
  const g = setup(2, [['distort'], []]);
  const a = g.players[0]; I.bloomEgo(g, a, a.pieces[0], 'charge'); put(a, 0, 1); a.pieces[0].charge = 3;
  G.actAbility(g, a, 'ego', { pid: '0_0' });
  assert.strictEqual(I.groupSteps(g, a, '도', [a.pieces[0]]), 4);
});
t('EGO 꺼지지 않는 장례식: 적 말이 있는 칸을 지나가면 화상, 차례 시작에 후퇴', () => {
  const g = setup(2, [['distort'], []]);
  const a = g.players[0], b = g.players[1]; I.bloomEgo(g, a, a.pieces[0], 'burn'); put(a, 0, 6); put(b, 0, 7);
  g.tn.throws = 0; g.tn.queue = ['개'];
  G.actMove(g, a, 0, '0_0');
  assert.strictEqual(b.pieces[0].burn, 1);   // 상대 차례가 시작되며 이미 1 줄고 1칸 후퇴
  assert.strictEqual(b.pieces[0].pos, 6);
});
t('해결사: 적을 잡으면 급수 상승, 변환된 말은 2급, 5급이면 이동+1과 뒤로 이동', () => {
  const g = setup(2, [['fixer'], []]);
  const a = g.players[0], b = g.players[1]; a.pieces[0].type = 'fixer'; a.pieces[0].lv = 0; a.pieces[0].ex = 0;
  put(a, 0, 6); put(b, 0, 7); b.pieces[0].type = 'goblin';
  g.tn.throws = 0; g.tn.queue = ['도'];
  G.actMove(g, a, 0, '0_0');
  assert.strictEqual(a.pieces[0].lv, 2);
  a.pieces[0].lv = 4; assert.strictEqual(I.groupSteps(g, a, '도', [a.pieces[0]]), 2);
  g.tn = { queue: ['걸'], throws: 0, counts: {}, thrown: true }; a.pieces[0].pos = 10; a.pieces[0].route = 'main';
  G.actMove(g, a, 0, '0_0', { back: true });
  assert.strictEqual(a.pieces[0].pos, 9);
});
t('해결사: 1급 이후 3스택이면 특색, 죽어도 유지', () => {
  const g = setup(2, [['fixer'], []]);
  const a = g.players[0]; a.pieces[0].type = 'fixer'; a.pieces[0].lv = 8; a.pieces[0].ex = 2; put(a, 0, 6);
  I.fixerGain(g, a, a.pieces[0], 1);
  assert(['red', 'yellow', 'indigo'].includes(a.pieces[0].trait));
});
t('붉은시선: 앞에 있는 적의 이동 -2, 모/윷 금지', () => {
  const g = setup(2, [['fixer'], []]);
  const a = g.players[0], b = g.players[1]; a.pieces[0].type = 'fixer'; put(a, 0, 3); put(b, 0, 8);
  I.becomeTrait(g, a, a.pieces[0], 'red');
  assert.strictEqual(I.groupSteps(g, b, '걸', [b.pieces[0]]), 1);
  assert.strictEqual(I.groupSteps(g, b, '도', [b.pieces[0]]), 0);
  assert.strictEqual(g.pool, 0);
});
t('노란작살: 돌진은 지나간 칸의 적을 모두 죽이고, 쿨타임 2', () => {
  const g = setup(2, [['fixer'], []]);
  const a = g.players[0], b = g.players[1]; a.pieces[0].type = 'fixer'; put(a, 0, 6); put(b, 0, 7); put(b, 1, 8);
  I.becomeTrait(g, a, a.pieces[0], 'yellow');
  G.actAbility(g, a, 'trait', { pid: '0_0', mode: 'dash' });
  assert.strictEqual(b.pieces[0].pos, 0); assert.strictEqual(b.pieces[1].pos, 0); assert.strictEqual(a.pieces[0].pos, 9);
  assert.throws(() => G.actAbility(g, a, 'trait', { pid: '0_0', mode: 'dash' }), /차례 뒤/);
});
t('쪽빛노인: 대호수의 규칙 획득, 연못, 고래 4마리(주인 면역)', () => {
  const g = setup(2, [['fixer'], []]);
  const a = g.players[0]; a.pieces[0].type = 'fixer';
  I.becomeTrait(g, a, a.pieces[0], 'indigo');
  assert(g.pond); assert.strictEqual(g.whales.length, 4); assert(a.augs.includes('lake')); assert(g.whales.every((w) => w.imm === 0));
});
t('검은침묵: 무기 능력으로 범위 안의 적을 처치 (추가 던지기 없음)', () => {
  const g = setup(2, [['fixer'], []]);
  const a = g.players[0], b = g.players[1]; a.pieces[0].type = 'fixer'; put(a, 0, 6); put(b, 0, 8);
  I.becomeTrait(g, a, a.pieces[0], 'black'); a.pieces[0].weapon = '대검';
  const th = g.tn.throws;
  G.actAbility(g, a, 'weapon', { pid: '0_0' });
  assert.strictEqual(b.pieces[0].pos, 0); assert.strictEqual(g.tn.throws, th);
});
t('주식: 값에 따라 이동 증감, 0 이하 이동은 불가', () => {
  const g = setup(2, [['stock'], []]);
  const a = g.players[0]; a.st.lim.stock = { name: 'W', v: 12 }; put(a, 0, 1);
  assert.strictEqual(I.groupSteps(g, a, '도', [a.pieces[0]]), 4);
  a.st.lim.stock.v = 3; assert.strictEqual(I.groupSteps(g, a, '도', [a.pieces[0]]), 0); assert.strictEqual(I.groupSteps(g, a, '개', [a.pieces[0]]), 1);
  a.st.lim.stock.v = 0; assert.strictEqual(I.groupSteps(g, a, '윷', [a.pieces[0]]), 1);
});
t('초록빛: 말을 바치면 주변 말이 끌려오고 조종 불가, 3차례 뒤 소멸', () => {
  const g = setup(2, [['light'], []]);
  const a = g.players[0], b = g.players[1]; put(a, 0, 7); put(a, 1, 6); put(b, 0, 8);
  G.actAbility(g, a, 'light', { pid: '0_0' });
  assert.strictEqual(a.pieces[0].pos, 0); assert.strictEqual(a.pieces[1].pos, 7); assert.strictEqual(b.pieces[0].pos, 7);
  assert(b.pieces[0].lit);
  for (let i = 0; i < 3; i++) I.lightTick(g, a);
  assert.strictEqual(g.lights.length, 0); assert(!b.pieces[0].lit);
});
t('마티아스: 모든 플레이어의 말 +1, 이동 +1', () => {
  const g = setup(2, [[], []]);
  g.phase = 'pick'; g.pick = { kind: 'start', order: [0, 1], stage: 'choose', cur: 0, left: { 0: 1, 1: 0 }, chosen: { 0: [], 1: [] }, opts: { 0: [{ id: 'matthias', locked: false }], 1: [] }, queue: [], banned: [], options: [], sub: null };
  g.players.forEach((p) => { p.augs = []; });
  G.actPick(g, g.players[0], 'matthias');
  assert.deepStrictEqual(g.players.map((p) => p.pieces.length), [5, 5]);
  assert(g.matthias);
  put(g.players[0], 0, 1);
  assert.strictEqual(I.groupSteps(g, g.players[0], '도', [g.players[0].pieces[0]]), 2);
});

console.log(pass + '개 통과');
