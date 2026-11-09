import { expect, test, type Page } from '@playwright/test';

/** Use the fast preset so a whole game is reviewed in seconds, and keep the run quiet. */
async function fastEngine(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('blunderscope:settings')) {
      localStorage.setItem('blunderscope:settings', JSON.stringify({ depth: 'fast', threads: 2, sound: false }));
    }
  });
}

async function waitForReview(page: Page) {
  await expect(page.locator('.progress')).toHaveCount(0, { timeout: 75_000 });
  await expect(page.locator('.acc-value').first()).toHaveText(/^\d+\.\d$/);
}

const LICHESS_GAME = {
  id: 'Tz7nQ2Xb',
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  createdAt: Date.now() - 3_600_000,
  lastMoveAt: Date.now() - 3_000_000,
  status: 'mate',
  winner: 'black',
  players: {
    white: { user: { name: 'Sam_Test', id: 'sam_test' }, rating: 1500 },
    black: { user: { name: 'Riley', id: 'riley' }, rating: 1530 },
  },
  opening: { eco: 'A00', name: "Barnes Opening: Fool's Mate" },
  pgn: '[Event "Rated blitz game"]\n[Site "https://lichess.org/Tz7nQ2Xb"]\n[White "Sam_Test"]\n[Black "Riley"]\n[Result "0-1"]\n\n1. f3 { [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. g4 { [%clk 0:02:58] } Qh4# { [%clk 0:02:57] } 0-1',
};

test('reviews a classic game move by move', async ({ page }) => {
  await fastEngine(page);
  await page.goto('./');
  await page.getByRole('button', { name: /The Opera Game/ }).click();
  await waitForReview(page);

  await expect(page.locator('.sheet-cell[data-ply]')).toHaveCount(33);
  await page.keyboard.press('End');
  await expect(page.getByRole('heading', { name: 'Rd8# is the best move' })).toBeVisible();

  await page.getByRole('button', { name: /^16\. Qb8\+/ }).click();
  await expect(page.locator('.coach-title')).toHaveText(/^Qb8\+ is (a great|the best) move$/);

  // The report lists every move once per side.
  await page.getByRole('button', { name: 'Full report' }).click();
  const counts = await page.locator('.report tbody tr:not(.report-acpl) td').allInnerTexts();
  const total = counts.reduce((sum, n) => sum + Number(n), 0);
  expect(total).toBe(33);
});

test('explains a pasted blunder and rejects broken PGN', async ({ page }) => {
  await fastEngine(page);
  await page.goto('./');
  const box = page.getByLabel('PGN or FEN');
  await box.fill('1. e4 e5 2. Ke3');
  await page.getByRole('button', { name: 'Analyze game' }).click();
  await expect(page.getByRole('alert')).toContainText('Illegal move "Ke3"');

  await box.fill('1. f3 e5 2. g4 Qh4#');
  await page.getByRole('button', { name: 'Analyze game' }).click();
  await waitForReview(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'g4 is a blunder' })).toBeVisible();
  await expect(page.locator('.coach-text').first()).toContainText('It allows Black to force mate in 1.');
  await expect(page.locator('.sheet-cell.is-blunder')).toHaveCount(1);
});

test('opens a single position from a FEN and lets you explore it', async ({ page }) => {
  await fastEngine(page);
  await page.goto('./');
  await page.getByLabel('PGN or FEN').fill('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  await page.getByRole('button', { name: 'Analyze game' }).click();
  await expect(page.getByText('Position to analyze')).toBeVisible();
  // The live engine finds the back-rank mate.
  await expect(page.locator('.engine-score').first()).toHaveText('M1', { timeout: 30_000 });
  await page.locator('.engine-line').first().click();
  await expect(page.locator('.explore')).toContainText('Rd8#');
  await page.getByRole('button', { name: 'Back to the game' }).click();
  await expect(page.locator('.explore')).toHaveCount(0);
});

test('plays a side line by moving a piece on the board', async ({ page }) => {
  await fastEngine(page);
  await page.goto('./');
  await page.getByLabel('PGN or FEN').fill('1. e4 e5 2. Nf3 Nc6');
  await page.getByRole('button', { name: 'Analyze game' }).click();
  await waitForReview(page);
  await page.keyboard.press('End');

  const board = page.locator('.board cg-board');
  const box = (await board.boundingBox())!;
  const sq = box.width / 8;
  const center = (file: number, rank: number) => ({ x: box.x + (file + 0.5) * sq, y: box.y + (7 - rank + 0.5) * sq });
  // Bishop f1 to c4 (file f = 5, rank 1 = index 0).
  const from = center(5, 0);
  const to = center(2, 3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('.explore')).toContainText('Bc4');
  await page.keyboard.press('Escape');
  await expect(page.locator('.explore')).toHaveCount(0);
});

test('loads recent games from Lichess', async ({ page }) => {
  await fastEngine(page);
  await page.route('https://lichess.org/api/games/user/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/x-ndjson', 'access-control-allow-origin': '*' },
      body: `${JSON.stringify(LICHESS_GAME)}\n`,
    }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: 'Lichess' }).click();
  await page.getByLabel('Lichess username or game link').fill('Sam_Test');
  await page.getByRole('button', { name: 'Show games' }).click();
  const row = page.locator('.game-row').first();
  await expect(row).toContainText('Lost');
  await expect(row).toContainText('Riley');
  await row.click();

  await waitForReview(page);
  await expect(page.getByRole('link', { name: /View on Lichess/ })).toHaveAttribute('href', 'https://lichess.org/Tz7nQ2Xb');
  // Clock times from the PGN are shown next to the players.
  await expect(page.locator('.player-clock').first()).toBeVisible();
});

test('shows a clear message when a Chess.com player does not exist', async ({ page }) => {
  await page.route('https://api.chess.com/pub/**', (route) =>
    route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }),
  );
  await page.goto('./');
  await page.getByRole('tab', { name: 'Chess.com' }).click();
  await page.getByLabel('Chess.com username').fill('nobody_at_all');
  await page.getByRole('button', { name: 'Show games' }).click();
  await expect(page.getByRole('alert')).toHaveText('No Chess.com player called “nobody_at_all”.');
});

test('opens shared links and keeps recent analyses', async ({ page }) => {
  await fastEngine(page);
  // #pgn= is lz-string compressed; this is "1. d4 d5 2. c4".
  await page.goto('./#pgn=IwOgBAJgLJCsYCZwGMpA&ply=2');
  await expect(page.locator('.sheet-cell[data-ply]')).toHaveCount(3);
  await expect(page.locator('.sheet-cell.is-current')).toContainText('d5');
  await waitForReview(page);

  await page.getByRole('button', { name: 'New game' }).click();
  const recent = page.locator('.history-open').first();
  await expect(recent).toContainText('White – Black');
  await recent.click();
  // Reopening uses the saved analysis, so no progress bar appears.
  await expect(page.locator('.acc-value').first()).toHaveText(/^\d+\.\d$/, { timeout: 5_000 });
});

test('works on a phone @mobile', async ({ page }) => {
  await fastEngine(page);
  await page.goto('./');
  await page.getByRole('button', { name: /The Immortal Game/ }).click();
  await waitForReview(page);
  await page.getByRole('button', { name: 'Next mistake' }).click();
  await expect(page.locator('.coach-title')).toHaveText(/is an? (inaccuracy|mistake|blunder)$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
