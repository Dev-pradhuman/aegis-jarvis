import { fetchWithCredentialRotation } from './credentialPool.js';

export class GroqWhisperProvider {
    constructor(options = {}) {
        this.localProvider = options.localProvider;
        this.enabled = options.enabled !== undefined ? options.enabled : true;
        this.groqApiKey = options.groqApiKey || process.env.GROQ_API_KEY;
        this.models = ['whisper-large-v3-turbo', 'whisper-large-v3'];
    }

    async transcribe(audioBuffer) {
        if (!this.enabled) {
            if (this.localProvider) {
                return this.localProvider.transcribe(audioBuffer);
            }
            throw new Error('Cloud STT is disabled and no local provider available.');
        }

        const WHISPER_HALLUCINATIONS = /^(thank you(\.|\!)?|thanks for watching(\.|\!)?|thank you for watching(\.|\!)?|subscribe(\.|\!)?|please subscribe(\.|\!)?|you(\.|\!)?|\.|\.\.\.|\[.*\]|jarvis(\.|\!)?)$/i;
        const modelsToTry = this.models;
        let lastError = null;

        for (const modelId of modelsToTry) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
                const requestFn = (apiKey) => {
                    const formData = new FormData();
                    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'speech.wav');
                    formData.append('model', modelId);
                    formData.append('response_format', 'json');
                    formData.append('temperature', '0');
                    formData.append('prompt', 'JARVIS voice assistant. User speaks clear commands in English, Hindi, and Hinglish. Namaste, jarvis, open, check, search, volume, reminders, tasks, email, calendar.');

                    return fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: formData,
                        signal: controller.signal
                    });
                };

                let response;
                if (this.groqApiKey && !process.env.GROQ_API_KEY_1) {
                    response = await requestFn(this.groqApiKey);
                } else {
                    const rot = await fetchWithCredentialRotation('GROQ_API_KEY', (key) => requestFn(this.groqApiKey || key));
                    response = rot.response;
                }

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Groq STT error ${response.status}: ${text}`);
                }

                const data = await response.json();
                const text = String(data.text || '').trim();
                if (text && !WHISPER_HALLUCINATIONS.test(text)) return text;
            } catch (error) {
                console.warn(`[GroqWhisperProvider] Model ${modelId} failed (${error.message}), trying backup...`);
                lastError = error;
            } finally {
                clearTimeout(timeoutId);
            }
        }

        console.error(`[GroqWhisperProvider] Both Groq Whisper models failed (${lastError?.message}), falling back to local or prompting to type`);
        if (this.localProvider) {
            try {
                return await this.localProvider.transcribe(audioBuffer);
            } catch (err) {
                console.warn(`[GroqWhisperProvider] Local STT fallback failed: ${err.message}`);
            }
        }
        return "[Audio transcription failed. Please type your message in the chat input.]";
    }
}
