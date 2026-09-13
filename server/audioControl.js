import {desktopRequest} from './desktopBridge.js';
export async function audioControl(action,args={},options={}){
 const bridge=options.bridge||desktopRequest;
 const before=await bridge('audio.status');
 if(action==='status')return before;
 let volume=null,muted=null;
 if(action==='set_volume')volume=args.volume;
 if(action==='volume_up')volume=Math.min(100,before.volume+(args.amount??5));
 if(action==='volume_down')volume=Math.max(0,before.volume-(args.amount??5));
 if(action==='mute')muted=true;
 if(action==='unmute')muted=false;
 if(action==='toggle_mute')muted=!before.muted;
 return bridge('audio.set',{volume,muted});
}
