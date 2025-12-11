import { expect, test } from '@playwright/test';

import { clearMailbox, getOtpFromMailpit, waitForMailpit } from './utils/mailpit';

/**
 * Authentication E2E tests
 * These tests use real email sending via Mailpit - NO MOCKS
 */

// Use serial execution to avoid Mailpit conflicts between tests
test.describe.serial('Authentication', () => {
  // Clear mailbox before each test for isolation
  test.beforeEach(async () => {
    await waitForMailpit();
    await clearMailbox();
  });

  test('signup with email OTP', async ({ page }) => {
    // Generate unique email for this test
    const email = `test-${Date.now()}@example.com`;

    // 1. Go to signup page and enter email
    await page.goto('/auth/signup');
    await page.fill('[name="email"]', email);
    await page.click('button[type="submit"]');

    // 2. Wait for OTP to be sent and retrieve it from Mailpit
    const otp = await getOtpFromMailpit(email);
    expect(otp).toBeTruthy();
    expect(otp).toMatch(/^\d{4,8}$/); // OTP should be 4-8 digits

    // 3. Navigate to OTP verification page (if not auto-redirected)
    // The app may auto-redirect to /auth/verify-otp or we need to navigate
    const currentUrl = page.url();
    if (!currentUrl.includes('/auth/verify-otp')) {
      await page.goto('/auth/verify-otp');
    }

    // 4. Enter OTP
    await page.fill('[name="otp"]', otp);
    await page.click('button[type="submit"]');

    // 5. Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('signin with existing user email OTP', async ({ page }) => {
    // Generate unique email for this test
    const email = `test-${Date.now()}@example.com`;

    // First, sign up the user
    await page.goto('/auth/signup');
    await page.fill('[name="email"]', email);
    await page.click('button[type="submit"]');

    const signupOtp = await getOtpFromMailpit(email);

    const currentUrl = page.url();
    if (!currentUrl.includes('/auth/verify-otp')) {
      await page.goto('/auth/verify-otp');
    }

    await page.fill('[name="otp"]', signupOtp);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');

    // Log out (if there's a logout button)
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("ログアウト"), [data-testid="logout"]');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    } else {
      // Manually navigate away from dashboard
      await page.goto('/');
    }

    // Clear mailbox for signin test
    await clearMailbox();

    // Now test signin flow
    await page.goto('/auth/signin');
    await page.fill('[name="email"]', email);
    await page.click('button[type="submit"]');

    // Get new OTP for signin
    const signinOtp = await getOtpFromMailpit(email);
    expect(signinOtp).toBeTruthy();

    const signinUrl = page.url();
    if (!signinUrl.includes('/auth/verify-otp')) {
      await page.goto('/auth/verify-otp');
    }

    await page.fill('[name="otp"]', signinOtp);
    await page.click('button[type="submit"]');

    // Should be redirected to dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('invalid OTP shows error', async ({ page }) => {
    const email = `test-${Date.now()}@example.com`;

    // 1. Go to signup page and enter email
    await page.goto('/auth/signup');
    await page.fill('[name="email"]', email);
    await page.click('button[type="submit"]');

    // 2. Wait for real OTP to be sent (we won't use it)
    await getOtpFromMailpit(email);

    // 3. Navigate to OTP verification page
    const currentUrl = page.url();
    if (!currentUrl.includes('/auth/verify-otp')) {
      await page.goto('/auth/verify-otp');
    }

    // 4. Enter wrong OTP
    await page.fill('[name="otp"]', '000000');
    await page.click('button[type="submit"]');

    // 5. Should show an error message (not redirect to dashboard)
    await expect(page).not.toHaveURL('/dashboard');

    // Look for error message
    const errorMessage = page.locator('[role="alert"], .error, [data-testid="error"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('email validation on signup', async ({ page }) => {
    await page.goto('/auth/signup');

    // Try to submit without email
    await page.click('button[type="submit"]');

    // Should show validation error or stay on page
    await expect(page).toHaveURL(/\/auth\/signup/);

    // Try with invalid email format
    await page.fill('[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');

    // Should still be on signup page
    await expect(page).toHaveURL(/\/auth\/signup/);
  });
});

test.describe('Protected Routes', () => {
  test('unauthenticated user cannot access dashboard', async ({ page }) => {
    // Try to access dashboard directly
    await page.goto('/dashboard');

    // Should be redirected to signin or landing page
    await expect(page).not.toHaveURL('/dashboard');

    // Should be on signin page or home
    const url = page.url();
    expect(url).toMatch(/\/(auth\/signin|auth\/signup|$)/);
  });
});
