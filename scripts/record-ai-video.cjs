const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:15173';
const MAILPIT_URL = 'http://localhost:18025';
const ARTIFACTS_DIR = '/Users/kazuph/src/github.com/kazuph/vibestar/.artifacts/phase2-ai-verified';

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
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: `${ARTIFACTS_DIR}/videos/`,
      size: { width: 1440, height: 900 }
    }
  });
  const page = await context.newPage();

  try {
    console.log('=== AI Chat 動画録画開始 ===\n');

    console.log('1. メールボックスをクリア...');
    await clearMailbox();

    const testEmail = `test-video-${Date.now()}@example.com`;
    console.log(`2. テストユーザー作成: ${testEmail}`);

    // サインアップページへ
    await page.goto(`${BASE_URL}/auth/signup`);
    await page.waitForLoadState('networkidle');
    console.log('   サインアップページ表示');

    // メールアドレス入力
    await page.fill('input[name="email"]', testEmail);
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');

    // OTP待機
    console.log('3. OTP待機中...');
    await page.waitForTimeout(3000);

    let otp = null;
    for (let i = 0; i < 15; i++) {
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
    await page.fill('input[name="otp"]', otp);
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');

    // ダッシュボードへリダイレクト
    console.log('4. ダッシュボードへ...');
    await page.waitForURL('**/dashboard**');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('   ダッシュボード表示完了');

    // AI Chatタブをクリック
    console.log('5. AI Chatタブへ...');
    await page.click('button:has-text("AI Chat")');
    await page.waitForTimeout(1000);

    // メッセージ入力
    console.log('6. メッセージ送信: "What is 2 + 2?"');
    const inputSelector = 'input[placeholder="Type your message..."]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });

    // ゆっくり入力（動画用）
    await page.type(inputSelector, 'What is 2 + 2?', { delay: 100 });
    await page.waitForTimeout(500);

    // 送信
    await page.click('button[type="submit"]');

    // AI応答待機（最大60秒）
    console.log('7. AI応答待機中...');
    await page.waitForSelector('[data-role="user"]', { timeout: 10000 });
    console.log('   ユーザーメッセージ表示確認');

    // Assistantの応答を待つ
    let hasResponse = false;
    for (let i = 0; i < 60; i++) {
      const assistantMessages = await page.locator('[data-role="assistant"]').count();
      if (assistantMessages > 0) {
        const text = await page.locator('[data-role="assistant"]').first().textContent();
        if (text && text.length > 5 && !text.includes('...')) {
          hasResponse = true;
          console.log(`   ★ AI応答検出: "${text}"`);
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    if (!hasResponse) {
      console.log('   応答待機タイムアウト');
    }

    // 応答表示後、少し待機（動画用）
    await page.waitForTimeout(3000);

    // RAGモードでテスト
    console.log('8. RAGモードでテスト...');
    await page.click('button:has-text("New Chat")');
    await page.waitForTimeout(1000);

    // RAGチェックボックスをオン
    const ragCheckbox = page.locator('input[type="checkbox"]');
    await ragCheckbox.check();
    await page.waitForTimeout(500);

    // RAGモードでメッセージ送信
    await page.type(inputSelector, 'Hello, how are you?', { delay: 100 });
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');

    // 応答待機
    console.log('9. RAG AI応答待機中...');
    for (let i = 0; i < 60; i++) {
      const assistantMessages = await page.locator('[data-role="assistant"]').count();
      if (assistantMessages > 0) {
        const text = await page.locator('[data-role="assistant"]').first().textContent();
        if (text && text.length > 5 && !text.includes('...')) {
          console.log(`   ★ RAG AI応答検出: "${text}"`);
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    // 応答表示後、少し待機（動画用）
    await page.waitForTimeout(3000);

    console.log('\n=== 録画完了 ===');

  } catch (error) {
    console.error('エラー:', error);
    throw error;
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    console.log(`動画保存先: ${ARTIFACTS_DIR}/videos/`);
  }
})();
