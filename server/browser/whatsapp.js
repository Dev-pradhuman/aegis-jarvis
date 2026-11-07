import { browserManager as defaultBrowserManager } from './index.js';

/**
 * Sends a message to a recipient via WhatsApp Web in headless mode
 * using the persisted Camoufox browser session.
 */
export async function sendWhatsAppWebMessage(recipient, message, options = {}) {
  const bm = options.browserManager || defaultBrowserManager;
  const cleanRecipient = String(recipient || '').trim();
  const cleanMessage = String(message || '').trim();

  if (!cleanRecipient) throw new Error('A recipient name or number is required for WhatsApp messaging');
  if (!cleanMessage) throw new Error('A message body is required for WhatsApp messaging');

  // 1. Ensure navigated to WhatsApp Web
  const currentUrl = bm.engine?.url?.() || bm.currentUrl || '';
  if (!currentUrl.includes('web.whatsapp.com')) {
    await bm.navigate('https://web.whatsapp.com', { mode: 'visual' });
  }

  // 2. Wait for search box to be present and active
  const searchSelector = '#_r_c_, div[contenteditable="true"][data-tab="3"], [aria-label*="Search or start a new chat"], [aria-label*="Search"]';
  await bm.waitFor(searchSelector, 15000);

  // 3. Search for recipient
  await bm.type(searchSelector, cleanRecipient, { mode: 'visual' });

  // Brief pause for contact results to render
  await new Promise((r) => setTimeout(r, 1200));

  // 4. Click matching contact/chat row or fall back to pressing Enter
  const snapshot = await bm.snapshot().catch(() => null);
  let clicked = false;
  if (snapshot?.items?.length) {
    const escaped = cleanRecipient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const contactRow = snapshot.items.find((item) =>
      item.role === 'row' && new RegExp(escaped, 'i').test(item.name)
    );
    if (contactRow?.selector) {
      await bm.click(contactRow.selector, { mode: 'visual' }).catch(() => {});
      clicked = true;
    }
  }

  if (!clicked) {
    await bm.press('Enter', searchSelector, { mode: 'visual' }).catch(() => {});
  }

  // Brief pause for conversation thread to open
  await new Promise((r) => setTimeout(r, 1200));

  // 5. Dismiss any popup/dialog that might be blocking the view (e.g., call promo)
  const dialogClose = 'button[aria-label="Close"], [data-jarvis-ref="e4"]';
  try {
    await bm.click(dialogClose, { mode: 'visual' });
  } catch {}

  // 6. Locate the message composer textbox
  const composerSelector = '[aria-label*="Type a message"], footer div[contenteditable="true"], div[contenteditable="true"][data-tab="10"]';
  await bm.waitFor(composerSelector, 12000);

  // 7. Type message into composer
  await bm.type(composerSelector, cleanMessage, { mode: 'visual' });

  // Brief pause before dispatch
  await new Promise((r) => setTimeout(r, 400));

  // 8. Click send button or press Enter
  const sendSelector = 'span[data-icon="send"], button[aria-label="Send"]';
  let sent = false;
  try {
    await bm.click(sendSelector, { mode: 'visual' });
    sent = true;
  } catch {
    await bm.press('Enter', composerSelector, { mode: 'visual' });
    sent = true;
  }

  // Brief pause to allow send event to complete in web socket
  await new Promise((r) => setTimeout(r, 800));

  return {
    delivered: sent,
    recipient: cleanRecipient,
    message: cleanMessage,
    channel: 'whatsapp',
    timestamp: new Date().toISOString()
  };
}
