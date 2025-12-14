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

/**
 * RAG Evidence Video Recording Script - Before/After Format
 *
 * Flow:
 * 1. Sign up → OTP → Dashboard
 * 2. AI Chat tab → Ask about Gemini version WITHOUT RAG (Before)
 * 3. Documents tab → Upload document with Gemini 2.5 info
 * 4. Wait for document processing (status: ready)
 * 5. AI Chat tab → Enable RAG → Ask same question again (After)
 * 6. Show the difference - AI now knows from document
 */
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
    console.log('=== RAG Evidence Video Recording (Before/After) ===\n');

    // Step 1: Clear mailbox and create user
    console.log('1. Clearing mailbox...');
    await clearMailbox();

    const testEmail = `test-rag-${Date.now()}@example.com`;
    console.log(`2. Creating test user: ${testEmail}`);

    // Sign up
    await page.goto(`${BASE_URL}/auth/signup`);
    await page.waitForLoadState('networkidle');
    console.log('   Sign up page loaded');

    await page.fill('input[name="email"]', testEmail);
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');

    // Wait for OTP
    console.log('3. Waiting for OTP...');
    await page.waitForTimeout(3000);

    let otp = null;
    for (let i = 0; i < 15; i++) {
      otp = await getOtpFromMailpit(testEmail);
      if (otp) break;
      await page.waitForTimeout(1000);
    }

    if (!otp) {
      throw new Error('Failed to get OTP');
    }
    console.log(`   OTP received: ${otp}`);

    // Enter OTP
    await page.waitForURL('**/auth/verify-otp**');
    await page.fill('input[name="otp"]', otp);
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');

    // Wait for dashboard
    console.log('4. Navigating to dashboard...');
    await page.waitForURL('**/dashboard**');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('   Dashboard loaded');

    // ========================================
    // BEFORE: Ask without RAG/Document
    // ========================================
    console.log('\n========== BEFORE (No Document) ==========');

    console.log('5. Opening AI Chat tab...');
    const chatTab = page.locator('button', { hasText: 'AI Chat' });
    await chatTab.waitFor({ state: 'visible', timeout: 30000 });
    await chatTab.click();
    await page.waitForTimeout(1000);

    const inputSelector = 'input[placeholder="Type your message..."]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });

    // Ask about Gemini version WITHOUT RAG
    console.log('6. Asking about Gemini version (without document)...');
    await page.type(inputSelector, 'What is the latest version of Gemini?', { delay: 80 });
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');

    // Wait for AI response (BEFORE)
    console.log('7. Waiting for AI response (BEFORE)...');
    await page.waitForSelector('[data-role="user"]', { timeout: 10000 });

    let beforeResponse = '';
    for (let i = 0; i < 90; i++) {
      const assistantMessages = await page.locator('[data-role="assistant"]').count();
      if (assistantMessages > 0) {
        const text = await page.locator('[data-role="assistant"]').last().textContent();
        if (text && text.length > 10 && !text.includes('...')) {
          beforeResponse = text;
          console.log(`   ★ BEFORE Response: "${text.substring(0, 150)}..."`);
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    // Pause to show the BEFORE response
    await page.waitForTimeout(4000);

    // ========================================
    // Upload Document
    // ========================================
    console.log('\n========== UPLOADING DOCUMENT ==========');

    console.log('8. Going to Documents tab...');
    const docsTab = page.locator('button', { hasText: 'Documents' });
    await docsTab.waitFor({ state: 'visible', timeout: 30000 });
    await docsTab.click();
    await page.waitForTimeout(1000);

    // Create document content with unique testable info
    const documentContent = `Gemini AI Version Information
=============================

The latest version of Gemini is 2.5.
This version was released in December 2025.

Key features of Gemini 2.5:
- Enhanced multimodal capabilities
- Improved reasoning and coding
- Better context understanding

This document is for RAG testing purposes.
The unique identifier for this test is: GEMINI_VERSION_2.5_TEST`;

    // Upload document via UI (using Playwright's setInputFiles)
    console.log('9. Uploading document via UI...');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'gemini-version-info.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(documentContent)
    });

    // Wait for upload success message
    console.log('   Waiting for upload completion...');
    await page.waitForTimeout(2000);

    // Check for success message
    const successMsg = await page.locator('text=uploaded successfully').count();
    if (successMsg > 0) {
      console.log('   Upload success message shown ✓');
    }

    // Wait for document processing
    console.log('10. Waiting for document processing...');

    // Poll for document to appear in the list
    let docVisible = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);

      const docItem = await page.locator('text=gemini-version-info.txt').count();
      if (docItem > 0) {
        // Check if the status shows ready (green checkmark or similar)
        const readyStatus = await page.locator('text=ready').count();
        if (readyStatus > 0 || i > 10) {
          docVisible = true;
          console.log('    Document visible in UI ✓');
          break;
        }
      }

      if (i % 5 === 0) {
        console.log('    Waiting for document processing...');
      }
    }

    if (!docVisible) {
      console.log('    Warning: Document may not be visible in UI');
    }

    // Pause on Documents tab to clearly show the uploaded file in video
    console.log('    Showing document in UI for video evidence...');
    await page.waitForTimeout(4000);

    // ========================================
    // AFTER: Ask with RAG enabled
    // ========================================
    console.log('\n========== AFTER (With RAG) ==========');

    console.log('11. Going back to AI Chat tab...');
    await chatTab.click();
    await page.waitForTimeout(1000);

    // Start new chat
    const newChatBtn = page.locator('button', { hasText: 'New Chat' });
    await newChatBtn.waitFor({ state: 'visible', timeout: 30000 });
    await newChatBtn.click();
    await page.waitForTimeout(1000);

    // Enable RAG checkbox
    console.log('12. Enabling RAG (Use documents)...');
    const ragCheckbox = page.locator('input[type="checkbox"]');
    await ragCheckbox.check();
    await page.waitForTimeout(500);
    console.log('    RAG enabled ✓');

    // Ask the SAME question again
    console.log('13. Asking the same question (with RAG)...');
    await page.type(inputSelector, 'What is the latest version of Gemini?', { delay: 80 });
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');

    // Wait for AI response (AFTER)
    console.log('14. Waiting for AI response (AFTER)...');
    await page.waitForSelector('[data-role="user"]', { timeout: 10000 });

    let afterResponse = '';
    for (let i = 0; i < 90; i++) {
      const assistantMessages = await page.locator('[data-role="assistant"]').count();
      if (assistantMessages > 0) {
        const text = await page.locator('[data-role="assistant"]').last().textContent();
        if (text && text.length > 10 && !text.includes('...')) {
          afterResponse = text;
          console.log(`   ★ AFTER Response: "${text.substring(0, 150)}..."`);

          // Check if response mentions 2.5
          if (text.includes('2.5')) {
            console.log('   ✓✓ RAG SUCCESS! Response contains "2.5" from document.');
          }
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    // Final pause for video
    await page.waitForTimeout(5000);

    // ========================================
    // Summary
    // ========================================
    console.log('\n========== SUMMARY ==========');
    console.log('BEFORE (no document):');
    console.log(`  "${beforeResponse.substring(0, 100)}..."`);
    console.log('AFTER (with RAG):');
    console.log(`  "${afterResponse.substring(0, 100)}..."`);

    if (afterResponse.includes('2.5') && !beforeResponse.includes('2.5')) {
      console.log('\n✓✓✓ RAG PROVEN! The AI learned "Gemini 2.5" from the uploaded document.');
    }

    console.log('\n=== Recording Complete ===');

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    console.log(`Video saved to: ${ARTIFACTS_DIR}/videos/`);
  }
})();
