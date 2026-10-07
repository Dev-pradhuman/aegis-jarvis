export class LocalOllamaMultimodalProvider {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.modelName = options.modelName || 'llava';
  }

  async generate(prompt, imageBuffer, fetchImpl = fetch) {
    if (!fetchImpl) fetchImpl = fetch;
    try {
      const response = await fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: prompt,
          images: [imageBuffer.toString('base64')],
          stream: false
        })
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Model not installed');
        }
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return { reply: data.response };
    } catch (err) {
      if (err.message === 'fetch failed' || err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
        throw new Error('Local perception provider unreachable (no model installed or running)');
      }
      throw err;
    }
  }
}

export class FakePerceptionProvider {
  async generate(prompt, imageBuffer) {
    return { reply: 'Fake perception response' };
  }
}

export async function perceive(prompt, imageBuffer, options = {}) {
  const { fetchImpl = fetch, testMode = false } = options;
  const provider = testMode ? new FakePerceptionProvider() : new LocalOllamaMultimodalProvider(options);

  return provider.generate(prompt, imageBuffer, fetchImpl);
}
