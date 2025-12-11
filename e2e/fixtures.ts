import { test as base, type Page } from '@playwright/test';

import { clearMailbox, getOtpFromMailpit, waitForMailpit } from './utils/mailpit';

/**
 * Custom test fixtures for Vibestar E2E tests
 * Extends Playwright's base test with reusable utilities
 */

/**
 * Generate a unique test email address
 */
export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Test user data for authenticated tests
 */
export interface TestUser {
  email: string;
}

/**
 * Extended test fixtures
 */
export interface TestFixtures {
  /** Generate unique test email */
  testEmail: string;
  /** Authenticated user with session */
  authenticatedUser: TestUser;
  /** Clear mailbox before test */
  cleanMailbox: void;
}

/**
 * Sign up a new user and return their credentials
 */
async function signUpUser(page: Page, email: string): Promise<TestUser> {
  // Clear mailbox first
  await clearMailbox();

  // Go to signup page
  await page.goto('/auth/signup');
  await page.fill('[name="email"]', email);
  await page.click('button[type="submit"]');

  // Get OTP from mailpit
  const otp = await getOtpFromMailpit(email);

  // Verify OTP
  const currentUrl = page.url();
  if (!currentUrl.includes('/auth/verify-otp')) {
    await page.goto('/auth/verify-otp');
  }

  await page.fill('[name="otp"]', otp);
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await page.waitForURL('/dashboard');

  return { email };
}

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<TestFixtures>({
  // Unique email for each test
  testEmail: async ({}, use) => {
    const email = generateTestEmail();
    await use(email);
  },

  // Authenticated user fixture
  authenticatedUser: async ({ page }, use) => {
    await waitForMailpit();

    const email = generateTestEmail();
    const user = await signUpUser(page, email);

    await use(user);

    // Cleanup: You could add user deletion here if needed
  },

  // Clean mailbox fixture
  cleanMailbox: async ({}, use) => {
    await waitForMailpit();
    await clearMailbox();
    await use();
  },
});

/**
 * Export expect from Playwright
 */
export { expect } from '@playwright/test';

/**
 * Page Object Model base class
 * Use this to create page objects for better test organization
 */
export abstract class PageObject {
  constructor(protected readonly page: Page) {}

  /**
   * Navigate to this page
   */
  abstract goto(): Promise<void>;
}

/**
 * Auth pages page object
 */
export class AuthPages extends PageObject {
  async goto() {
    await this.page.goto('/auth/signup');
  }

  async goToSignup() {
    await this.page.goto('/auth/signup');
  }

  async goToSignin() {
    await this.page.goto('/auth/signin');
  }

  async goToVerifyOtp() {
    await this.page.goto('/auth/verify-otp');
  }

  async fillEmail(email: string) {
    await this.page.fill('[name="email"]', email);
  }

  async fillOtp(otp: string) {
    await this.page.fill('[name="otp"]', otp);
  }

  async submit() {
    await this.page.click('button[type="submit"]');
  }

  async signUp(email: string): Promise<void> {
    await this.goToSignup();
    await this.fillEmail(email);
    await this.submit();
  }

  async verifyOtp(otp: string): Promise<void> {
    const currentUrl = this.page.url();
    if (!currentUrl.includes('/auth/verify-otp')) {
      await this.goToVerifyOtp();
    }
    await this.fillOtp(otp);
    await this.submit();
  }
}

/**
 * Dashboard page object
 */
export class DashboardPage extends PageObject {
  async goto() {
    await this.page.goto('/dashboard');
  }

  async isLoggedIn(): Promise<boolean> {
    return this.page.url().includes('/dashboard');
  }

  async logout(): Promise<void> {
    const logoutButton = this.page.locator(
      'button:has-text("Logout"), button:has-text("ログアウト"), [data-testid="logout"]'
    );
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    }
  }
}
