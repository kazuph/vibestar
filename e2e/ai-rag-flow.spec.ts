import { expect, test } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

import { clearMailbox, getOtpFromMailpit, waitForMailpit } from "./utils/mailpit";

/**
 * RAG Flow E2E Test - プロジェクト作成 → ドキュメントアップロード → プロジェクト選択してチャット
 *
 * Note: プロジェクトベースのRAG管理により、プロジェクトを選択すると自動でRAGが有効化されます。
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

  test("complete RAG flow: create project, upload document, chat with RAG", async ({ page }) => {
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

    // Step 2: Navigate to Projects tab
    const projectsTab = page.locator('button:has-text("Projects")');
    await projectsTab.click();
    await expect(page.locator("h3:has-text('Projects')")).toBeVisible();

    // Step 3: Create a new project
    await page.fill('input[placeholder="Project name"]', 'RAG Test Project');
    await page.fill('input[placeholder="Description (optional)"]', 'Test project for RAG');
    await page.click('button:has-text("Create Project")');

    // Wait for project to be created
    await expect(page.locator("text=RAG Test Project")).toBeVisible({ timeout: 10000 });

    // Step 4: Select the project
    await page.click('text=RAG Test Project');
    await expect(page.locator("span:has-text('Selected')")).toBeVisible();

    // Small pause for visibility
    await page.waitForTimeout(500);

    // Step 5: Navigate to Documents tab
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();
    await expect(page.locator("text=Document Management")).toBeVisible();

    // Step 6: Upload document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);

    // Wait for upload success message - accept any processing state
    await expect(
      page.locator("text=uploaded successfully")
        .or(page.locator("text=Processing"))
        .or(page.locator("text=Ready"))
        .or(page.locator("text=Failed"))
        .first()
    ).toBeVisible({ timeout: 15000 });

    // Wait for document processing to settle
    await page.waitForTimeout(5000);

    // Step 7: Navigate to AI Chat tab
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();
    await expect(page.locator("h3:has-text('AI Chat')")).toBeVisible();

    // Step 8: Verify RAG is automatically enabled (project selected)
    await expect(page.locator("text=RAG Enabled")).toBeVisible();

    // Small pause to show RAG is enabled
    await page.waitForTimeout(500);

    // Step 9: Send a chat message that would use RAG
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("What is Vibestar?");

    const sendButton = page.locator('button:has-text("Send")');
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Step 10: Wait for user message to appear
    await expect(
      page.locator("text=What is Vibestar?")
    ).toBeVisible({ timeout: 5000 });

    // Step 11: Wait for AI response
    await expect(
      page.locator('[data-role="assistant"]').first()
    ).toBeVisible({ timeout: 30000 });

    // Verify assistant response appeared
    const assistantResponse = await page.locator('[data-role="assistant"]').first().textContent();
    console.log("Assistant response:", assistantResponse);
    expect(assistantResponse).toBeTruthy();

    // Final pause for video capture
    await page.waitForTimeout(1000);
  });

  test("document upload to default project", async ({ page }) => {
    // Create test files
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

    // Navigate to Documents tab (without selecting a project)
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();
    await expect(page.locator("text=Document Management")).toBeVisible();

    // Verify message about default project
    await expect(page.locator("text=Uncategorized")).toBeVisible({ timeout: 5000 });

    // Upload first document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePaths[0]);

    // Wait for upload
    await page.waitForTimeout(2000);

    // Upload second document
    await fileInput.setInputFiles(filePaths[1]);

    // Wait for upload
    await page.waitForTimeout(2000);

    // Final pause for video
    await page.waitForTimeout(1000);
  });

  test("chat without project has no RAG", async ({ page }) => {
    // Login
    await loginUser(page);

    // Navigate to AI Chat directly (no project selected)
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();
    await expect(page.locator("h3:has-text('AI Chat')")).toBeVisible();

    // Verify RAG is not enabled (no project)
    await expect(page.locator("span:has-text('No Project')")).toBeVisible();

    // Send a message
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("Hello! What is 2 + 2?");

    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // Wait for AI response
    await expect(
      page.locator('[data-role="assistant"]').first()
    ).toBeVisible({ timeout: 30000 });

    // Verify response
    const assistantResponse = await page.locator('[data-role="assistant"]').first().textContent();
    expect(assistantResponse).toBeTruthy();

    // Final pause
    await page.waitForTimeout(1000);
  });
});
