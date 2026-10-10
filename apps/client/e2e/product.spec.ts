import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('new account connects channels, reviews an AI draft and publishes it', async ({
  page,
  request,
}, testInfo) => {
  await request.post('http://127.0.0.1:3088/__test/reset');

  const email = `browser-${Date.now()}-${testInfo.project.name}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Ім’я', { exact: true }).fill('Ada');
  await page.getByLabel('Прізвище').fill('Editor');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('correct-password');
  await page.getByLabel('Повторіть пароль').fill('correct-password');
  await page.getByRole('button', { name: 'Створити акаунт' }).click();
  await expect(page.getByText('Акаунт створено. Можна одразу увійти.')).toBeVisible();
  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'Забули пароль?' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Надіслати підтвердження знову' })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).toHaveURL(/workspace/);
  await page.goto('/channels');
  await page.getByRole('button', { name: 'Підключити Telegram', exact: true }).click();

  const url = await page.getByRole('link', { name: 'Відкрити бота' }).getAttribute('href');

  await request.post('http://127.0.0.1:3088/__test/link', {
    data: { token: new URL(url!).searchParams.get('start') },
  });
  await page.getByRole('button', { name: 'Перевірити підключення' }).click();
  await expect(page.getByText('Telegram підключено')).toBeVisible();

  for (const identifier of ['@source_test', '@target_test']) {
    await page.getByLabel('Username або числовий ID каналу').fill(identifier);
    await page.getByRole('button', { name: 'Додати канал', exact: true }).click();
    await expect(page.getByText(identifier, { exact: false }).first()).toBeVisible();
  }

  await page.goto('/routes');
  await page.getByLabel('Назва маршруту').fill('Daily editorial');
  await page.getByLabel('Канал джерела', { exact: true }).selectOption({ label: 'Tech Notes' });
  await page
    .getByLabel('Канал публікації', { exact: true })
    .selectOption({ label: 'Daily Digest' });
  await page.getByRole('button', { name: 'Створити маршрут', exact: true }).click();
  await expect(page.getByText('Daily editorial', { exact: true })).toBeVisible();
  await request.post('http://127.0.0.1:3088/__test/ingest');
  await page.goto('/workspace');
  await page.getByRole('button', { name: /Tech Notes.*Новий/ }).click();
  await page.getByRole('button', { name: 'Створити AI-чернетку' }).click();
  await expect(page.getByText('Готовий до перегляду', { exact: true }).first()).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole('button', { name: 'Опублікувати в каналі', exact: true }),
  ).toBeEnabled();

  if (process.env.CAPTURE_UI === '1') {
    await mkdir('../../.impeccable/review', { recursive: true });
    await page.screenshot({
      path: `../../.impeccable/review/${testInfo.project.name}.png`,
      fullPage: true,
    });
  }

  await page.getByRole('button', { name: 'Опублікувати в каналі', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Опублікувати в каналі', exact: true })
    .click();
  await expect(page.getByText('Опублікований', { exact: true }).first()).toBeVisible({
    timeout: 15000,
  });
  await page.goto('/metrics');
  await expect(page.getByText('Виклики AI', { exact: true })).toBeVisible();
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible();
  await page.goto('/account');
  await page.getByRole('main').getByLabel('Мова інтерфейсу').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();

  await page.getByLabel('First name', { exact: true }).fill('Updated');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Updated');

  if (process.env.CAPTURE_UI === '1')
    await page.screenshot({
      path: `../../.impeccable/review/${testInfo.project.name}-account.png`,
      fullPage: true,
    });

  const mediaRequests = new Set<string>();

  await page.route('**/api/posts/*/media/*', async (route) => {
    mediaRequests.add(route.request().url());
    await route.fulfill({
      contentType: 'image/png',
      path: fileURLToPath(new URL('./fixtures/photo.png', import.meta.url)),
    });
  });
  await request.post('http://127.0.0.1:3088/__test/album');
  await page.goto('/workspace');
  await page.getByRole('button', { name: /Tech Notes.*New/ }).click();
  await expect(page.locator('.preview-message img.post-media')).toHaveCount(2);
  await expect(page.locator('.original-message img.post-media')).toHaveCount(2);
  expect(mediaRequests.size).toBe(2);
  await page
    .getByRole('heading', { name: 'Telegram preview', exact: true })
    .scrollIntoViewIfNeeded();

  if (process.env.CAPTURE_UI === '1')
    await page.screenshot({
      path: `../../.impeccable/review/${testInfo.project.name}-media.png`,
      fullPage: true,
    });

  await page.route('**/api/posts?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Offline fixture: inbox unavailable' } }),
  );
  await page.goto('/workspace');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByText('Your inbox is ready')).toHaveCount(0);

  if (process.env.CAPTURE_UI === '1')
    await page.screenshot({
      path: `../../.impeccable/review/${testInfo.project.name}-inbox-error.png`,
      fullPage: true,
    });

  await page.route('**/api/channels', (route) =>
    route.fulfill({ status: 503, json: { message: 'Offline fixture: channels unavailable' } }),
  );
  await page.goto('/channels');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByText('Connect your first channel')).toHaveCount(0);

  if (process.env.CAPTURE_UI === '1')
    await page.screenshot({
      path: `../../.impeccable/review/${testInfo.project.name}-channels-error.png`,
      fullPage: true,
    });

  await page.goto('/account');
  await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
});
