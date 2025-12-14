const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:15173';
const MAILPIT_URL = 'http://localhost:18025';
const ARTIFACTS_DIR = '/Users/kazuph/src/github.com/kazuph/vibestar/.artifacts/phase2-ai-verified/images';

async function getOtpFromMailpit(email) {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
  const data = await response.json();

  for (const msg of data.messages || []) {
    if (msg.To && msg.To.some(t => t.Address === email)) {
      const msgResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`);
      const msgData = await msgResponse.json();
      const text = msgData.Text || '';
      const match = text.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
  }
  return null;
}

async function clearMailbox() {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('1. メールボックスをクリア...');
    await clearMailbox();

    const testEmail = `test-screenshot-${Date.now()}@example.com`;
    console.log(`2. テストユーザー作成: ${testEmail}`);

    // サインアップページへ
    await page.goto(`${BASE_URL}/auth/signup`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${ARTIFACTS_DIR}/01-signup-page.png`, fullPage: true });
    console.log('   スクリーンショット: 01-signup-page.png');

    // メールアドレス入力
    await page.fill('input[name="email"]', testEmail);
    await page.click('button[type="submit"]');

    // OTP待機
    console.log('3. OTP待機中...');
    await page.waitForTimeout(3000);

    let otp = null;
    for (let i = 0; i < 10; i++) {
      otp = await getOtpFromMailpit(testEmail);
      if (otp) break;
      await page.waitForTimeout(1000);
    }

    if (!otp) {
      throw new Error('OTPが取得できませんでした');
    }
    console.log(`   OTP取得: ${otp}`);

    // OTP入力
    await page.waitForURL('**/auth/verify-otp**');
    await page.screenshot({ path: `${ARTIFACTS_DIR}/02-otp-page.png`, fullPage: true });
    console.log('   スクリーンショット: 02-otp-page.png');

    await page.fill('input[name="otp"]', otp);
    await page.click('button[type="submit"]');

    // ダッシュボードへリダイレクト
    console.log('4. ダッシュボードへ...');
    await page.waitForURL('**/dashboard**');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${ARTIFACTS_DIR}/03-dashboard.png`, fullPage: true });
    console.log('   スクリーンショット: 03-dashboard.png');

    // AI Chatタブをクリック
    console.log('5. AI Chatタブへ...');
    await page.click('button:has-text("AI Chat")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/04-ai-chat-tab.png`, fullPage: true });
    console.log('   スクリーンショット: 04-ai-chat-tab.png');

    // メッセージ入力 - 正しいセレクタ: input[placeholder="Type your message..."]
    console.log('6. メッセージ送信: "What is 2 + 2?"');
    const inputSelector = 'input[placeholder="Type your message..."]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.fill(inputSelector, 'What is 2 + 2?');
    await page.screenshot({ path: `${ARTIFACTS_DIR}/05-message-typed.png`, fullPage: true });
    console.log('   スクリーンショット: 05-message-typed.png');

    // 送信
    await page.click('button[type="submit"]');

    // AI応答待機（最大60秒）
    console.log('7. AI応答待機中...');

    // ユーザーメッセージが表示されるのを待つ - data-role="user"
    await page.waitForSelector('[data-role="user"]', { timeout: 10000 });
    console.log('   ユーザーメッセージ表示確認');

    // Assistantの応答を待つ（data-role="assistant"）
    let hasResponse = false;
    for (let i = 0; i < 60; i++) {
      const assistantMessages = await page.locator('[data-role="assistant"]').count();
      if (assistantMessages > 0) {
        const text = await page.locator('[data-role="assistant"]').first().textContent();
        // ローディング中でなく、実際のコンテンツがある場合
        if (text && text.length > 5 && !text.includes('...')) {
          hasResponse = true;
          console.log(`   AI応答検出: "${text.substring(0, 80)}..."`);
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    if (!hasResponse) {
      console.log('   応答待機タイムアウト、現在の状態をキャプチャ');
    }

    await page.screenshot({ path: `${ARTIFACTS_DIR}/06-ai-response.png`, fullPage: true });
    console.log('   スクリーンショット: 06-ai-response.png ★ AI応答');

    // RAGをオンにして再度質問
    console.log('8. RAGモードでテスト...');
    await page.click('button:has-text("New Chat")');
    await page.waitForTimeout(500);

    // RAGチェックボックスをオン
    const ragCheckbox = page.locator('input[type="checkbox"]');
    await ragCheckbox.check();
    await page.screenshot({ path: `${ARTIFACTS_DIR}/07-rag-enabled.png`, fullPage: true });
    console.log('   スクリーンショット: 07-rag-enabled.png');

    // RAGモードでメッセージ送信
    await page.fill(inputSelector, 'Hello, how are you?');
    await page.click('button[type="submit"]');

    // 応答待機
    console.log('9. RAG AI応答待機中...');
    for (let i = 0; i < 60; i++) {
      const assistantMessages = await page.locator('[data-role="assistant"]').count();
      if (assistantMessages > 0) {
        const text = await page.locator('[data-role="assistant"]').first().textContent();
        if (text && text.length > 5 && !text.includes('...')) {
          console.log(`   RAG AI応答検出: "${text.substring(0, 80)}..."`);
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: `${ARTIFACTS_DIR}/08-rag-ai-response.png`, fullPage: true });
    console.log('   スクリーンショット: 08-rag-ai-response.png ★ RAG AI応答');

    // Documentsタブ
    console.log('10. Documentsタブ確認...');
    await page.click('button:has-text("Documents")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/09-documents-tab.png`, fullPage: true });
    console.log('   スクリーンショット: 09-documents-tab.png');

    console.log('\n=== 完了 ===');
    console.log(`スクリーンショット保存先: ${ARTIFACTS_DIR}`);

  } catch (error) {
    console.error('エラー:', error);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/error-screenshot.png`, fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
})();
