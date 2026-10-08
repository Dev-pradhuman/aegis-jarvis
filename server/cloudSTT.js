export class GroqWhisperProvider {
    constructor(options = {}) {
        this.localProvider = options.localProvider;
        this.enabled = options.enabled || false;
        this.groqApiKey = options.groqApiKey || process.env.GROQ_API_KEY;
        this.modelId = options.modelId || 'whisper-large-v3-turbo';
    }

    async transcribe(audioBuffer) {
        if (!this.enabled || !this.groqApiKey) {
            if (this.localProvider) {
                return this.localProvider.transcribe(audioBuffer);
            }
            throw new Error('Cloud STT is disabled and no local provider available.');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const formData = new FormData();
            formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'speech.wav');
            formData.append('model', this.modelId);
            formData.append('response_format', 'json');

            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.groqApiKey}`
                },
                body: formData,
                signal: controller.signal
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Groq STT error ${response.status}: ${text}`);
            }

            const data = await response.json();
            return String(data.text || '').trim();
        } catch (error) {
            console.error(`[GroqWhisperProvider] Cloud STT failed (${error.message}), falling back to local`);
            if (this.localProvider) {
                return this.localProvider.transcribe(audioBuffer);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}
