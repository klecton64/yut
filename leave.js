'use strict';
// 방 나가기 테스트: 로비에서 나가면 자리가 비고, 게임 중 나가면 탈락 처리되어 게임이 계속됨
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: '3918' }, cwd: __dirname + '/..' });
const open = (first) => new Promise((res) => { const w = new WebSocket('ws://localhost:3918'); w.msgs = []; w.on('message', (r) => w.msgs.push(JSON.parse(r))); w.on('open', () => { w.send(JSON.stringify(first)); setTimeout(() => res(w), 150); }); });
const last = (w, t) => [...w.msgs].reverse().find((m) => m.t === t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(700);
  const a = await open({ t: 'create', name: 'A', token: 'ta' });
  const code = last(a, 'joined').code;
  const b = await open({ t: 'join', code, name: 'B', token: 'tb' });
  const c = await open({ t: 'join', code, name: 'C', token: 'tc' });
  assert.strictEqual(last(a, 'state').s.players.length, 3);
  b.send(JSON.stringify({ t: 'leave' })); await sleep(200);
  assert(last(b, 'left'), 'B 에게 left 응답');
  assert.strictEqual(last(a, 'state').s.players.length, 2, '로비에서 나가면 인원 감소');
  assert.deepStrictEqual(last(a, 'state').s.players.map((p) => p.name), ['A', 'C']);
  a.send(JSON.stringify({ t: 'start' })); await sleep(200);
  assert.strictEqual(last(a, 'state').s.phase, 'pick');
  c.send(JSON.stringify({ t: 'leave' })); await sleep(200);
  const s = last(a, 'state').s;
  assert.strictEqual(s.phase, 'ended', '2인 게임에서 한 명이 나가면 남은 사람 승리');
  assert.strictEqual(s.winner, 0);
  console.log('방 나가기 테스트 통과');
  srv.kill(); process.exit(0);
})().catch((e) => { console.log('FAIL', e.message); srv.kill(); process.exit(1); });
