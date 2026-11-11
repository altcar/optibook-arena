/**
 * End-to-end smoke test for a running Optibook Arena deployment.
 *
 *   node scripts/smoke.mjs
 *   node scripts/smoke.mjs https://optibook-arena.hheylau.workers.dev
 *
 * Requires Node 22+ for the global WebSocket/EventSource APIs.
 */

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const wsUrl = base.replace(/^http/, 'ws') + '/ws';

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function getJson(path) {
  const response = await fetch(base + path);
  if (!response.ok) fail(`${path} returned HTTP ${response.status}`);
  return response.json();
}

const health = await getJson('/api/health');
if (!health.ok) fail('health check did not return ok');
const state = await getJson('/api/state');
if (state.instruments?.length !== 10) fail(`expected 10 instruments, got ${state.instruments?.length}`);
if (state.strategies?.length !== 6) fail(`expected 6 strategies, got ${state.strategies?.length}`);
if (!state.instruments.every((i) => i.book?.bids?.length && i.book?.asks?.length)) {
  fail('one or more instruments returned an incomplete book');
}
console.log(`✓ REST  equity=$${state.stats.equity.toFixed(2)} tick=${state.stats.tick} instruments=${state.instruments.length}`);

const ws = new WebSocket(wsUrl);
let snapshots = 0;
let ticks = 0;
let pongs = 0;

const timeout = setTimeout(() => fail('WebSocket timed out'), 20_000);
ws.onerror = (event) => fail(`WebSocket error: ${event.message || 'unknown'}`);
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'ping' }));
};
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'snapshot') {
    snapshots++;
    if (message.instruments.length !== 10) fail('snapshot did not include 10 instruments');
  }
  if (message.type === 'tick') ticks++;
  if (message.type === 'pong') pongs++;
  if (snapshots >= 1 && ticks >= 2 && pongs >= 1) {
    clearTimeout(timeout);
    console.log(`✓ WS    snapshot=${snapshots} ticks=${ticks} pong=${pongs}`);
    ws.close();
    process.exit(0);
  }
};
