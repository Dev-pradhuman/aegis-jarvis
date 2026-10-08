export const sites = {
  chatgpt: {
    url: 'https://chatgpt.com/',
    composer: ['#prompt-textarea', '[data-testid="prompt-textarea"]'],
    send: ['[data-testid="send-button"]', 'button[aria-label="Send prompt"]'],
    answer: '[data-message-author-role="assistant"]',
  },
  claude: {
    url: 'https://claude.ai/new',
    composer: ['[data-testid="chat-input"]', 'div.ProseMirror[contenteditable="true"]'],
    send: ['button[aria-label="Send message"]', 'button[data-testid="send-button"]'],
    answer: '[data-testid="assistant-message"]',
  },
  gemini: {
    url: 'https://gemini.google.com/app',
    composer: ['.rich-textarea', '[data-test-id="chat-input-text-area"]', 'rich-textarea'],
    send: ['button[aria-label="Send message"]', '.send-button'],
    answer: ['message-content', '.message-content', 'model-response'],
  },
  googleFlow: {
    url: 'https://imagefx.google.com/',
    composer: ['textarea[aria-label*="prompt"]', '.prompt-input'],
    send: ['button[aria-label*="Generate"]', '.generate-button'],
    answer: ['img.generated-image', 'video.generated-video'],
  }
};

export const BROWSER_PROVIDER_WARNING = "EXPERIMENTAL / may violate provider terms / account risk";
