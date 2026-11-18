import { Link } from '../router';
import { PageShell } from '../shell';
import { Icon } from '../components/Icons';

const EXAMPLE = `{
  "name": "Basis Hunter",
  "description": "Buy the cheap leg and sell the rich leg above 10 bps.",
  "family": "custom",
  "universe": ["NVDA", "PFE"],
  "params": { "qty": 4 },
  "risk": {
    "maxPosition": 40,
    "maxGross": 60000,
    "maxOrdersPerMin": 20
  },
  "rules": [
    {
      "when": [
        { "field": "basisBps", "op": "gt", "value": 10, "instrument": "NVDA" }
      ],
      "action": {
        "type": "pair",
        "long": "NVDA",
        "short": "NVDA_DUAL",
        "qty": 4
      },
      "cooldownMs": 2000
    }
  ]
}`;

const FAMILIES = [
  ['dual-mm', 'Dual Maker', 'Quotes the stock around the blended stock/dual mid with inventory skew.'],
  ['hedge', 'Pair Hedger', 'Flattens the stock/dual pair when the combined delta leaves a band.'],
  ['dual-arb', 'Dual Arbitrage', 'Trades the basis when the stock/dual spread clears an edge in bps.'],
  ['sentiment-mm', 'News Sentiment', 'Leans or takes liquidity when the synthetic newswire score is strong.'],
  ['momentum-mm', 'Momentum Maker', 'Uses short-horizon momentum and volatility-scaled spreads.'],
  ['adaptive-mm', 'Adaptive Maker', 'Adapts spread to realised volatility and skews with tanh inventory.'],
  ['custom', 'Custom Rules', 'Runs your declarative trigger/action rules against the venue.'],
];

const FIELDS = [
  ['basisBps', 'Dual vs stock basis, already in basis points (10 = 0.10%).'],
  ['changePct', 'Last price vs previous close, in percent.'],
  ['sentiment', 'Rolling news score for the instrument, roughly −1 to +1.'],
  ['momentumBps', '8-tick price change in basis points.'],
  ['spreadBps', 'Current synthetic bid/ask spread in basis points.'],
  ['inventory', 'The bot book\'s signed position in the instrument.'],
  ['priceVsFairBps', 'Mid vs the simulator fair value, in basis points.'],
];

export default function DocsBotsPage() {
  return (
    <PageShell>
      <div className="content-wrap">
        <header className="legal-head">
          <span className="eyebrow">Developer docs · Bot upload spec v1</span>
          <h1>What to upload, and what the engine will do with it.</h1>
          <p>
            A bot is a JSON object. It describes a strategy family, numeric parameters, risk limits, a universe and,
            for custom bots, a small rule set. The engine validates the file before it can trade and interprets it on
            every tick.
          </p>
          <div className="legal-callout">
            <strong>Upload path:</strong> Bot console → drop a <code>.json</code> file → Validate → Deploy. Maximum file
            size 128 KB. Arbitrary Python or JavaScript is not executed in v1.
          </div>
        </header>

        <div className="docs-layout">
          <aside className="legal-toc">
            <h3>Contents</h3>
            <a href="#schema">Schema</a>
            <a href="#families">Families</a>
            <a href="#risk">Risk limits</a>
            <a href="#rules">Custom rules</a>
            <a href="#example">Full example</a>
            <a href="#validation">Validation</a>
            <a href="#faq">FAQ</a>
          </aside>

          <article className="legal-body docs-body">
            <section id="schema">
              <h2>Top-level schema</h2>
              <table className="data-table spec-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>name</code></td>
                    <td>string</td>
                    <td>yes</td>
                    <td>3–40 characters, unique within your account.</td>
                  </tr>
                  <tr>
                    <td><code>description</code></td>
                    <td>string</td>
                    <td>no</td>
                    <td>Up to 280 characters.</td>
                  </tr>
                  <tr>
                    <td><code>family</code></td>
                    <td>enum</td>
                    <td>yes</td>
                    <td>One of the six families or <code>custom</code>.</td>
                  </tr>
                  <tr>
                    <td><code>universe</code></td>
                    <td>string[]</td>
                    <td>yes</td>
                    <td>1–5 of NVDA, CSCO, ING, SAN, PFE.</td>
                  </tr>
                  <tr>
                    <td><code>params</code></td>
                    <td>object</td>
                    <td>no</td>
                    <td>Numeric strategy parameters. Unknown keys warn.</td>
                  </tr>
                  <tr>
                    <td><code>risk</code></td>
                    <td>object</td>
                    <td>no</td>
                    <td>Defaults are applied if omitted.</td>
                  </tr>
                  <tr>
                    <td><code>rules</code></td>
                    <td>array</td>
                    <td>for custom</td>
                    <td>1–12 rules; ignored for template families.</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section id="families">
              <h2>Families &amp; parameters</h2>
              <table className="data-table spec-table">
                <thead>
                  <tr>
                    <th>Family</th>
                    <th>Name</th>
                    <th>Parameters</th>
                    <th>Behaviour</th>
                  </tr>
                </thead>
                <tbody>
                  {FAMILIES.map(([id, name, body]) => (
                    <tr key={id}>
                      <td><code>{id}</code></td>
                      <td>{name}</td>
                      <td className="mono small">
                        {id === 'dual-mm' && 'spread, qty'}
                        {id === 'hedge' && 'threshold, qty'}
                        {id === 'dual-arb' && 'edgeBps, qty'}
                        {id === 'sentiment-mm' && 'spread, qty, takeThreshold'}
                        {id === 'momentum-mm' && 'spread, qty, horizon, bias, thresholdBps'}
                        {id === 'adaptive-mm' && 'baseSpread, qty, hedgeThreshold'}
                        {id === 'custom' && 'qty, edgeBps, cooldownMs'}
                      </td>
                      <td>{body}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="fine-print">
                All parameters are numbers. Sensible ranges: <code>qty</code> 1–50, <code>edgeBps</code> 1–100,{' '}
                <code>spread</code> 0.02–2.00, <code>threshold</code> 2–100.
              </p>
            </section>

            <section id="risk">
              <h2>Risk limits</h2>
              <div className="risk-grid">
                <div>
                  <h3><code>maxPosition</code></h3>
                  <p>Maximum absolute signed position per instrument for this bot's book. Range 1–100. The venue cap still applies at account level.</p>
                </div>
                <div>
                  <h3><code>maxGross</code></h3>
                  <p>Maximum gross notional across the bot's book. Range 1,000–1,000,000. Checked before each action batch.</p>
                </div>
                <div>
                  <h3><code>maxOrdersPerMin</code></h3>
                  <p>Action-rate throttle. Range 1–120. The runtime skips the bot once the window is exhausted.</p>
                </div>
              </div>
              <p className="fine-print">
                Position caps are aggregated at account level across manual trading, enabled strategy families and all
                bots. You cannot exceed the venue cap by adding bots.
              </p>
            </section>

            <section id="rules">
              <h2>Custom rules</h2>
              <p>Each rule has a <code>when</code> array of 1–4 triggers and one <code>action</code>. All triggers must pass. A per-rule cooldown prevents machine-gun submissions.</p>
              <h3>Trigger fields</h3>
              <table className="data-table spec-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(([field, meaning]) => (
                    <tr key={field}>
                      <td><code>{field}</code></td>
                      <td>{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Operators: <code>gt</code>, <code>lt</code>, <code>abs_gt</code>. Add an optional <code>instrument</code>{' '}
                to a trigger to evaluate a specific stock instead of the current universe symbol.
              </p>
              <h3>Actions</h3>
              <pre className="code-block">{`{
  "type": "order",
  "instrument": "NVDA",
  "side": "buy",
  "qty": 4,
  "orderType": "market" | "ioc" | "limit",
  "offsetBps": 0
}`}</pre>
              <pre className="code-block">{`{
  "type": "pair",
  "long": "NVDA",
  "short": "NVDA_DUAL",
  "qty": 4
}`}</pre>
              <p>
                Pair actions take both legs with IOC orders. Use <code>NVDA_DUAL</code> for the dual listing. A market
                order takes the touch; <code>ioc</code> takes up to the limit and cancels the remainder; a limit order
                with <code>offsetBps</code> rests away from the mid.
              </p>
            </section>

            <section id="example">
              <h2>Full example</h2>
              <pre className="code-block">{EXAMPLE}</pre>
              <div className="docs-actions">
                <Link to="/bots" className="btn btn-primary btn-sm">
                  Open bot console
                </Link>
                <a href="/api/bots/template" className="btn btn-outline btn-sm" target="_blank" rel="noreferrer">
                  Download templates
                </a>
              </div>
            </section>

            <section id="validation">
              <h2>Validation &amp; limits</h2>
              <ul>
                <li>The file must be valid JSON and no larger than 128 KB.</li>
                <li>Family, universe symbols, trigger fields, operators and action types are enum-checked.</li>
                <li>All numeric parameters must be finite and within range.</li>
                <li>Custom bots need at least one valid rule; a maximum of 12 rules and 4 triggers per rule is enforced.</li>
                <li>Bot names must be unique per account and fit the 3–40 character limit.</li>
                <li>Plan limits: Free 2 bots, Pro 10, Desk 50.</li>
                <li>Validation failures return a list of field-level errors; warnings are shown but do not block deployment.</li>
              </ul>
              <p>
                The full repository document is <code>BOT_UPLOAD.md</code>. The rule book is <Link to="/rules">/rules</Link>.
              </p>
            </section>

            <section id="faq">
              <h2>FAQ</h2>
              <h3>Can I upload Python or JavaScript?</h3>
              <p>Not in v1. The runtime only interprets declarative JSON. This keeps the shared Worker isolated and the competition fair. A reviewed WebAssembly sandbox is a roadmap item.</p>
              <h3>Are my parameters secret?</h3>
              <p>Your bot spec is private to your account. Public leaderboard fields are bot name, owner username, family, P&amp;L, win rate, trade count and trend.</p>
              <h3>How do I update a bot?</h3>
              <p>The API supports <code>PUT /api/bots/:id</code> with a new spec. The console currently focuses on deploy, pause and delete; updates are available through the API.</p>
              <h3>Why did my bot stop trading?</h3>
              <p>Check its status, risk limits, order-rate throttle and the account position cap. A bot can be active but still have no room to trade.</p>
            </section>

            <div className="docs-note">
              <Icon name="shield" size={16} />
              <p>Uploads are simulated only. Never upload secrets, API keys or personal data. The platform will never ask for brokerage credentials.</p>
            </div>
          </article>
        </div>
      </div>
    </PageShell>
  );
}
