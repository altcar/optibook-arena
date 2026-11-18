import { expect, test, type Page } from '@playwright/test';

const stamp = () => Date.now().toString().slice(-8);

async function register(page: Page, prefix = 'trader') {
  const username = `${prefix}${stamp()}`.slice(0, 20);
  await page.goto('/register');
  await page.locator('input[name=username]').fill(username);
  await page.locator('input[name=email]').fill(`${username}@example.com`);
  await page.locator('input[name=password]').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.locator('.account-banner')).toBeVisible({ timeout: 20_000 });
  return username;
}

test.describe('public site', () => {
  for (const [path, heading] of [
    ['/', 'Ship the bot.'],
    ['/leaderboard', 'The board is the product.'],
    ['/seasons', 'Every season changes the game.'],
    ['/tournaments', 'Short formats. Sharp edges.'],
    ['/forum', 'The build room.'],
    ['/newsletter', 'Season notes for people who ship bots.'],
    ['/rules', 'The rules that keep the arena fair.'],
    ['/pricing', 'Free to compete. Paid to scale.'],
    ['/stack', 'A trading arena that fits in one Durable Object.'],
    ['/docs/bots', 'What to upload, and what the engine will do with it.'],
    ['/live', 'Ten books. One tick loop.'],
  ] as const) {
    test(`renders ${path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(path);
      await expect(page.locator('h1').first()).toContainText(heading);
      expect(errors).toEqual([]);
    });
  }

  test('leaderboard has seeded bots and season filters', async ({ page }) => {
    await page.goto('/leaderboard');
    const table = page.getByTestId('leaderboard-table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('Baseline');
    const rows = await table.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(10);
    await page.getByRole('tab', { name: 'Raised' }).click();
    await expect(page.locator('.leaderboard-meta')).toContainText('bots ranked');
    await page.locator('.search-field').last().fill('Baseline');
    await expect(table).toContainText('Baseline');
  });

  test('websocket delivers a live snapshot for ten instruments', async ({ page }) => {
    await page.goto('/live');
    await expect(page.locator('.live-table tbody tr')).toHaveCount(10);
    const snapshot = await page.evaluate(
      () =>
        new Promise<{ type: string; instruments: unknown[]; seq: number }>((resolve, reject) => {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
          const timer = window.setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket snapshot timed out'));
          }, 8000);
          ws.onmessage = (event) => {
            const message = JSON.parse(String(event.data));
            if (message.type === 'snapshot') {
              window.clearTimeout(timer);
              ws.close();
              resolve(message);
            }
          };
          ws.onerror = () => reject(new Error('WebSocket failed'));
        }),
    );
    expect(snapshot.type).toBe('snapshot');
    expect(snapshot.instruments).toHaveLength(10);
    expect(snapshot.seq).toBeGreaterThan(0);
  });

  test('season and tournament details render', async ({ page }) => {
    await page.goto('/season/15');
    await expect(page.locator('h1')).toContainText('Season 15');
    await expect(page.locator('.rule-list')).toContainText('Starting paper balance');
    await page.goto('/tournaments');
    await expect(page.locator('.tournament-card').first()).toContainText('Basis Blitz');
  });
});

test.describe('account and trading', () => {
  test('registers, trades, and shows an isolated position', async ({ page }) => {
    const username = await register(page);
    await expect(page.locator('.account-banner')).toContainText(username);
    await expect(page.locator('body')).toContainText(/account equity/i);

    await page.getByRole('button', { name: /Buy 10 NVDA/i }).click();
    await expect(page.locator('.positions-panel')).toContainText('NVDA');
    await expect(page.locator('.positions-panel')).toContainText('manual');

    const account = await page.locator('.account-metrics').innerText();
    expect(account).toContain('EQUITY');
  });

  test('runs every strategy family from the dashboard', async ({ page }) => {
    await register(page);
    const families = ['Dual Maker', 'Pair Hedger', 'Dual Arbitrage', 'News Sentiment', 'Momentum Maker', 'Adaptive Maker'];
    for (const family of families) {
      const toggle = page.getByRole('switch', { name: `Start ${family}` });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByRole('switch', { name: `Pause ${family}` })).toBeVisible();
    }
    await expect(page.locator('.strategies-panel')).toContainText('6 / 6 running');
    for (const family of families) {
      await page.getByRole('switch', { name: `Pause ${family}` }).click();
    }
    await expect(page.locator('.strategies-panel')).toContainText('0 / 6 running');
  });

  test('logout and login keeps the same paper account', async ({ page }) => {
    const username = await register(page, 'login');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.locator('.site-nav')).toBeVisible();
    await page.goto('/login');
    await page.locator('input[name=login]').fill(username);
    await page.locator('input[name=password]').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');
    await expect(page.locator('.account-banner')).toContainText(username);
  });

  test('unauthenticated API actions are rejected', async ({ request }) => {
    const response = await request.post('/api/order', {
      data: { instrument: 'NVDA', side: 'buy', qty: 1, type: 'market' },
    });
    expect(response.status()).toBe(401);
    const bots = await request.get('/api/bots');
    expect(bots.status()).toBe(401);
  });
});

test.describe('bot console', () => {
  test('deploys a template, pauses and resumes it', async ({ page }) => {
    await register(page, 'bot');
    await page.goto('/bots');
    await expect(page.getByTestId('bot-editor')).toHaveValue(/Basis Hunter/);
    await page.getByTestId('deploy-bot').click();
    await expect(page.locator('.form-success')).toContainText('is live');
    await expect(page.getByTestId('bot-card')).toHaveCount(1);
    await expect(page.getByTestId('bot-card').first()).toContainText('Basis Hunter');

    await page.getByTestId('bot-card').first().getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByTestId('bot-card').first()).toContainText('Resume');
    await page.getByTestId('bot-card').first().getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByTestId('bot-card').first()).toContainText('Pause');
  });

  test('validates bad JSON and accepts a custom upload', async ({ page }) => {
    await register(page, 'upload');
    await page.goto('/bots');
    await page.getByTestId('bot-editor').fill('{ "name": "x" }');
    await expect(page.getByTestId('bot-editor')).toHaveValue('{ "name": "x" }');
    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByTestId('validation-box')).toContainText('Validation failed');
    await expect(page.getByTestId('validation-box')).toContainText('Family');

    const spec = {
      name: `Custom ${stamp()}`,
      description: 'A Playwright-uploaded basis rule.',
      family: 'custom',
      universe: ['NVDA'],
      params: { qty: 2 },
      risk: { maxPosition: 20, maxGross: 20_000, maxOrdersPerMin: 15 },
      rules: [
        {
          when: [{ field: 'basisBps', op: 'abs_gt', value: 5, instrument: 'NVDA' }],
          action: { type: 'pair', long: 'NVDA', short: 'NVDA_DUAL', qty: 2 },
          cooldownMs: 2000,
        },
      ],
    };
    await page.locator('input[type=file]').setInputFiles({
      name: 'custom-bot.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(spec)),
    });
    await expect(page.getByTestId('bot-editor')).toHaveValue(new RegExp(spec.name));
    await page.getByTestId('deploy-bot').click();
    await expect(page.locator('.form-success')).toContainText('is live');
    await expect(page.getByTestId('bot-card')).toHaveCount(1);
    await expect(page.getByTestId('bot-card').first()).toContainText('Custom Rules');
  });

  test('viewer bot appears on the leaderboard', async ({ page }) => {
    const username = await register(page, 'board');
    await page.goto('/bots');
    await page.getByTestId('deploy-bot').click();
    await expect(page.locator('.form-success')).toContainText('is live');
    await page.goto('/leaderboard');
    const row = page.locator('tr.is-viewer');
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(username);
    await expect(row).toContainText('Basis Hunter');
  });
});

test.describe('community and competition', () => {
  test('registers for a tournament', async ({ page }) => {
    await register(page, 'tour');
    await page.goto('/tournaments');
    const live = page.locator('.tournament-card.live').first();
    await expect(live).toContainText('Basis Blitz');
    await live.getByRole('button', { name: 'Register for this event' }).click();
    await expect(live).toContainText('Registered');
  });

  test('creates a forum thread and replies', async ({ page }) => {
    const username = await register(page, 'forum');
    await page.goto('/forum');
    await page.getByRole('button', { name: 'New thread' }).click();
    const title = `Playwright thread ${stamp()}`;
    await page.locator('.forum-composer input').fill(title);
    await page.locator('.forum-composer textarea').fill('A reproducible test thread about basis rules and risk limits.');
    await page.getByRole('button', { name: 'Publish thread' }).click();
    await expect(page.locator('.form-success')).toContainText('published');
    const row = page.locator('.thread-row', { hasText: title }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('h1')).toContainText(title);
    await page.locator('.reply-panel textarea').fill('A reply posted by the Playwright suite.');
    await page.getByRole('button', { name: 'Post reply' }).click();
    await expect(page.locator('.post-list')).toContainText('A reply posted by the Playwright suite.');
    await expect(page.locator('.post-list')).toContainText(username);
  });

  test('subscribes to the newsletter', async ({ page }) => {
    await page.goto('/newsletter');
    await page.locator('.newsletter-form input').fill(`news${stamp()}@example.com`);
    await page.getByRole('button', { name: 'Get the newsletter' }).click();
    await expect(page.locator('.newsletter-form')).toContainText('You are subscribed');
    await expect(page.locator('.issue-card').first()).toBeVisible();
  });
});

test.describe('responsive', () => {
  test('mobile navigation and dashboard render', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Ship the bot.');
    await page.getByRole('button', { name: 'Toggle menu' }).click();
    await expect(page.locator('.site-links.is-open')).toBeVisible();
    await register(page, 'mobile');
    await expect(page.locator('.account-banner')).toBeVisible();
    await expect(page.locator('.terminal-grid')).toBeVisible();
  });
});
