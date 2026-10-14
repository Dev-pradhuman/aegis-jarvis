import test from 'node:test';
import assert from 'node:assert';
import { FishAudioProvider } from '../server/cloudTTS.js';
import { GroqWhisperProvider } from '../server/cloudSTT.js';
import { createServer } from 'node:http';

test('FishAudioProvider should fallback to Piper on 429', async () => {
    let piperCalled = false;
    const mockPiper = {
        speak: async (text) => { piperCalled = true; },
        stop: () => {}
    };

    const server = createServer((req, res) => {
        res.writeHead(429);
        res.end('Rate Limited');
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const provider = new FishAudioProvider({
        piper: mockPiper,
        mode: 'openrouter',
        openRouterKey: 'test',
        audioPlayback: { playStream: async () => {}, stop: () => {} }
    });

    // Override fetch to point to fake server
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        return originalFetch(`http://127.0.0.1:${port}`, options);
    };

    try {
        await provider.speak('hello');
        assert.ok(piperCalled, 'Should fallback to Piper on 429');
    } finally {
        global.fetch = originalFetch;
        server.close();
    }
});

test('GroqWhisperProvider respects disabled state', async () => {
    let localCalled = false;
    const mockLocal = {
        transcribe: async () => { localCalled = true; return 'local'; }
    };

    const provider = new GroqWhisperProvider({
        enabled: false,
        localProvider: mockLocal,
        groqApiKey: 'test'
    });

    const res = await provider.transcribe(Buffer.from('test'));
    assert.strictEqual(res, 'local');
    assert.ok(localCalled);
});

import {
    detectReplyLanguage,
    getLanguageTtsCascade,
    synthesizeSpeech,
    ttsStatus,
    setProviderCooldown,
    clearProviderCooldown,
    isProviderOnCooldown
} from '../server/tts.js';

test('detectReplyLanguage identifies English vs Hindi correctly', () => {
    assert.strictEqual(detectReplyLanguage('Hello, this is JARVIS.'), 'en');
    assert.strictEqual(detectReplyLanguage('नमस्ते, मैं जार्विस हूँ।'), 'hi');
    assert.strictEqual(detectReplyLanguage('Haan main theek hoon, aap batao.'), 'hi');
    assert.strictEqual(detectReplyLanguage('System is online.', 'hi'), 'hi');
    assert.strictEqual(detectReplyLanguage('System is online.', 'en'), 'en');
});

test('getLanguageTtsCascade uses ElevenLabs as direct primary for both English and Hindi', () => {
    const enOrder = getLanguageTtsCascade('en');
    assert.deepStrictEqual(enOrder, ['elevenlabs']);

    const hiOrder = getLanguageTtsCascade('hi');
    assert.deepStrictEqual(hiOrder, ['elevenlabs']);
});

test('synthesizeSpeech falls back to text-only mode when ElevenLabs fails', async () => {
    clearProviderCooldown();
    // English cascade test
    const enResult = await synthesizeSpeech({ text: 'Hello, systems are ready.' });
    assert.strictEqual(enResult.textOnly, true);
    assert.strictEqual(enResult.language, 'en');

    // Hindi cascade test
    const hiResult = await synthesizeSpeech({ text: 'नमस्ते, सिस्टम तैयार है।' });
    assert.strictEqual(hiResult.textOnly, true);
    assert.strictEqual(hiResult.language, 'hi');
});

test('circuit breaker marks provider on cooldown and ttsStatus exposes it', () => {
    clearProviderCooldown();
    assert.strictEqual(isProviderOnCooldown('elevenlabs'), false);
    setProviderCooldown('elevenlabs', 'Insufficient API credit', 402);
    assert.strictEqual(isProviderOnCooldown('elevenlabs'), true);

    const status = ttsStatus();
    assert.strictEqual(status.elevenlabs.onCooldown, true);
    assert.ok(status.cooldowns['elevenlabs']);
    assert.strictEqual(status.cooldowns['elevenlabs'].active, true);
    assert.ok(status.cooldowns['elevenlabs'].remainingMs > 0);

    clearProviderCooldown();
    assert.strictEqual(isProviderOnCooldown('elevenlabs'), false);
    assert.strictEqual(ttsStatus().elevenlabs.onCooldown, false);
});

test('synthesizeSpeech skips cooled-down providers immediately', async () => {
    clearProviderCooldown();
    setProviderCooldown('elevenlabs', 'Rate limited or quota exceeded', 429);

    // Since elevenlabs is on cooldown, it should skip elevenlabs directly to text-only in <200ms
    const start = Date.now();
    const result = await synthesizeSpeech({ text: 'Testing circuit breaker bypass.' });
    const elapsed = Date.now() - start;

    assert.strictEqual(result.textOnly, true);
    assert.ok(elapsed < 200, `Bypass should complete in < 200ms without waiting on elevenlabs, took ${elapsed}ms`);
    clearProviderCooldown();
});

