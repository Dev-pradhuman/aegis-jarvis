import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

export class FishAudioProvider {
    constructor(options = {}) {
        this.piper = options.piper;
        if (!this.piper) {
            throw new Error('PiperProvider fallback is required');
        }
        this.audioPlayback = options.audioPlayback || this.piper.audioPlayback;
        this.mode = options.mode || 'openrouter'; // 'openrouter' or 'direct'
        this.modelSlug = options.modelSlug || 's2.1-pro-free';
        this.voiceId = options.voiceId || 'default';
        this.openRouterKey = options.openRouterKey || process.env.OPENROUTER_API_KEY;
        this.fishAudioKey = options.fishAudioKey || process.env.FISH_AUDIO_API_KEY;
    }

    async speak(text) {
        if (!text) return;
        
        // Redaction is assumed to be handled before calling this, as per instructions.
        try {
            return await this._cloudSpeak(text);
        } catch (error) {
            console.error(`[FishAudioProvider] Cloud TTS failed (${error.message}), falling back to Piper`);
            return this.piper.speak(text);
        }
    }

    async _cloudSpeak(text) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            let response;
            if (this.mode === 'openrouter') {
                if (!this.openRouterKey) throw new Error('Missing OPENROUTER_API_KEY');
                response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.openRouterKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: this.modelSlug,
                        input: text,
                        voice: this.voiceId,
                        response_format: 'mp3' // Fetch mp3 and decode it
                    }),
                    signal: controller.signal
                });
            } else {
                if (!this.fishAudioKey) throw new Error('Missing FISH_AUDIO_API_KEY');
                response = await fetch('https://api.fish.audio/v1/tts', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.fishAudioKey}`,
                        'Content-Type': 'application/json',
                        'model': 's2.1-pro-free'
                    },
                    body: JSON.stringify({
                        text: text,
                        reference_id: this.voiceId,
                        format: 'mp3'
                    }),
                    signal: controller.signal
                });
            }

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
            }

            const webStream = response.body;
            const nodeStream = Readable.fromWeb(webStream);

            // Use ffmpeg to convert mp3 to raw PCM for audioPlayback
            return new Promise((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', [
                    '-i', 'pipe:0',
                    '-f', 's16le',
                    '-ar', '22050',
                    '-ac', '1',
                    'pipe:1'
                ]);
                this._currentFfmpeg = ffmpeg;

                nodeStream.pipe(ffmpeg.stdin);
                ffmpeg.stdin.on('error', () => {}); // Ignore EPIPE
                
                let ffmpegError = '';
                ffmpeg.stderr.on('data', chunk => {
                    ffmpegError += chunk.toString();
                });

                ffmpeg.on('error', err => {
                    this._currentFfmpeg = null;
                    reject(err);
                });

                ffmpeg.on('close', code => {
                    this._currentFfmpeg = null;
                    if (code !== 0 && code !== null) {
                        reject(new Error(`ffmpeg exited with code ${code}: ${ffmpegError.slice(0, 200)}`));
                    }
                });

                // Pass the decoded PCM to audioPlayback
                this.audioPlayback.playStream(ffmpeg.stdout)
                    .then(resolve)
                    .catch(reject);
            });
            
        } finally {
            clearTimeout(timeoutId);
        }
    }

    stop() {
        if (this._currentFfmpeg) {
            try { this._currentFfmpeg.kill('SIGKILL'); } catch (e) {}
            this._currentFfmpeg = null;
        }
        this.piper.stop();
        if (this.audioPlayback) this.audioPlayback.stop();
    }
}
