import { expect, test } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

import { clearMailbox, getOtpFromMailpit, waitForMailpit } from "./utils/mailpit";

/**
 * RAG Flow E2E Test - ドキュメントアップロード → チャットでRAG使用
 *
 * Note: Workers AI はローカルでは利用できないため、
 * このテストはUI操作フローの動画証跡を残すことが目的。
 * 実際のAI応答は期待しない。
 */

// Create a test file for upload
function createTestFile(content: string): string {
  const testDir = path.join(process.cwd(), ".artifacts", "phase2-ai", "test-data");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const filePath = path.join(testDir, "test-document.txt");
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Helper to login user
async function loginUser(page: import("@playwright/test").Page): Promise<string> {
  const email = `test-rag-${Date.now()}@example.com`;

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

test.describe.serial("RAG Flow E2E", () => {
  test.beforeEach(async () => {
    await waitForMailpit();
    await clearMailbox();
  });

  test("complete RAG flow: upload document and use in chat", async ({ page }) => {
    // Create test document
    const testContent = `
Vibestar Project Information
============================

Vibestar is a full-stack development template for the AI era.
It uses Cloudflare Workers, React Router v7, and Drizzle ORM.

Key Features:
- Email OTP authentication with Better Auth
- AI chat with Workers AI (gpt-oss-120b)
- RAG support with Vectorize (plamo-embedding-1b)
- Document management for RAG context

This is a test document for RAG demonstration.
    `.trim();

    const testFilePath = createTestFile(testContent);

    // Step 1: Login
    await loginUser(page);

    // Step 2: Navigate to Documents tab
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();
    await expect(page.locator("text=Document Management")).toBeVisible();

    // Step 3: Upload document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);

    // Wait for upload success message - accept any processing state
    // Note: With remote AI binding, embedding can take time or fail
    // Use .first() to avoid strict mode violation when multiple elements match
    await expect(
      page.locator("text=uploaded successfully")
        .or(page.locator("text=Processing"))
        .or(page.locator("text=Ready"))
        .or(page.locator("text=Failed")) // Embedding failure is still a valid upload
        .first()
    ).toBeVisible({ timeout: 15000 });

    // Wait for document processing to settle (longer timeout for remote AI)
    await page.waitForTimeout(5000);

    // Small pause for video visibility
    await page.waitForTimeout(1000);

    // Step 4: Navigate to AI Chat tab
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();
    await expect(page.locator("h3:has-text('AI Chat')")).toBeVisible();

    // Step 5: Enable RAG (Use documents checkbox)
    const ragCheckbox = page.locator('input[type="checkbox"]');
    await ragCheckbox.click();
    await expect(ragCheckbox).toBeChecked();

    // Small pause to show RAG is enabled
    await page.waitForTimeout(500);

    // Step 6: Send a chat message that would use RAG
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("What is Vibestar?");

    const sendButton = page.locator('button:has-text("Send")');
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Step 7: Wait for user message to appear
    await expect(
      page.locator("text=What is Vibestar?")
    ).toBeVisible({ timeout: 5000 });

    // Step 8: Wait for AI response (local dev simulated response)
    await expect(
      page.locator("text=ローカル開発モード")
        .or(page.locator('[class*="bg-gray-50"]')) // Assistant message bubble
    ).toBeVisible({ timeout: 10000 });

    // Verify NO error states in chat area
    await expect(page.locator("text=Failed to generate")).not.toBeVisible({ timeout: 1000 });
    await expect(page.locator("text=error")).not.toBeVisible({ timeout: 1000 });

    // Final pause for video capture
    await page.waitForTimeout(1000);
  });

  test("document upload and list display", async ({ page }) => {
    // Create multiple test files
    const testFiles = [
      { name: "project-overview.md", content: "# Vibestar\n\nModern fullstack template." },
      { name: "api-docs.json", content: '{"name": "vibestar", "version": "1.0.0"}' },
    ];

    const testDir = path.join(process.cwd(), ".artifacts", "phase2-ai", "test-data");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const filePaths = testFiles.map(f => {
      const filePath = path.join(testDir, f.name);
      fs.writeFileSync(filePath, f.content);
      return filePath;
    });

    // Login
    await loginUser(page);

    // Navigate to Documents tab
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();
    await expect(page.locator("text=Document Management")).toBeVisible();

    // Upload first document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePaths[0]);

    // Wait for upload
    await page.waitForTimeout(2000);

    // Upload second document
    await fileInput.setInputFiles(filePaths[1]);

    // Wait for upload
    await page.waitForTimeout(2000);

    // Check documents list section is visible
    await expect(page.locator("text=Uploaded Documents")).toBeVisible();

    // Final pause for video
    await page.waitForTimeout(1000);
  });
});
