'use strict';
// 증강 윷놀이 - 서버 권위(authoritative) 게임 로직

const COLORS = ['#e5484d', '#3e8ef7', '#30a46c', '#f5c518'];
const COLOR_NAMES = ['빨강', '파랑', '초록', '노랑'];

// 경로: 말은 (pos, route) 로 위치를 표현. pos 0 = 대기(집), done = 완주
const ROUTES = {
  main: Array.from({ length: 19 }, (_, i) => i + 1),
  A: [5, 20, 21, 22, 23, 24, 15, 16, 17, 18, 19], // 첫 모서리 지름길 (중앙 지나 15로)
  B: [10, 25, 26, 22, 27, 28],                    // 둘째 모서리 지름길 (중앙 지나 출발점으로)
};
// 일직선 (사목/바둑). 0 = 출발점(말이 설 수 없음)
const LINES = [
  [0, 1, 2, 3, 4, 5], [5, 6, 7, 8, 9, 10], [10, 11, 12, 13, 14, 15], [15, 16, 17, 18, 19, 0],
  [5, 20, 21, 22, 23, 24, 15], [10, 25, 26, 22, 27, 28, 0],
];
const DIAG_NODES = [20, 21, 22, 23, 24, 25, 26, 27, 28];
const STEPS = { '백도': -1, '도': 1, '개': 2, '걸': 3, '윷': 4, '모': 5 };
const RES = Object.keys(STEPS);
const ROUND_PICKS = { 1: 'start', 6: 'mid', 12: 'end' };

const A = (id, name, cat, desc, note) => ({ id, name, cat, desc, note });
const AUGMENTS = [
  // ---- 범용 ----
  A('cat', '고양이', 'gen', '아무 능력이 없습니다. 왜 있냐고요? 귀엽잖아요.'),
  A('gantaek', '간택', 'gen', '이제 모든 플레이어는 증강 선택창에 고양이가 나오면 무조건 고양이를 골라야 합니다.'),
  A('catlover', '애묘인', 'gen', '언제든 고양이를 선택한 플레이어가 있으면 승리합니다.'),
  A('dogpig', '개돼지', 'gen', '매 턴 도와 개만 낼 수 있지만 선택할 수 있습니다.'),
  A('modo', '모 아니면 도', 'gen', '모 아니면 도만 나옵니다. (50:50)'),
  A('twin', '이도류', 'gen', '윷을 2개씩 모두 던지며, 모 결과는 도로 바뀝니다.'),
  A('excess', '과유불급', 'gen', '윷 6개를 사용합니다. 앞면 0개는 모, 5개는 윷, 앞면 6개는 탈락입니다. (1=도, 2=개, 3·4=걸)', '앞면 1~4개 결과는 원문에 없어 임의로 정했습니다.'),
  A('doberman', '도베르만', 'gen', '이번 게임 동안 자신이 개를 낸 만큼 개 코인을 얻고, 이후 개를 낼 때마다 1개씩 더 얻습니다. 던질 때 개 코인 2개를 소비해 모를 낼 수 있습니다.'),
  A('handfast', '손은 눈보다 빠르다', 'gen', '1회, 다음 윷을 던질 때 원하는 대로 낼 수 있습니다.'),
  A('timetravel', '시간 여행', 'gen', '1회, 자신의 말 하나를 원하는 뒤쪽 칸으로 이동시킵니다.'),
  A('objection', '이의있음!', 'gen', '이번 증강 선택을 취소하고 다시 고릅니다.'),
  A('detective', '명탐정', 'gen', '증강 하나를 고릅니다. 해당 증강은 이번 증강 선택에서 무효화됩니다.'),
  A('delivery', '배달', 'gen', '증강 하나를 선택합니다. 다음 증강 선택 때 해당 증강이 자신에게 무조건 등장합니다.'),
  A('shield', '천상의 보호막', 'gen', '1회, 자신의 말뭉치 하나를 선택합니다. 해당 말뭉치는 보호막을 얻어 죽음을 1번 견딥니다.'),
  A('friendshield', '프랜드 실드', 'gen', '내 말뭉치가 죽을 때 말이 1개만 죽습니다.'),
  A('sacrifice', '희생', 'gen', '1회, 윷판 위의 자신의 말 하나를 죽입니다. 윷판 위의 자신의 다른 모든 말에 보호막을 씌워 죽음을 1번 막습니다.'),
  A('redbutton', '크고 빨간 버튼', 'gen', '획득 즉시 두 대각선 지름길에 있는 모든 플레이어의 말을 죽입니다.'),
  A('notme', '나만 아니면 돼~', 'gen', '즉시 무작위 플레이어 한 명의 모든 말을 죽입니다. (자신 제외)'),
  A('baduk', '바둑', 'gen', '1회, 일직선으로 있는 내 말뭉치 둘 사이에 있는 적을 모두 죽이고 죽인 수만큼 던지기 기회를 얻습니다.'),
  A('jajin', '자진모리 장단', 'gen', '걸이 2번 나올 때마다 개를 얻습니다.'),
  A('ejiri', '어부지리', 'gen', '내 차례가 아닐 때 죽은 다른 플레이어의 말 개수 2개마다 개를 얻습니다. (다음 내 차례에 지급)'),
  A('sniper', '명사수', 'gen', '던지기 기회를 소모해 칸 하나를 선택합니다. 다음 라운드 자신 차례가 시작하면 해당 칸의 모든 말을 죽입니다.'),
  A('vanguard', '변환: 선봉장', 'gen', '일반말을 선봉장으로 바꿉니다. 선봉장이 윷판에 있는 동안, 내 모든 이동이 1칸 증가합니다.'),
  A('poop', '히히 똥!', 'gen', '무작위 칸에 똥을 쌉니다. 다른 플레이어의 말이 이동하다가 똥을 밟으면 멈춥니다. (한 번 밟히면 사라짐)'),
  A('samok', '사목', 'gen', '내 말이 일직선으로 연속된 네 칸을 차지하거나 네 말이 한 말뭉치가 되면 승리합니다.'),
  A('cow', '소 뒷걸음질', 'gen', '자신이 백도로 2번 말을 잡으면 승리합니다.'),
  A('score', '악보가 완성되었다!', 'gen', '이번 게임 동안 자신이 백도, 도, 개, 걸, 윷, 모를 내면 승리합니다.'),
  // ---- 시작 전용 ----
  A('equal', '등가교환', 'start', '자신의 말 1개와 윷 1개를 제거하고 시작합니다.'),
  A('sgame', '스겜', 'start', '모든 플레이어의 말이 2개가 되며, 자신의 말은 도와 개에서 시작합니다.'),
  A('piggyback', '이리 오너라 업고 놀자', 'start', '자신의 모든 말을 업은 채 도 위치에서 시작합니다.'),
  A('burden', '짐덩이와 복덩이', 'start', '자신의 말 1개와 윷 1개를 추가하고 시작합니다.'),
  A('alone', '천상천하 유아독존', 'start', '윷판에 말뭉치가 1개만 있으면 승리합니다. (대기 중인 말 없이, 남은 말이 전부 하나의 말뭉치일 때)', '대기 말이 있어도 되면 말 1개만 올려도 바로 승리라 이렇게 해석했습니다.'),
  A('garlic', '웅녀', 'start', '무작위 칸의 마늘 3개를 모두 모으면 승리합니다. (지나가기만 해도 획득)'),
  // ---- 중간 전용 ----
  A('sevens', '777', 'mid', '한 차례 안에 같은 윷 결과가 3번 이상 나오면 승리합니다.'),
  A('nofriend', '나만 친구 없어', 'mid', '이 증강을 선택한 후 다른 모든 플레이어가 자신의 말을 잡으면 승리합니다.'),
  A('summon', '마신 소환', 'mid', '내 모든 일반말을 광신도로 바꿉니다. 광신도는 차례 시작할 때 의식 코인 1개를 줍니다. 의식 코인 12개를 모으면 승리합니다.'),
  A('coup', '무신정변', 'mid', '적 말을 4개 이상 죽이면 승리합니다.'),
  A('treason', '역모', 'mid', '나보다 말을 많이 통과시킨 플레이어의 말을 죽일 때, 투척 기회를 1번 더 얻습니다.'),
  A('wait', '잠깐!', 'mid', '다른 플레이어의 가장 앞선 말 뭉치 1개를 2라운드 동안 못 움직이게 합니다.'),
  A('peace', '평화 협정', 'mid', '다른 플레이어를 죽일 수 없고, 다른 플레이어에게 죽임 당하지 않습니다. 증강으로 인한 죽음도 포함합니다.'),
  // ---- 마무리 전용 ----
  A('chalice', '독이 든 성배', 'end', '원할 때마다 투척 기회 3회를 얻습니다. 사용한 뒤 이번 차례에 모가 나오면 탈락합니다.'),
  A('lastdance', '라스트 댄스', 'end', '1회, 이번 턴 동안 내 모든 이동 거리가 2배가 됩니다. 이번 턴이 끝날 때 탈락합니다.'),
  A('marathon', '변환: 마라토너', 'end', '1회, 대기 중인 일반말을 마라토너로 바꿉니다. 그 말이 완주하면 승리합니다.'),
  A('comeback', '역전 찬스', 'end', '무작위 증강을 3개 얻습니다. (범용 중에서)'),
];
const BY_ID = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));

// ---------- 유틸 ----------
const E = (m) => new Error(m);
const rnd = (n) => Math.floor(Math.random() * n);
const sample = (arr) => arr[rnd(arr.length)];
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const has = (p, id) => p.augs.includes(id);
const log = (g, m) => { g.log.push(m); if (g.log.length > 100) g.log.shift(); };
const isFrozen = (g, x) => x.frozen > g.round;

function newStats() {
  return {
    dogs: 0, gul: 0, kills: 0, seen: [], coins: 0, ritual: 0, ejiri: 0, backdoCaps: 0, friendHits: [],
    garlic: [], garlicGot: [], bank: [], snipers: [], nextChoose: false, lastDance: false, poison: false, deliver: [],
  };
}
function newPlayer(idx, name, token) {
  return {
    idx, name, token, color: COLORS[idx], colorName: COLOR_NAMES[idx], connected: true, alive: true,
    augs: [], used: {}, npieces: 4, sticks: 4, pieces: [], finished: 0, nextPid: 0, st: newStats(),
  };
}
function mkPiece(p) { return { id: `${p.idx}_${p.nextPid++}`, pos: 0, route: 'main', done: false, type: 'normal', shield: false, frozen: 0 }; }
function makePieces(p) { p.pieces = []; for (let k = 0; k < p.npieces; k++) p.pieces.push(mkPiece(p)); }
function removeOnePiece(p) {
  let i = -1;
  p.pieces.forEach((x, k) => { if (x.pos === 0 && !x.done) i = k; });
  if (i < 0) i = p.pieces.length - 1;
  if (i >= 0) p.pieces.splice(i, 1);
}
const stacksOf = (p) => { const m = {}; for (const x of p.pieces) if (!x.done && x.pos > 0) (m[x.pos] = m[x.pos] || []).push(x); return m; };
const sendHome = (x) => { x.pos = 0; x.route = 'main'; x.shield = false; x.frozen = 0; };

// ---------- 방/게임 ----------
function createGame(code) {
  return { code, players: [], chaos: false, phase: 'lobby', round: 0, cur: 0, tn: null, pick: null, log: [], winner: null, reason: '', poops: [], ganTaek: false };
}
function addPlayer(g, name, token) {
  if (g.phase !== 'lobby') throw E('이미 게임이 시작되었습니다');
  if (g.players.length >= 4) throw E('방이 가득 찼습니다 (최대 4명)');
  const p = newPlayer(g.players.length, String(name || '플레이어').slice(0, 10), token);
  g.players.push(p);
  return p;
}
function removePlayer(g, p) {
  g.players.splice(g.players.indexOf(p), 1);
  g.players.forEach((q, i) => { q.idx = i; q.color = COLORS[i]; q.colorName = COLOR_NAMES[i]; });
}
function resetGame(g) {
  g.phase = 'lobby'; g.round = 0; g.cur = 0; g.tn = null; g.pick = null; g.winner = null; g.reason = '';
  g.poops = []; g.ganTaek = false; g.log = [];
  g.players = g.players.map((p) => { const q = newPlayer(p.idx, p.name, p.token); q.connected = p.connected; return q; });
}
function startGame(g) {
  if (g.players.length < 2) throw E('2명 이상이 필요합니다');
  g.players.forEach(makePieces);
  g.round = 1; g.poops = []; g.winner = null;
  log(g, '게임 시작!');
  startPick(g);
}

// ---------- 증강 선택 ----------
function startPick(g) {
  const kind = ROUND_PICKS[g.round];
  g.phase = 'pick';
  const order = g.players.filter((p) => p.alive).map((p) => p.idx);
  const left = {}; order.forEach((i) => { left[i] = g.chaos ? 2 : 1; });
  g.pick = { kind, order, pos: 0, left, banned: [], options: [], sub: null };
  log(g, `━ ${g.round}라운드: 증강 선택 (${{ start: '시작', mid: '중간', end: '마무리' }[kind]} 전용 포함) ━`);
  rollOptions(g);
}
const picker = (g) => g.players[g.pick.order[g.pick.pos]];
function rollOptions(g, exclude) {
  const pk = g.pick; const p = picker(g);
  const ok = (a) => (a.cat === 'gen' || a.cat === pk.kind) && !has(p, a.id) && !pk.banned.includes(a.id);
  const pool = AUGMENTS.filter((a) => ok(a) && !(exclude || []).includes(a.id));
  const forced = p.st.deliver.filter((id) => BY_ID[id] && ok(BY_ID[id])).slice(0, 3);
  let ids = [...forced];
  for (const a of shuffle(pool.filter((x) => !forced.includes(x.id)))) { if (ids.length >= 3) break; ids.push(a.id); }
  ids = shuffle(ids);
  pk.options = ids.map((id) => ({ id, locked: false }));
  if (g.ganTaek && ids.includes('cat')) pk.options.forEach((o) => { o.locked = o.id !== 'cat'; });
  pk.sub = null;
}
function actPick(g, p, id) {
  const pk = g.pick;
  if (g.phase !== 'pick' || !pk) throw E('지금은 증강을 고를 수 없습니다');
  if (picker(g) !== p) throw E('내 선택 차례가 아닙니다');
  if (pk.sub) throw E('먼저 대상을 선택하세요');
  const o = pk.options.find((x) => x.id === id);
  if (!o) throw E('선택할 수 없는 증강입니다');
  if (o.locked) throw E('간택! 고양이를 골라야 합니다');
  if (id === 'objection') { log(g, `${p.name}: 이의있음! 다시 고릅니다`); rollOptions(g, ['objection']); return; }
  p.augs.push(id); p.st.deliver = [];
  pk.left[p.idx]--;
  log(g, `${p.name} 선택 → ${BY_ID[id].name}`);
  const sub = acquire(g, p, id);
  if (g.phase === 'ended') return;
  if (sub) { pk.sub = sub; return; }
  afterPick(g);
}
function actSub(g, p, value) {
  const pk = g.pick;
  if (g.phase !== 'pick' || !pk || !pk.sub || picker(g) !== p) throw E('선택할 항목이 없습니다');
  const sub = pk.sub;
  if (sub.type === 'player') {
    const t = g.players[value];
    if (!t || !t.alive || t === p) throw E('대상을 다시 고르세요');
    if (sub.aug === 'wait') {
      const st = stacksOf(t); let best = null, bestRem = 1e9;
      for (const n of Object.keys(st)) {
        const rem = Math.min(...st[n].map((x) => ROUTES[x.route].length - ROUTES[x.route].indexOf(x.pos)));
        if (rem < bestRem) { bestRem = rem; best = st[n]; }
      }
      if (best) { best.forEach((x) => { x.frozen = g.round + 2; }); log(g, `${p.name}: 잠깐! ${t.name}의 가장 앞선 말뭉치가 2라운드 동안 멈춥니다`); }
      else log(g, `${p.name}: 잠깐! ${t.name}은(는) 윷판에 말이 없어 효과가 없었습니다`);
    }
  } else {
    if (!BY_ID[value]) throw E('존재하지 않는 증강입니다');
    if (sub.aug === 'detective') { pk.banned.push(value); log(g, `${p.name}: 명탐정! '${BY_ID[value].name}' 무효화`); }
    if (sub.aug === 'delivery') { p.st.deliver = [value]; log(g, `${p.name}: 배달! 다음 선택창에 '${BY_ID[value].name}' 등장 예약`); }
  }
  pk.sub = null;
  afterPick(g);
}
function afterPick(g) {
  checkWins(g);
  if (g.phase === 'ended') return;
  const pk = g.pick; const p = picker(g);
  if (pk.left[p.idx] > 0 && p.alive) { rollOptions(g); return; }
  pk.pos++;
  while (pk.pos < pk.order.length && !g.players[pk.order[pk.pos]].alive) pk.pos++;
  if (pk.pos >= pk.order.length) finishPick(g); else rollOptions(g);
}
function finishPick(g) {
  g.pick = null;
  const first = g.players.find((p) => p.alive);
  startTurn(g, first.idx);
}

// 증강 획득 즉시 효과. 대상 선택이 필요하면 sub 반환
function acquire(g, p, id) {
  switch (id) {
    case 'gantaek': g.ganTaek = true; break;
    case 'doberman': p.st.coins = p.st.dogs; break;
    case 'equal': removeOnePiece(p); p.npieces = p.pieces.length; p.sticks = Math.max(2, p.sticks - 1); break;
    case 'burden': p.pieces.push(mkPiece(p)); p.npieces = p.pieces.length; p.sticks += 1; break;
    case 'sgame':
      for (const q of g.players) { while (q.pieces.length > 2) removeOnePiece(q); q.npieces = q.pieces.length; }
      if (p.pieces[0]) p.pieces[0].pos = 1;
      if (p.pieces[1]) p.pieces[1].pos = 2;
      break;
    case 'piggyback': p.pieces.filter((x) => !x.done).forEach((x) => { x.pos = 1; x.route = 'main'; }); break;
    case 'garlic': p.st.garlic = shuffle(Array.from({ length: 28 }, (_, i) => i + 1)).slice(0, 3); p.st.garlicGot = []; break;
    case 'nofriend': p.st.friendHits = []; break;
    case 'poop': { const node = 1 + rnd(28); g.poops.push({ node, owner: p.idx }); log(g, `💩 ${p.name}이(가) 어딘가에 똥을 쌌습니다`); break; }
    case 'vanguard': case 'marathon': {
      const t = id === 'vanguard' ? 'vanguard' : 'marathon';
      const c = p.pieces.find((x) => !x.done && x.pos === 0 && x.type === 'normal') || p.pieces.find((x) => !x.done && x.type === 'normal');
      if (c) c.type = t;
      break;
    }
    case 'summon': p.pieces.filter((x) => !x.done && x.type === 'normal').forEach((x) => { x.type = 'zealot'; }); break;
    case 'redbutton':
      for (const q of g.players) { if (!q.alive) continue; const st = stacksOf(q); for (const n of DIAG_NODES) if (st[n]) augKill(g, q, st[n], p); }
      log(g, `${p.name}: 크고 빨간 버튼!`);
      break;
    case 'notme': {
      const others = g.players.filter((q) => q.alive && q !== p);
      if (others.length) {
        const v = sample(others); const st = stacksOf(v);
        for (const n of Object.keys(st)) augKill(g, v, st[n], p);
        log(g, `${p.name}: 나만 아니면 돼~ → ${v.name}!`);
      }
      break;
    }
    case 'comeback': {
      const ex = ['comeback', 'objection', 'detective', 'delivery'];
      const pool = shuffle(AUGMENTS.filter((a) => a.cat === 'gen' && !ex.includes(a.id) && !has(p, a.id))).slice(0, 3);
      for (const a of pool) { p.augs.push(a.id); log(g, `${p.name} 획득 → ${a.name}`); acquire(g, p, a.id); }
      break;
    }
    case 'detective': case 'delivery': return { type: 'augment', aug: id };
    case 'wait': return { type: 'player', aug: id };
    default: break;
  }
  return null;
}

// ---------- 죽음 / 잡기 ----------
function onDeaths(g, owner, n) {
  for (const q of g.players) {
    if (!q.alive || !has(q, 'ejiri') || q === owner || g.cur === q.idx) continue;
    q.st.ejiri += n;
    while (q.st.ejiri >= 2) { q.st.ejiri -= 2; q.st.bank.push('개'); log(g, `${q.name}: 어부지리로 개 획득`); }
  }
}
// stack: 같은 칸 owner의 말들. 죽인 말 수 반환
function killStack(g, owner, stack, killer) {
  if (stack.some((x) => x.shield)) {
    stack.forEach((x) => { x.shield = false; });
    log(g, `🛡 ${owner.name}의 말뭉치가 보호막으로 죽음을 막았습니다`);
    return 0;
  }
  const victims = has(owner, 'friendshield') ? [stack[stack.length - 1]] : stack;
  victims.forEach(sendHome);
  onDeaths(g, owner, victims.length);
  log(g, `☠ ${owner.name}의 말 ${victims.length}개 사망${killer && killer !== owner ? ` (by ${killer.name})` : ''}`);
  if (killer && killer !== owner) {
    killer.st.kills += victims.length;
    if (has(owner, 'nofriend') && !owner.st.friendHits.includes(killer.idx)) owner.st.friendHits.push(killer.idx);
  }
  return victims.length;
}
function augKill(g, owner, stack, src) {
  if (src && src !== owner && (has(src, 'peace') || has(owner, 'peace'))) return 0;
  return killStack(g, owner, stack, src);
}

// ---------- 이동 ----------
function stepFrom(piece, steps) {
  let route = piece.route; const pos = piece.pos;
  if (steps < 0) {
    if (pos === 0) return null;
    const r = ROUTES[route]; const i = r.indexOf(pos);
    if (i <= 0) {
      if (route === 'main') return { home: true, nodes: [], route: 'main' };
      const np = r[0] - 1; return { nodes: [np], route: 'main' };
    }
    return { nodes: [r[i - 1]], route };
  }
  let idx;
  if (pos === 0) { route = 'main'; idx = -1; }
  else if (pos === 22) { route = 'B'; idx = ROUTES.B.indexOf(22); }
  else if (pos === 5 && route === 'main') { route = 'A'; idx = 0; }
  else if (pos === 10 && route === 'main') { route = 'B'; idx = 0; }
  else idx = ROUTES[route].indexOf(pos);
  const r = ROUTES[route]; const nodes = [];
  for (let k = 1; k <= steps; k++) {
    const i = idx + k;
    if (i >= r.length) return { finished: true, nodes, route };
    nodes.push(r[i]);
  }
  return { finished: false, nodes, route };
}
const groupOf = (p, x) => (x.pos === 0 ? [x] : p.pieces.filter((y) => !y.done && y.pos === x.pos));
const usable = (g, p, res) => p.pieces.some((x) => !x.done && (res !== '백도' || x.pos > 0) && !groupOf(p, x).some((y) => isFrozen(g, y)));

function actMove(g, p, ri, pid) {
  assertTurn(g, p);
  const tn = g.tn;
  if (tn.throws > 0) throw E('먼저 윷을 던지세요');
  const res = tn.queue[ri];
  if (!res) throw E('사용할 윷 결과를 선택하세요');
  const piece = p.pieces.find((x) => x.id === pid);
  if (!piece || piece.done) throw E('움직일 수 없는 말입니다');
  if (res === '백도' && piece.pos === 0) throw E('대기 중인 말은 백도로 움직일 수 없습니다');
  const group = piece.pos === 0 ? [piece] : p.pieces.filter((x) => !x.done && x.pos === piece.pos);
  if (group.some((x) => isFrozen(g, x))) throw E('멈춰 있는 말입니다');
  let steps = STEPS[res];
  if (steps > 0) {
    if (p.st.lastDance) steps *= 2;
    if (p.pieces.some((x) => x.type === 'vanguard' && !x.done && x.pos > 0)) steps += 1;
  }
  const mv = stepFrom(group[0], steps);
  if (!mv) throw E('움직일 수 없습니다');
  tn.queue.splice(ri, 1);

  let nodes = mv.nodes; let stopped = false;
  if (!mv.home) {
    for (let i = 0; i < nodes.length; i++) {
      const pi = g.poops.findIndex((q) => q.node === nodes[i] && q.owner !== p.idx);
      if (pi >= 0) { g.poops.splice(pi, 1); nodes = nodes.slice(0, i + 1); stopped = true; log(g, `💩 ${p.name}의 말이 똥을 밟고 멈췄습니다!`); break; }
    }
  }
  for (const nd of nodes) if (p.st.garlic.includes(nd) && !p.st.garlicGot.includes(nd)) { p.st.garlicGot.push(nd); log(g, `🧄 ${p.name} 마늘 획득 (${p.st.garlicGot.length}/3)`); }

  if (mv.home) {
    group.forEach(sendHome);
    log(g, `${p.name}: ${res} → 대기칸으로 되돌아감`);
  } else if (mv.finished && !stopped) {
    group.forEach((x) => { x.done = true; x.pos = -1; x.shield = false; });
    p.finished += group.length;
    log(g, `${p.name}: ${res} → 말 ${group.length}개 완주! (${p.finished}/${p.pieces.length})`);
  } else {
    const np = nodes[nodes.length - 1];
    group.forEach((x) => { x.pos = np; x.route = mv.route; });
    log(g, `${p.name}: ${res} → ${np}번 칸`);
    let killed = 0, bonus = 0;
    for (const o of g.players) {
      if (o === p || !o.alive) continue;
      const stack = o.pieces.filter((x) => !x.done && x.pos === np);
      if (!stack.length) continue;
      if (has(p, 'peace') || has(o, 'peace')) continue;
      const k = killStack(g, o, stack, p);
      if (k > 0) { killed += k; if (has(p, 'treason') && o.finished > p.finished) bonus++; }
    }
    if (killed > 0) {
      tn.throws += 1 + bonus;
      log(g, `${p.name}: 잡았다! 추가 던지기 ${1 + bonus}회`);
      if (res === '백도') p.st.backdoCaps++;
    }
  }
  afterAction(g);
}

// ---------- 던지기 ----------
function roll(p) {
  if (has(p, 'modo')) return Math.random() < 0.5 ? '모' : '도';
  if (has(p, 'excess')) {
    let f = 0; for (let i = 0; i < 6; i++) if (Math.random() < 0.5) f++;
    return { 0: '모', 1: '도', 2: '개', 3: '걸', 4: '걸', 5: '윷', 6: '탈락' }[f];
  }
  const n = p.sticks; let f = 0, marked = false;
  for (let i = 0; i < n; i++) if (Math.random() < 0.5) { f++; if (i === 0) marked = true; }
  if (f === 0) return '모';
  if (f === n) return '윷';
  if (f === 1) return marked ? '백도' : '도';
  if (f === n - 1) return '걸';
  return '개';
}
function actThrow(g, p, o) {
  o = o || {};
  assertTurn(g, p);
  const tn = g.tn;
  if (tn.throws <= 0) throw E('던질 기회가 없습니다');
  let forced = null;
  if (p.st.nextChoose) {
    if (!RES.includes(o.choose)) throw E('원하는 결과를 고르세요');
    forced = o.choose; p.st.nextChoose = false;
  } else if (o.coin && has(p, 'doberman') && p.st.coins >= 2) {
    p.st.coins -= 2; forced = '모';
  } else if (has(p, 'dogpig')) {
    if (!['도', '개'].includes(o.choose)) throw E('도 또는 개를 고르세요');
    forced = o.choose;
  }
  tn.throws--;
  const count = has(p, 'twin') ? 2 : 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    let r = forced || roll(p);
    if (has(p, 'twin') && r === '모') r = '도';
    out.push(r);
  }
  for (const r of out) {
    if (!p.alive) break;
    if (r === '탈락') { log(g, `${p.name}: 윷이 전부 앞면! 탈락`); eliminate(g, p); break; }
    tn.queue.push(r);
    tn.counts[r] = (tn.counts[r] || 0) + 1;
    if (!p.st.seen.includes(r)) p.st.seen.push(r);
    if (r === '개') { p.st.dogs++; if (has(p, 'doberman')) p.st.coins++; }
    if (r === '걸') { p.st.gul++; if (has(p, 'jajin') && p.st.gul % 2 === 0) { tn.queue.push('개'); log(g, `${p.name}: 자진모리 장단! 개 획득`); } }
    if (r === '윷' || r === '모') tn.throws++;
    log(g, `${p.name}: ${r}${r === '윷' || r === '모' ? ' (한 번 더!)' : ''}`);
    if (p.st.poison && r === '모') { log(g, `${p.name}: 독이 든 성배... 모가 나와 탈락!`); eliminate(g, p); break; }
  }
  afterAction(g);
}

// ---------- 능력 ----------
function badukTargets(g, p) {
  const seen = new Set();
  for (const line of LINES) {
    const mine = [];
    line.forEach((n, i) => { if (n > 0 && p.pieces.some((x) => !x.done && x.pos === n)) mine.push(i); });
    if (mine.length < 2) continue;
    for (let i = Math.min(...mine) + 1; i < Math.max(...mine); i++) {
      const n = line[i]; if (n === 0) continue;
      for (const o of g.players) { if (o === p || !o.alive) continue; if (o.pieces.some((x) => !x.done && x.pos === n)) seen.add(o.idx + ':' + n); }
    }
  }
  return [...seen].map((s) => { const [o, n] = s.split(':').map(Number); return { o, n }; });
}
function actAbility(g, p, a, o) {
  o = o || {};
  assertTurn(g, p);
  const tn = g.tn;
  const need = (id) => { if (!has(p, id)) throw E('가지고 있지 않은 증강입니다'); };
  const once = (id) => { need(id); if (p.used[id]) throw E('이미 사용했습니다'); };
  const myBoardPiece = () => { const x = p.pieces.find((y) => y.id === o.pid); if (!x || x.done || x.pos <= 0) throw E('윷판 위의 내 말을 선택하세요'); return x; };
  switch (a) {
    case 'timetravel': {
      once('timetravel'); const x = myBoardPiece();
      const r = ROUTES[x.route]; const i = r.indexOf(x.pos);
      const allowed = [0, ...r.slice(0, i)];
      if (!allowed.includes(o.target)) throw E('그 칸으로는 되돌아갈 수 없습니다');
      if (o.target === 0) sendHome(x); else x.pos = o.target;
      p.used.timetravel = true; log(g, `${p.name}: 시간 여행! 말이 ${o.target === 0 ? '대기칸' : o.target + '번 칸'}으로`);
      break;
    }
    case 'shield': {
      once('shield'); const x = myBoardPiece();
      p.pieces.filter((y) => !y.done && y.pos === x.pos).forEach((y) => { y.shield = true; });
      p.used.shield = true; log(g, `${p.name}: 천상의 보호막!`);
      break;
    }
    case 'sacrifice': {
      once('sacrifice'); const x = myBoardPiece();
      sendHome(x); onDeaths(g, p, 1);
      p.pieces.filter((y) => !y.done && y.pos > 0).forEach((y) => { y.shield = true; });
      p.used.sacrifice = true; log(g, `${p.name}: 희생! 말 1개를 바치고 나머지에 보호막`);
      break;
    }
    case 'baduk': {
      once('baduk');
      const targets = badukTargets(g, p);
      if (!targets.length) throw E('내 말뭉치 사이에 잡을 적이 없습니다');
      let k = 0;
      for (const t of targets) { const q = g.players[t.o]; const st = q.pieces.filter((x) => !x.done && x.pos === t.n); if (st.length) k += augKill(g, q, st, p); }
      p.used.baduk = true;
      tn.throws += k; log(g, `${p.name}: 바둑! ${k}개 포위 → 던지기 ${k}회 획득`);
      break;
    }
    case 'handfast': once('handfast'); p.used.handfast = true; p.st.nextChoose = true; log(g, `${p.name}: 손은 눈보다 빠르다 (다음 윷을 원하는 대로)`); break;
    case 'chalice': need('chalice'); tn.throws += 3; p.st.poison = true; log(g, `${p.name}: 독이 든 성배! 던지기 +3 (모가 나오면 탈락)`); break;
    case 'lastdance': once('lastdance'); p.used.lastdance = true; p.st.lastDance = true; log(g, `${p.name}: 라스트 댄스! 이번 턴 이동 2배, 턴이 끝나면 탈락`); break;
    case 'sniper': {
      need('sniper'); if (tn.throws <= 0) throw E('던지기 기회가 있을 때만 사용할 수 있습니다');
      if (!(o.node >= 1 && o.node <= 28)) throw E('칸을 선택하세요');
      tn.throws--; p.st.snipers.push(o.node); log(g, `${p.name}: 🎯 명사수가 어딘가를 조준했습니다`);
      break;
    }
    default: throw E('알 수 없는 능력입니다');
  }
  afterAction(g);
}

// ---------- 턴 진행 ----------
function assertTurn(g, p) {
  if (g.phase !== 'turn') throw E('지금은 할 수 없습니다');
  if (g.cur !== p.idx) throw E('내 차례가 아닙니다');
  if (!p.alive) throw E('탈락했습니다');
}
function startTurn(g, idx) {
  g.phase = 'turn'; g.cur = idx;
  const p = g.players[idx];
  g.tn = { queue: [...p.st.bank], throws: 1, counts: {} };
  if (p.st.bank.length) log(g, `${p.name}: 보관한 개 ${p.st.bank.length}개 사용 가능`);
  p.st.bank = [];
  for (const node of p.st.snipers) {
    log(g, `🎯 ${p.name}의 저격! ${node}번 칸`);
    for (const o of g.players) { if (!o.alive) continue; const st = o.pieces.filter((x) => !x.done && x.pos === node); if (st.length) augKill(g, o, st, p); }
  }
  p.st.snipers = [];
  const z = p.pieces.filter((x) => x.type === 'zealot' && !x.done).length;
  if (has(p, 'summon') && z) { p.st.ritual += z; log(g, `${p.name}: 의식 코인 +${z} (${p.st.ritual}/12)`); }
  log(g, `▶ ${g.round}라운드 - ${p.name}의 차례`);
  checkWins(g);
  if (g.phase === 'turn') normalizeTurn(g);
}
function normalizeTurn(g) {
  if (g.phase !== 'turn') return;
  const p = g.players[g.cur];
  if (!p.alive) { endTurn(g); return; }
  if (g.tn.throws > 0) return;
  g.tn.queue = g.tn.queue.filter((r) => usable(g, p, r));
  if (!g.tn.queue.length) endTurn(g);
}
function afterAction(g) { checkWins(g); if (g.phase === 'turn') normalizeTurn(g); }
function endTurn(g) {
  const p = g.players[g.cur];
  if (p.alive && p.st.lastDance) { log(g, `${p.name}: 라스트 댄스가 끝났습니다. 탈락`); eliminate(g, p); }
  p.st.poison = false; p.st.lastDance = false;
  checkWins(g);
  if (g.phase === 'ended') return;
  const n = g.players.length; let nxt = -1, wrap = false;
  for (let k = 1; k <= n; k++) { const j = (g.cur + k) % n; if (g.players[j].alive) { nxt = j; wrap = j <= g.cur; break; } }
  if (nxt < 0) return;
  if (wrap) { g.round++; if (ROUND_PICKS[g.round]) { startPick(g); return; } }
  startTurn(g, nxt);
}
function eliminate(g, p) {
  if (!p.alive) return;
  p.alive = false; p.pieces = [];
  log(g, `❌ ${p.name} 탈락`);
}

// ---------- 승리 ----------
function samokOK(p) {
  const st = stacksOf(p);
  if (Object.values(st).some((a) => a.length >= 4)) return true;
  const occ = (n) => n > 0 && !!st[n];
  for (const line of LINES) for (let i = 0; i + 4 <= line.length; i++) if (line.slice(i, i + 4).every(occ)) return true;
  return false;
}
function winReason(g, p) {
  if (p.pieces.length && p.pieces.every((x) => x.done)) return '모든 말 완주';
  if (has(p, 'marathon') && p.pieces.some((x) => x.type === 'marathon' && x.done)) return '마라토너 완주';
  if (has(p, 'catlover') && g.players.some((q) => has(q, 'cat'))) return '애묘인 - 고양이를 고른 플레이어가 있다';
  if (has(p, 'samok') && samokOK(p)) return '사목 달성';
  if (has(p, 'alone')) {
    const keys = Object.keys(stacksOf(p));
    if (keys.length === 1 && p.pieces.every((x) => x.done || x.pos > 0)) return '천상천하 유아독존';
  }
  if (has(p, 'garlic') && p.st.garlicGot.length >= 3) return '웅녀 - 마늘 3개 수집';
  if (has(p, 'score') && p.st.seen.length >= 6) return '악보 완성';
  if (has(p, 'sevens') && g.tn && g.cur === p.idx && Object.values(g.tn.counts).some((c) => c >= 3)) return '777';
  if (has(p, 'coup') && p.st.kills >= 4) return '무신정변 - 적 말 4개 처치';
  if (has(p, 'cow') && p.st.backdoCaps >= 2) return '소 뒷걸음질';
  if (has(p, 'nofriend')) {
    const others = g.players.filter((q) => q !== p && q.alive);
    if (others.length && others.every((q) => p.st.friendHits.includes(q.idx))) return '나만 친구 없어';
  }
  if (has(p, 'summon') && p.st.ritual >= 12) return '의식 코인 12개';
  return null;
}
function checkWins(g) {
  if (g.phase === 'ended' || g.phase === 'lobby') return;
  const start = g.phase === 'turn' ? g.cur : 0;
  const n = g.players.length;
  for (let k = 0; k < n; k++) {
    const p = g.players[(start + k) % n];
    if (!p.alive) continue;
    const r = winReason(g, p);
    if (r) { endGame(g, p, r); return; }
  }
  const alive = g.players.filter((p) => p.alive);
  if (alive.length === 1) endGame(g, alive[0], '최후의 생존자');
}
function endGame(g, p, reason) {
  g.phase = 'ended'; g.winner = p.idx; g.reason = reason; g.pick = null;
  log(g, `🏆 ${p.name} 승리! (${reason})`);
}

// ---------- 클라이언트용 뷰 ----------
function pubSt(q, mine) {
  const s = q.st;
  return {
    dogs: s.dogs, coins: s.coins, ritual: s.ritual, kills: s.kills, gul: s.gul, seen: s.seen, backdoCaps: s.backdoCaps,
    nextChoose: s.nextChoose, lastDance: s.lastDance, poison: s.poison, garlicGot: s.garlicGot,
    garlic: mine ? s.garlic : s.garlic.length, snipers: mine ? s.snipers : s.snipers.length,
    friendHits: s.friendHits, bank: s.bank.length, ejiri: s.ejiri,
  };
}
function viewFor(g, me) {
  const pk = g.pick;
  return {
    code: g.code, phase: g.phase, chaos: g.chaos, round: g.round, cur: g.cur, winner: g.winner, reason: g.reason,
    me: me.idx, ganTaek: g.ganTaek, poops: g.poops.map((q) => q.node),
    players: g.players.map((q) => ({
      idx: q.idx, name: q.name, color: q.color, colorName: q.colorName, connected: q.connected, alive: q.alive,
      augs: q.augs, used: q.used, npieces: q.pieces.length || q.npieces, sticks: q.sticks, finished: q.finished,
      pieces: q.pieces.map((x) => ({ id: x.id, pos: x.pos, route: x.route, done: x.done, type: x.type, shield: x.shield, frozen: x.frozen > g.round })),
      st: pubSt(q, q === me),
    })),
    tn: g.tn && g.phase === 'turn' ? { queue: g.tn.queue, throws: g.tn.throws } : null,
    pick: pk ? { kind: pk.kind, picker: pk.order[pk.pos], left: pk.left, sub: pk.sub, banned: pk.banned, options: g.players[pk.order[pk.pos]] === me ? pk.options : null } : null,
    log: g.log.slice(-40),
  };
}

module.exports = {
  AUGMENTS, BY_ID, ROUTES, LINES, STEPS, RES, ROUND_PICKS,
  createGame, addPlayer, removePlayer, resetGame, startGame,
  actPick, actSub, actThrow, actMove, actAbility, viewFor,
  _internal: { has, usable, stacksOf, picker },
};
