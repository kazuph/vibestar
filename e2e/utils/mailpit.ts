/**
 * Mailpit API utilities for E2E tests
 * Mailpit is used as a local SMTP server for testing email functionality
 * @see https://mailpit.axllent.org/docs/api-v1/
 */

const MAILPIT_BASE_URL = 'http://localhost:18025';

/**
 * Message summary from Mailpit API
 */
interface MailpitMessageSummary {
  ID: string;
  MessageID: string;
  Read: boolean;
  From: {
    Name: string;
    Address: string;
  };
  To: Array<{
    Name: string;
    Address: string;
  }>;
  Cc: Array<{
    Name: string;
    Address: string;
  }>;
  Bcc: Array<{
    Name: string;
    Address: string;
  }>;
  Subject: string;
  Created: string;
  Tags: string[];
  Size: number;
  Attachments: number;
  Snippet: string;
}

/**
 * Full message from Mailpit API
 */
interface MailpitMessage extends MailpitMessageSummary {
  Text: string;
  HTML: string;
}

/**
 * Messages list response from Mailpit API
 */
interface MailpitMessagesResponse {
  total: number;
  unread: number;
  count: number;
  start: number;
  messages: MailpitMessageSummary[];
}

/**
 * Get all messages from Mailpit
 * @returns List of messages
 */
export async function getMessages(): Promise<MailpitMessageSummary[]> {
  const response = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages`);
  if (!response.ok) {
    throw new Error(`Failed to fetch messages from Mailpit: ${response.status}`);
  }
  const data = (await response.json()) as MailpitMessagesResponse;
  return data.messages;
}

/**
 * Get a single message by ID
 * @param id Message ID
 * @returns Full message content
 */
export async function getMessage(id: string): Promise<MailpitMessage> {
  const response = await fetch(`${MAILPIT_BASE_URL}/api/v1/message/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch message ${id} from Mailpit: ${response.status}`);
  }
  return (await response.json()) as MailpitMessage;
}

/**
 * Get the latest email for a specific recipient
 * @param email Recipient email address
 * @param timeout Maximum time to wait for the email (ms)
 * @param interval Polling interval (ms)
 * @returns Full message content or null if not found
 */
export async function getLatestEmailForRecipient(
  email: string,
  timeout = 30000,
  interval = 500
): Promise<MailpitMessage | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const messages = await getMessages();

    // Find message sent to this email address
    const message = messages.find((msg) =>
      msg.To.some((to) => to.Address.toLowerCase() === email.toLowerCase())
    );

    if (message) {
      return await getMessage(message.ID);
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return null;
}

/**
 * Extract OTP code from email body
 * Looks for common OTP patterns (4-8 digit codes)
 * @param message Mailpit message
 * @returns OTP code or null if not found
 */
export function extractOtpFromEmail(message: MailpitMessage): string | null {
  // Use text content first, fallback to HTML
  const content = message.Text || message.HTML;

  if (!content) {
    return null;
  }

  // Common OTP patterns:
  // - 6 digit codes (most common)
  // - 4-8 digit codes
  // - Codes that might be in special formatting

  // Try to find patterns like "OTP: 123456", "code: 123456", "verification code is 123456"
  const patterns = [
    /(?:OTP|code|verification code|認証コード|確認コード)[:\s]+(\d{4,8})/i,
    /\b(\d{6})\b/, // Standalone 6-digit number (most common OTP length)
    /\b(\d{4})\b/, // Fallback to 4-digit
    /\b(\d{8})\b/, // 8-digit OTP
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Get OTP from Mailpit for a specific email address
 * Combines waiting for email and extracting OTP
 * @param email Recipient email address
 * @param timeout Maximum time to wait for the email (ms)
 * @returns OTP code
 * @throws Error if no email found or no OTP in email
 */
export async function getOtpFromMailpit(email: string, timeout = 30000): Promise<string> {
  const message = await getLatestEmailForRecipient(email, timeout);

  if (!message) {
    throw new Error(`No email found for ${email} within ${timeout}ms`);
  }

  const otp = extractOtpFromEmail(message);

  if (!otp) {
    throw new Error(`No OTP code found in email for ${email}. Email content: ${message.Text || message.HTML}`);
  }

  return otp;
}

/**
 * Delete all messages in Mailpit (for test isolation)
 */
export async function clearMailbox(): Promise<void> {
  const response = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to clear Mailpit mailbox: ${response.status}`);
  }
}

/**
 * Delete a specific message by ID
 * @param id Message ID to delete
 */
export async function deleteMessage(id: string): Promise<void> {
  const response = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ IDs: [id] }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete message ${id}: ${response.status}`);
  }
}

/**
 * Wait for Mailpit to be ready
 * Useful for CI environments where Mailpit might not be immediately available
 * @param timeout Maximum time to wait (ms)
 * @param interval Polling interval (ms)
 */
export async function waitForMailpit(timeout = 30000, interval = 1000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages`);
      if (response.ok) {
        return;
      }
    } catch {
      // Mailpit not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Mailpit not available at ${MAILPIT_BASE_URL} after ${timeout}ms`);
}
