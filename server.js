'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('./game');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer((req, res) => {
  let f = req.url.split('?')[0];
  if (f === '/api/meta') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify({ augments: G.AUGMENTS, packs: G.PACKS, rules: G.RULES })); }
  if (f === '/') f = '/index.html';
  const full = path.normalize(path.join(PUB, f));
  if (!full.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> { g, conns: Map(player -> ws) }

function genCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
    if (!rooms.has(c)) return c;
  }
}
const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

function broadcast(room) {
  for (const [p, ws] of room.conns) send(ws, { t: 'state', s: G.viewFor(room.g, p) });
}

function attach(room, p, ws) {
  const old = room.conns.get(p);
  if (old && old !== ws) { old.ctx = null; try { old.close(); } catch (e) { /* */ } }
  room.conns.set(p, ws); p.connected = true;
  ws.ctx = { room, p };
  send(ws, { t: 'joined', code: room.g.code, token: p.token, meta: { augments: G.AUGMENTS, packs: G.PACKS, rules: G.RULES, routes: G.ROUTES, lines: G.LINES } });
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    try {
      if (m.t === 'create' || m.t === 'join') {
        const token = String(m.token || Math.random().toString(36).slice(2));
        let room;
        if (m.t === 'create') {
          const code = genCode(); room = { g: G.createGame(code), conns: new Map() }; rooms.set(code, room);
        } else {
          room = rooms.get(String(m.code || '').toUpperCase());
          if (!room) throw new Error('방을 찾을 수 없습니다');
        }
        let p = room.g.players.find((q) => q.token === token);
        if (!p) p = G.addPlayer(room.g, m.name, token); else if (m.name && room.g.phase === 'lobby') p.name = String(m.name).slice(0, 10);
        p.token = token;
        attach(room, p, ws); broadcast(room);
        return;
      }
      if (!ws.ctx) throw new Error('먼저 방에 입장하세요');
      const { room, p } = ws.ctx; const g = room.g;
      switch (m.t) {
        case 'leave': {
          room.conns.delete(p); ws.ctx = null; p.connected = false;
          send(ws, { t: 'left' });   // 나가기는 어떤 상황에서도 먼저 성공 처리
          try { if (g.phase === 'lobby') G.removePlayer(g, p); else G.forfeit(g, p); } catch (e) { console.error('leave error', e.message); }
          try { G.unstick(g); } catch (e) { /* */ }
          if (room.conns.size === 0) setTimeout(() => { if (room.conns.size === 0) rooms.delete(g.code); }, 30 * 60 * 1000);
          broadcast(room);
          return;
        }
        case 'chaos': if (p.idx !== 0 || g.phase !== 'lobby') throw new Error('방장만 로비에서 설정할 수 있습니다'); g.chaos = !!m.v; break;
        case 'packs': if (p.idx !== 0) throw new Error('방장만 로비에서 설정할 수 있습니다'); G.setPacks(g, m.ids); break;
        case 'ranking': if (p.idx !== 0 || g.phase !== 'lobby') throw new Error('방장만 로비에서 설정할 수 있습니다'); g.ranking = !!m.v; break;
        case 'guess': G.actGuess(g, p, m.value); break;
        case 'vote': G.actVote(g, p, m.value); break;
        case 'start': if (p.idx !== 0) throw new Error('방장만 시작할 수 있습니다'); if (g.phase !== 'lobby') throw new Error('이미 시작됨'); G.startGame(g); break;
        case 'pick': G.actPick(g, p, m.id); break;
        case 'sub': G.actSub(g, p, m.value); break;
        case 'throw': G.actThrow(g, p, { choose: m.choose, coin: !!m.coin }); break;
        case 'move': G.actMove(g, p, m.ri, m.pid, m); break;
        case 'interrupt': G.actInterrupt(g, p, m); break;
        case 'ability': G.actAbility(g, p, m.a, m); break;
        case 'rematch': if (g.phase !== 'ended') throw new Error('게임이 끝나지 않았습니다'); G.resetGame(g); break;
        default: return;
      }
      try { G.unstick(g); } catch (e2) { /* */ }
      broadcast(room);
    } catch (e) {
      send(ws, { t: 'err', msg: e.message });
    }
  });
  ws.on('close', () => {
    if (!ws.ctx) return;
    const { room, p } = ws.ctx;
    if (room.conns.get(p) !== ws) return;
    room.conns.delete(p); p.connected = false;
    if (room.g.phase === 'lobby') { G.removePlayer(room.g, p); }
    if (room.conns.size === 0) { setTimeout(() => { if (room.conns.size === 0) rooms.delete(room.g.code); }, 30 * 60 * 1000); }
    broadcast(room);
  });
});

// 막힌 차례 자동 해소(안전장치)
setInterval(() => { for (const room of rooms.values()) { try { if (G.unstick(room.g)) broadcast(room); } catch (e) { /* */ } } }, 3000);

server.listen(PORT, () => console.log(`증강 윷놀이 v1.13 서버 실행 중: http://localhost:${PORT}`));
