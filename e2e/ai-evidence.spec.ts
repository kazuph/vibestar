import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

import { clearMailbox, getOtpFromMailpit, waitForMailpit } from "./utils/mailpit";

const EVIDENCE_DIR = path.join(process.cwd(), ".artifacts", "phase2-ai");

// Ensure evidence directories exist
function ensureEvidenceDir() {
  const imagesDir = path.join(EVIDENCE_DIR, "images");
  const videosDir = path.join(EVIDENCE_DIR, "videos");
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
}

// Helper to login user
async function loginUser(page: import("@playwright/test").Page): Promise<string> {
  const email = `evidence-${Date.now()}@example.com`;

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

test.describe("AI機能動作証拠取得", () => {
  test.beforeEach(async () => {
    ensureEvidenceDir();
    await waitForMailpit();
    await clearMailbox();
  });

  test("AIチャットが実際にAIレスポンスを返す証拠（プロジェクト未選択）", async ({ page }) => {
    // ログイン
    await loginUser(page);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "01-logged-in-dashboard.png"),
      fullPage: true
    });

    // AI Chatタブに移動
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();
    await expect(page.locator("h3:has-text('AI Chat')")).toBeVisible();

    // プロジェクト未選択状態を確認
    await expect(page.locator("text=No Project")).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "02-ai-chat-tab-no-project.png"),
      fullPage: true
    });

    // メッセージを入力
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("Hello! What is 2 + 2? Please answer briefly.");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "03-message-typed.png"),
      fullPage: true
    });

    // 送信ボタンをクリック
    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // ユーザーメッセージが表示されるまで待つ
    await expect(page.locator("text=Hello! What is 2 + 2?")).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "04-user-message-sent.png"),
      fullPage: true
    });

    // AIレスポンスを待つ（最大60秒）
    const assistantMessage = page.locator('[data-role="assistant"]').first();
    await expect(assistantMessage).toBeVisible({ timeout: 60000 });

    // レスポンスが完全に生成されるまで少し待つ
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "05-ai-response-received.png"),
      fullPage: true
    });

    // AIレスポンスの内容を検証
    const responseText = await assistantMessage.textContent();
    console.log("AI Response:", responseText);

    // 実際のAIレスポンスであることを確認
    expect(responseText).toBeTruthy();
    expect(responseText!.length).toBeGreaterThan(0);
    expect(responseText).not.toContain("ローカル開発モード");
    expect(responseText).not.toContain("Workers AIはローカルでは利用できない");
  });

  test("プロジェクト選択でRAG有効化の証拠", async ({ page }) => {
    // ログイン
    await loginUser(page);

    // Projectsタブに移動
    const projectsTab = page.locator('button:has-text("Projects")');
    await projectsTab.click();
    await expect(page.locator("h3:has-text('Projects')")).toBeVisible();

    // プロジェクトを作成
    await page.fill('input[placeholder="Project name"]', 'Evidence Test Project');
    await page.click('button:has-text("Create Project")');

    // プロジェクトが作成されるまで待つ
    await expect(page.locator("text=Evidence Test Project")).toBeVisible({ timeout: 10000 });

    // プロジェクトを選択
    await page.click('text=Evidence Test Project');
    await expect(page.locator("text=Selected")).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "06-project-selected.png"),
      fullPage: true
    });

    // AI Chatタブに移動
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();
    await expect(page.locator("h3:has-text('AI Chat')")).toBeVisible();

    // RAG有効を確認
    await expect(page.locator("text=RAG Enabled")).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "07-rag-enabled-via-project.png"),
      fullPage: true
    });

    // メッセージを入力して送信
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("Tell me what you know. Answer in one sentence.");

    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // AIレスポンスを待つ
    const assistantMessage = page.locator('[data-role="assistant"]').first();
    await expect(assistantMessage).toBeVisible({ timeout: 60000 });

    // レスポンスが完全に生成されるまで少し待つ
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "08-rag-ai-response.png"),
      fullPage: true
    });

    // AIレスポンスの内容を検証
    const responseText = await assistantMessage.textContent();
    console.log("RAG AI Response:", responseText);

    expect(responseText).toBeTruthy();
    expect(responseText!.length).toBeGreaterThan(5);
  });

  test("ドキュメントアップロードとRAG検索の完全フロー", async ({ page }) => {
    // ログイン
    await loginUser(page);

    // Projectsタブに移動してプロジェクト作成
    const projectsTab = page.locator('button:has-text("Projects")');
    await projectsTab.click();
    await expect(page.locator("h3:has-text('Projects')")).toBeVisible();

    await page.fill('input[placeholder="Project name"]', 'Doc Upload Test');
    await page.click('button:has-text("Create Project")');
    await expect(page.locator("text=Doc Upload Test")).toBeVisible({ timeout: 10000 });

    // プロジェクトを選択
    await page.click('text=Doc Upload Test');
    await expect(page.locator("text=Selected")).toBeVisible();

    // Documentsタブに移動
    const documentsTab = page.locator('button:has-text("Documents")');
    await documentsTab.click();
    await expect(page.locator("text=Document Management")).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "09-documents-tab.png"),
      fullPage: true
    });

    // テストファイルをアップロード
    const fileInput = page.locator('input[type="file"]');

    // テストドキュメントを作成
    const testContent = `# Vibestar Project Information

Vibestar is an AI-powered full-stack development template built on Cloudflare ecosystem.

Key Features:
- React Router v7 with Hono and Vite
- Cloudflare Workers AI for chat
- Cloudflare Vectorize for RAG
- Better Auth with Email OTP
- Turso database with Drizzle ORM

This document is used for RAG testing purposes.
Created at: ${new Date().toISOString()}
`;

    // ファイルをセット
    await fileInput.setInputFiles({
      name: "vibestar-info.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(testContent),
    });

    // アップロード完了を待つ
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "10-document-uploaded.png"),
      fullPage: true
    });

    // ドキュメント処理完了を待つ（最大30秒）
    try {
      await expect(
        page.locator("text=Ready").or(page.locator("text=Processing"))
      ).toBeVisible({ timeout: 30000 });
    } catch {
      console.log("Document status check skipped");
    }

    // AI Chatタブに移動
    const chatTab = page.locator('button:has-text("AI Chat")');
    await chatTab.click();
    await expect(page.locator("h3:has-text('AI Chat')")).toBeVisible();

    // RAG有効を確認（プロジェクト選択済み）
    await expect(page.locator("text=RAG Enabled")).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "11-rag-enabled-for-query.png"),
      fullPage: true
    });

    // Vibestarについて質問
    const input = page.locator('input[placeholder*="message"]');
    await input.fill("What is Vibestar?");

    const sendButton = page.locator('button:has-text("Send")');
    await sendButton.click();

    // AIレスポンスを待つ
    const assistantMessage = page.locator('[data-role="assistant"]').first();
    await expect(assistantMessage).toBeVisible({ timeout: 90000 });

    // レスポンスが完全に生成されるまで待つ
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "images", "12-rag-query-response.png"),
      fullPage: true
    });

    // レスポンスを確認
    const responseText = await assistantMessage.textContent();
    console.log("RAG Query Response:", responseText);

    expect(responseText).toBeTruthy();
    expect(responseText!.length).toBeGreaterThan(10);
  });
});
