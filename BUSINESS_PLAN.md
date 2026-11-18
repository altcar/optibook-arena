# Optibook Arena — Business Plan and Pricing

**Status:** public beta · November 2026
**Live product:** <https://optibook-arena.hheylau.workers.dev>
**Category:** paper-trading competition platform for developer-built trading bots
**Business model:** freemium SaaS + private leagues + enterprise events
**Billing:** disabled during the beta. Prices below are the intended launch pricing, not current charges.

> **Simulation only.** Optibook Arena does not accept deposits, route orders, hold client assets or
> provide investment advice. Prizes are simulated credits with no cash value. The business sells
> software features, not capital or expected returns.

---

## 1. Executive summary

Optibook Arena turns the closed-world Optiver/HTB dual-market challenge into a public, recurring
competition. Developers register, receive a $100,000 paper account, deploy a bot from one of six
strategy families or upload a declarative custom rule bot, and compete on a live leaderboard across
seasons and tournaments.

The product is deliberately **not** a broker and **not** a signal marketplace. It is a skill
competition and a developer sandbox. That keeps the regulatory surface small, makes the arena cheap
to operate, and gives the business a clean paid upgrade path: more bot slots, division eligibility,
private leagues and team tooling.

**Thesis:** there is a large audience of developers who want to test trading logic but do not want to
open a brokerage account, pay for market data, or take capital risk. A credible, well-scored paper
arena can become the default place to publish and compare trading bots.

**Near-term goal (12 months):** 25,000 registered traders, 3,000 monthly active competitors, 350
paying Pro seats and 20 Desk accounts. At the intended prices that is roughly **$8.6k MRR** before
private-league contracts.

---

## 2. Problem

1. **Paper trading is fragmented and unconvincing.** Brokers offer paper accounts, but they are
   single-player, poorly instrumented and tied to that broker's market data.
2. **Bot developers have nowhere credible to compete.** Crypto hackathons are episodic; Kaggle-style
   competitions are batch-scored; trading Discords are full of unverified screenshots.
3. **Market-data and execution costs are a barrier.** A hobbyist cannot easily justify a data feed,
   a colocation bill, or a prime-broker relationship just to test an idea.
4. **Existing “bot arenas” are either real-money (regulatory and reputational risk) or games with no
   meaningful scoring.** There is room for a simulation-first competition with transparent rules.
5. **Universities and trading societies need a safe competition format.** They want a branded event
   without onboarding 200 students to a brokerage.

## 3. Product

### Core loop

1. Register free → isolated $100,000 paper account.
2. Deploy a house strategy family or upload a JSON bot.
3. The bot trades a shared synthetic dual-market venue (5 stocks + 5 dual listings).
4. P&L, win rate, Sharpe and trade count update on a live leaderboard.
5. Seasons reset the rules; tournaments add short formats; the forum and newsletter build community.

### Differentiators

- **Six real strategy families** ported from the Optiver/HTB challenge, not generic “buy low” toys.
- **Dual-market basis** as the core mechanic, which is more interesting than a single synthetic price.
- **Declarative uploads** that are safe to run in a shared Worker isolate.
- **Per-account risk rails**: position caps, gross exposure, order-rate throttles.
- **Transparent scoring** with a published rule book and a win-rate definition.
- **Community surfaces** (forum, newsletter, seasons, tournaments) that create retention.
- **Cheap infrastructure**: one Durable Object + static assets on Cloudflare's edge.

### What the product is not

- Not a brokerage, exchange, custodian or investment adviser.
- Not a marketplace for live trading signals.
- Not a venue for real-money competitions.
- Not an arbitrary-code execution platform in v1.

## 4. Market and competition

### Target segments

| Segment | Size signal | Need | Willingness to pay |
| --- | --- | --- | --- |
| Indie algo traders / CS students | Large, global | A credible scoreboard and a portfolio project | Low–medium |
| Quant-curious developers | Medium | A safe sandbox with realistic mechanics | Medium |
| Trading societies / universities | Thousands of institutions | Branded paper-trading events | Medium–high (institutional) |
| Prop desks / fintech teams | Small but high value | Team training, recruiting pipeline, private leagues | High |
| Content creators / educators | Medium | A live demo venue and audience | Medium |

### Competitive landscape

| Alternative | Strength | Gap Optibook exploits |
| --- | --- | --- |
| Broker paper accounts | Realistic order types | Single-player, broker-locked, no public scoring |
| Kaggle / Numerai | Credible competition | Batch, not live; different skill; no execution loop |
| Crypto trading bots | Real execution | Regulatory risk, real losses, low trust |
| Discord signal groups | Community | Unverified, often pay-to-enter, no audited scoring |
| University trading simulations | Safe | Expensive, closed, poor developer tooling |
| General hackathons | Energy | Episodic; no persistent rating or season |

### Positioning

> **“The paper-trading arena where developers ship bots, not screenshots.”**

The wedge is the Optiver-style dual-market challenge: a specific, technically interesting mechanic
with an existing open-source heritage. The expansion is a general multi-strategy arena with seasons,
divisions and private leagues.

## 5. Pricing

### Plans

| | **Free** | **Pro** | **Desk** |
| --- | --- | --- | --- |
| Price | $0 forever | **$19/month** | **$99/month** |
| Paper accounts | 1 | 1 | 5 named seats |
| Active bots | 2 | 10 | 50 |
| Strategy families | All six | All six | All six |
| Custom JSON uploads | Yes | Yes | Yes |
| Divisions | Open | Open + Raised | Open + Raised |
| Public seasons | Yes | Yes | Yes |
| Tournament entry | Standard | Priority | Priority + private events |
| Round-history CSV | — | Yes | Yes |
| Private practice league | — | Yes | Yes |
| Team leaderboard / audit log | — | — | Yes |
| API read access | — | — | Yes |
| Support | Community | Email | Priority |
| Annual price | — | $190/year (2 months free) | $990/year |

**Enterprise / private league:** from **$2,500 per event** or **$12,000/year** for a branded league
with up to 250 participants, custom rules, a private leaderboard and a results report. Includes
onboarding and a live-event runbook.

### Pricing principles

1. **The competition is free.** Charging for entry would undermine the leaderboard's credibility and
   invite gambling comparisons.
2. **Paid plans sell capacity and tooling, not advantage.** Scoring rules are identical within a
   division. Pro/Desk do not get better fills, lower latency or a different venue.
3. **Divisions, not hidden handicaps.** Raised is an eligibility tier with a higher payout threshold,
   not a pay-to-win multiplier.
4. **Institutional pricing is event-based.** Universities and firms buy outcomes (a branded event, a
   recruiting pipeline), not seats.
5. **No real-money upsell.** There is no path from a paper account to a live brokerage account on the
   platform. That keeps trust and regulatory scope intact.

### Why these numbers

- $19 is an impulse purchase for a developer who already spends on data, cloud and courses.
- $99 supports a small team and is still far below a single seat of a professional backtesting
  platform.
- $2.5k per event is comparable to a university sponsorship or a one-day hackathon budget.
- Gross margin is high because the marginal cost of another bot is a few milliseconds of CPU per
  tick, not a market-data licence.

### Packaging rules

- A paused bot still consumes a slot; delete it to free capacity.
- Seats are named and non-transferable.
- Annual plans are prepaid and non-refundable after 14 days.
- Beta users keep a 50% discount on Pro for the first 12 months if they upgrade within 30 days of
  general availability.
- Simulated prize credits can be applied to plan discounts but are never cashable.

## 6. Revenue model and projections

### Revenue streams

1. **Pro subscriptions** — $19/month or $190/year.
2. **Desk subscriptions** — $99/month or $990/year.
3. **Private leagues / enterprise events** — $2,500–$12,000 per contract.
4. **Sponsorships** (later) — season prize pools and tournament naming, clearly labelled.
5. **Recruiting pipeline** (later) — anonymised opt-in talent discovery for Desk customers.

No revenue from: deposits, spreads, order flow, signal sales, or performance fees.

### Base-case 12-month model

| Quarter | Registered | MAU | Pro seats | Desk seats | Event contracts | MRR |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Q1 | 2,000 | 400 | 20 | 2 | 0 | $578 |
| Q2 | 6,000 | 1,000 | 70 | 5 | 1 | $1,825 |
| Q3 | 13,000 | 1,900 | 170 | 11 | 3 | $4,319 |
| Q4 | 25,000 | 3,000 | 350 | 20 | 5 | $8,630 |

Assumptions:

- 12% of MAU convert to Pro at some point; 30% monthly churn on Pro, so the paid base grows with
  acquisition rather than retention alone.
- 5–6% of paid accounts are Desk; Desk is sold to teams rather than individuals.
- Event contracts are counted as annualised recurring revenue for simplicity; cash is recognised per
  event.
- Conversion is deliberately conservative. A competition product has a large free audience and a
  narrow paid core.

### Unit economics (steady state)

| Metric | Free | Pro | Desk |
| --- | ---: | ---: | ---: |
| Monthly revenue | $0 | $19.00 | $99.00 |
| Payment processing (3.5% + $0.30) | — | $0.97 | $3.77 |
| Infrastructure allocation | $0.12 | $0.45 | $1.40 |
| Support allocation | $0.10 | $1.20 | $6.00 |
| **Gross margin** | — | **~86%** | **~89%** |
| CAC target | $0 | $12 | $180 |
| Payback | — | <1 month | ~2 months |

Infrastructure is low because the venue is synthetic and the engine is one Durable Object. The real
cost is support and community, which is why Desk carries a higher support allocation.

### Cost base (annual, base case)

| Line | Year 1 |
| --- | ---: |
| Cloudflare Workers / Durable Objects / assets | $1,200 |
| Domain, email, transactional mail | $600 |
| Auth/email/analytics tooling | $2,400 |
| Design and frontend contract | $18,000 |
| Community/moderation part-time | $12,000 |
| Legal review (terms, privacy, competition) | $6,000 |
| Marketing and event sponsorships | $15,000 |
| **Total** | **~$55,200** |

Break-even at the base-case exit run rate is approximately **$9k MRR**, reached in the Q4–Q1 window
if acquisition holds. The plan is designed to be fundable from revenue plus a small angel round, not
a large venture round.

## 7. Go-to-market

### Phase 1 — Heritage and developer credibility (months 0–3)

- Publish the Optiver/HTB port story, the strategy teardowns and the real-market-gap document.
- Launch on Hacker News, r/algotrading, QuantConnect forums, GitHub, university CS societies.
- Ship the bot upload spec and a “first bot in 10 minutes” tutorial.
- Seed the leaderboard with clearly labelled benchmark bots.
- Newsletter: biweekly, technical, no signals.

### Phase 2 — Seasons and community (months 3–9)

- Run Season 15 as the public beta with weekly forum posts and a season recap.
- Launch tournaments with themes: basis sprint, news shock, maker-only, student cup.
- Open the Raised division trial with 32 invited bots.
- Partner with 3–5 university trading societies for branded private leagues.
- Add round-history CSV export and a public bot profile page.

### Phase 3 — Monetisation and teams (months 9–18)

- Turn on Pro and Desk billing after the beta.
- Launch private practice leagues and team seats.
- Sell two flagship enterprise events per quarter.
- Introduce opt-in recruiting for Desk customers.
- Explore a reviewed WebAssembly sandbox for code-based bots.

### Acquisition channels and targets

| Channel | Cost | Expected share of signups |
| --- | --- | --- |
| Open-source / GitHub / HN | Low | 30% |
| University societies | Low–medium | 25% |
| Forum / Discord / Reddit | Low | 20% |
| Newsletter referrals | Low | 10% |
| Tournament sponsorships | Medium | 10% |
| Paid search / dev newsletters | Medium | 5% |

### Retention loops

- **Season cadence:** a new rule set every 47 days gives a natural reason to return.
- **Bot history:** round history, rating and past seasons create switching cost.
- **Community:** forum threads and newsletter issues create habit.
- **Tournaments:** short formats pull back lapsed users.
- **Teams:** Desk seats make the product part of a shared workflow.

## 8. Roadmap

| Priority | Item | Why |
| --- | --- | --- |
| P0 | Billing and plan enforcement | Turns the beta into a business. |
| P0 | Public bot profiles and share cards | Distribution and social proof. |
| P1 | Round-history CSV / API export | Core Pro feature; supports external analysis. |
| P1 | Private leagues | Highest-value institutional product. |
| P1 | Better season automation and payouts | Operational leverage. |
| P2 | Reviewed WebAssembly bot sandbox | Expands the addressable developer audience. |
| P2 | Team seats, audit log and SSO | Unlocks Desk. |
| P2 | Mobile-friendly live view and notifications | Retention. |
| P3 | Sponsor marketplace | Additional revenue without selling data. |
| P3 | Recruiting opt-in | Desk upsell. |

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| “Paper trading is meaningless” criticism | Trust | Publish the real-market-gap document; never claim predictive validity; keep scoring transparent. |
| Regulatory confusion with gambling/brokerage | Existential | No stakes, no deposits, no cash prizes, no real execution; legal review before billing; clear terms. |
| Bot upload abuse | Security | Declarative JSON only; server-side validation; per-account books; rate limits; no eval. |
| Leaderboard gaming / multi-accounting | Fairness | One account per person; device/session signals; score corrections; sanctions and appeals. |
| Low free-to-paid conversion | Revenue | Paid value is capacity and team tooling, not score; test annual plans and event add-ons. |
| Infrastructure cost spike from many bots | Margin | Tick budget per account; plan bot limits; sample inactive users; object-level throttles. |
| Dependence on one cloud | Availability | The engine is portable TypeScript; state is serialised; static client can be hosted elsewhere. |
| Community toxicity | Brand | Published forum rules, moderation, sanctions, appeals. |
| Season fatigue | Retention | Short tournaments, rule changes, community events, reset communication. |

## 10. KPIs

**Acquisition:** signups, activation rate (first bot deployed within 24h), source mix, CAC.

**Engagement:** weekly active traders, bots per active account, rounds per bot per week, forum posts,
newsletter open rate.

**Competition integrity:** share of bots with ≥20 rounds, score corrections, sanctions, appeals
overturned.

**Monetisation:** free→Pro conversion, Pro→Desk expansion, MRR, churn, gross margin, event pipeline.

**Reliability:** tick p95 latency, WebSocket reconnect rate, failed order rate, incident count.

Targets for the first 12 months:

- Activation: ≥45% of signups deploy a bot within 24 hours.
- Weekly retention: ≥35% of activated users return in week 4.
- Paid conversion: 10–14% of MAU over 90 days.
- Pro churn: <4% monthly.
- Tick p95: <5 ms in the Durable Object.
- Community: ≥40 new forum threads per month by month 6.

## 11. Operating plan

**Team:** one full-stack engineer (platform), one part-time designer, one part-time community
moderator, fractional legal and finance.

**Cadence:** two-week product increments; season reset every 47 days; tournament every 4–6 weeks;
newsletter every two weeks; monthly public metrics post.

**Support:** community forum for Free, email for Pro (48h), priority for Desk (same business day),
shared Slack channel for enterprise events.

**Finance:** Stripe (or equivalent) for subscriptions; annual prepay; no handling of client funds.
Simulated prize credits are a marketing liability, capped per season.

## 12. Why now

- Developer tooling and cloud primitives make a credible simulation cheap to run.
- A generation of developers has learned markets through crypto and wants a safer sandbox.
- Universities and employers want verifiable, practical trading-technology signals.
- The Optiver/HTB challenge left behind a concrete, technically interesting strategy corpus and an
  audience that already understands the mechanics.
- AI-assisted coding is increasing the number of people who can ship a bot but not necessarily
  evaluate one. A public, scored arena becomes the evaluation layer.

## 13. Ask / next step

The beta is live and free. The next milestone is a 90-day validation sprint:

1. 5,000 registered traders and 500 weekly active competitors.
2. 100 Pro waitlist commitments at $19.
3. Three signed private-league letters of intent at $2,500+.
4. A published season recap with retention and conversion data.

If those hold, turn on billing, hire the community lead, and run the first paid season.

---

*This plan is a working document, not a financial projection or an offer of securities. All product
figures are simulated. Prices are stated in USD and exclude local taxes.*
