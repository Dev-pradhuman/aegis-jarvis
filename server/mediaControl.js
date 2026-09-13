import {desktopRequest} from './desktopBridge.js';
export async function mediaControl(action,options={}){
 const bridge=options.bridge||desktopRequest;
 return bridge(action==='status'?'media.status':'media.action',action==='status'?{}:{action});
}
