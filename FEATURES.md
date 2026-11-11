# Optibook Arena — Features, Implementation, and the Real-Market Gap

> **Simulation only.** Optibook Arena is a self-contained synthetic venue and strategy sandbox.
> It is not a real exchange, broker, market-data product, or trading system. Nothing here is
> financial, legal, or investment advice.

This document answers three questions for every part of the app:

1. **What does it do?**
2. **How is it implemented?**
3. **Why is the same thing impossible, illegal, or heavily simplified in a real market?**

---

## 1. Summary

Optibook Arena rebuilds the strategy collection from
[`altcar/htb-optiver-challenge`](https://github.com/altcar/htb-optiver-challenge) as a live
Cloudflare Workers application.

It contains:

- a synthetic **dual-market venue** with 5 stocks and 5 dual listings;
- a **250 ms matching/simulation engine** inside one Durable Object;
- a **WebSocket feed** (snapshot + 500 ms ticks) and a REST control API;
- **manual buy/sell** with market and limit orders;
- **six server-side strategy engines** with independent P&L attribution and live parameters;
- a **news wire** with sentiment scoring and manual headline injection;
- a **React trading terminal** with watchlist, chart, book, tape, ticket, positions, orders, strategy
  lab, and news;
- **persistence** of positions, cash, orders, news, and strategy state;
- **push-triggered Cloudflare Workers Builds** deployment.

The central caveat is simple: the app owns the venue **and** the trading desk. That gives it a
complete view of every synthetic order and print. No real market participant has that view, and a
real venue operator that traded on it would be in serious legal and ethical territory.

---

## 2. Feature map

| # | Feature | Implementation | Real-market status |
| --- | --- | --- | --- |
| 1 | Five stocks + five dual listings | `src/shared/types.ts`, `src/worker/market.ts` (`SEEDS`) | Simplified universe; real duals have FX, lots, borrow, settlement |
| 2 | Synthetic order books | `MarketSim.buildBook()` | Full depth is not visible in real markets |
| 3 | 250 ms engine tick | `ArenaEngine.tick()`, `TICK_MS = 250` | Real matching is continuous, asynchronous, and much faster |
| 4 | Snapshot + 500 ms WebSocket ticks | `engine.snapshot()`, `tickMessage()`, `handleWebSocket()` | Real feeds are incremental, conflated, permissioned, and venue-specific |
| 5 | Market / limit / IOC execution | `Broker.place()`, `executeImmediate()` | Real fills depend on queue position, latency, and hidden liquidity |
| 6 | Resting orders and partial fills | `Broker.restOrder()`, `matchCrossing()` | Modelled, but no queue priority or exchange acknowledgements |
| 7 | Random aggressor flow | `Broker.match()` → `executeAggressor()` | Real flow is informed, toxic, fragmented, and not random |
| 8 | Merged book with own orders | `Broker.mergeBook()` | Real “own order” views exist; full participant-level book does not |
| 9 | Time & sales tape | `TradeRow`, `TradeTape.tsx` | Public tapes show anonymous prints, not identities |
| 10 | ±100 share position limit | `Broker.roomFor()`, `fillRoom()` | Real limits are account/venue/margin/product specific |
| 11 | Starting equity / P&L attribution | `bookPnl()`, `positions()`, `StrategyInfo` | Real P&L needs fees, funding, borrow, corporate actions, allocation |
| 12 | Six strategy engines | `src/worker/strategies.ts` | Ported ideas, not production trading systems |
| 13 | Live strategy toggle + parameters | `/api/strategy`, `Strategies.tsx` | Real changes need change control, risk approval, and kill switches |
| 14 | News generation + sentiment | `src/worker/news.ts` | Real news is noisy, delayed, ambiguous, and regulated |
| 15 | Manual headline injection | `NewsEngine.createManual()` | Fake market-moving news is illegal; this is a sandbox only |
| 16 | Price / basis chart | `PriceChart.tsx` | Real charts use licensed historical data and corrections |
| 17 | Order-book click-to-price | `OrderBook.tsx` → `onPrice` | Fine for a simulator; real order entry has validation and entitlements |
| 18 | Manual order book / cancel all | `Broker.cancelAll('manual')` | Real systems need auth, audit, and rate limits |
| 19 | Persistence | `ArenaEngine.persist()`, Durable Object SQLite | Periodic snapshot, not a write-ahead trading ledger |
| 20 | REST API + WebSocket protocol | `src/worker/engine.ts`, `src/worker/index.ts` | Real APIs require authentication, entitlements, and quotas |
| 21 | Responsive terminal UI | `src/client/styles.css`, components | Presentation layer; no real-market equivalent |
| 22 | Legacy strategy archive | `legacy/` | Reference only; not executed |
| 23 | CI + Workers Builds | `.github/workflows/ci.yml`, Cloudflare Workers Builds | Good deployment hygiene; not HFT infrastructure |
| 24 | Reset button | `POST /api/reset` | Markets cannot be reset |
| 25 | Speed control | `POST /api/config` | Time cannot be sped up in a real market |

---

## 3. The synthetic venue

### 3.1 Five stocks, five duals, ten books

**What it does:** trades `NVDA`, `CSCO`, `ING`, `SAN`, and `PFE`, each with a `_DUAL` instrument.
The dashboard treats them as five pairs.

**How:**

- `STOCK_SYMBOLS` and `STOCK_PAIRS` are defined in `src/shared/types.ts`.
- `MarketSim` seeds each stock in `src/worker/market.ts` with a price, previous close, spread, and
  liquidity factor. Initial stock mid prices are approximately:
  - `NVDA` 184.62
  - `CSCO` 48.72
  - `ING` 14.38
  - `SAN` 4.26
  - `PFE` 28.54
- Each dual is created from its stock with an initial basis:

```ts
dual.fair = stock.fair * (1 + dual.basis)
```

**Real-market gap:** a real dual listing is not just “the same asset times one plus a basis”.
Depending on the structure it can involve:

- different currencies and FX conversion;
- different lot sizes and tick regimes;
- ADR ratios, depositary fees, and transfer restrictions;
- dividends, withholding tax, and record dates;
- borrow availability, locate requirements, and short-sale restrictions;
- different trading calendars, auctions, and settlement cycles;
- different liquidity and investor bases.

Our duals are 1:1, same-currency, same-calendar instruments. That is a deliberate simplification.

### 3.2 Fair value, basis, and price formation

**What it does:** every stock has a latent fair value that random-walks with mean reversion,
volatility drag, and decaying news impulses. Every dual has an Ornstein–Uhlenbeck basis with
occasional jumps.

**How (`MarketSim.tick`):**

- Stock shock: Gaussian with a per-tick scale, multiplied by the volatility config.
- Slow anchor: `stock.anchor` drifts very slowly and pulls fair value back.
- News impulse: `stock.newsImpulse` decays each tick and is applied to fair value.
- Dual basis:

```ts
dual.basis += -0.09 * dual.basis * dt + gaussian() * 0.00075 * scale * volatility;
if (Math.random() < 0.007 * speed) dual.basis += gaussian() * 0.0035 * volatility;
```

- Basis is capped at ±3%.
- Fair value is clamped so prices stay positive.

**Real-market gap:** real fair value is unobservable. It depends on earnings expectations, rates,
credit, flow, macro, sector correlation, options positioning, and private information. Real dual
bases are driven by borrow, funding, dividends, FX, settlement, taxes, and capital constraints — not
a single OU process. Our model is intentionally stationary and easy to trade against.

### 3.3 Synthetic depth

**What it does:** every instrument always shows seven levels per side in the venue, merged with the
user's own working orders in the dashboard.

**How (`MarketSim.buildBook`):**

- Best bid/ask are placed around fair value using the instrument spread and a small jitter.
- Seven levels are generated outward with random gaps and sizes.
- Size scales with a per-symbol liquidity factor and decays with level.
- Duals receive roughly 55% of stock liquidity.
- `Broker.mergeBook()` overlays open user/strategy orders, aggregates equal prices, marks own levels,
  and returns the top ten levels per side.

**Real-market gap:** a real book is not complete, stable, or free:

- **Hidden liquidity:** iceberg/reserve orders show only a tip, or nothing.
- **Dark pools and internalization:** large amounts of real trading never appear on a lit book.
- **Fragmentation:** the “national best bid and offer” is a composite, not one book.
- **Fleeting liquidity:** quotes can be cancelled in microseconds.
- **Depth is not commitment:** displayed size can disappear before you reach it.
- **Data licensing:** full depth is expensive and permissioned; not every participant sees the same
  feed.
- **No guaranteed 7 levels:** real books can be one-sided, empty, locked, crossed, or halted.

### 3.4 Random aggressor flow and prints

**What it does:** synthetic market participants randomly hit the book, producing the time & sales
tape and filling resting orders.

**How (`Broker.match`, `executeAggressor`):**

- Per instrument, per tick, there is a 30% chance of one or two aggressor events.
- Aggressor side is random.
- Size is random between 5 and 55 shares.
- The aggressor takes the best available price, including eligible user/strategy orders.
- Each print updates `last`, `high`, `low`, and cumulative `volume`.

**Real-market gap:** real aggressor flow is not random. It is a mix of:

- informed and uninformed traders;
- retail flow, often internalized or sold as order flow;
- institutional executions sliced across venues and time;
- market makers hedging elsewhere;
- momentum/stop cascades and liquidations;
- latency arbitrage and HFT.

The tape also does not tell you who traded, why, whether it was part of a larger parent order, or
whether it was hedged in another venue. Our random flow is deliberately benign and non-toxic.

### 3.5 Trades, highs, lows, and volume

**What it does:** the tape shows price, size, aggressor side, venue leg (STK/DUAL), and a `YOU` badge
for the user's own fills.

**How:** `Broker.executeFill()` and `recordSyntheticTrade()` write `TradeRow` records; the UI filters
them to the active pair in `TradeTape.tsx`.

**Real-market gap:** public trade tapes are anonymized. Many venues publish price and size but not
counterparty identity; some do not publish aggressor side; off-exchange prints may be delayed or
reported through a trade reporting facility. “Who bought/sold” is generally confidential.

---

## 4. Orders and matching

### 4.1 Manual market and limit orders

**What it does:** the order ticket supports buy/sell, market or limit, quantity, position display, and
estimated notional.

**How:**

- UI: `src/client/components/TradeTicket.tsx`.
- API: `POST /api/order` in `ArenaEngine.fetch()`.
- Broker: `Broker.place()`.
- Market orders walk the synthetic side in `executeImmediate()`.
- Limit orders that cross execute immediately; any remainder rests.
- Limit orders that do not cross are stored in `Broker.orders`.

**Real-market gap:** real order entry includes:

- order acknowledgements/rejects and exchange throttles;
- risk checks for buying power, margin, restricted lists, and fat-finger limits;
- self-trade prevention;
- venue routing and smart order routing;
- minimum quantity, display quantity, iceberg, pegged, and other order types;
- auction-only and halt states;
- regulatory flags and audit trails.

We implement a deliberately small subset: market, limit, and internal IOC.

### 4.2 IOC orders for strategies

**What it does:** strategy engines can take liquidity immediately and cancel any remainder.

**How:** `Broker.place({ type: 'ioc' })` → `executeImmediate()`. The public `/api/order` maps manual
orders to `market` or `limit`, so IOC is currently a strategy/internal capability.

**Real-market gap:** IOC orders are real, but fill quality depends on venue, queue, fees, and
latency. Our IOC assumes the synthetic book is available at the moment of the call.

### 4.3 Resting orders and partial fills

**What it does:** user and strategy limit orders rest in the book, can be partially filled, and can
be cancelled.

**How:**

- `restOrder()` creates an order with `filled = 0`.
- `matchCrossing()` fills a resting order if the synthetic book moves through its limit.
- `executeAggressor()` can fill a resting order when it is the best eligible price.
- `executeFill()` updates positions, cash, realized P&L, and the tape.
- Filled/cancelled orders are pruned from the map to avoid unbounded memory growth.

**Real-market gap:** real matching uses price-time or pro-rata priority, queue position, and
exchange-specific allocation. Our aggressor matching sorts by price only; time priority at the same
price is not modelled. Real partial fills also depend on hidden size and venue rules.

### 4.4 Position limits and buy/sell room

**What it does:** every instrument is capped at ±100 shares across all books. The ticket and strategy
engines see remaining room.

**How:**

- `Broker.roomFor(instrument, side)` includes current positions and all open orders.
- `Broker.fillRoom()` prevents fills from pushing aggregate positions through the cap.
- `TradeTicket` computes `roomBuy = 100 - currentQty` and `roomSell = 100 + currentQty`.

**Real-market gap:** real limits are account-, product-, venue-, and margin-specific. They can be
intraday or overnight, gross or net, and may change with volatility. There are also:

- margin calls and buying-power checks;
- short-sale locate/borrow requirements;
- position limits for options/futures and large-trader reporting;
- pre-trade risk gates and kill switches;
- cross-product and cross-account aggregation.

Our ±100 cap is a single global parameter. **Cash is displayed but not enforced**; the position limit
is the binding constraint. That is a major simplification.

### 4.5 Market impact

**What it does (and does not do):** our trades update last price, high, low, and volume, but **do not
move fair value** or permanently consume synthetic depth beyond the tick.

**Real-market gap:** real orders move prices. Impact depends on size relative to ADV, spread, depth,
volatility, urgency, and information content. A strategy that ignores impact will overstate capacity
and P&L.

### 4.6 Self-trade prevention, auctions, and halts

Not implemented.

**Real-market gap:** real venues have self-trade prevention, opening/closing auctions, volatility
auctions, limit-up/limit-down bands, circuit breakers, and regulatory halts. A real strategy must
handle all of them.

---

## 5. Portfolio, P&L, and risk

### 5.1 Books and attribution

**What it does:** every order belongs to a book:
`manual` for the user, or one of the six strategy IDs. Positions, cash, realized P&L, unrealized P&L,
fills, and exposure are tracked per book.

**How:**

- `Broker.book(name)` returns a `BookState` with cash, realized P&L, fills, order count, and positions.
- `Broker.executeFill()` applies signed quantity, average price, and realized P&L.
- `Broker.bookPnl()` computes `cash + Σ(qty × mid)`.
- `Broker.positions()` aggregates across books for the positions table.
- `ArenaEngine.strategyInfos()` builds the strategy cards.

**Real-market gap:** real P&L attribution requires:

- fee and rebate schedules;
- financing, margin interest, and borrow costs;
- dividends and corporate actions;
- FX translation;
- allocation across accounts, strategies, and legal entities;
- reconciliation with clearing and prime-broker records.

Our P&L is an internal mark-to-mid estimate with zero fees.

### 5.2 Marking to mid

**What it does:** unrealized P&L marks open positions at the synthetic mid.

**Real-market gap:** mid is not necessarily executable. Real risk systems may mark at bid, ask,
last, a model price, or a prudent valuation, and they include funding and liquidity adjustments.

### 5.3 Equity curve

**What it does:** the account equity card shows a sparkline of equity history.

**How:** `ArenaEngine.tick()` appends equity every broadcast; the snapshot carries up to 300 points.
The client also keeps a 300-point tail.

**Real-market gap:** a real equity curve needs a consistent valuation policy, fee accrual, cash
reconciliation, and a time series that survives restarts. We persist only the last 120 points and
otherwise rebuild the chart from the live session.

### 5.4 Reset

**What it does:** clears positions, orders, cash, news, and strategies, and starts a new session.

**How:** `POST /api/reset` → `ArenaEngine.reset()`.

**Real-market gap:** there is no reset in a real market. Losses, positions, and obligations persist.
A real system needs a controlled cancel/kill process, not a reset button.

---

## 6. The six strategy engines

All strategies are defined in `src/worker/strategies.ts` and run inside the Durable Object on every
tick. All six are enabled by default on a fresh arena. Each has editable numeric parameters through
`POST /api/strategy`.

### 6.1 Dual Maker (`dual-mm`)

**What it does:** quotes the stock around a blend of the stock and dual mids, skews by inventory, and
refreshes on drift.

**How:**

- Fair: `0.5 * stock.mid + 0.5 * dual.mid`.
- Inventory skew: `-(position / 100) * spread * 0.9`.
- Spread default: `0.14`; size default: `20`.
- `ArenaEngine.quote()` cancels a quote only when the desired price moves more than half a tick, and
  keeps at most one order per side per instrument.

**Real-market gap:**

- Real market making requires queue-position management, adverse-selection modelling, and
  inventory/vega/gamma limits.
- Real quotes are cancelled and replaced under exchange rate limits and fees.
- A real maker cannot assume it will be filled at the mid or that its quotes are safe from informed
  flow.
- The “dual mid” is not a risk-free fair value; it can be stale or manipulated.

### 6.2 Pair Hedger (`hedge`)

**What it does:** measures net delta across each stock/dual pair and flattens with IOC orders when
the band breaks.

**How:**

- Net: `position(stock) + position(dual)`.
- Trigger: absolute net ≥ `threshold` (default 30).
- Size: at most `qty` (default 40), taken from the dual at the touch.
- Cooldown: 900 ms per pair.

**Real-market gap:** the two legs have different liquidity, borrow, FX, and settlement. A real hedge
has leg risk, slippage, and basis risk. Our hedge uses a simple share-for-share delta; it ignores
beta, currency, and funding.

### 6.3 Dual Arbitrage (`dual-arb`)

**What it does:** sells the rich leg and buys the cheap leg when the executable touch clears the
configured edge.

**How:**

- If `stock.bid - dual.ask > edge` (default 0.05), sell stock and buy dual.
- If `dual.bid - stock.ask > edge`, sell dual and buy stock.
- Size default 10; cooldown 1.1 s per pair.
- Both legs are IOC; `recordArb()` increments only if both legs succeed.

**Real-market gap:**

- Sequential IOC legs create **leg risk**. One leg can fill while the other misses.
- Real arbitrage must account for fees, borrow, FX, taxes, and settlement.
- “Dual” arbitrage is often not a pure arbitrage; it can be a statistical or structural trade.
- Real capacity is limited by depth, impact, and capital.
- Our 1:1 same-currency assumption removes most of the hard parts.

### 6.4 News Sentiment (`sentiment-mm`)

**What it does:** scores the synthetic newswire, shifts fair value per ticker, leans quotes, and takes
small directional trades on strong headlines.

**How:**

- `NewsEngine.scores` decays each tick and is updated on every headline.
- Fair: `mid + mid * score * 0.0016 * sensitivity`.
- Spread widens with `abs(score)`.
- Strong scores trigger an IOC trade at most every 2.6 s, with a position guard.

**Real-market gap:**

- Real news is noisy, duplicated, corrected, and ambiguous; ticker mapping is hard.
- Materiality is not a lexicon score.
- Markets react before a slow NLP pipeline finishes.
- The original project used a DistilBERT/PyTorch model; Workers cannot load those weights, so the
  running engine uses a deterministic finance lexicon. The original model is archived under
  `legacy/`.
- Trading on non-public information or publishing false information is illegal.

### 6.5 Momentum Maker (`momentum-mm`)

**What it does:** adds a short-horizon momentum bias to the mid, widens with realized volatility, and
scales size down as inventory grows.

**How:**

- Momentum: `(last - history[-horizon]) / history[-horizon]`, default horizon 6 ticks.
- Fair: `mid + mid * momentum * bias` (bias default 0.5).
- Spread widens with recent absolute returns.
- Size scales with `1 - abs(position)/100`.

**Real-market gap:** real momentum signals use trades, volume, order-flow imbalance, cross-asset
signals, and microstructure features. Mid-price history alone is a toy signal. Real momentum also
suffers from decay, crowding, and transaction costs.

### 6.6 Adaptive Maker (`adaptive-mm`)

**What it does:** uses `tanh` inventory skew, a spread that adapts to the live market spread, and
threshold-based dual hedges.

**How:**

- `base = max(baseSpread, marketSpread * 0.55)`, default minimum 0.07.
- Skew: `tanh(position / 100) * 0.3`.
- Bid/ask around mid with asymmetric spreads.
- Above `hedgeThreshold` (default 70), take a dual hedge at most every 1.4 s.

**Real-market gap:** the original `final_solution` controller is a heuristic. Real adaptive market
making needs estimation of fair value, adverse selection, queue dynamics, and risk limits. A tanh
skew is a useful demo, not a production alpha model.

### 6.7 Shared strategy assumptions

All six engines assume:

- immediate access to complete state;
- no latency between signal, order, and fill;
- no exchange fees;
- no borrow or funding costs;
- no market impact from their own orders;
- no possibility of a broken or rejected order;
- no independent risk limits or capital allocation;
- one global position limit shared across strategies.

**Real-market gap:** each of these is false. A production desk needs independent risk, monitoring,
allocation, fee-aware backtests, and a kill switch.

---

## 7. News and sentiment

### 7.1 Synthetic headlines

**What it does:** generates market headlines roughly every 4–6 seconds at 1× speed, with a source,
ticker tags, and a sentiment score.

**How (`src/worker/news.ts`):**

- A template list combines positive, negative, and neutral headlines.
- Each headline picks a stock and applies ticker/name substitution.
- Sentiment is the template score plus noise, clamped to `[-1, 1]`.
- Headline sources include `@EarningsWire`, `@AnalystDesk`, `@CorporateWire`, `@IndustrySources`,
  `@FlowDesk`, `@MarketRecap`, `@PolicyWire`, `@MacroReport`, and `@VenueWire`.
- Source-appropriate tags are appended (e.g. `#Earnings`).

### 7.2 Sentiment impact

**What it does:** headlines change the stock's anchor and add a decaying impulse.

**How (`MarketSim.applyNews`):**

- `stock.newsImpulse += sentiment * strength`.
- `stock.anchor *= 1 + sentiment * 0.00022`.
- The dual receives a fraction of the impulse.
- If no tickers are supplied, the market-wide effect is small.

**Real-market gap:** real news impact is nonlinear, path-dependent, and often already priced. A
headline can be material for one company and irrelevant for another. Real systems also have to handle
duplicates, revisions, press releases, social-media rumors, and halts.

### 7.3 The manual wire

**What it does:** the user can publish a headline from the dashboard, auto-detect tickers, choose
auto/bullish/bearish sentiment, and watch the market react.

**How:**

- UI: `NewsFeed.tsx`.
- API: `POST /api/news`.
- `NewsEngine.createManual()` detects tickers by symbol and company name, scores the text with a
  lexicon, and emits the item.

**Real-market gap:** publishing false or misleading market-moving information is market manipulation
in most jurisdictions. A real firm cannot let any user inject headlines into a production market
feed. This feature exists only because the venue is synthetic and the feed is sandboxed.

### 7.4 Sentiment scoring

**What it does:** assigns a score between -1 and +1 using positive/negative finance words.

**How:** `NewsEngine.lexiconScore()` counts positive and negative terms and normalizes.

**Real-market gap:** lexicons miss negation, sarcasm, context, entity ambiguity, and magnitude.
A real system would use a trained model, retrieval, source reliability, and human review. The
archived DistilBERT model is not runnable on Workers without a different inference setup.

---

## 8. The dashboard

### 8.1 Layout

The React terminal (`src/client/App.tsx`) contains:

- top bar with connection state, latency, tick count, uptime, UTC clock, speed, reset;
- stat strip: equity, net P&L, gross exposure, arbitrage count, engine tick time;
- watchlist of five pairs;
- instrument header with last, change, bid/ask, dual mid, position, range, and sentiment;
- normalized stock-vs-dual chart;
- order book ladder and time & sales;
- order ticket, positions, working orders;
- strategy lab;
- Arena Wire news feed with composer;
- footer and toast notifications.

### 8.2 Live WebSocket state

**What it does:** the browser receives a snapshot on connect, then 500 ms ticks. It reconnects with
exponential backoff and displays latency.

**How (`src/client/useArena.ts`):**

- Connects to `/ws` over `ws://` or `wss://`.
- Sends `{ type: 'ping' }` on open and every 10 s; the server replies `{ type: 'pong', ts }`.
- On `snapshot`, replaces state.
- On `tick`, merges instruments, appends history, prepends new trades/news, and appends equity.
- De-duplicates trades and news by ID.
- Reconnects with delays capped at 6 s.
- Requests a fresh snapshot if a tick arrives before the first snapshot.

**Real-market gap:** real market data is not a single JSON WebSocket that gives every user a full
snapshot of every book. Real feeds are incremental, sequenced, sometimes conflated, and licensed per
venue. Reconnects must handle gaps, sequence numbers, and stale snapshots. Our feed is intentionally
simple and complete.

### 8.3 Chart

**What it does:** plots the last 190 ticks of stock and dual mids, normalized to percentage change,
with a hover crosshair and tooltip.

**How:** `PriceChart.tsx` builds SVG paths from `instrument.history`, which the server maintains per
tick (`HISTORY_LIMIT = 360`).

**Real-market gap:** real charts require licensed historical data, adjustments for splits/dividends,
time-zone handling, and corrections. Our chart is a live session visualization, not a research
dataset.

### 8.4 Order book

**What it does:** shows seven synthetic levels per side plus own orders, cumulative sizes, depth bars,
spread, mid, fair, last, and sentiment bias. Clicking a price seeds the ticket.

**How:** `OrderBook.tsx` uses `instrument.book`, which is produced by `Broker.mergeBook()`.

**Real-market gap:** as above: hidden liquidity, fragmentation, dark pools, data licensing, and no
participant identities. A real “own order” view is normal; a complete market-by-order view with
identities is not.

### 8.5 Ticket and working orders

**What it does:** manual buy/sell, market/limit, quantity stepper, quick sizes, max room, estimated
notional, working-order list, cancel one, cancel all manual.

**How:** `TradeTicket.tsx`, `OpenOrders.tsx`, `/api/order`, `/api/cancel`.

**Real-market gap:** real order entry requires auth, entitlements, approval workflows, risk checks,
and audit. A public unauthenticated “cancel all” button is only acceptable in a sandbox.

### 8.6 Positions and strategy cards

**What it does:** positions table with aggregate quantity, average, mark, open P&L, source books, and
a utilization bar. Strategy cards show state, P&L, fills, net quantity, exposure, origin, and
parameters.

**How:** `PositionsTable.tsx`, `Strategies.tsx`, `Broker.positions()`, `ArenaEngine.strategyInfos()`.

**Real-market gap:** real position views must reconcile with clearing, include fees/funding, and
respect entitlements. Real strategy changes require deployment controls, not a toggle switch.

### 8.7 Responsive and accessibility details

- Breakpoints at 1380, 1180, 900, and 620 px.
- Mobile stacks the terminal and keeps the book/tape usable.
- Strategy toggles use `role="switch"`.
- Position rows are keyboard-selectable.
- `prefers-reduced-motion` disables animations.
- Toasts announce with `aria-live="polite"`.

**Real-market gap:** none specific; this is ordinary web UX. Real trading terminals have additional
requirements around keyboard shortcuts, multi-monitor layouts, entitlement-driven widgets, and
latency indicators.

---

## 9. API and realtime protocol

### 9.1 REST API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health, tick, equity, sockets, enabled strategies |
| `GET` | `/api/state` | Full snapshot |
| `POST` | `/api/order` | Manual market/limit order |
| `POST` | `/api/cancel` | Cancel one manual order or all manual orders |
| `POST` | `/api/strategy` | Toggle or tune a strategy |
| `POST` | `/api/news` | Publish a manual headline |
| `POST` | `/api/config` | Speed / volatility |
| `POST` | `/api/reset` | Reset the arena |

**Real-market gap:** real APIs require authentication, authorization, entitlements, rate limits,
idempotency, audit logs, and reconciliation. Our API is unauthenticated by design so the public demo
is usable.

### 9.2 WebSocket messages

Server → client:

- `{ type: 'snapshot', ... }` on connect and on request;
- `{ type: 'tick', ... }` every 500 ms;
- `{ type: 'pong', ts }`.

Client → server:

- `{ type: 'ping' }`;
- `{ type: 'snapshot' }`.

**Real-market gap:** real feeds use binary protocols, sequence numbers, heartbeats, gap recovery,
conflation, and per-venue sessions. Ours is JSON and deliberately lossy across reconnects: a reconnect
gets a fresh snapshot rather than a replay.

---

## 10. Platform, persistence, and deployment

### 10.1 Cloudflare Worker and Durable Object

**What it does:** the Worker routes `/api/*` and `/ws` to one Durable Object named `global-arena`, and
serves the React build from the assets binding.

**How:**

- `src/worker/index.ts` routes requests.
- `wrangler.jsonc` binds `ARENA` (`ArenaEngine`) and `ASSETS`.
- The Durable Object uses the SQLite storage backend.
- A non-hibernating WebSocket set keeps the arena alive while clients are connected.
- The tick loop stops after two minutes with no clients or API activity.

**Real-market gap:** real matching engines are replicated, deterministic, audited, and
fault-tolerant. A single Durable Object is a single logical thread in one location. It is excellent
for a demo, but not a global low-latency exchange. Real HFT colocates servers, uses kernel bypass,
and measures microseconds, not 250 ms ticks.

### 10.2 Persistence

**What it does:** saves market state, positions, cash, open orders, news, strategy state, config, tick
counter, and equity every 20 ticks (about 5 s at 1×).

**How:** `ArenaEngine.persist()` writes a structured snapshot to `ctx.storage`. `restore()` rebuilds
the engine on startup.

**Real-market gap:**

- A periodic snapshot can lose up to five seconds of state on a crash.
- Real trading ledgers use write-ahead logs, replication, and point-in-time recovery.
- Real audit trails are immutable and retained for years.
- Real state includes fees, funding, corporate actions, and clearing breaks.

### 10.3 CI and Workers Builds

**What it does:** GitHub Actions runs `npm ci && npm run build` on every push and pull request.
Cloudflare Workers Builds is connected to `main` and deploys on every push.

**How:**

- `.github/workflows/ci.yml` runs the build check.
- Cloudflare Workers Builds config: branch `main`, build `npm ci && npm run build`, deploy
  `npx wrangler deploy`, Node 22, dependency caching, root `/`.
- The build token deploys to the `optibook-arena` Worker.

**Real-market gap:** real deployment needs change approval, canaries, rollback plans, and independent
risk sign-off. A push-to-deploy pipeline is convenient for a simulator but unacceptable for a
production trading system without controls.

### 10.4 Public demo

**What it does:** the app is public, unauthenticated, and shared. Anyone can trade, publish news,
toggle strategies, or reset.

**Real-market gap:** real systems require identity, entitlements, segregation, and audit. Publishing
news or resetting a market is impossible; trading on confidential order flow is illegal. The public
demo is explicitly a shared sandbox.

---

## 11. Why “watch every buy and sell from other players” is impossible in a real market

This is the most important section. The dashboard can show a complete synthetic tape and book
because **we operate the venue and generate the flow**. A real market participant cannot get the same
view, for technical, commercial, and legal reasons.

### 11.1 What our dashboard actually shows

In Optibook Arena the browser receives:

- every synthetic order book level for all ten instruments;
- every synthetic trade print, with price, size, aggressor side, and venue leg;
- every one of the user's own fills, flagged `YOU`;
- every strategy order and position, because the app is also the strategy host;
- every headline and its sentiment score.

It does **not** show a counterparty identity for synthetic trades. There is no “other player” object
with a name, account, or inventory. The venue simply generates anonymous flow. The omniscience is
about **completeness of prints and depth**, not about identifying people.

### 11.2 What a real participant can see

A real participant with full market-data entitlements can usually see:

- aggregated depth by price (market-by-price), often 5–10 levels or the full book depending on the
  venue and product;
- a public trade tape with price, size, and sometimes the aggressor side;
- maybe anonymous order IDs on venues that publish market-by-order data;
- derived statistics such as volume, VWAP, imbalance, and open interest.

A real participant generally **cannot** see:

- the identity behind an order or trade;
- the full order book across all venues;
- hidden/iceberg/reserve quantity;
- dark-pool and internalized flow;
- the parent order behind a child slice;
- other participants' positions, inventory, or intent;
- cancellations and modifications across the whole market in real time;
- the same data at the same time as everyone else.

Even “market by order” feeds anonymize the participant. You may see an order ID, price, size, and
timestamp, but not “this is Player X.” And order IDs can change as orders are modified.

### 11.3 What the venue can see — and why it cannot trade on it

If you **operate the exchange**, you can see order flow, identities, and cancellations. But:

- Using confidential order information to trade is a conflict of interest and generally illegal.
- Exchanges separate market operations, surveillance, and any affiliated trading.
- Regulators require fair access, surveillance, and market-abuse controls.
- Front-running customer orders, trading ahead, and misusing non-public order data are prohibited.
- A venue that traded against its own participants would face regulatory, civil, and reputational
  consequences.

So “the exchange operator has the data” does **not** mean “a trader can use the data.” Our app
collapses venue and participant into one process; that is exactly what a real market forbids.

### 11.4 Technical reasons completeness is impossible

1. **Fragmentation.** US equities trade across dozens of venues; Europe across many trading venues
   and systematic internalizers. There is no single complete book.
2. **Dark pools and internalization.** A large share of flow never appears on a lit book.
3. **Hidden liquidity.** Iceberg and reserve orders display only a fraction of their size.
4. **Latency and asynchrony.** Feeds arrive at different times; packets are lost, reordered, or
   conflated. Two participants rarely see the same state at the same instant.
5. **Conflation and throttling.** Venues aggregate updates to keep bandwidth manageable; you may not
   see every intermediate book state.
6. **Data licensing.** Full depth and low-latency feeds are commercial products with entitlements,
   redistribution limits, and fees.
7. **Cancellations are messages too.** A complete view requires every add, modify, cancel, execution,
   and halt message, sequenced correctly. Missing one message corrupts the book.
8. **Auctions and halts.** Opening/closing auctions, volatility auctions, and regulatory halts change
   the matching rules and the meaning of “best price.”
9. **Off-exchange reporting.** Trades can be reported late or through consolidated tapes, so “every
   trade” is not instantaneous even when it is eventually public.
10. **Identity is not in the data.** Even a complete, low-latency, market-by-order feed does not
    tell you who the participant is or why they are trading.

### 11.5 Commercial reasons

- Full-depth, low-latency data is expensive.
- Redistribution is restricted.
- Venues compete on speed and data products.
- A retail participant typically sees a subset, sometimes delayed or aggregated.
- Payment for order flow and internalization mean much retail flow never reaches a lit book.

### 11.6 Legal and regulatory reasons

Depending on jurisdiction and venue, the following are generally prohibited or tightly controlled:

- **Front-running** client or customer orders.
- **Insider trading** on material non-public information.
- **Spoofing and layering** — placing orders with intent to cancel to mislead.
- **Momentum ignition** and other manipulation.
- **Publishing false or misleading market information.**
- **Misuse of confidential order data** by venue staff or affiliates.
- **Trading ahead of a known customer order** or misusing a fiduciary relationship.
- **Wash trading** and **pre-arranged trading** outside permitted rules.
- **Short selling without a locate/borrow** where required.

Examples of regulatory frameworks include Reg NMS and Reg SHO in the US, MiFID II/MiFIR and MAR in
the EU/UK, and exchange-specific rulebooks and market-surveillance obligations. This list is
illustrative, not legal advice.

### 11.7 The practical conclusion

You can often see **anonymous public prints** and **aggregated depth** for a venue. You cannot see:

- every order and cancellation across the whole market;
- hidden and off-exchange liquidity;
- participant identities;
- other participants' positions and intent;
- a synchronized, complete, real-time global book.

And even if you could, using identity-linked order flow to trade would be illegal or a serious
conflict. Our dashboard is a god view of a synthetic venue, not a model of a real participant's
information set.

---

## 12. Other things that are impossible or heavily simplified

### 12.1 Market data and microstructure

- No hidden/iceberg liquidity.
- No dark pools, internalizers, or payment for order flow.
- No fragmentation across venues.
- No auction, halt, or circuit-breaker states.
- No odd lots, round lots, board lots, or lot-size rules.
- No tick-size regime changes.
- No locked or crossed markets.
- No opening/closing prices.
- No exchange sequence numbers or gap recovery.
- No historical replay or backtesting.

### 12.2 Execution

- No queue position or time priority at a price level.
- No exchange acknowledgements, rejects, or throttles.
- No self-trade prevention.
- No smart order routing.
- No iceberg/pegged/conditional orders.
- No partial-fill allocation rules beyond simple price priority.
- No latency or clock synchronization.
- No broken trades or busted executions.
- No settlement or clearing.

### 12.3 Costs, capital, and borrowing

- Zero fees, rebates, clearing, and market-data costs.
- No margin, financing, or funding.
- No borrow/locate costs or short-sale restrictions.
- No dividends, withholding tax, or corporate actions.
- No FX conversion for duals.
- No capital allocation per strategy; one shared position limit.
- Cash is displayed but not enforced as buying power.
- No market impact from our own orders.

### 12.4 News and sentiment

- Headlines are synthetic.
- Sentiment is a lexicon, not a trained language model.
- Ticker detection is regex-and-name matching.
- No source reliability, duplication, correction, or retraction handling.
- No materiality estimate.
- No halt or regulatory-news workflow.
- Manual news injection is a sandbox feature; in a real market it would be manipulation.

### 12.5 Strategy realism

- The six engines are demonstrators, not production alpha.
- No adverse-selection model.
- No queue model.
- No transaction-cost model.
- No capacity or impact model.
- No independent risk limits or kill switches.
- No model monitoring, drift detection, or failover.
- No backtest/live parity guarantee.
- No cross-asset hedges (rates, FX, sector, options).
- No borrow or funding in the hedge.
- The Pair Hedger assumes 1:1 share delta.
- The Dual Arbitrage assumes sequential IOC legs with no leg risk.
- The Momentum Maker uses mid history only.
- The Sentiment Maker uses a lexicon.
- The Adaptive Maker is a heuristic tanh skew.

### 12.6 Operations and security

- No authentication or entitlements.
- No per-user rate limits.
- No audit log or compliance archive.
- No role separation between trader, risk, and venue operator.
- No kill switch (reset is destructive, not a risk control).
- No disaster recovery or multi-region replication.
- No immutable trade ledger.
- Periodic snapshot persistence can lose up to ~5 seconds.
- The tick loop stops after two minutes of inactivity.
- A single Durable Object is a single logical engine, not a distributed matching cluster.
- Workers are not colocated with exchange gateways; 250 ms is an eternity for HFT.
- Public state is shared by every visitor.

### 12.7 The “venue + participant” problem

The app is simultaneously:

- the exchange;
- the market-data vendor;
- the broker;
- the clearing house;
- the strategy host;
- the risk system;
- the news wire.

That is convenient for a demo and impossible for a real market. Real markets separate these roles
precisely to manage conflicts, risk, and accountability.

---

## 13. What would make it more realistic

If the goal were to move from sandbox to realistic simulation, the next steps would be:

1. **Anonymous, permissioned market data.** Remove the global god view; give each participant a
   role-specific feed with entitlements and delays.
2. **Hidden and fragmented liquidity.** Add iceberg orders, dark pools, internalizers, and multiple
   venues with different rules.
3. **Queue and latency model.** Add price-time priority, exchange acknowledgements, throttles,
   network delay, and clock skew.
4. **Costs and capital.** Add fees, rebates, margin, borrow, funding, FX, dividends, and corporate
   actions.
5. **Market impact.** Make large orders consume depth and move fair value.
6. **Auctions and halts.** Add opening/closing auctions, volatility auctions, LULD bands, and halts.
7. **Real risk controls.** Per-strategy capital, gross/net limits, kill switches, and pre-trade risk.
8. **Compliance.** Authentication, audit logs, surveillance, and a clear separation between venue
   operations and trading.
9. **Better news.** A trained model or external NLP service, source reliability, entity resolution,
   and latency.
10. **Realistic duals.** FX, ADR ratios, borrow, dividends, tax, and settlement.

These changes would make the app much more realistic — and much less omniscient. That trade-off is
the point.

---

## 14. File map

| Area | Files |
| --- | --- |
| Shared contracts | `src/shared/types.ts` |
| Worker router | `src/worker/index.ts` |
| Engine / Durable Object | `src/worker/engine.ts` |
| Market simulation | `src/worker/market.ts` |
| Matching / positions / P&L | `src/worker/broker.ts` |
| Strategies | `src/worker/strategies.ts` |
| News / sentiment | `src/worker/news.ts` |
| Random and tick helpers | `src/worker/rng.ts` |
| Client state / WebSocket | `src/client/useArena.ts` |
| Terminal composition | `src/client/App.tsx` |
| Terminal components | `src/client/components/` |
| Design system | `src/client/styles.css` |
| Worker config | `wrangler.jsonc` |
| Smoke test | `scripts/smoke.mjs` |
| CI | `.github/workflows/ci.yml` |
| Archived originals | `legacy/` |

---

## 15. Final disclaimer

Optibook Arena is a **simulation and educational sandbox**. It deliberately gives the user a complete
view of a synthetic venue so that the strategies, dashboard, and execution model can be explored.

A real market does not provide that view. Attempting to obtain or use complete, identity-linked order
flow, customer order information, or material non-public information would be illegal or a serious
conflict of interest in most jurisdictions. Nothing in this repository is intended to model, enable,
or encourage market abuse.

For real trading, use regulated venues, licensed data, proper risk controls, and qualified legal and
compliance advice.
