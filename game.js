'use strict';
// 증강 윷놀이 - 서버 권위(authoritative) 게임 로직

const COLORS = ['#e5484d', '#3e8ef7', '#30a46c', '#f5c518', '#a855f7', '#f97316'];
const COLOR_NAMES = ['빨강', '파랑', '초록', '노랑', '보라', '주황'];

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
const MAX_PLAYERS = 6;
const ROUND_PICKS = { 1: 'start', 5: 'mid', 10: 'end' };

// ---------- 판 기하 (접기/돌리기/안개) ----------
const C4 = [[90, 90], [90, 10], [10, 10], [10, 90]], MID = [50, 50];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function XY(n) {
  if (n < 20) { const s = Math.floor(n / 5), k = n % 5; return lerp(C4[s], C4[(s + 1) % 4], k / 5); }
  if (n === 22) return MID;
  if (n === 20 || n === 21) return lerp(C4[1], MID, (n - 19) / 3);
  if (n === 23 || n === 24) return lerp(MID, C4[3], (n - 22) / 3);
  if (n === 25 || n === 26) return lerp(C4[2], MID, (n - 24) / 3);
  return lerp(MID, C4[0], (n - 26) / 3);
}
const pairs = (arr) => { const m = {}; arr.forEach(([a, b]) => { m[a] = b; m[b] = a; }); return m; };
const MIRH = pairs([[0, 15], [5, 10], [1, 14], [2, 13], [3, 12], [4, 11], [6, 9], [7, 8], [16, 19], [17, 18], [20, 25], [21, 26], [23, 27], [24, 28], [22, 22]]);
const MIRV = pairs([[0, 5], [15, 10], [1, 4], [2, 3], [14, 11], [13, 12], [6, 19], [7, 18], [8, 17], [9, 16], [20, 28], [21, 27], [23, 26], [24, 25], [22, 22]]);
const ROT1 = { 22: 22, 20: 25, 25: 23, 23: 27, 27: 20, 21: 26, 26: 24, 24: 28, 28: 21 };
for (let n = 0; n < 20; n++) ROT1[n] = (n + 5) % 20;
// 천마군림보: 출발점(0)-왼쪽 위(10)를 잇는 대각선 기준으로 판을 뒤집은 방향으로 진행
const MIRD = { 0: 0, 20: 24, 24: 20, 21: 23, 23: 21, 22: 22, 25: 25, 26: 26, 27: 27, 28: 28 };
for (let n = 1; n < 20; n++) MIRD[n] = 20 - n;
const mirNode = (n) => (MIRD[n] != null ? MIRD[n] : n);
const NEI = {};
for (const line of LINES) for (let i = 0; i + 1 < line.length; i++) {
  const a = line[i], b = line[i + 1];
  (NEI[a] = NEI[a] || new Set()).add(b); (NEI[b] = NEI[b] || new Set()).add(a);
}

const A = (id, name, cat, desc, flags) => Object.assign({ id, name, cat, desc }, flags || {});
const AUGMENTS = [
  // ---- 범용 ----
  A('cat', '고양이', 'gen', '아무 능력이 없습니다. 왜 있냐고요? 귀엽잖아요.'),
  A('gantaek', '간택', 'gen', '이제 모든 플레이어는 증강 선택창에 고양이가 나오면 무조건 고양이를 골라야 합니다.'),
  A('catlover', '애묘인', 'gen', '언제든 고양이를 선택한 플레이어가 있으면 승리합니다.'),
  A('dogpig', '개돼지', 'gen', '매 턴 도와 개만 낼 수 있지만 선택할 수 있습니다.'),
  A('modo', '모 아니면 도', 'gen', '모 아니면 도만 나옵니다. (모 40% : 도 60%)'),
  A('twin', '이도류', 'gen', '윷을 2개씩 모두 던지며, 모 결과는 도로 바뀝니다.'),
  A('excess', '과유불급', 'gen', '윷 6개를 사용합니다. 앞면 0개는 모, 5개는 윷, 앞면 6개는 탈락입니다. (1=도, 2=개, 3·4=걸)'),
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
  A('truck', '8톤 트럭', 'gen', '1회, 차례 소모(던지기 전에만). 말이 2개 이상인 자신의 말뭉치를 선택합니다. 그 말뭉치가 막히기 전까지, 최대 벽(그 직선의 끝)까지 직선으로 달립니다.'),
  A('combo', '3단 합체 필살기!!!', 'gen', '1회, 차례 소모(던지기 전에만). 말이 3개 이상인 자신의 말뭉치를 선택합니다. 그 말뭉치 이외의 모든 말뭉치를 죽입니다.'),
  A('fold', '게임 접어라', 'gen', '즉시 윷판을 반으로 접습니다. 접는 방향을 선택할 수 있습니다. (접힌 쪽 말이 반대편 칸으로 옮겨가며 거기 있던 적을 잡습니다)', { inter: true }),
  A('leech', '거머리', 'gen', '즉시 다른 플레이어에게 말을 1개 줍니다. 그 플레이어가 이기거나 지면 같이 이기거나 집니다.', { inter: true }),
  A('whoami', '나 누구게?', 'gen', '잠시 모든 정보가 감춰집니다. 다른 플레이어는 자신의 색을 맞춰야 하며, 못 맞출 경우 차례를 한 번 건너뜁니다.', { inter: true }),
  A('vote', '내려', 'gen', '투표를 진행합니다. 최다 득표자는 차례를 한번 건너뜁니다. 자신은 2표를 행사합니다.', { inter: true }),
  A('spinwheel', '돌려돌려 돌림판', 'gen', '판을 회전시킵니다. 소유자는 한 번 다시 돌릴 수 있습니다.', { inter: true }),
  A('goblin', '변환: 도깨비', 'gen', '1회, 일반말을 도깨비로 바꿉니다. 도깨비는 매 턴 던지기와 별개로 도나 백도만큼 이동할 수 있습니다.'),
  A('cannon', '변환: 포', 'gen', '1회용, 일반말을 포로 바꿉니다. 매 차례 한 번, 포는 말이 있는 칸 하나를 넘어 일직선으로 벽(그 직선의 끝)까지 원하는 만큼 이동할 수 있습니다.'),
  A('pawn', '변환: 폰', 'gen', '1회, 일반말을 폰으로 바꿉니다. 폰은 조작할 수 없지만 투척마다 도만큼 전진합니다.'),
  A('fog', '안개', 'gen', '1회, 두 차례 동안 윷판에 안개가 생깁니다. 안개 속에서 자신 이외의 플레이어는 자신 말 근처만 확인할 수 있습니다.'),
  A('flick', '알까기', 'gen', '1회, 차례를 사용해 알까기를 합니다. (내 말과 노릴 적 말 선택 → 50% 명중해 적 말뭉치 사망 / 35% 빗나감 / 15% 내 말이 떨어짐)'),
  A('mistake', '언제부터 착각한 거지?', 'gen', '한 플레이어의 능력 하나를 지정해 3 라운드 동안 "고양이"로 바꿉니다. 이미 사용 완료한 증강은 바꿀 수 없습니다.', { inter: true }),
  A('aim', '윷을 잘 던져봐', 'gen', '1회, 윷을 던져서 플레이어를 맞춥니다. (걸 이상이 나오면 명중) 해당 플레이어는 차례를 두 번 건너뜁니다.'),
  A('tianma', '천마군림보 - 달걸음', 'gen', '자신의 모든 말이 반대 방향으로 이동합니다. 출발도 반대편(왼쪽 길)에서 하고 지름길도 거울처럼 뒤집힙니다. (백도는 원래 방향으로 한 칸)'),
  // ---- 시작 전용 ----
  A('equal', '등가교환', 'start', '자신의 말 1개를 제거하는 대신 윷 1개를 추가하고 시작합니다. (윷이 5개가 되어 윷·모가 잘 안 나오지만 개가 많이 나옵니다)'),
  A('sgame', '스겜', 'start', '모든 플레이어의 말이 2개가 되며, 자신의 말은 도와 개에서 시작합니다.'),
  A('piggyback', '이리 오너라 업고 놀자', 'start', '자신의 모든 말을 업은 채 도 위치에서 시작합니다.'),
  A('burden', '짐덩이와 복덩이', 'start', '자신의 말 1개를 추가하는 대신 윷 1개를 제거하고 시작합니다. (윷이 3개가 되어 걸이 사라지고 윷·모가 더 자주 나옵니다)'),
  A('alone', '천상천하 유아독존', 'start', '윷판에 말뭉치가 1개만 있으면 승리합니다. (대기 중인 말 없이, 남은 말이 전부 하나의 말뭉치일 때)'),
  A('garlic', '웅녀', 'start', '무작위 칸의 마늘 3개를 모두 모으면 승리합니다. 정확히 그 칸에 멈춰야 먹을 수 있고, 지나가기만 하면 그 칸의 위치만 알려줍니다.'),
  A('party', '말이오? 파티', 'start', '판에 함정 6개와 보상 4개를 설치해 정확히 도착한 말을 이동시키거나 죽입니다. 자신이 설치한 함정에는 영향을 받지 않습니다. (설치 위치는 나만 보입니다)'),
  A('kim', '시작 변환: 김첨지', 'start', '일반말 하나를 김첨지로 바꿉니다. 김첨지가 6차례 안에 완주하면 승리합니다.'),
  A('queen', '시작 변환: 중전마마', 'start', '좌측 상단의 중전마마가 죽으면 탈락하고, 12번 던질 때까지 지키면 승리합니다. 중전마마는 완주할 수 없습니다. 다른 말이 완주하면 목숨이 1개 증가합니다.'),
  // ---- 중간 전용 ----
  A('sevens', '777', 'mid', '한 차례 안에 같은 윷 결과가 3번 이상 나오면 승리합니다.'),
  A('nofriend', '나만 친구 없어', 'mid', '이 증강을 선택한 후 다른 모든 플레이어가 자신의 말을 잡으면 승리합니다.'),
  A('summon', '마신 소환', 'mid', '내 모든 일반말을 광신도로 바꿉니다. 광신도는 판 위에 있을 때만(대기·완주 제외) 차례 시작할 때 의식 코인 1개를 줍니다. 의식 코인 12개를 모으면 승리합니다.'),
  A('coup', '무신정변', 'mid', '적 말을 4개 이상 죽이면 승리합니다.'),
  A('treason', '역모', 'mid', '나보다 말을 많이 통과시킨 플레이어의 말을 죽일 때, 투척 기회를 1번 더 얻습니다.'),
  A('wait', '잠깐!', 'mid', '다른 플레이어의 가장 앞선 말 뭉치 1개를 2라운드 동안 못 움직이게 합니다.', { inter: true }),
  A('peace', '평화 협정', 'mid', '다른 플레이어를 죽일 수 없고, 다른 플레이어에게 죽임 당하지 않습니다. 증강으로 인한 죽음도 포함합니다.'),
  // ---- 마무리 전용 ----
  A('chalice', '독이 든 성배', 'end', '원할 때마다 투척 기회 3회를 얻습니다. 사용한 뒤 이번 차례에 모가 나오면 탈락합니다.'),
  A('lastdance', '라스트 댄스', 'end', '1회, 이번 턴 동안 내 모든 이동 거리가 2배가 됩니다. 이번 턴이 끝날 때 탈락합니다.'),
  A('marathon', '변환: 마라토너', 'end', '1회, 대기 중인 일반말을 마라토너로 바꿉니다. 그 말이 완주하면 승리합니다.'),
  A('comeback', '역전 찬스', 'end', '무작위 증강을 3개 얻습니다. (범용 중에서)'),
  A('plan', '계획대로', 'end', '[순위전] 최종 순위를 예측합니다. 게임이 끝났을 때 순위를 모두 맞추면, 기존 순위를 없애고 자신만 승리합니다.', { inter: true, rankOnly: true }),
  A('murder', '나에게 윷놀이는 "살인"이다', 'end', '모두에게 체력(3)이 생깁니다. 증강 소유자가 말을 잡을 때마다 잡힌 플레이어가 피해를 1 입습니다. 체력이 0이 되면 탈락합니다.'),
  A('necro', '네크로맨서', 'end', '1회, 탈락한 플레이어를 부활시킵니다. 그 플레이어가 승리하면 같이 승리합니다.'),
  A('bronze', '동메달도 잘한 거야', 'end', '[순위전] 즉시 3위가 됩니다. (2인이면 2위)', { rankOnly: true }),
  A('echo', '메아리의 형상', 'end', '자신의 차례부터, 모든 플레이어가 차례를 두 번씩 가집니다.'),
  A('duel', '승부다!', 'end', '즉시 플레이어 하나를 선택합니다. 그 플레이어는 세 차례 안에 말을 하나라도 완주시키지 못하면 탈락합니다. 완주시키면 자신이 탈락합니다.', { inter: true }),
  A('domain', '영역 전개', 'end', '1회, 윷판 위에 있는 자신의 말 하나를 지정해 못 움직이게 합니다. 두 차례 동안 살아남으면 승리하고 아니면 탈락합니다.'),
  A('cancel', '취~소', 'end', '[순위전] 지금까지 확정된 모든 승리(순위)를 취소하고 그 플레이어들을 게임에 복귀시킵니다.', { rankOnly: true }),
  A('cannibal', '카니발리즘', 'end', '내 말끼리 업을 수 없는 대신 내 말을 죽일 수 있으며, 죽이면 추가로 한 번 더 던집니다.'),
  // ---- 내부용 (선택창에 나오지 않음) ----
  A('cat_dis', '고양이', 'hidden', '착각으로 변한 고양이. 아무 능력이 없습니다.'),
];
const BY_ID = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));
const CONVERT = { vanguard: 'vanguard', goblin: 'goblin', cannon: 'cannon', pawn: 'pawn', marathon: 'marathon', kim: 'kim' };

// ---------- 유틸 ----------
const E = (m) => new Error(m);
const rnd = (n) => Math.floor(Math.random() * n);
const sample = (arr) => arr[rnd(arr.length)];
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const has = (p, id) => p.augs.includes(id);
const log = (g, m) => { g.logN = (g.logN || 0) + 1; g.log.push(m); if (g.log.length > 120) g.log.shift(); };
const isFrozen = (g, x) => x.frozen > g.round;
const isActive = (p) => p.alive && !p.out;
const activeList = (g) => g.players.filter(isActive);

function newStats() {
  return {
    dogs: 0, gul: 0, kills: 0, seen: [], coins: 0, ritual: 0, ejiri: 0, backdoCaps: 0, friendHits: [],
    garlic: [], garlicGot: [], garlicSeen: [], bank: [], snipers: [], nextChoose: false, lastDance: false, poison: false, deliver: [],
    skip: 0, bound: [], leechTo: null, plan: null, queenLives: 0, queenThrows: 0, kimLeft: 0, domain: null, domainWon: false, dis: [],
  };
}
function newPlayer(idx, name, token) {
  return {
    idx, name, token, color: COLORS[idx], colorName: COLOR_NAMES[idx], connected: true, alive: true, out: false, stash: null, fixedRank: null, hp: null,
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
const groupOf = (p, x) => (x.pos === 0 ? [x] : p.pieces.filter((y) => !y.done && y.pos === x.pos));
function sendHome(x) { x.pos = 0; x.route = 'main'; x.shield = false; x.frozen = 0; }
function setRoute(x, node, prefer) {
  if (node < 20) x.route = 'main';
  else if (node >= 25) x.route = 'B';
  else if (node === 22) x.route = (prefer === 'A' || prefer === 'B') ? prefer : (x.route === 'B' ? 'B' : 'A');
  else x.route = 'A';
}
const vpos = (p, x) => (has(p, 'tianma') ? mirNode(x.pos) : x.pos);
const occupiedSet = (g) => { const s = new Set(); for (const q of g.players) for (const x of q.pieces) if (!x.done && x.pos > 0) s.add(x.pos); return s; };

// ---------- 방/게임 ----------
function createGame(code) {
  return {
    code, players: [], chaos: false, ranking: false, phase: 'lobby', round: 0, cur: 0, tn: null, pick: null, log: [], winner: null, reason: '',
    poops: [], ganTaek: false, ranks: [], elim: [], fixed: {}, party: [], duels: [], echo: false, fog: null, hpOn: false, final: null, coWinners: [], planWin: null,
  };
}
function addPlayer(g, name, token) {
  if (g.phase !== 'lobby') throw E('이미 게임이 시작되었습니다');
  if (g.players.length >= MAX_PLAYERS) throw E(`방이 가득 찼습니다 (최대 ${MAX_PLAYERS}명)`);
  const p = newPlayer(g.players.length, String(name || '플레이어').slice(0, 10), token);
  g.players.push(p);
  return p;
}
function removePlayer(g, p) {
  g.players.splice(g.players.indexOf(p), 1);
  g.players.forEach((q, i) => { q.idx = i; q.color = COLORS[i]; q.colorName = COLOR_NAMES[i]; });
}
function resetState(g) {
  g.round = 0; g.cur = 0; g.order = null; g.tn = null; g.pick = null; g.winner = null; g.reason = '';
  g.poops = []; g.ganTaek = false; g.log = []; g.ranks = []; g.elim = []; g.fixed = {}; g.party = []; g.duels = [];
  g.echo = false; g.fog = null; g.hpOn = false; g.lastThrow = null; g.final = null; g.coWinners = []; g.planWin = null;
}
function resetGame(g) {
  g.phase = 'lobby'; resetState(g);
  g.players = g.players.map((p) => { const q = newPlayer(p.idx, p.name, p.token); q.connected = p.connected; return q; });
}
function startGame(g) {
  if (g.players.length < 2) throw E('2명 이상이 필요합니다');
  resetState(g);
  g.players.forEach(makePieces);
  g.round = 1;
  log(g, g.ranking ? '게임 시작! (순위전)' : '게임 시작!');
  decideOrder(g);
  startPick(g);
}

// 시작 전에 모두 윷을 던져 큰 순서대로 차례를 정함 (동점이면 동점자끼리 다시 던짐)
const RES_VAL = { '백도': 0, '도': 1, '개': 2, '걸': 3, '윷': 4, '모': 5 };
function decideOrder(g) {
  const rounds = []; const out = [];
  const settle = (set, depth) => {
    if (set.length === 1) { out.push(set[0]); return; }
    if (depth > 6) { out.push(...shuffle(set)); return; }
    const rolls = set.map((i) => { const r = rollFaces(4); return { by: i, items: [{ res: r.r, faces: r.faces }], v: RES_VAL[r.r] }; });
    rounds.push(rolls.map((x) => ({ by: x.by, items: x.items })));
    const vals = [...new Set(rolls.map((x) => x.v))].sort((a, b) => b - a);
    for (const v of vals) settle(rolls.filter((x) => x.v === v).map((x) => x.by), depth + 1);
  };
  settle(g.players.map((p) => p.idx), 0);
  g.order = out;
  g.throwSeq = (g.throwSeq || 0) + 1;
  g.lastThrow = { seq: g.throwSeq, by: -1, items: [], label: '순서 정하기', rounds, order: out.slice() };
  rounds.forEach((rd, k) => log(g, `🎲 순서 던지기${rounds.length > 1 ? ` ${k + 1}차` : ''}: ` + rd.map((x) => `${g.players[x.by].name} ${x.items[0].res}`).join(', ')));
  log(g, `🔢 차례 순서: ${out.map((i) => g.players[i].name).join(' → ')}`);
}

// ---------- 증강 선택 ----------
function startPick(g) {
  const kind = ROUND_PICKS[g.round];
  g.phase = 'pick';
  const order = ordList(g).filter(isActive).map((p) => p.idx);
  const left = {}, chosen = {}, opts = {};
  order.forEach((i) => { left[i] = g.chaos ? 2 : 1; chosen[i] = []; });
  // stage: choose(모두 동시에 고름) → resolve(공개 후 순서대로 효과 적용)
  g.pick = { kind, order, stage: 'choose', cur: order[0], left, chosen, opts, queue: [], banned: [], options: [], sub: null };
  log(g, `━ ${g.round}라운드: 증강 선택 (${{ start: '시작', mid: '중간', end: '마무리' }[kind]} 전용 포함) — 모두 동시에 고릅니다 ━`);
  if (!order.length) { finishPick(g); return; }
  order.forEach((i) => rollOptions(g, g.players[i]));
}
const picker = (g) => g.players[g.pick.cur];
const ordList = (g) => (g.order || g.players.map((p) => p.idx)).map((i) => g.players[i]);
// 동시 선택 단계에서 각자 받는 선택지 (남들에게는 보이지 않음)
function rollOptions(g, p, exclude) {
  const pk = g.pick;
  const mine = pk.chosen[p.idx] || [];
  const ok = (a) => (a.cat === 'gen' || a.cat === pk.kind) && (!a.rankOnly || g.ranking) && !has(p, a.id) && !mine.includes(a.id);
  const pool = AUGMENTS.filter((a) => ok(a) && !(exclude || []).includes(a.id));
  const forced = p.st.deliver.filter((id) => BY_ID[id] && ok(BY_ID[id])).slice(0, 3);
  let ids = [...forced];
  for (const a of shuffle(pool.filter((x) => !forced.includes(x.id)))) { if (ids.length >= 3) break; ids.push(a.id); }
  ids = shuffle(ids);
  const opts = ids.map((id) => ({ id, locked: false }));
  if (g.ganTaek && ids.includes('cat')) opts.forEach((o) => { o.locked = o.id !== 'cat'; });
  pk.opts[p.idx] = opts;
}
function actPick(g, p, id) {
  const pk = g.pick;
  if (g.phase !== 'pick' || !pk || pk.stage !== 'choose') throw E('지금은 증강을 고를 수 없습니다');
  if (!(p.idx in pk.left) || pk.left[p.idx] <= 0) throw E('이미 선택을 마쳤습니다');
  const o = (pk.opts[p.idx] || []).find((x) => x.id === id);
  if (!o) throw E('선택할 수 없는 증강입니다');
  if (o.locked) throw E('간택! 고양이를 골라야 합니다');
  if (id === 'objection') { log(g, `${p.name}: 이의있음! 다시 고릅니다`); rollOptions(g, p, ['objection']); return; }
  pk.chosen[p.idx].push(id); p.st.deliver = [];
  pk.left[p.idx]--;
  if (pk.left[p.idx] > 0) rollOptions(g, p);
  else { pk.opts[p.idx] = []; log(g, `${p.name}: 선택 완료`); }
  if (Object.keys(pk.left).every((i) => pk.left[i] <= 0 || !isActive(g.players[i]))) startResolve(g);
}
// 모두 고르면 공개하고, 명탐정을 먼저 처리한 뒤 순서대로 효과를 적용
function startResolve(g) {
  const pk = g.pick; pk.stage = 'resolve';
  const items = [];
  for (const i of pk.order) for (const id of pk.chosen[i]) items.push({ idx: i, id });
  items.sort((x, y) => (y.id === 'detective') - (x.id === 'detective'));
  pk.queue = items;
  g.players.forEach((q) => { if (pk.chosen[q.idx] && pk.chosen[q.idx].length) log(g, `📜 ${q.name}의 선택: ${pk.chosen[q.idx].map((id) => BY_ID[id].name).join(', ')}`); });
  processQueue(g);
}
function processQueue(g) {
  const pk = g.pick;
  while (pk.queue.length) {
    const it = pk.queue.shift(); const p = g.players[it.idx];
    if (!isActive(p)) continue;
    const ban = pk.banned.find((b) => b.id === it.id && b.by !== it.idx);
    if (ban) { log(g, `🔍 ${p.name}의 '${BY_ID[it.id].name}'은(는) ${g.players[ban.by].name}의 명탐정으로 무효화되었습니다`); continue; }
    pk.cur = it.idx;
    p.augs.push(it.id);
    log(g, `${p.name} 선택 → ${BY_ID[it.id].name}`);
    const sub = acquire(g, p, it.id);
    if (g.phase === 'ended') return;
    if (sub) { pk.sub = sub; return; }
    checkWins(g);
    if (g.phase === 'ended') return;
  }
  finishPick(g);
}
function otherTarget(g, p, value) {
  const t = g.players[value];
  if (!t || !isActive(t) || t === p) throw E('대상을 다시 고르세요');
  return t;
}
function actSub(g, p, value) {
  const pk = g.pick;
  if (g.phase !== 'pick' || !pk || pk.stage !== 'resolve' || !pk.sub || picker(g) !== p) throw E('선택할 항목이 없습니다');
  const sub = pk.sub;
  switch (sub.type) {
    case 'player': {
      const t = otherTarget(g, p, value);
      if (sub.aug === 'wait') {
        const st = stacksOf(t); let best = null, bestRem = 1e9;
        for (const n of Object.keys(st)) {
          const rem = Math.min(...st[n].map((x) => ROUTES[x.route].length - ROUTES[x.route].indexOf(vpos(t, x))));
          if (rem < bestRem) { bestRem = rem; best = st[n]; }
        }
        if (best) { best.forEach((x) => { x.frozen = g.round + 2; }); log(g, `${p.name}: 잠깐! ${t.name}의 가장 앞선 말뭉치가 2라운드 동안 멈춥니다`); }
        else log(g, `${p.name}: 잠깐! ${t.name}은(는) 윷판에 말이 없어 효과가 없었습니다`);
      } else if (sub.aug === 'leech') {
        let c = p.pieces.filter((x) => !x.done && x.pos === 0 && x.type === 'normal').pop();
        if (!c) c = p.pieces.filter((x) => !x.done && x.type === 'normal').pop();
        if (c) {
          p.pieces.splice(p.pieces.indexOf(c), 1); p.npieces = p.pieces.length;
          const np = mkPiece(t); np.pos = c.pos; np.route = c.route; t.pieces.push(np); t.npieces = t.pieces.length;
        }
        p.st.bound.push(t.idx); p.st.leechTo = t.idx;
        log(g, `${p.name}: 거머리! ${t.name}에게 말을 주고 운명을 함께합니다`);
      } else if (sub.aug === 'duel') {
        g.duels.push({ ch: p.idx, t: t.idx, left: 3, base: t.finished });
        log(g, `${p.name}: 승부다! ${t.name}은(는) 세 차례 안에 말을 완주시켜야 합니다 (완주하면 ${p.name} 탈락)`);
      } else if (sub.aug === 'mistake') {
        const list = t.augs.filter((id) => !t.used[id] && id !== 'cat' && id !== 'cat_dis');
        if (!list.length) { log(g, `${p.name}: 착각... ${t.name}은(는) 바꿀 증강이 없었습니다`); break; }
        pk.sub = { type: 'owned', aug: 'mistake', target: t.idx, list };
        return;
      }
      break;
    }
    case 'augment': {
      if (!BY_ID[value] || BY_ID[value].cat === 'hidden') throw E('존재하지 않는 증강입니다');
      if (sub.aug === 'detective') { pk.banned.push({ id: value, by: p.idx }); log(g, `${p.name}: 명탐정! '${BY_ID[value].name}' 무효화`); }
      if (sub.aug === 'delivery') { p.st.deliver = [value]; log(g, `${p.name}: 배달! 다음 선택창에 '${BY_ID[value].name}' 등장 예약`); }
      break;
    }
    case 'owned': {
      if (!sub.list.includes(value)) throw E('고를 수 없는 증강입니다');
      const t = g.players[sub.target];
      disguise(g, t, value, g.round + 3);
      log(g, `${p.name}: 착각! ${t.name}의 '${BY_ID[value].name}'이(가) 3라운드 동안 고양이로 변했습니다`);
      break;
    }
    case 'fold': {
      if (!['R', 'L', 'T', 'B'].includes(value)) throw E('접는 방향을 고르세요');
      foldBoard(g, p, value);
      break;
    }
    case 'spin': {
      if (value === 'respin' && !sub.respun) { sub.k = 1 + rnd(3); sub.respun = true; log(g, `${p.name}: 돌림판을 다시 돌립니다`); return; }
      if (value !== 'keep' && !(value === 'respin' && sub.respun)) throw E('선택할 수 없습니다');
      if (value === 'respin') throw E('이미 한 번 다시 돌렸습니다');
      rotateBoard(g, sub.k);
      log(g, `${p.name}: 돌려돌려 돌림판! 판이 ${sub.k * 90}° 돌아갑니다`);
      break;
    }
    case 'rank': {
      const v = Number(value);
      if (!(v >= 0 && v < g.players.length) || sub.picks.includes(v)) throw E('이미 고른 플레이어입니다');
      sub.picks.push(v);
      if (sub.picks.length < g.players.length) return;
      p.st.plan = sub.picks.slice();
      log(g, `${p.name}: 계획대로... 순위를 예측했습니다 (비공개)`);
      break;
    }
    default: throw E('선택할 항목이 없습니다');
  }
  pk.sub = null;
  afterPick(g);
}
function actGuess(g, p, v) {
  const pk = g.pick;
  if (g.phase !== 'pick' || !pk || !pk.sub || pk.sub.type !== 'guess') throw E('지금은 색을 맞출 수 없습니다');
  const s = pk.sub;
  if (!s.pending.includes(p.idx)) throw E('이미 답했거나 대상이 아닙니다');
  v = Number(v);
  if (!(v >= 0 && v < COLORS.length)) throw E('색을 고르세요');
  s.pending = s.pending.filter((i) => i !== p.idx); s.answered[p.idx] = true;
  if (v !== p.idx) { p.st.skip++; log(g, `${p.name}: 자신의 색을 못 맞춰 다음 차례를 건너뜁니다`); } else log(g, `${p.name}: 자신의 색을 맞췄습니다`);
  if (!s.pending.length) { pk.sub = null; afterPick(g); }
}
function actVote(g, p, v) {
  const pk = g.pick;
  if (g.phase !== 'pick' || !pk || !pk.sub || pk.sub.type !== 'vote') throw E('지금은 투표할 수 없습니다');
  const s = pk.sub;
  if (!s.pending.includes(p.idx)) throw E('이미 투표했거나 대상이 아닙니다');
  v = Number(v);
  const t = g.players[v];
  if (!t || !isActive(t) || t === p) throw E('자신이 아닌 다른 플레이어에게 투표하세요');
  s.pending = s.pending.filter((i) => i !== p.idx); s.votes[p.idx] = v;
  if (s.pending.length) return;
  const owner = picker(g); const tally = {};
  for (const [voter, tg] of Object.entries(s.votes)) tally[tg] = (tally[tg] || 0) + (Number(voter) === owner.idx ? 2 : 1);
  const mx = Math.max(...Object.values(tally));
  const top = Object.keys(tally).filter((k) => tally[k] === mx).map(Number);
  const loser = g.players[sample(top)];
  loser.st.skip++;
  log(g, `내려! 투표 결과: ${Object.entries(tally).map(([k, c]) => `${g.players[k].name} ${c}표`).join(', ')} → ${loser.name} 다음 차례 건너뜀${top.length > 1 ? ' (동점 추첨)' : ''}`);
  pk.sub = null; afterPick(g);
}
function afterPick(g) {
  checkWins(g);
  if (g.phase === 'ended') return;
  processQueue(g);
}
function finishPick(g) {
  g.pick = null;
  const first = ordList(g).find(isActive);
  if (!first) { checkWins(g); return; }
  startTurn(g, first.idx);
}

function convertPiece(p, type) {
  const c = p.pieces.find((x) => !x.done && x.pos === 0 && x.type === 'normal') || p.pieces.find((x) => !x.done && x.type === 'normal');
  if (c) c.type = type;
  return c;
}
function disguise(g, q, id, until) {
  const slot = q.augs.indexOf(id);
  if (slot < 0) return;
  q.augs[slot] = 'cat_dis'; q.st.dis.push({ slot, id, until });
}
function expireDisguises(g) {
  for (const q of g.players) {
    q.st.dis = q.st.dis.filter((d) => {
      if (g.round >= d.until) { if (q.augs[d.slot] === 'cat_dis') q.augs[d.slot] = d.id; log(g, `${q.name}: '${BY_ID[d.id].name}'이(가) 원래대로 돌아왔습니다`); return false; }
      return true;
    });
  }
}

// 증강 획득 즉시 효과. 추가 입력이 필요하면 sub 반환
function acquire(g, p, id) {
  switch (id) {
    case 'gantaek': g.ganTaek = true; break;
    case 'doberman': p.st.coins = p.st.dogs; break;
    case 'equal': removeOnePiece(p); p.npieces = p.pieces.length; p.sticks += 1; break;
    case 'burden': p.pieces.push(mkPiece(p)); p.npieces = p.pieces.length; p.sticks = Math.max(2, p.sticks - 1); break;
    case 'sgame':
      for (const q of g.players) { while (q.pieces.length > 2) removeOnePiece(q); q.npieces = q.pieces.length; }
      if (p.pieces[0]) p.pieces[0].pos = has(p, 'tianma') ? mirNode(1) : 1;
      if (p.pieces[1]) p.pieces[1].pos = has(p, 'tianma') ? mirNode(2) : 2;
      break;
    case 'piggyback': p.pieces.filter((x) => !x.done).forEach((x) => { x.pos = has(p, 'tianma') ? mirNode(1) : 1; x.route = 'main'; }); break;
    case 'garlic': p.st.garlic = shuffle(Array.from({ length: 28 }, (_, i) => i + 1)).slice(0, 3); p.st.garlicGot = []; p.st.garlicSeen = []; break;
    case 'nofriend': p.st.friendHits = []; break;
    case 'poop': { const node = 1 + rnd(28); g.poops.push({ node, owner: p.idx }); log(g, `💩 ${p.name}이(가) 어딘가에 똥을 쌌습니다`); break; }
    case 'vanguard': case 'goblin': case 'cannon': case 'pawn': case 'marathon': convertPiece(p, CONVERT[id]); break;
    case 'kim': convertPiece(p, 'kim'); p.st.kimLeft = 6; break;
    case 'queen': {
      const c = convertPiece(p, 'queen');
      if (c) { c.pos = 10; c.route = 'main'; }
      p.st.queenLives = 0; p.st.queenThrows = 0;
      break;
    }
    case 'summon': p.pieces.filter((x) => !x.done && x.type === 'normal').forEach((x) => { x.type = 'zealot'; }); break;
    case 'redbutton':
      for (const q of g.players) { if (!isActive(q)) continue; const st = stacksOf(q); for (const n of DIAG_NODES) if (st[n]) augKill(g, q, st[n], p); }
      log(g, `${p.name}: 크고 빨간 버튼!`);
      break;
    case 'notme': {
      const others = activeList(g).filter((q) => q !== p);
      if (others.length) {
        const v = sample(others); const st = stacksOf(v);
        for (const n of Object.keys(st)) augKill(g, v, st[n], p);
        log(g, `${p.name}: 나만 아니면 돼~ → ${v.name}!`);
      }
      break;
    }
    case 'comeback': {
      const ex = ['comeback', 'objection', 'detective', 'delivery'];
      const pool = shuffle(AUGMENTS.filter((a) => a.cat === 'gen' && !a.inter && !ex.includes(a.id) && !has(p, a.id))).slice(0, 3);
      for (const a of pool) { p.augs.push(a.id); log(g, `${p.name} 획득 → ${a.name}`); acquire(g, p, a.id); }
      break;
    }
    case 'party': {
      const nodes = shuffle(Array.from({ length: 28 }, (_, i) => i + 1)).slice(0, 10);
      const kinds = ['kill', 'kill', 'kill', 'back', 'back', 'back', 'fwd', 'fwd', 'fwd', 'fwd'];
      g.party = g.party.concat(nodes.map((node, i) => ({ node, kind: kinds[i], owner: p.idx })));
      log(g, `🎉 ${p.name}이(가) 판 위에 함정 6개와 보상 4개를 설치했습니다`);
      break;
    }
    case 'murder': g.hpOn = true; g.players.forEach((q) => { if (q.hp == null) q.hp = 3; }); log(g, '모든 플레이어에게 체력 3이 생겼습니다'); break;
    case 'echo': g.echo = true; log(g, '메아리의 형상! 모든 플레이어가 차례를 두 번씩 가집니다'); break;
    case 'bronze': {
      const r = Math.min(3, g.players.length);
      p.fixedRank = r; g.fixed[r] = p.idx; p.out = true; p.stash = p.pieces; p.pieces = [];
      log(g, `🥉 ${p.name}: 동메달도 잘한 거야! ${r}위 확정, 게임에서 빠집니다`);
      break;
    }
    case 'cancel': undoWins(g); break;
    case 'fold': return { type: 'fold' };
    case 'spinwheel': return { type: 'spin', aug: id, k: 1 + rnd(3), respun: false };
    case 'whoami': {
      const pending = activeList(g).filter((q) => q !== p).map((q) => q.idx);
      if (!pending.length) break;
      log(g, '❓ 나 누구게? 모든 정보가 감춰집니다. 각자 자신의 색을 맞추세요!');
      return { type: 'guess', aug: id, pending, answered: {} };
    }
    case 'vote': return { type: 'vote', aug: id, pending: activeList(g).map((q) => q.idx), votes: {} };
    case 'plan': return { type: 'rank', aug: id, picks: [] };
    case 'detective': case 'delivery': return { type: 'augment', aug: id };
    case 'wait': case 'leech': case 'duel': case 'mistake': return { type: 'player', aug: id };
    default: break;
  }
  return null;
}

// ---------- 판 변형 (접기 / 돌리기) ----------
function mapNodeLists(g, f) {
  const mp = (n) => { const m = f(n); return m === 0 ? null : m; };
  g.poops = g.poops.map((q) => ({ ...q, node: mp(q.node) })).filter((q) => q.node);
  g.party = g.party.map((q) => ({ ...q, node: mp(q.node) })).filter((q) => q.node);
  for (const q of g.players) {
    q.st.garlic = q.st.garlic.map(mp).filter(Boolean);
    q.st.garlicGot = q.st.garlicGot.map(mp).filter(Boolean);
    q.st.garlicSeen = q.st.garlicSeen.map(mp).filter(Boolean);
    q.st.snipers = q.st.snipers.map(mp).filter(Boolean);
  }
}
function foldBoard(g, p, dir) {
  const mir = (dir === 'R' || dir === 'L') ? MIRH : MIRV;
  const folded = (n) => { const [x, y] = XY(n); return dir === 'R' ? x > 50.01 : dir === 'L' ? x < 49.99 : dir === 'B' ? y > 50.01 : y < 49.99; };
  const movers = [];
  for (const q of g.players) {
    if (!isActive(q)) continue;
    const st = stacksOf(q);
    for (const n of Object.keys(st)) if (folded(+n)) movers.push({ q, stack: st[n], to: mir[+n] });
  }
  log(g, `${p.name}: 게임 접어라! 윷판을 ${{ R: '오른쪽을 왼쪽으로', L: '왼쪽을 오른쪽으로', T: '위쪽을 아래로', B: '아래쪽을 위로' }[dir]} 접습니다`);
  for (const m of movers) {
    if (m.to === 0) { log(g, `${m.q.name}의 말이 접히며 골인!`); finishPieces(g, m.q, m.stack); continue; }
    m.stack.forEach((x) => { x.pos = m.to; setRoute(x, m.to); });
  }
  for (const m of movers) {
    if (m.to === 0) continue;
    for (const o of g.players) {
      if (o === m.q || !isActive(o)) continue;
      const opp = o.pieces.filter((x) => !x.done && x.pos === m.to);
      if (opp.length) augKill(g, o, opp, m.q);
    }
  }
  mapNodeLists(g, (n) => (folded(n) ? mir[n] : n));
}
function rotateBoard(g, k) {
  const f = (n) => { let m = n; for (let i = 0; i < k; i++) m = ROT1[m]; return m; };
  for (const q of g.players) {
    if (!isActive(q)) continue;
    const st = stacksOf(q);
    for (const n of Object.keys(st)) {
      const to = f(+n);
      if (to === 0) { log(g, `${q.name}의 말이 돌아가며 골인!`); finishPieces(g, q, st[n]); }
      else st[n].forEach((x) => { x.pos = to; setRoute(x, to); });
    }
  }
  mapNodeLists(g, f);
}

// ---------- 죽음 / 잡기 ----------
function onDeaths(g, owner, n) {
  for (const q of g.players) {
    if (!isActive(q) || !has(q, 'ejiri') || q === owner || g.cur === q.idx) continue;
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
  const queenDied = victims.some((x) => x.type === 'queen');
  victims.forEach(sendHome);
  onDeaths(g, owner, victims.length);
  log(g, `☠ ${owner.name}의 말 ${victims.length}개 사망${killer && killer !== owner ? ` (by ${killer.name})` : ''}`);
  if (killer && killer !== owner) {
    killer.st.kills += victims.length;
    if (has(owner, 'nofriend') && !owner.st.friendHits.includes(killer.idx)) owner.st.friendHits.push(killer.idx);
    if (has(killer, 'murder') && owner.hp != null && owner.alive) {
      owner.hp -= 1; log(g, `🩸 ${owner.name}의 체력 ${owner.hp}/3`);
      if (owner.hp <= 0) { eliminate(g, owner); return victims.length; }
    }
  }
  if (queenDied && owner.alive && has(owner, 'queen')) {
    if (owner.st.queenLives > 0) {
      owner.st.queenLives--;
      const q = owner.pieces.find((x) => x.type === 'queen');
      if (q) { q.pos = 10; q.route = 'main'; }
      log(g, `👑 ${owner.name}: 중전마마가 목숨 하나를 잃고 되살아났습니다 (남은 목숨 ${owner.st.queenLives})`);
    } else { log(g, `👑 ${owner.name}: 중전마마가 죽었습니다`); eliminate(g, owner); }
  }
  return victims.length;
}
function augKill(g, owner, stack, src) {
  if (src && src !== owner && (has(src, 'peace') || has(owner, 'peace'))) return 0;
  return killStack(g, owner, stack, src);
}
function finishPieces(g, p, list) {
  list.forEach((x) => { x.done = true; x.pos = -1; x.shield = false; x.frozen = 0; });
  p.finished += list.length;
  if (has(p, 'queen')) p.st.queenLives += list.filter((x) => x.type !== 'queen').length;
  g.duels = g.duels.filter((d) => {
    if (d.t !== p.idx) return true;
    const c = g.players[d.ch];
    log(g, `승부다! ${p.name}이(가) 완주해 ${c.name}이(가) 탈락합니다`);
    if (isActive(c)) eliminate(g, c);
    return false;
  });
}

// ---------- 이동 ----------
function stepFrom(piece, steps) {
  let route = piece.route; const pos = piece.pos;
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
function stepBack(piece, n) {
  if (piece.pos === 0) return null;
  let route = piece.route, pos = piece.pos; const nodes = [];
  for (let k = 0; k < n; k++) {
    const r = ROUTES[route]; const i = r.indexOf(pos);
    if (i > 0) pos = r[i - 1];
    else if (route === 'main') return { home: true, nodes, route: 'main' };
    else { pos = r[0] - 1; route = 'main'; }
    nodes.push(pos);
  }
  return { finished: false, nodes, route };
}
function moveFor(group, steps, mir) {
  const x = group[0];
  const v = mir ? { pos: mirNode(x.pos), route: x.route } : x;
  let mv = steps < 0 ? stepBack(v, -steps) : stepFrom(v, steps);
  if (!mv) return null;
  if (mir) mv = Object.assign({}, mv, { nodes: mv.nodes.map(mirNode) });
  if (mv.finished && group.some((y) => y.type === 'queen')) return null;
  return mv;
}
// 일직선 경로: 지금 가는 방향의 직선 위에서 벽(그 직선의 끝)까지의 칸들. 출발/골인점(0)과 모서리 너머로는 가지 않음
function straightPath(x, mir) {
  const v = mir ? { pos: mirNode(x.pos), route: x.route } : x;
  const first = stepFrom(v, 1);
  if (first.finished || !first.nodes.length) return [];
  const a = v.pos, b = first.nodes[0];
  for (const line of LINES) {
    const i = line.indexOf(a), j = line.indexOf(b);
    if (i < 0 || j < 0 || j !== i + 1) continue;
    const out = [];
    for (let k = j; k < line.length; k++) { if (line[k] === 0) break; out.push(line[k]); }
    return mir ? out.map(mirNode) : out;
  }
  return [];
}
function effSteps(p, res) {
  let s = STEPS[res];
  if (s > 0) {
    if (p.st.lastDance) s *= 2;
    if (p.pieces.some((x) => x.type === 'vanguard' && !x.done && x.pos > 0)) s += 1;
  }
  return s;
}
function usable(g, p, res) {
  const s = effSteps(p, res);
  return p.pieces.some((x) => {
    if (x.done || x.type === 'pawn') return false;
    const grp = groupOf(p, x);
    if (grp.some((y) => isFrozen(g, y))) return false;
    return !!moveFor(grp, s, has(p, 'tianma'));
  });
}

// group 을 steps 만큼 움직이고 부가효과(똥, 마늘, 잡기, 함정/보상, 카니발)를 처리
function applyMove(g, p, group, steps, label, opts) {
  opts = opts || {};
  const tn = g.tn;
  const mv = opts.mv || moveFor(group, steps, has(p, 'tianma'));
  if (!mv) throw E('움직일 수 없습니다');
  let nodes = mv.nodes; let stopped = false;
  for (let i = 0; i < nodes.length; i++) {
    const pi = g.poops.findIndex((q) => q.node === nodes[i] && q.owner !== p.idx);
    if (pi >= 0) { g.poops.splice(pi, 1); nodes = nodes.slice(0, i + 1); stopped = true; log(g, `💩 ${p.name}의 말이 똥을 밟고 멈췄습니다!`); break; }
  }
  // 웅녀: 마늘 칸에 정확히 멈춰야 획득, 지나가기만 하면 위치가 드러남
  const landing = ((mv.home || mv.finished) && !stopped) ? null : nodes[nodes.length - 1];
  for (const nd of nodes) {
    if (!p.st.garlic.includes(nd) || p.st.garlicGot.includes(nd)) continue;
    if (nd === landing) { p.st.garlicGot.push(nd); p.st.garlicSeen = p.st.garlicSeen.filter((n) => n !== nd); log(g, `🧄 ${p.name} 마늘 획득 (${p.st.garlicGot.length}/3)`); }
    else if (!p.st.garlicSeen.includes(nd)) { p.st.garlicSeen.push(nd); log(g, `🧄 ${p.name}: 마늘이 있는 칸을 지나쳤습니다! 위치를 알아냈습니다`); }
  }

  if (mv.home && !stopped) {
    group.forEach(sendHome);
    log(g, `${p.name}: ${label} → 대기칸으로 되돌아감`);
    return;
  }
  if (mv.finished && !stopped) {
    finishPieces(g, p, group);
    log(g, `${p.name}: ${label} → 말 ${group.length}개 완주! (${p.finished}/${p.pieces.length})`);
    return;
  }
  const np = nodes[nodes.length - 1];
  group.forEach((x) => { x.pos = np; setRoute(x, np, mv.route); });
  log(g, `${p.name}: ${label} → ${np}번 칸`);
  if (has(p, 'cannibal')) {
    const own = p.pieces.filter((x) => !x.done && x.pos === np && !group.includes(x));
    if (own.length && killStack(g, p, own, null) > 0) { tn.throws += 1; log(g, `${p.name}: 카니발리즘! 추가 던지기 1회`); }
  }
  let killed = 0, bonus = 0;
  for (const o of g.players) {
    if (o === p || !isActive(o)) continue;
    const stack = o.pieces.filter((x) => !x.done && x.pos === np);
    if (!stack.length) continue;
    if (has(p, 'peace') || has(o, 'peace')) continue;
    const k = killStack(g, o, stack, p);
    if (k > 0) { killed += k; if (has(p, 'treason') && o.finished > p.finished) bonus++; }
  }
  if (killed > 0) {
    tn.throws += 1 + bonus;
    log(g, `${p.name}: 잡았다! 추가 던지기 ${1 + bonus}회`);
    if (opts.backdo) p.st.backdoCaps++;
  }
  if (!opts.noTrigger && p.alive && group.every((x) => x.pos === np)) partyTrigger(g, p, group, np);
}
function partyTrigger(g, p, group, np) {
  const i = g.party.findIndex((q) => q.node === np && (q.kind === 'fwd' || q.owner !== p.idx));
  if (i < 0) return;
  const t = g.party.splice(i, 1)[0]; const owner = g.players[t.owner];
  if (t.kind === 'kill') { log(g, `💀 ${p.name}의 말이 함정을 밟았습니다!`); augKill(g, p, group, owner); }
  else if (t.kind === 'back') {
    log(g, `⏪ ${p.name}의 말이 함정을 밟아 3칸 뒤로 밀려납니다`);
    const mv = moveFor(group, -3, has(p, 'tianma')); if (mv) applyMove(g, p, group, -3, '함정', { mv, noTrigger: true });
  } else {
    log(g, `🎁 ${p.name}의 말이 보상을 찾았습니다! 3칸 전진`);
    const mv = moveFor(group, 3, has(p, 'tianma')); if (mv) applyMove(g, p, group, 3, '보상', { mv, noTrigger: true });
  }
}
function actMove(g, p, ri, pid) {
  assertTurn(g, p);
  const tn = g.tn;
  if (tn.throws > 0) throw E('먼저 윷을 던지세요');
  const res = tn.queue[ri];
  if (!res) throw E('사용할 윷 결과를 선택하세요');
  const piece = p.pieces.find((x) => x.id === pid);
  if (!piece || piece.done) throw E('움직일 수 없는 말입니다');
  if (piece.type === 'pawn') throw E('폰은 직접 움직일 수 없습니다');
  const group = groupOf(p, piece);
  if (group.some((x) => isFrozen(g, x))) throw E('멈춰 있는 말입니다');
  const steps = effSteps(p, res);
  const mv = moveFor(group, steps, has(p, 'tianma'));
  if (!mv) throw E(group.some((x) => x.type === 'queen') ? '중전마마는 완주할 수 없습니다' : '그 말은 그렇게 움직일 수 없습니다');
  tn.queue.splice(ri, 1);
  applyMove(g, p, group, steps, res, { mv, backdo: res === '백도' });
  afterAction(g);
}

// ---------- 던지기 ----------
function rollFaces(n) {
  const faces = []; let f = 0, marked = false;
  for (let i = 0; i < n; i++) { const up = Math.random() < 0.5; faces.push(up); if (up) { f++; if (i === 0) marked = true; } }
  let r;
  if (f === 0) r = '모';
  else if (f === n) r = '윷';
  else if (f === 1) r = marked ? '백도' : '도';
  else if (n >= 4 && f === n - 1) r = '걸';   // 윷이 3개 이하면 걸이 없음 (앞면 2개 = 개)
  else r = '개';
  return { r, faces };
}
const rollPlain = (n) => rollFaces(n).r;
// 정해진 결과(강제/모아니면도 등)에 맞는 윷 모양
function facesFor(res, n) {
  const up = new Array(n).fill(false);
  const set = (k, skipFirst) => {
    const idx = []; for (let i = skipFirst ? 1 : 0; i < n; i++) idx.push(i);
    idx.sort(() => Math.random() - 0.5); idx.slice(0, k).forEach((i) => { up[i] = true; });
  };
  switch (res) {
    case '윷': up.fill(true); break;
    case '탈락': up.fill(true); break;
    case '도': set(1, true); break;
    case '백도': up[0] = true; break;
    case '개': set(2, false); break;
    case '걸': set(Math.max(2, n - 1), false); break;
    default: break; // 모
  }
  return up;
}
function roll(p) {
  if (has(p, 'modo')) { const r = Math.random() < 0.4 ? '모' : '도'; return { r, faces: facesFor(r, p.sticks) }; }
  if (has(p, 'excess')) {
    const faces = []; let f = 0; for (let i = 0; i < 6; i++) { const u = Math.random() < 0.5; faces.push(u); if (u) f++; }
    return { r: { 0: '모', 1: '도', 2: '개', 3: '걸', 4: '걸', 5: '윷', 6: '탈락' }[f], faces };
  }
  return rollFaces(p.sticks);
}
function announceThrow(g, p, items, label) {
  g.throwSeq = (g.throwSeq || 0) + 1;
  g.lastThrow = { seq: g.throwSeq, by: p.idx, items, label: label || '' };
}
function movePawns(g, p) {
  const done = new Set();
  for (const x of p.pieces.slice()) {
    if (x.done || x.type !== 'pawn' || done.has(x.id) || !p.alive) continue;
    const grp = groupOf(p, x); grp.forEach((y) => done.add(y.id));
    if (grp.some((y) => isFrozen(g, y))) continue;
    const mv = moveFor(grp, 1, has(p, 'tianma'));
    if (mv) applyMove(g, p, grp, 1, '폰 전진', { mv });
  }
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
  tn.throws--; tn.thrown = true;
  if (has(p, 'queen')) p.st.queenThrows++;
  const count = has(p, 'twin') ? 2 : 1;
  const out = [], shown = [];
  for (let i = 0; i < count; i++) {
    let r, faces;
    if (forced) { r = forced; faces = facesFor(r, p.sticks); } else { const o2 = roll(p); r = o2.r; faces = o2.faces; }
    if (has(p, 'twin') && r === '모') { r = '도'; faces = facesFor('도', p.sticks); log(g, `${p.name}: 이도류! 모가 나왔지만 도로 바뀝니다`); }
    out.push(r); shown.push({ res: r, faces });
  }
  announceThrow(g, p, shown);
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
  if (p.alive && p.pieces.some((x) => x.type === 'pawn')) movePawns(g, p);
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
      for (const o of g.players) { if (o === p || !isActive(o)) continue; if (o.pieces.some((x) => !x.done && x.pos === n)) seen.add(o.idx + ':' + n); }
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
  const myPiece = () => { const x = p.pieces.find((y) => y.id === o.pid); if (!x || x.done) throw E('내 말을 선택하세요'); return x; };
  const boardPiece = () => { const x = myPiece(); if (x.pos <= 0) throw E('윷판 위의 내 말을 선택하세요'); return x; };
  const beforeThrow = () => { if (tn.thrown) throw E('이번 차례에 이미 윷을 던져서 사용할 수 없습니다'); };
  const unfrozen = (grp) => { if (grp.some((y) => isFrozen(g, y))) throw E('멈춰 있는 말뭉치입니다'); };
  switch (a) {
    case 'timetravel': {
      once('timetravel'); const x = boardPiece();
      const mir = has(p, 'tianma'); const r = ROUTES[x.route]; const i = r.indexOf(mir ? mirNode(x.pos) : x.pos);
      const target = o.target != null ? o.target : o.node;
      const allowed = [0, ...r.slice(0, i).map((n) => (mir ? mirNode(n) : n))];
      if (!allowed.includes(target)) throw E('그 칸으로는 되돌아갈 수 없습니다');
      if (target === 0) sendHome(x); else x.pos = target;
      p.used.timetravel = true; log(g, `${p.name}: 시간 여행! 말이 ${target === 0 ? '대기칸' : target + '번 칸'}으로`);
      break;
    }
    case 'shield': {
      once('shield'); const x = boardPiece();
      p.pieces.filter((y) => !y.done && y.pos === x.pos).forEach((y) => { y.shield = true; });
      p.used.shield = true; log(g, `${p.name}: 천상의 보호막!`);
      break;
    }
    case 'sacrifice': {
      once('sacrifice'); const x = boardPiece();
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
    case 'truck': {
      once('truck'); beforeThrow(); const x = boardPiece(); const grp = groupOf(p, x);
      if (grp.length < 2) throw E('말이 2개 이상인 말뭉치를 고르세요');
      unfrozen(grp);
      const occ = occupiedSet(g); let cnt = 0;
      const line = straightPath(grp[0], has(p, 'tianma'));
      for (const nd of line) {
        if (occ.has(nd)) break;
        cnt++;
        if (g.poops.some((q) => q.node === nd && q.owner !== p.idx)) break;
      }
      if (cnt === 0) throw E('앞이 막혀 있습니다');
      p.used.truck = true; tn.throws = 0;
      log(g, `${p.name}: 🚚 8톤 트럭 출동!`);
      applyMove(g, p, grp, cnt, '8톤 트럭', { mv: { finished: false, nodes: line.slice(0, cnt), route: grp[0].route } });
      break;
    }
    case 'combo': {
      once('combo'); beforeThrow(); const x = boardPiece(); const grp = groupOf(p, x);
      if (grp.length < 3) throw E('말이 3개 이상인 말뭉치를 고르세요');
      const keep = new Set(grp.map((y) => y.id));
      p.used.combo = true; tn.throws = 0;
      log(g, `${p.name}: 3단 합체 필살기!!!`);
      for (const q of g.players) {
        if (!isActive(q)) continue;
        const st = stacksOf(q);
        for (const n of Object.keys(st)) {
          const s = st[n]; if (s.some((y) => keep.has(y.id))) continue;
          if (q === p) killStack(g, p, s, null); else augKill(g, q, s, p);
        }
      }
      break;
    }
    case 'flick': {
      once('flick'); beforeThrow(); const x = boardPiece();
      let tp = null, tq = null;
      for (const q of g.players) { if (q === p || !isActive(q)) continue; const y = q.pieces.find((z) => z.id === o.tpid && !z.done && z.pos > 0); if (y) { tp = y; tq = q; } }
      if (!tp) throw E('노릴 적 말을 선택하세요');
      p.used.flick = true; tn.throws = 0;
      const r = Math.random();
      if (r < 0.5) { log(g, `${p.name}: 🪨 알까기 명중!`); augKill(g, tq, tq.pieces.filter((z) => !z.done && z.pos === tp.pos), p); }
      else if (r < 0.85) log(g, `${p.name}: 🪨 알까기... 빗나갔습니다`);
      else { log(g, `${p.name}: 🪨 알까기... 자기 말이 판 밖으로 떨어졌습니다!`); killStack(g, p, groupOf(p, x), null); }
      break;
    }
    case 'goblin': {
      need('goblin'); const x = myPiece();
      if (x.type !== 'goblin') throw E('도깨비를 선택하세요');
      if (tn.goblin) throw E('이번 차례에 이미 도깨비를 움직였습니다');
      const grp = groupOf(p, x); unfrozen(grp);
      const steps = o.dir === -1 ? -1 : 1;
      const mv = moveFor(grp, steps, has(p, 'tianma'));
      if (!mv) throw E('그쪽으로는 움직일 수 없습니다');
      tn.goblin = true;
      applyMove(g, p, grp, steps, steps > 0 ? '도깨비 도' : '도깨비 백도', { mv });
      break;
    }
    case 'cannon': {
      need('cannon'); const x = myPiece();
      if (x.type !== 'cannon') throw E('포를 선택하세요');
      if (tn.cannon) throw E('이번 차례에 이미 포를 움직였습니다');
      const grp = groupOf(p, x); unfrozen(grp);
      const path = straightPath(grp[0], has(p, 'tianma')); const t = path.indexOf(Number(o.node));
      if (t < 0) throw E('갈 수 없는 칸입니다 (포는 가는 방향의 직선, 벽까지만 갈 수 있습니다)');
      const occ = occupiedSet(g);
      const screens = path.slice(0, t).filter((n) => occ.has(n)).length;
      if (screens !== 1) throw E('말이 있는 칸을 정확히 하나만 넘어야 합니다');
      tn.cannon = true;
      applyMove(g, p, grp, t + 1, '포', { mv: { finished: false, nodes: path.slice(0, t + 1), route: grp[0].route } });
      break;
    }
    case 'domain': {
      once('domain'); const x = boardPiece();
      p.used.domain = true; p.st.domain = { pid: x.id, left: 2, armed: false };
      x.frozen = 1e9;
      log(g, `${p.name}: 영역 전개! 말 하나가 움직일 수 없게 됩니다. 두 차례 살아남으면 승리, 죽으면 탈락`);
      break;
    }
    case 'fog': once('fog'); p.used.fog = true; g.fog = { owner: p.idx, left: 2 }; log(g, `${p.name}: 🌫 안개가 깔립니다`); break;
    case 'aim': {
      once('aim'); const t = otherTarget(g, p, o.target);
      p.used.aim = true;
      const ar = rollFaces(4); const r = ar.r;
      announceThrow(g, p, [{ res: r, faces: ar.faces }], '조준');
      if (['걸', '윷', '모'].includes(r)) { t.st.skip += 2; log(g, `${p.name}: 윷을 던져 ${t.name}을(를) 맞췄다! (${r}) ${t.name}은(는) 두 차례 쉽니다`); }
      else log(g, `${p.name}: 윷을 던졌지만 ${t.name}을(를) 빗나갔습니다 (${r})`);
      break;
    }
    case 'necro': {
      once('necro'); const t = g.players[o.target];
      if (!t || t.alive) throw E('탈락한 플레이어를 선택하세요');
      p.used.necro = true;
      t.alive = true; t.out = false; t.finished = 0; t.st.skip = 0; makePieces(t);
      g.elim = g.elim.filter((i) => i !== t.idx);
      if (g.hpOn) t.hp = 3;
      p.st.bound.push(t.idx);
      log(g, `${p.name}: 💀 네크로맨서! ${t.name}이(가) 부활했습니다`);
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
  if (!isActive(p)) throw E('탈락했습니다');
}
function startTurn(g, idx, second) {
  g.phase = 'turn'; g.cur = idx;
  const p = g.players[idx];
  g.tn = { queue: [...p.st.bank], throws: 1, counts: {}, thrown: false, second: !!second };
  if (p.st.bank.length) log(g, `${p.name}: 보관한 개 ${p.st.bank.length}개 사용 가능`);
  p.st.bank = [];
  if (p.st.skip > 0) {
    p.st.skip--; g.tn.queue = []; g.tn.throws = 0;
    log(g, `⏭ ${p.name}: 차례를 건너뜁니다`);
    endTurn(g); return;
  }
  for (const node of p.st.snipers) {
    log(g, `🎯 ${p.name}의 저격! ${node}번 칸`);
    for (const o of g.players) { if (!isActive(o)) continue; const st = o.pieces.filter((x) => !x.done && x.pos === node); if (st.length) augKill(g, o, st, p); }
  }
  p.st.snipers = [];
  const z = p.pieces.filter((x) => x.type === 'zealot' && !x.done && x.pos > 0).length;
  if (has(p, 'summon') && z) { p.st.ritual += z; log(g, `${p.name}: 의식 코인 +${z} (${p.st.ritual}/12)`); }
  log(g, `▶ ${g.round}라운드 - ${p.name}의 차례${second ? ' (두 번째)' : ''}`);
  checkWins(g);
  if (g.phase === 'turn') normalizeTurn(g);
}
function normalizeTurn(g) {
  if (g.phase !== 'turn') return;
  const p = g.players[g.cur];
  if (!isActive(p)) { endTurn(g); return; }
  if (g.tn.throws > 0) return;
  g.tn.queue = g.tn.queue.filter((r) => usable(g, p, r));
  if (!g.tn.queue.length) endTurn(g);
}
function afterAction(g) { checkWins(g); if (g.phase === 'turn') normalizeTurn(g); }
function endTurn(g) {
  const p = g.players[g.cur];
  if (isActive(p) && p.st.lastDance) { log(g, `${p.name}: 라스트 댄스가 끝났습니다. 탈락`); eliminate(g, p); }
  p.st.poison = false; p.st.lastDance = false;
  if (isActive(p)) {
    if (p.st.kimLeft > 0) p.st.kimLeft--;
    const d = p.st.domain;
    if (d) {
      if (!d.armed) d.armed = true;
      else { d.left--; if (d.left <= 0) { p.st.domainWon = true; const x = p.pieces.find((y) => y.id === d.pid); if (x) x.frozen = 0; p.st.domain = null; } }
    }
  }
  if (g.fog && g.fog.owner === p.idx) { g.fog.left--; if (g.fog.left <= 0) { g.fog = null; log(g, '🌫 안개가 걷혔습니다'); } }
  g.duels = g.duels.filter((d) => {
    if (d.t !== p.idx) return true;
    d.left--;
    if (d.left <= 0) { log(g, `승부다! ${p.name}은(는) 세 차례 안에 완주하지 못했습니다`); if (isActive(p)) eliminate(g, p); return false; }
    return true;
  });
  checkWins(g);
  if (g.phase === 'ended') return;
  if (g.echo && !g.tn.second && isActive(p)) { log(g, `🔁 메아리! ${p.name}의 차례가 한 번 더 옵니다`); startTurn(g, g.cur, true); return; }
  const ord = g.order || g.players.map((q) => q.idx); const n = ord.length; let nxt = -1, wrap = false;
  const ci = ord.indexOf(g.cur);
  for (let k = 1; k <= n; k++) { const pj = (ci + k) % n; const j = ord[pj]; if (isActive(g.players[j])) { nxt = j; wrap = pj <= ci; break; } }
  if (nxt < 0) { checkWins(g); return; }
  if (wrap) {
    g.round++; expireDisguises(g);
    if (g.round > MAX_ROUND) { timeUp(g); return; }
    if (ROUND_PICKS[g.round]) { startPick(g); return; }
  }
  startTurn(g, nxt);
}
function eliminate(g, p) {
  if (!p.alive) return;
  p.alive = false; p.pieces = []; p.out = false;
  g.elim.push(p.idx);
  g.duels = g.duels.filter((d) => d.t !== p.idx && d.ch !== p.idx);
  log(g, `❌ ${p.name} 탈락`);
  for (const q of g.players) if (q.alive && q.st.leechTo === p.idx) { log(g, `🪱 거머리! ${q.name}도 함께 탈락합니다`); eliminate(g, q); }
}
// 게임 중 방을 나간 플레이어: 탈락 처리하고 진행이 멈추지 않게 이어줌
function forfeit(g, p) {
  if (!p.alive || g.phase === 'lobby' || g.phase === 'ended') return;
  log(g, `🚪 ${p.name}이(가) 방을 나갔습니다`);
  const wasCur = g.phase === 'turn' && g.cur === p.idx;
  const pk = g.pick; const wasPicker = g.phase === 'pick' && pk && pk.stage === 'resolve' && picker(g) === p;
  eliminate(g, p);
  if (pk && pk.sub) {
    const s = pk.sub;
    if (s.pending) s.pending = s.pending.filter((i) => i !== p.idx);
    if (s.type === 'guess' && !s.pending.length) { pk.sub = null; afterPick(g); return; }
    if (s.type === 'vote' && !s.pending.length) {
      pk.sub = null; afterPick(g); return;
    }
  }
  checkWins(g);
  if (g.phase === 'ended') return;
  if (wasCur) endTurn(g);
  else if (wasPicker) { if (pk.sub) pk.sub = null; afterPick(g); }
  else if (g.phase === 'pick' && pk && pk.stage === 'choose' && Object.keys(pk.left).every((i) => pk.left[i] <= 0 || !isActive(g.players[i]))) startResolve(g);
}
function undoWins(g) {
  if (!g.ranks.length) { log(g, '취~소! 취소할 승리가 없었습니다'); return; }
  for (const i of g.ranks) { const q = g.players[i]; q.out = false; if (q.stash) { q.pieces = q.stash; q.stash = null; } }
  log(g, `취~소! ${g.ranks.map((i) => g.players[i].name).join(', ')}의 승리가 취소되었습니다`);
  g.ranks = [];
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
  const real = p.pieces.filter((x) => x.type !== 'queen');
  if (real.length && real.every((x) => x.done)) return '모든 말 완주';
  if (has(p, 'marathon') && p.pieces.some((x) => x.type === 'marathon' && x.done)) return '마라토너 완주';
  if (has(p, 'kim') && p.st.kimLeft > 0 && p.pieces.some((x) => x.type === 'kim' && x.done)) return '김첨지가 제때 완주';
  if (has(p, 'queen') && p.st.queenThrows >= 12 && p.pieces.some((x) => x.type === 'queen' && !x.done)) return '중전마마를 지켜냈다';
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
  if (p.st.domainWon) return '영역 전개 - 살아남았다';
  return null;
}
function checkWins(g) {
  if (g.phase === 'ended' || g.phase === 'lobby') return;
  for (const p of g.players) {
    const d = p.st.domain;
    if (d && isActive(p)) { const x = p.pieces.find((y) => y.id === d.pid); if (!x || x.pos === 0) { log(g, `${p.name}: 영역이 깨졌습니다`); p.st.domain = null; eliminate(g, p); } }
  }
  const start = g.phase === 'turn' ? g.cur : 0;
  const n = g.players.length;
  for (let k = 0; k < n; k++) {
    const p = g.players[(start + k) % n];
    if (!isActive(p)) continue;
    const r = winReason(g, p);
    if (r) { declareWin(g, p, r); if (g.phase === 'ended') return; }
  }
  const act = activeList(g);
  if (g.ranking) { if (act.length <= 1) finalize(g); }
  else if (act.length === 1) endGame(g, act[0], '최후의 생존자');
  else if (act.length === 0) finalize(g);
}
function declareWin(g, p, reason) {
  const co = g.players.filter((q) => q !== p && isActive(q) && q.st.bound.includes(p.idx));
  if (!g.ranking) {
    g.coWinners = co.map((q) => q.idx);
    endGame(g, p, reason);
    return;
  }
  for (const w of [p, ...co]) {
    w.out = true; w.stash = w.pieces; w.pieces = [];
    g.ranks.push(w.idx);
    log(g, `🏅 ${w.name} ${g.ranks.length}위 확정! (${w === p ? reason : '운명 공동체'})`);
  }
}
function finalize(g) {
  const fixedIdx = new Set(Object.values(g.fixed));
  let list = [...g.ranks, ...activeList(g).map((p) => p.idx), ...g.elim.slice().reverse()].filter((i, k, a) => a.indexOf(i) === k && !fixedIdx.has(i));
  Object.keys(g.fixed).map(Number).sort((a, b) => a - b).forEach((r) => list.splice(Math.min(r - 1, list.length), 0, g.fixed[r]));
  list = list.filter((i, k, a) => a.indexOf(i) === k);
  let reason = '순위 확정';
  const planner = g.players.find((q) => q.st.plan && q.st.plan.length === list.length && q.st.plan.every((v, k) => v === list[k]));
  if (planner) {
    g.planWin = planner.idx;
    list = [planner.idx, ...list.filter((i) => i !== planner.idx)];
    reason = `${planner.name}: 계획대로! 순위를 모두 맞춰 혼자 승리`;
  }
  endGame(g, g.players[list[0]], reason, list);
}
const MAX_ROUND = 40;
function progressOf(p) {
  let s = p.finished * 100;
  for (const x of p.pieces) if (!x.done && x.pos > 0) s += ROUTES[x.route].indexOf(vpos(p, x)) + 1;
  return s;
}
function timeUp(g) {
  log(g, `⏰ ${MAX_ROUND}라운드가 지나 시간 종료! 진행도로 순위를 정합니다`);
  const act = activeList(g).sort((a, b) => progressOf(b) - progressOf(a));
  if (!g.ranking) { if (act.length) endGame(g, act[0], '시간 종료 - 가장 앞선 플레이어'); else finalize(g); return; }
  for (const p of act) { p.out = true; p.stash = p.pieces; p.pieces = []; g.ranks.push(p.idx); }
  finalize(g);
}
function endGame(g, p, reason, final) {
  g.phase = 'ended'; g.winner = p.idx; g.reason = reason; g.pick = null; g.final = final || null;
  log(g, `🏆 ${p.name} 승리! (${reason})`);
}

// ---------- 클라이언트용 뷰 ----------
function pubSt(q, mine) {
  const s = q.st;
  return {
    dogs: s.dogs, coins: s.coins, ritual: s.ritual, kills: s.kills, gul: s.gul, seen: s.seen, backdoCaps: s.backdoCaps,
    nextChoose: s.nextChoose, lastDance: s.lastDance, poison: s.poison, garlicGot: s.garlicGot,
    garlic: mine ? s.garlicSeen.filter((n) => !s.garlicGot.includes(n)) : s.garlic.length, snipers: mine ? s.snipers : s.snipers.length,
    friendHits: s.friendHits, bank: s.bank.length, ejiri: s.ejiri, skip: s.skip, queenLives: s.queenLives, queenThrows: s.queenThrows,
    kimLeft: s.kimLeft, domain: s.domain ? { left: s.domain.left, armed: s.domain.armed } : null, leechTo: s.leechTo, bound: s.bound,
    plan: mine ? s.plan : !!s.plan,
  };
}
function visibleNodes(viewer) {
  const seen = new Set(); let frontier = [];
  viewer.pieces.forEach((x) => { if (!x.done && x.pos > 0) { seen.add(x.pos); frontier.push(x.pos); } });
  for (let d = 0; d < 2; d++) {
    const nx = [];
    frontier.forEach((n) => (NEI[n] ? [...NEI[n]] : []).forEach((m) => { if (!seen.has(m)) { seen.add(m); nx.push(m); } }));
    frontier = nx;
  }
  return seen;
}
function pubSub(sub) {
  if (!sub) return null;
  const s = { ...sub };
  if (s.votes) { s.voted = Object.keys(s.votes).map(Number); delete s.votes; }
  if (s.answered) { s.answered = Object.keys(s.answered).map(Number); }
  return s;
}
function viewFor(g, me) {
  const pk = g.pick;
  const hideColors = !!(pk && pk.sub && pk.sub.type === 'guess');
  const fogOn = !!(g.fog && g.fog.owner !== me.idx && g.phase !== 'ended');
  const vis = fogOn ? visibleNodes(me) : null;
  return {
    code: g.code, phase: g.phase, chaos: g.chaos, ranking: g.ranking, round: g.round, cur: g.cur, winner: g.winner, reason: g.reason,
    me: me.idx, ganTaek: g.ganTaek, poops: g.poops.map((q) => q.node), hpOn: g.hpOn, echo: g.echo,
    fog: g.fog ? { owner: g.fog.owner, left: g.fog.left } : null, final: g.final, ranks: g.ranks, coWinners: g.coWinners, planWin: g.planWin,
    party: g.party.filter((q) => q.owner === me.idx).map((q) => ({ node: q.node, kind: q.kind })),
    duels: g.duels.map((d) => ({ ch: d.ch, t: d.t, left: d.left })),
    players: g.players.map((q) => ({
      idx: q.idx, name: q.name, color: hideColors ? '#8a8f9e' : q.color, colorName: hideColors ? '?' : q.colorName, connected: q.connected, alive: q.alive, out: q.out, fixedRank: q.fixedRank, hp: q.hp,
      augs: q.augs, used: q.used, npieces: q.pieces.length || q.npieces, sticks: q.sticks, finished: q.finished,
      pieces: q.pieces.map((x) => {
        const hidden = vis && q !== me && !x.done && x.pos > 0 && !vis.has(x.pos);
        return { id: x.id, pos: hidden ? -2 : x.pos, route: x.route, done: x.done, type: x.type, shield: x.shield, frozen: x.frozen > g.round };
      }),
      st: pubSt(q, q === me),
    })),
    tn: g.tn && g.phase === 'turn' ? { queue: g.tn.queue, throws: g.tn.throws, thrown: g.tn.thrown, goblin: !!g.tn.goblin, cannon: !!g.tn.cannon } : null,
    pick: pk ? { kind: pk.kind, stage: pk.stage, picker: pk.cur, left: pk.left, done: pk.order.filter((i) => pk.left[i] <= 0 || !isActive(g.players[i])), sub: pubSub(pk.sub), banned: pk.banned.map((b) => b.id), pending: pk.queue.map((q) => q.idx), mine: pk.chosen[me.idx] || [], options: pk.stage === 'choose' ? (pk.opts[me.idx] || null) : null } : null,
    order: g.order || g.players.map((q) => q.idx),
    log: g.log.slice(-40), logN: g.logN || 0, lastThrow: g.lastThrow || null,
  };
}

module.exports = {
  AUGMENTS, BY_ID, ROUTES, LINES, STEPS, RES, ROUND_PICKS,
  createGame, addPlayer, removePlayer, resetGame, startGame,
  actPick, actSub, actGuess, actVote, forfeit, actThrow, actMove, actAbility, viewFor,
  _internal: { has, usable, stacksOf, picker, isActive, endTurn },
};
