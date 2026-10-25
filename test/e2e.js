'use strict';
// 서버를 띄우고 WebSocket 봇 3명이 한 판을 끝까지 플레이
const { spawn } = require('child_process');
const WebSocket = require('ws');
const sample = (a) => a[Math.floor(Math.random() * a.length)];
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: '3917' }, cwd: __dirname + '/..' });
let meta;
setTimeout(() => {
  const bots = [];
  let code = null; let done = false; let errs = 0; let msgs = 0;
  const mk = (i) => {
    const ws = new WebSocket('ws://localhost:3917');
    const b = { ws, i, S: null, busy: 0 };
    ws.on('open', () => ws.send(JSON.stringify(i === 0 ? { t: 'create', name: 'B0', token: 'tok0' } : { t: 'join', code, name: 'B' + i, token: 'tok' + i })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw); msgs++;
      if (m.t === 'joined') { meta = m.meta; if (i === 0) { code = m.code; mk(1); mk(2); } }
      if (m.t === 'err') { errs++; console.log('서버 에러:', m.msg); if (b.S) setTimeout(() => act(b), 0); }
      if (m.t === 'state') { b.S = m.s; act(b); }
    });
    bots.push(b);
  };
  const send = (b, o) => b.ws.send(JSON.stringify(o));
  function act(b) {
    const S = b.S; const me = S.players[S.me];
    if (S.phase === 'lobby') { if (S.me === 0 && S.players.length === 3 && !b.started && Date.now() > 0) { b.started = true; send(b, { t: 'chaos', v: true }); send(b, { t: 'ranking', v: true }); send(b, { t: 'start' }); } return; }
    if (S.phase === 'ended') { if (!done) { done = true; console.log('종료:', S.players[S.winner].name, S.reason, '| 서버 에러 응답 수', errs, '| 메시지', msgs); bots.forEach((x) => x.ws.close()); srv.kill(); setTimeout(() => process.exit(0), 100); } return; }
    if (S.phase === 'pick') {
      const sub = S.pick.sub;
      if (sub && sub.type === 'guess') return sub.pending.includes(S.me) && send(b, { t: 'guess', value: Math.floor(Math.random() * 4) });
      if (sub && sub.type === 'vote') return sub.pending.includes(S.me) && send(b, { t: 'vote', value: sample(S.players.filter((p) => p.idx !== S.me && p.alive && !p.out)).idx });
      if (S.pick.picker !== S.me) return;
      if (sub) {
        const others = S.players.filter((p) => p.idx !== S.me && p.alive && !p.out);
        const v = { player: () => sample(others).idx, augment: () => sample(meta.augments).id, owned: () => sample(sub.list), fold: () => sample(['R', 'L', 'T', 'B']), spin: () => 'keep', rank: () => sample(S.players.filter((p) => !sub.picks.includes(p.idx))).idx }[sub.type]();
        return send(b, { t: 'sub', value: v });
      }
      return send(b, { t: 'pick', id: sample(S.pick.options.filter((o) => !o.locked)).id });
    }
    if (S.cur !== S.me) return;
    if (S.tn.throws > 0) { const o = { t: 'throw' }; if (me.st.nextChoose) o.choose = sample(['도', '개', '걸', '윷', '모']); else if (me.augs.includes('dogpig')) o.choose = sample(['도', '개']); return send(b, o); }
    const tries = []; S.tn.queue.forEach((r, ri) => me.pieces.forEach((x) => { if (!x.done) tries.push([ri, x.id]); }));
    const [ri, pid] = sample(tries); send(b, { t: 'move', ri, pid });
  }
  mk(0);
  setTimeout(() => {
    const w = new WebSocket('ws://localhost:3917'); let n = 0;
    w.on('open', () => w.send(JSON.stringify({ t: 'join', code, name: 'Tmp', token: 'tmp' })));
    w.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'state' && n++ === 0) { console.log('임시 입장: 인원', m.s.players.length); w.send(JSON.stringify({ t: 'leave' })); } if (m.t === 'left') { console.log('방 나가기 확인'); w.close(); } });
  }, 300);
  setTimeout(() => { if (!done) { console.log('시간 초과 (미종료)'); srv.kill(); process.exit(1); } }, 60000);
}, 800);
srv.stdout.on('data', (d) => process.stdout.write(d));
srv.stderr.on('data', (d) => process.stderr.write(d));
