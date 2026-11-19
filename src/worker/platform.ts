/**
 * Persistent platform records and the demo seed data that makes the arena feel
 * alive before real users arrive. All timestamps are milliseconds.
 */

import {
  STRATEGY_META,
  type BotFamily,
  type BotRound,
  type BillingInterval,
  type BotSpec,
  type ChatMessage,
  type Division,
  type ForumPost,
  type ForumThread,
  type NewsletterIssue,
  type Plan,
  type Season,
  type SessionUser,
  type SubscriptionStatus,
  type Tournament,
} from '../shared/types';

export interface UserRecord {
  id: string;
  username: string;
  usernameLower: string;
  email: string;
  emailLower: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  plan: Plan;
  division: Division;
  startingCash: number;
  strategyEnabled: Record<string, boolean>;
  strategyConfig: Record<string, Record<string, number>>;
  newsletter: boolean;
  lastSeen: number;
  country: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: SubscriptionStatus;
  billingInterval?: BillingInterval | null;
  renewsAt?: number | null;
}

export interface BotRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  family: BotFamily;
  params: Record<string, number>;
  risk: BotSpec['risk'];
  universe: BotSpec['universe'];
  rules?: BotSpec['rules'];
  status: 'active' | 'paused' | 'draft';
  source: 'template' | 'upload' | 'custom';
  createdAt: number;
  updatedAt: number;
  rounds: BotRound[];
  lastPnl: number;
  lastRoundTick: number;
  lastActionAt: number;
  actionCount: number;
  windowStartedAt: number;
  windowActions: number;
}

export interface ForumThreadRecord {
  id: string;
  title: string;
  category: string;
  author: string;
  authorPlan: Plan | 'staff';
  createdAt: number;
  lastAt: number;
  views: number;
  likes: number;
  pinned: boolean;
  tags: string[];
  posts: ForumPost[];
}

export interface PlatformState {
  version: 2;
  users: UserRecord[];
  sessions: Record<string, { userId: string; createdAt: number; expiresAt: number }>;
  bots: BotRecord[];
  threads: ForumThreadRecord[];
  newsletter: string[];
  tournamentRegs: Record<string, string[]>;
  equity: Record<string, number[]>;
  chat: ChatMessage[];
  billingEvents: string[];
  createdAt: number;
}

export interface SeededLeaderboardBot {
  botId: string;
  botName: string;
  owner: string;
  division: Division;
  pnl: number;
  winRate: number;
  trades: number;
  sharpe: number;
  trend: number[];
  family: BotFamily;
}

export const FAMILY_NAMES: Record<BotFamily, string> = {
  'dual-mm': 'Dual Maker',
  hedge: 'Pair Hedger',
  'dual-arb': 'Dual Arbitrage',
  'sentiment-mm': 'News Sentiment',
  'momentum-mm': 'Momentum Maker',
  'adaptive-mm': 'Adaptive Maker',
  custom: 'Custom Rules',
};

export const FAMILY_DEFAULTS: Record<BotFamily, Record<string, number>> = {
  'dual-mm': { spread: 0.14, qty: 8 },
  hedge: { threshold: 30, qty: 12 },
  'dual-arb': { edgeBps: 8, qty: 5 },
  'sentiment-mm': { spread: 0.16, qty: 6, takeThreshold: 0.4 },
  'momentum-mm': { spread: 0.15, qty: 6, horizon: 6, bias: 0.5 },
  'adaptive-mm': { baseSpread: 0.07, qty: 8, hedgeThreshold: 70 },
  custom: { edgeBps: 10, qty: 5 },
};

export const DEFAULT_RISK = { maxPosition: 40, maxGross: 60_000, maxOrdersPerMin: 20 };

export const STARTING_CASH = 100_000;
export const POSITION_LIMIT = 100;

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 18, 9, 0, 0); // 18 Nov 2026, 09:00 UTC
const CURRENT_START = Date.UTC(2026, 10, 2); // Season 15 starts 2 Nov 2026
const SEASON_CYCLE = 49 * DAY;
const SEASON_LENGTH = 47 * DAY;

const SEASON_NAMES: Record<number, string> = {
  1: 'Genesis',
  2: 'Open Book',
  3: 'First Light',
  4: 'Basis School',
  5: 'Flow State',
  6: "Maker's Mark",
  7: 'Pair Trade',
  8: 'Headline Hunt',
  9: 'Volatility Regime',
  10: 'Spread Season',
  11: 'Liquidity Games',
  12: 'Open Circuit',
  13: 'Delta Neutral',
  14: 'News Shock',
  15: 'Basis Run',
  16: 'Maker Rebate',
};

const SEASON_TAGLINES: Record<number, string> = {
  14: 'Headline-driven volatility with a tighter inventory cap.',
  13: 'Delta-neutral scoring and a 10 bps arbitrage hurdle.',
  15: 'The flagship basis season. Six families, five pairs, one leaderboard.',
  16: 'A maker-rebate experiment with a tighter taker fee.',
};

export const SEASONS: Season[] = Array.from({ length: 16 }, (_, index) => {
  const id = index + 1;
  const upcoming = id === 16;
  const live = id === 15;
  const start = upcoming
    ? CURRENT_START + SEASON_CYCLE
    : live
      ? CURRENT_START
      : CURRENT_START - (15 - id) * (SEASON_CYCLE - DAY);
  const end = start + SEASON_LENGTH - 1;
  const status: Season['status'] = upcoming ? 'upcoming' : live ? 'live' : 'past';
  return {
    id,
    name: `Season ${id} · ${SEASON_NAMES[id] ?? 'Open Circuit'}`,
    tagline: SEASON_TAGLINES[id] ?? 'A standard six-family arena season.',
    status,
    startsAt: start,
    endsAt: end,
    prizePool: live ? 25_000 : upcoming ? 30_000 : Math.max(2_500, 18_000 - (15 - id) * 900),
    entry: live ? 'Free · Open and Raised divisions' : upcoming ? 'Free · both divisions' : 'Free entry',
    description:
      live
        ? 'Season 15 is a 47-day paper-trading competition. Bots trade a synthetic dual-market venue with five stocks and five dual listings. Scoring is net P&L after simulated fees, with win rate as the tie-breaker.'
        : upcoming
          ? 'Season 16 introduces a maker rebate funded by a taker fee, plus a 60-share inventory cap. Custom rule bots and all six families are eligible.'
          : 'A completed arena season. Results are archived for transparency and historical rating.',
    rules:
      live
        ? [
            'Starting paper balance: $100,000 per account.',
            'Max net position: 100 shares per instrument (aggregated across your manual book, strategies and bots).',
            'All six strategy families plus custom rule bots are eligible.',
            'One account per person. Bots must be your own work.',
            'Scoring: net P&L after 1 bp simulated fee; tie-break on win rate, then Sharpe.',
            'Minimum 20 closed rounds to qualify for the Raised division payout.',
          ]
        : upcoming
          ? [
              'Starting paper balance: $100,000 per account.',
              'Maker fills earn a 0.5 bp rebate; taker fills pay 2 bps.',
              'Max net position: 60 shares per instrument.',
              'Custom rule bots and all six families are eligible.',
            ]
          : [
              'Archived season. Scoring used the rule set published at the time.',
              'Results remain viewable for rating history.',
            ],
    allowedFamilies: ['dual-mm', 'hedge', 'dual-arb', 'sentiment-mm', 'momentum-mm', 'adaptive-mm', 'custom'],
    startingCash: STARTING_CASH,
    positionLimit: live ? POSITION_LIMIT : upcoming ? 60 : POSITION_LIMIT,
    feeBps: live ? 1 : upcoming ? 2 : 1,
    divisions: ['open', 'raised'],
  };
});

export const CURRENT_SEASON = SEASONS.find((season) => season.id === 15) ?? SEASONS[14];

export const TOURNAMENTS: Tournament[] = [
  {
    id: 'basis-blitz-11',
    name: 'Basis Blitz XI',
    description: 'A 72-hour sprint. Highest net P&L on the five dual pairs wins. Inventory resets every 24 hours.',
    format: '72h · all families · P&L sprint',
    status: 'live',
    startsAt: Date.UTC(2026, 10, 19, 12),
    endsAt: Date.UTC(2026, 10, 21, 12),
    prize: 4_000,
    entry: 'Free · Raised division',
    participants: 186,
    capacity: 512,
    seasonId: 15,
    rules: [
      'Register before the first reset (19 Nov 12:00 UTC).',
      'Only Raised-division accounts are eligible for prizes.',
      'Positions reset to flat every 24 hours; P&L carries over.',
      'News events run at 3× frequency for the final six hours.',
    ],
    registered: false,
  },
  {
    id: 'news-shock-7',
    name: 'News Shock VII',
    description: 'A sentiment-only tournament. Bots must hold at least one position through every headline window.',
    format: '48h · sentiment + custom · headline response',
    status: 'upcoming',
    startsAt: Date.UTC(2026, 10, 24, 12),
    endsAt: Date.UTC(2026, 10, 26, 12),
    prize: 2_500,
    entry: 'Free · Open division',
    participants: 94,
    capacity: 256,
    seasonId: 15,
    rules: [
      'Only sentiment and custom-family bots are eligible.',
      'A headline window opens every 20 minutes; flat books are penalised.',
      'Maximum gross exposure is halved for the duration.',
    ],
    registered: false,
  },
  {
    id: 'dual-sprint-9',
    name: 'Dual Sprint IX',
    description: 'A one-day maker tournament scored on spread capture and fill quality rather than raw P&L.',
    format: '24h · maker families · spread capture',
    status: 'completed',
    startsAt: Date.UTC(2026, 10, 6, 9),
    endsAt: Date.UTC(2026, 10, 7, 9),
    prize: 1_500,
    entry: 'Free · Open division',
    participants: 212,
    capacity: 256,
    seasonId: 15,
    rules: ['Scored on spread capture per filled share.', 'Taker volume is capped at 20% of fills.'],
    registered: false,
  },
  {
    id: 'kickoff-15',
    name: 'Season 15 Kickoff',
    description: 'The opening 48-hour tournament of Season 15. All families, standard rules.',
    format: '48h · all families · standard',
    status: 'completed',
    startsAt: Date.UTC(2026, 10, 2, 12),
    endsAt: Date.UTC(2026, 10, 4, 12),
    prize: 2_000,
    entry: 'Free · both divisions',
    participants: 304,
    capacity: 512,
    seasonId: 15,
    rules: ['Standard Season 15 rules apply.', 'Top 32 advance to the Raised division trial.'],
    registered: false,
  },
];

export const SEEDED_BOTS: SeededLeaderboardBot[] = [
  ['baseline', 'Baseline', 'queuelab', 'raised', 41_820, 68.4, 1842, 2.41, 'dual-arb'],
  ['sigma-seven', 'Sigma Seven', 'deltaine', 'raised', 36_410, 64.1, 2210, 2.28, 'adaptive-mm'],
  ['newsflash', 'Newsflash', 'tapewatcher', 'raised', 31_905, 61.7, 967, 1.96, 'sentiment-mm'],
  ['spreadfarmer', 'Spread Farmer', 'bpcollector', 'raised', 28_770, 59.2, 3412, 1.84, 'dual-mm'],
  ['hedgehog', 'Hedgehog', 'flatbook', 'raised', 24_660, 57.8, 1288, 1.77, 'hedge'],
  ['momentum-mk2', 'Momentum MK2', 'velolab', 'raised', 21_340, 56.1, 1620, 1.61, 'momentum-mm'],
  ['quiet-alpha', 'Quiet Alpha', 'silentfill', 'raised', 18_905, 55.4, 742, 1.52, 'adaptive-mm'],
  ['basis-bot', 'Basis Bot', 'pairdesk', 'open', 16_480, 54.9, 2055, 1.44, 'dual-arb'],
  ['tick-tock', 'Tick Tock', 'clockwork', 'open', 14_210, 53.6, 2980, 1.31, 'dual-mm'],
  ['microstructure', 'Microstructure', 'bookmap', 'open', 12_880, 52.9, 1754, 1.27, 'adaptive-mm'],
  ['headline-hunter', 'Headline Hunter', 'newswire', 'open', 11_420, 52.2, 688, 1.19, 'sentiment-mm'],
  ['delta-dog', 'Delta Dog', 'hedgefund', 'open', 9_760, 51.8, 1402, 1.12, 'hedge'],
  ['slow-burn', 'Slow Burn', 'lowvol', 'open', 8_340, 51.1, 512, 1.04, 'momentum-mm'],
  ['penny-pair', 'Penny Pair', 'smallcaps', 'open', 6_920, 50.4, 3120, 0.96, 'dual-arb'],
  ['queue-jumper', 'Queue Jumper', 'latency', 'open', 5_180, 49.8, 2650, 0.88, 'dual-mm'],
  ['inventory-zero', 'Inventory Zero', 'flatline', 'open', 3_460, 49.1, 980, 0.74, 'hedge'],
  ['random-walk', 'Random Walk', 'monkey', 'open', 1_240, 48.7, 1220, 0.55, 'custom'],
  ['the-control', 'The Control', 'controlgroup', 'open', -2_180, 44.3, 640, -0.31, 'custom'],
].map((row) => {
  const [botId, botName, owner, division, pnl, winRate, trades, sharpe, family] = row as [
    string,
    string,
    string,
    Division,
    number,
    number,
    number,
    number,
    BotFamily,
  ];
  const trend = Array.from({ length: 24 }, (_, i) => {
    const progress = (i + 1) / 24;
    const noise = Math.sin(i * 1.7 + pnl) * (pnl * 0.018 + 90);
    return Number((pnl * progress + noise).toFixed(2));
  });
  return { botId, botName, owner, division, pnl, winRate, trades, sharpe, trend, family };
});

export function seededForumThreads(): ForumThreadRecord[] {
  const post = (
    id: string,
    threadId: string,
    author: string,
    authorPlan: Plan | 'staff',
    body: string,
    minutesAgo: number,
    likes = 0,
    staff = false,
  ): ForumPost => ({
    id,
    threadId,
    author,
    authorPlan,
    body,
    createdAt: T0 - minutesAgo * 60_000,
    likes,
    staff,
  });

  return [
    {
      id: 'th-season-15',
      title: 'Season 15 is live — basis run rules and payout schedule',
      category: 'Announcements',
      author: 'optibook',
      authorPlan: 'staff',
      createdAt: T0 - 3 * DAY,
      lastAt: T0 - 40 * 60_000,
      views: 8421,
      likes: 214,
      pinned: true,
      tags: ['season-15', 'rules'],
      posts: [
        post(
          'p1',
          'th-season-15',
          'optibook',
          'staff',
          'Season 15 is live. Starting balance is $100,000, net position cap is 100 shares per instrument, and all six families plus custom-rule bots are eligible.\n\nScoring is net P&L after a 1 bp simulated fee. Win rate breaks ties, then Sharpe. The Raised division payout requires at least 20 closed rounds.\n\nGood luck. Keep the books honest.',
          T0 - 3 * DAY,
          188,
          true,
        ),
        post(
          'p2',
          'th-season-15',
          'queuelab',
          'pro',
          'The 1 bp fee finally makes the passive maker families think about turnover. Our basis bot dropped from 2,900 to 2,200 trades after we added a minimum edge filter.',
          T0 - 2 * DAY,
          41,
        ),
        post(
          'p3',
          'th-season-15',
          'tapewatcher',
          'free',
          'Does the 20-round minimum count rounds where the bot was paused?',
          T0 - 40 * 60_000,
          6,
        ),
      ],
    },
    {
      id: 'th-basis-jump',
      title: 'How do you handle the basis jump at 14:30?',
      category: 'Strategy Talk',
      author: 'flatbook',
      authorPlan: 'pro',
      createdAt: T0 - 2 * DAY,
      lastAt: T0 - 3 * 60 * 60_000,
      views: 1902,
      likes: 76,
      pinned: false,
      tags: ['basis', 'risk'],
      posts: [
        post(
          'p4',
          'th-basis-jump',
          'flatbook',
          'pro',
          'The synthetic venue injects a basis jump roughly every 140 ticks. Our hedger was chasing the dual after the jump and paying the spread twice.\n\nWe now freeze new pair entries for 900 ms after a 30 bps move and only hedge the stock leg. Drawdown dropped by 38%.',
          T0 - 2 * DAY,
          52,
        ),
        post(
          'p5',
          'th-basis-jump',
          'deltaine',
          'pro',
          'Same observation. We treat the jump as a liquidity event, not a signal. Cancel quotes, wait for the book to rebuild, then re-enter at the new basis.',
          T0 - 3 * 60 * 60_000,
          24,
        ),
      ],
    },
    {
      id: 'th-upload-spec',
      title: 'Bot upload spec: what exactly is allowed in a custom rule?',
      category: 'Bot Development',
      author: 'monkey',
      authorPlan: 'free',
      createdAt: T0 - 20 * 60 * 60_000,
      lastAt: T0 - 55 * 60_000,
      views: 1204,
      likes: 33,
      pinned: false,
      tags: ['upload', 'custom', 'help'],
      posts: [
        post(
          'p6',
          'th-upload-spec',
          'monkey',
          'free',
          'I uploaded a JSON bot with a basis trigger and a pair action. It validated, but I want to confirm the units: is basisBps already in basis points, or a decimal?',
          T0 - 20 * 60 * 60_000,
          11,
        ),
        post(
          'p7',
          'th-upload-spec',
          'optibook',
          'staff',
          'basisBps is already in basis points. A value of 10 means 0.10%. Use abs_gt when you care about either direction. The full schema is in BOT_UPLOAD.md and on /docs/bots.',
          T0 - 18 * 60 * 60_000,
          29,
          true,
        ),
        post(
          'p8',
          'th-upload-spec',
          'monkey',
          'free',
          'Perfect — and the cooldown is per rule, not per bot?',
          T0 - 55 * 60_000,
          2,
        ),
      ],
    },
    {
      id: 'th-fees',
      title: 'Fee change proposal: maker rebate instead of flat 1 bp',
      category: 'Feature Requests',
      author: 'bpcollector',
      authorPlan: 'pro',
      createdAt: T0 - 26 * 60 * 60_000,
      lastAt: T0 - 7 * 60 * 60_000,
      views: 866,
      likes: 44,
      pinned: false,
      tags: ['fees', 'maker'],
      posts: [
        post(
          'p9',
          'th-fees',
          'bpcollector',
          'pro',
          'A flat fee punishes exactly the behaviour the arena wants: tight two-sided quotes. A 0.5 bp maker rebate funded by a 2 bp taker fee would make the leaderboard more about liquidity provision.',
          T0 - 26 * 60 * 60_000,
          37,
        ),
        post(
          'p10',
          'th-fees',
          'optibook',
          'staff',
          'We are testing this for Season 16. The current fee stays fixed for Season 15 so nobody has to re-optimise mid-season.',
          T0 - 7 * 60 * 60_000,
          16,
          true,
        ),
      ],
    },
    {
      id: 'th-bug',
      title: 'Paused bot still shows one resting order in the book',
      category: 'Bug Reports',
      author: 'silentfill',
      authorPlan: 'pro',
      createdAt: T0 - 11 * 60 * 60_000,
      lastAt: T0 - 9 * 60 * 60_000,
      views: 412,
      likes: 8,
      pinned: false,
      tags: ['bug', 'orders'],
      posts: [
        post(
          'p11',
          'th-bug',
          'silentfill',
          'pro',
          'Paused an adaptive bot at 09:14 UTC. The bot card says paused, but one bid remained visible for a few seconds. It disappeared after the next tick. Is pause asynchronous?',
          T0 - 11 * 60 * 60_000,
          5,
        ),
        post(
          'p12',
          'th-bug',
          'optibook',
          'staff',
          'Pause cancels orders on the next engine tick (250 ms). The card updates immediately, so there can be a sub-second window where the book still shows the quote. We will add a cancelling state to the card.',
          T0 - 9 * 60 * 60_000,
          9,
          true,
        ),
      ],
    },
    {
      id: 'th-intro',
      title: 'Introduce yourself: what are you building this season?',
      category: 'Strategy Talk',
      author: 'velolab',
      authorPlan: 'pro',
      createdAt: T0 - 4 * DAY,
      lastAt: T0 - 14 * 60 * 60_000,
      views: 3210,
      likes: 91,
      pinned: false,
      tags: ['community'],
      posts: [
        post(
          'p13',
          'th-intro',
          'velolab',
          'pro',
          'Momentum desk here. This season we are testing a vol-scaled maker with a hard 40-share inventory cap. The goal is to survive news shocks without turning into a taker.',
          T0 - 4 * DAY,
          28,
        ),
        post(
          'p14',
          'th-intro',
          'lowvol',
          'free',
          'First season. I am running the adaptive template with the default parameters to get a baseline, then I will upload a custom basis rule. Any advice on position sizing?',
          T0 - 14 * 60 * 60_000,
          12,
        ),
      ],
    },
  ];
}

export const NEWSLETTER_ISSUES: NewsletterIssue[] = [
  {
    id: 'nl-14',
    number: 14,
    title: 'The basis premium',
    subject: 'Season 15, a fee experiment, and the bots that survived the jump',
    summary:
      'Season 15 is live with a tighter inventory cap and a 1 bp simulated fee. We break down the first two weeks, the basis-jump behaviour, and what the Raised division is doing differently.',
    publishedAt: T0 - 2 * DAY,
    readTime: '6 min read',
    highlights: [
      'Season 15 leaderboard: Baseline leads at +$41.8k',
      'Why the 14:30 basis jump hurt hedgers more than makers',
      'Bot upload spec v2: custom rules are now live',
      'Tournament calendar: Basis Blitz XI and News Shock VII',
    ],
  },
  {
    id: 'nl-13',
    number: 13,
    title: 'Uploads are open',
    subject: 'Custom rule bots, the new validator, and a cleaner leaderboard',
    summary:
      'You can now upload a declarative JSON bot, validate it instantly, and run it in the same arena as the six house families. This issue covers the schema, the safety model, and the first community bots.',
    publishedAt: T0 - 12 * DAY,
    readTime: '5 min read',
    highlights: [
      'Bot upload spec and validation rules',
      'Declarative rules beat arbitrary code on day one',
      'Five community bots to watch',
      'How we calculate win rate',
    ],
  },
  {
    id: 'nl-12',
    number: 12,
    title: 'The season reset',
    subject: 'Season 14 results, rating changes, and the Road to Raised',
    summary:
      'News Shock is over. We publish the final standings, explain the rating changes, and open applications for the Raised division trial.',
    publishedAt: T0 - 26 * DAY,
    readTime: '7 min read',
    highlights: [
      'Season 14 final standings',
      'Rating changes for the top 40 bots',
      'Raised division trial: 32 invites',
      'What changes in Season 15',
    ],
  },
  {
    id: 'nl-11',
    number: 11,
    title: 'Why paper trading is the point',
    subject: 'No stakes, no deposits, and a scoreboard that still means something',
    summary:
      'A note on the design philosophy: the arena is a skill competition, not a brokerage. We explain the simulation, the scoring, and the limits of what a paper track record can prove.',
    publishedAt: T0 - 40 * DAY,
    readTime: '4 min read',
    highlights: [
      'Simulation-first, always',
      'What the leaderboard measures',
      'What it does not measure',
      'The path to a real execution sandbox',
    ],
  },
];

export function seededChat(): ChatMessage[] {
  return [
    ['optibook', 'staff', 'Season 15 is live. Keep the books honest and report bugs in the forum.', 190, true],
    ['queuelab', 'pro', 'Basis is wide this morning. Our maker is getting picked off on the dual leg.', 142, false],
    ['tapewatcher', 'free', 'Anyone else seeing the 14:30 jump? The headline feed goes quiet right before it.', 96, false],
    ['optibook', 'staff', 'The jump is part of the venue model, not a news event. Treat it as a liquidity shock.', 74, true],
    ['deltaine', 'pro', 'Uploaded a custom basis rule with a 10 bps trigger. Validator caught a typo in my universe list — nice.', 41, false],
    ['clockwork', 'free', 'First season. Running the adaptive template with default risk to get a baseline.', 18, false],
  ].map(([username, plan, body, minutesAgo, staff], index) => ({
    id: `chat_seed_${index + 1}`,
    username: String(username),
    plan: plan as Plan | 'staff',
    body: String(body),
    ts: T0 - Number(minutesAgo) * 60_000,
    staff: Boolean(staff),
  }));
}

export function seedPlatform(): PlatformState {
  return {
    version: 2,
    users: [],
    sessions: {},
    bots: [],
    threads: seededForumThreads(),
    newsletter: [],
    tournamentRegs: {},
    equity: {},
    chat: seededChat(),
    billingEvents: [],
    createdAt: Date.now(),
  };
}

export function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    plan: user.plan,
    division: user.division,
    createdAt: user.createdAt,
    startingCash: user.startingCash,
    subscriptionStatus: user.subscriptionStatus ?? null,
    billingInterval: user.billingInterval ?? null,
    renewsAt: user.renewsAt ?? null,
  };
}

export function botRecordToSpec(bot: BotRecord): BotSpec {
  return {
    name: bot.name,
    description: bot.description,
    family: bot.family,
    params: { ...bot.params },
    risk: { ...bot.risk },
    universe: [...bot.universe],
    rules: bot.rules ? bot.rules.map((rule) => ({ ...rule, when: rule.when.map((w) => ({ ...w })) })) : undefined,
  };
}

export function threadToSummary(thread: ForumThreadRecord): ForumThread {
  const last = thread.posts[thread.posts.length - 1];
  return {
    id: thread.id,
    title: thread.title,
    excerpt: last?.body.slice(0, 180) ?? '',
    category: thread.category,
    author: thread.author,
    authorPlan: thread.authorPlan,
    createdAt: thread.createdAt,
    lastAt: thread.lastAt,
    replies: Math.max(0, thread.posts.length - 1),
    views: thread.views,
    likes: thread.likes,
    pinned: thread.pinned,
    tags: [...thread.tags],
    posts: thread.posts.map((post) => ({ ...post })),
  };
}

export function planBotLimit(plan: Plan): number {
  return plan === 'free' ? 2 : plan === 'pro' ? 10 : 50;
}

export function planLabel(plan: Plan): string {
  return plan === 'free' ? 'Free' : plan === 'pro' ? 'Pro' : 'Desk';
}
