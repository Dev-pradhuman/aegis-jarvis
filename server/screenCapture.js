import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { desktopRequest } from './desktopBridge.js';
import { dataDirectory } from './platform/paths.js';

export async function captureScreen(args, options = {}) {
  if(args.scope==='monitor'&&!args.monitorId)throw Object.assign(new Error('monitorId is required for monitor capture'),{code:'INVALID_ARGUMENTS'});
  if(args.scope==='window'&&(!args.windowHandle||!args.processId))throw Object.assign(new Error('Exact windowHandle and processId are required'),{code:'INVALID_ARGUMENTS'});
  const result=await (options.bridge||desktopRequest)('screen.capture',args);
  const png=Buffer.from(result.pngBase64||'','base64');
  if(png.length<24||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.readUInt32BE(16)!==result.width||png.readUInt32BE(20)!==result.height)throw Object.assign(new Error('Native screenshot was not a valid dimension-matched PNG'),{code:'VERIFICATION_FAILED'});
  const serverDir=path.dirname(fileURLToPath(import.meta.url));
  const root=path.resolve(options.artifactRoot||path.join(dataDirectory(path.dirname(serverDir)),'screenshots'));
  await mkdir(root,{recursive:true});
  const id=crypto.randomUUID();const file=path.join(root,`${id}.png`);
  await writeFile(file,png,{flag:'wx'});
  const hash=crypto.createHash('sha256').update(png).digest('hex');
  const persistedHash=crypto.createHash('sha256').update(await readFile(file)).digest('hex');
  if(hash!==persistedHash)throw Object.assign(new Error('Screenshot persistence verification failed'),{code:'VERIFICATION_FAILED'});
  return {artifact:{id,path:file,mimeType:'image/png',bytes:png.length,sha256:hash},width:result.width,height:result.height,x:result.x,y:result.y,scope:args.scope,observedAt:result.observedAt,method:result.method,verified:true};
}
