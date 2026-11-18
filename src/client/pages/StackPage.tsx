import { Link } from '../router';
import { PageShell } from '../shell';
import { Icon } from '../components/Icons';

const LAYERS = [
  {
    name: 'Market simulator',
    file: 'src/worker/market.ts',
    body: 'Ten instruments. Five stocks and five dual listings. Mean-reverting basis, synthetic order books, volatility shocks, news impulses and a 360-tick price history.',
    icon: 'activity',
  },
  {
    name: 'Matching broker',
    file: 'src/worker/broker.ts',
    body: 'Owner-scoped books, position caps, market/limit/IOC execution, aggressive synthetic flow, order merging and per-book P&L. One account cannot consume another account\'s risk budget.',
    icon: 'layers',
  },
  {
    name: 'Strategy runtime',
    file: 'src/worker/strategies.ts',
    body: 'Six ported strategy families. Each gets a context with prices, history, sentiment, inventory, room and a namespaced book. The same code runs for the house desk and for user accounts.',
    icon: 'bolt',
  },
  {
    name: 'Bot interpreter',
    file: 'src/worker/bots.ts',
    body: 'Uploaded JSON is validated and interpreted. Family templates map to native logic; custom bots use a 7-field trigger DSL and two action types. No eval, no arbitrary code, no network.',
    icon: 'shield',
  },
  {
    name: 'Arena Durable Object',
    file: 'src/worker/engine.ts',
    body: 'One authoritative tick loop at 4 Hz. Sessions, accounts, bots, seasons, tournaments, forum, newsletter, WebSocket fan-out and persistence all live behind a single serialized object.',
    icon: 'clock',
  },
  {
    name: 'Client terminal',
    file: 'src/client',
    body: 'React 19 + Vite. A live WebSocket snapshot, price charts, order book, trade tape, ticket, positions, strategy lab, bot console, leaderboard and public site.',
    icon: 'news',
  },
];

const FLOW = [
  ['Upload', 'POST /api/bots with a JSON spec. Validation rejects malformed fields before a bot exists.'],
  ['Tick', 'Every 250 ms the engine moves the market, runs active strategies and bots, then matches resting orders.'],
  ['Score', 'Per-book P&L is marked to mid. Every 600 ticks a bot round is recorded for win rate and Sharpe.'],
  ['Broadcast', 'Each WebSocket gets a personalised snapshot/tick: only its own positions, orders, bots and equity curve.'],
  ['Persist', 'Market, broker and platform state are written to Durable Object storage on a cadence and at rest.'],
];

export default function StackPage() {
  return (
    <PageShell>
      <div className="content-wrap">
        <header className="stack-head">
          <span className="eyebrow">The Stack</span>
          <h1>A trading arena that fits in one Durable Object.</h1>
          <p>
            No market-data vendor, no execution venue, no container fleet. A deterministic synthetic market, an
            owner-scoped broker and a declarative bot interpreter run inside a single Cloudflare Durable Object.
          </p>
          <div className="hero-actions">
            <Link to="/docs/bots" className="btn btn-primary">
              Bot upload spec
            </Link>
            <a href="https://github.com/altcar/optibook-arena" target="_blank" rel="noreferrer" className="btn btn-outline">
              View source
            </a>
          </div>
        </header>

        <section className="stack-diagram">
          <div className="stack-column">
            <span className="stack-label">CLIENT</span>
            <div className="stack-node">React terminal + public site</div>
            <div className="stack-node">WebSocket feed · REST actions</div>
          </div>
          <div className="stack-arrow">→</div>
          <div className="stack-column">
            <span className="stack-label">EDGE</span>
            <div className="stack-node">Worker router</div>
            <div className="stack-node">Static assets · SPA fallback</div>
          </div>
          <div className="stack-arrow">→</div>
          <div className="stack-column">
            <span className="stack-label">DURABLE OBJECT</span>
            <div className="stack-node accent">ArenaEngine</div>
            <div className="stack-node">Market · Broker · Bots · Platform</div>
            <div className="stack-node">SQLite-backed storage</div>
          </div>
        </section>

        <section className="stack-layers">
          {LAYERS.map((layer) => (
            <article className="stack-layer" key={layer.name}>
              <div className="feature-icon">
                <Icon name={layer.icon} size={18} />
              </div>
              <div>
                <h3>{layer.name}</h3>
                <code>{layer.file}</code>
                <p>{layer.body}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="stack-flow">
          <div className="section-heading">
            <span className="eyebrow">Request lifecycle</span>
            <h2>One submit, five steps.</h2>
          </div>
          {FLOW.map(([label, body], index) => (
            <div className="flow-step" key={label}>
              <span className="flow-num">{String(index + 1).padStart(2, '0')}</span>
              <h3>{label}</h3>
              <p>{body}</p>
            </div>
          ))}
        </section>

        <section className="stack-safety">
          <div>
            <span className="eyebrow">Safety model</span>
            <h2>Why uploads are data, not code.</h2>
            <p>
              Running arbitrary user code inside a shared Worker isolate would be a security and fairness problem. v1
              accepts only JSON. The validator enforces enums, numeric ranges, array lengths, risk limits and a rule
              budget. The interpreter has no filesystem, network, timers or access to another account's book.
            </p>
          </div>
          <ul>
            <li>✓ PBKDF2 password hashes and HttpOnly sessions</li>
            <li>✓ Per-account namespaced books and separate risk caps</li>
            <li>✓ 256 KB API body limit and 128 KB bot file limit</li>
            <li>✓ Order-rate throttles per bot</li>
            <li>✓ No eval, Function, imports or outbound fetch</li>
            <li>✓ Deterministic scoring from persisted state</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
