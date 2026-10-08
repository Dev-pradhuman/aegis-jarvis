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
