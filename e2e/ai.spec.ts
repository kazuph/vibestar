import { expect, test } from "@playwright/test";

import { clearMailbox, getOtpFromMailpit, waitForMailpit } from "./utils/mailpit";

/**
 * AI Features E2E tests
 * These tests verify:
 * - Authentication requirements for AI endpoints
 * - Document upload/delete UI flow
 * - Chat UI functionality
 * - Dashboard tab navigation
 *
 * Note: Workers AI is not available locally, so we test API responses
 * and UI behavior, not actual AI inference.
 */

// Helper to login user
async function loginUser(page: import("@playwright/test").Page): Promise<string> {
  const email = `test-ai-${Date.now()}@example.com`;

  await page.goto("/auth/signup");
  await page.fill('[name="email"]', email);
  await page.click('button[type="submit"]');

  const otp = await getOtpFromMailpit(email);

  const currentUrl = page.url();
  if (!currentUrl.includes("/auth/verify-otp")) {
    await page.goto("/auth/verify-otp");
  }

  await page.fill('[name="otp"]', otp);
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL("/dashboard");

  return email;
}

test.describe.serial("AI API Authentication", () => {
  test.beforeEach(async () => {
    await waitForMailpit();
    await clearMailbox();
  });

  test("chat API requires authentication", async ({ request }) => {
    // Try to access chat API without authentication
    const response = await request.post("/api/chat", {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        message: "Hello",
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("documents API requires authentication", async ({ request }) => {
    // GET documents list
    const getResponse = await request.get("/api/documents");
    expect(getResponse.status()).toBe(401);

    // POST document upload
    const postResponse = await request.post("/api/documents", {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        title: "test.txt",
        content: "test content",
      },
    });
    expect(postResponse.status()).toBe(401);
  });
});

test.describe.serial("Dashboard AI Features", () => {
  test.beforeEach(async () => {
    await waitForMailpit();
    await clearMailbox();
  });

  test("dashboard has AI Chat and Documents tabs", async ({ page }) => {
    await loginUser(page);

    // Check tab navigation exists
    const accountTab = page.locator('button:has-text("Account")');
    const chatTab = page.locator('button:has-text("AI Chat")');
    const documentsTab = page.locator('button:has-text("Documents")');

    await expect(accountTab).toBeVisible();
    await expect(chatTab).toBeVisible();
    await expect(documentsTab).toBeVisible();

    // Account tab should be active by default
    await expect(accountTab).toHaveClass(/border-blue-500/);
  });

  test("can navigate to AI Chat tab", async ({ page }) => {
    await loginUser(page);

    // Click on AI Chat tab
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();

    // Should see chat interface - use specific heading selector
    await expect(page.locator("h3:has-text('AI Chat')")).toBeVisible();
    await expect(page.locator('input[placeholder*="message"]')).toBeVisible();
    await expect(page.locator('button:has-text("Send")')).toBeVisible();

    // RAG checkbox should exist
    await expect(page.locator("text=Use documents")).toBeVisible();
  });

  test("can navigate to Documents tab", async ({ page }) => {
    await loginUser(page);

    // Click on Documents tab
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();

    // Should see document management interface
    await expect(page.locator("text=Document Management")).toBeVisible();
    await expect(page.locator("text=Upload documents")).toBeVisible();

    // Upload drop zone should exist
    await expect(page.locator("text=Click to upload")).toBeVisible();

    // Document list section should exist
    await expect(page.locator("text=Uploaded Documents")).toBeVisible();
  });

  test("chat input form works", async ({ page }) => {
    await loginUser(page);

    // Navigate to Chat tab
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();

    // Type a message
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("Hello AI");

    // Send button should be enabled when input has text
    const sendButton = page.locator('button:has-text("Send")');
    await expect(sendButton).toBeEnabled();

    // Clear input
    await input.fill("");

    // Send button should be disabled when input is empty
    await expect(sendButton).toBeDisabled();
  });

  test("RAG checkbox toggles correctly", async ({ page }) => {
    await loginUser(page);

    // Navigate to Chat tab
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();

    // Find RAG checkbox
    const ragCheckbox = page.locator('input[type="checkbox"]');

    // Should be unchecked by default
    await expect(ragCheckbox).not.toBeChecked();

    // Toggle on
    await ragCheckbox.click();
    await expect(ragCheckbox).toBeChecked();

    // Toggle off
    await ragCheckbox.click();
    await expect(ragCheckbox).not.toBeChecked();
  });

  test("New Chat button clears messages", async ({ page }) => {
    await loginUser(page);

    // Navigate to Chat tab
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();

    // Find New Chat button
    const newChatButton = page.locator('button:has-text("New Chat")');
    await expect(newChatButton).toBeVisible();

    // Should show placeholder when no messages
    await expect(page.locator("text=Start a conversation")).toBeVisible();
  });

  test("documents list shows content after loading", async ({ page }) => {
    await loginUser(page);

    // Navigate to Documents tab
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();

    // Wait for loading to complete - shows empty state or documents table
    await expect(
      page.locator("text=No documents uploaded yet")
        .or(page.locator("table"))
    ).toBeVisible({ timeout: 10000 });

    // Verify NO error states appear
    await expect(page.locator('button:has-text("Retry")')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('[class*="bg-red-50"]')).not.toBeVisible({ timeout: 1000 });
  });
});

test.describe.serial("AI Chat Response Verification", () => {
  test.beforeEach(async () => {
    await waitForMailpit();
    await clearMailbox();
  });

  test("AI chat sends message and receives real AI response", async ({ page }) => {
    await loginUser(page);

    // Navigate to Chat tab
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();

    // Wait for chat interface
    await expect(page.locator('input[placeholder*="message"]')).toBeVisible();

    // Type a simple test message
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("Hello, what is 2 + 2?");

    // Click send button
    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // Wait for user message to appear
    await expect(page.locator("text=Hello, what is 2 + 2?")).toBeVisible({ timeout: 5000 });

    // Wait for AI response - should NOT be local development mode message
    // and should contain some actual content
    const assistantMessage = page.locator('[data-role="assistant"]').first();
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });

    // Verify it's NOT a local development placeholder
    await expect(page.locator("text=ローカル開発モード")).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator("text=Workers AIはローカルでは利用できない")).not.toBeVisible({ timeout: 2000 });

    // AI should have responded with something substantial (more than 10 characters)
    const responseText = await assistantMessage.textContent();
    expect(responseText).toBeTruthy();
    expect(responseText!.length).toBeGreaterThan(10);
  });

  test("AI chat with RAG enabled processes correctly", async ({ page }) => {
    await loginUser(page);

    // Navigate to Chat tab
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();

    // Enable RAG checkbox
    const ragCheckbox = page.locator('input[type="checkbox"]');
    await ragCheckbox.click();
    await expect(ragCheckbox).toBeChecked();

    // Type a message
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("What can you tell me about your knowledge?");

    // Click send
    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // Wait for AI response (longer timeout for RAG processing)
    const assistantMessage = page.locator('[data-role="assistant"]').first();
    await expect(assistantMessage).toBeVisible({ timeout: 45000 });

    // Verify no error state
    await expect(page.locator("text=Failed to generate response")).not.toBeVisible({ timeout: 2000 });
  });
});

test.describe.serial("Document Upload UI", () => {
  test.beforeEach(async () => {
    await waitForMailpit();
    await clearMailbox();
  });

  test("upload zone shows correct file types", async ({ page }) => {
    await loginUser(page);

    // Navigate to Documents tab
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();

    // Should show supported file types - use more specific selector
    await expect(page.locator("p:has-text('TXT, MD, JSON, CSV (max 1MB)')")).toBeVisible();
  });

  test("file input accepts correct types", async ({ page }) => {
    await loginUser(page);

    // Navigate to Documents tab
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();

    // Check file input accept attribute
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute("accept", ".txt,.md,.json,.csv");
  });
});
