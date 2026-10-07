import { requestOriginAllowed } from '../requestSecurity.js';

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export function voiceRoutes(voicePipeline) {
  return async (req, res) => {
    if (req.url.startsWith('/api/voice/status') && req.method === 'GET') {
      return json(res, 200, {
        state: voicePipeline.state,
        enabled: voicePipeline.enabled
      });
    }

    // State changing routes
    if (!requestOriginAllowed(req)) {
      return json(res, 403, { error: 'Origin or host is not allowed' });
    }

    if (req.url.startsWith('/api/voice/enable') && req.method === 'POST') {
      voicePipeline.enabled = true;
      voicePipeline.startListening();
      return json(res, 200, { ok: true, state: voicePipeline.state });
    }

    if (req.url.startsWith('/api/voice/disable') && req.method === 'POST') {
      voicePipeline.enabled = false;
      voicePipeline.kill();
      return json(res, 200, { ok: true, state: voicePipeline.state });
    }

    if (req.url.startsWith('/api/voice/mute') && req.method === 'POST') {
      voicePipeline.mute();
      return json(res, 200, { ok: true, state: voicePipeline.state });
    }

    if (req.url.startsWith('/api/voice/kill') && req.method === 'POST') {
      voicePipeline.kill();
      return json(res, 200, { ok: true, state: voicePipeline.state });
    }

    if (req.url.startsWith('/api/voice/ptt') && req.method === 'POST') {
      let data = {};
      if (typeof req.json === 'function') {
        data = await req.json().catch(() => ({}));
      } else {
        try {
          let bodyData = '';
          for await (const chunk of req) bodyData += chunk;
          if (bodyData) data = JSON.parse(bodyData);
        } catch(e) {}
      }
      if (data.action === 'start') {
        voicePipeline.pushToTalk();
      } else if (data.action === 'stop' && voicePipeline.state === 'capturing') {
        voicePipeline.stopCapturing(voicePipeline.vadProvider ? voicePipeline.vadProvider.flush() : Buffer.alloc(0));
      }
      return json(res, 200, { ok: true, state: voicePipeline.state });
    }
    
    return null; // Not matched
  };
}
