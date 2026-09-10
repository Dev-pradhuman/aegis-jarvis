import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeSpeech } from '../server/tts.js';

function wav(value=1){const output=Buffer.alloc(46);output.write('RIFF',0);output.writeUInt32LE(38,4);output.write('WAVEfmt ',8);output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(1,22);output.writeUInt32LE(16000,24);output.writeUInt32LE(32000,28);output.writeUInt16LE(2,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(2,40);output.writeInt16LE(value,44);return output;}

test('Groq TTS migrates deprecated model and chunks replies within provider limit',async()=>{
 const saved={key:process.env.GROQ_API_KEY,model:process.env.GROQ_TTS_MODEL,voice:process.env.GROQ_TTS_VOICE,fetch:globalThis.fetch};
 process.env.GROQ_API_KEY='test-key';process.env.GROQ_TTS_MODEL='playai-tts';process.env.GROQ_TTS_VOICE='autumn';let requests=0;
 globalThis.fetch=async(_url,options)=>{requests++;const body=JSON.parse(options.body);assert.equal(body.model,'canopylabs/orpheus-v1-english');assert.ok(body.input.length<=200);return new Response(wav(requests),{status:200,headers:{'content-type':'audio/wav'}});};
 try{const result=await synthesizeSpeech({provider:'groq',text:'word '.repeat(110)});assert.ok(requests>=3);assert.equal(result.contentType,'audio/wav');assert.equal(result.audio.toString('ascii',0,4),'RIFF');}
 finally{for(const [key,value] of Object.entries({GROQ_API_KEY:saved.key,GROQ_TTS_MODEL:saved.model,GROQ_TTS_VOICE:saved.voice})){if(value===undefined)delete process.env[key];else process.env[key]=value;}globalThis.fetch=saved.fetch;}
});

test('invalid Groq voice is a configuration failure before network use',async()=>{
 const saved={key:process.env.GROQ_API_KEY,voice:process.env.GROQ_TTS_VOICE,fetch:globalThis.fetch};process.env.GROQ_API_KEY='test-key';process.env.GROQ_TTS_VOICE='not-a-voice';let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected');};
 try{await assert.rejects(()=>synthesizeSpeech({provider:'groq',text:'hello'}),/Unsupported Groq English voice/);assert.equal(calls,0);}
 finally{if(saved.key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=saved.key;if(saved.voice===undefined)delete process.env.GROQ_TTS_VOICE;else process.env.GROQ_TTS_VOICE=saved.voice;globalThis.fetch=saved.fetch;}
});
