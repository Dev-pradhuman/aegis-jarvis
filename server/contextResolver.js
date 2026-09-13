function commandText(value){return String(value||'').trim().replace(/^(?:hey\s+)?(?:jarvis|travis)[\s,]+/i,'').replace(/[.!?]+$/,'').trim();}

export function contextualToolRoute(text,state={}){
 const command=commandText(text);const context=state.runtime?.context||{};
 const windowAction=command.match(/^(close|minimize|maximize|restore|focus|switch to)\s+(?:it|this|that)(?:\s+window)?$/i);
 if(windowAction&&context.activeWindow?.handle){const action=/focus|switch/i.test(windowAction[1])?'focus':windowAction[1].toLowerCase();return{route:'TOOL_CALL',capability:`windows.${action}`,args:{target:String(context.activeWindow.handle)},confidence:.99,contextResolved:'activeWindow'};}
 if(/^(pause|play|toggle|next|previous)\s+it$/i.test(command)){const action=command.split(/\s+/)[0].toLowerCase();return{route:'TOOL_CALL',capability:`media.${action}`,args:{},confidence:.98,contextResolved:'currentMediaSession'};}
 if(/^(go\s+back|back)(?:\s+(?:in|on)\s+(?:it|this|that))?$/i.test(command)&&context.browser?.url)return{route:'TOOL_CALL',capability:'browser.back',args:{},confidence:.99,contextResolved:'activeBrowserTab'};
 if(/^reload\s+(?:it|this|that)(?:\s+page)?$/i.test(command)&&context.browser?.url)return{route:'TOOL_CALL',capability:'browser.reload',args:{},confidence:.99,contextResolved:'activeBrowserTab'};
 return null;
}

export function updateEphemeralContext(state,definition,output){
 if(!state?.runtime||!output||definition.sensitiveInput||definition.sensitiveOutput)return;
 const context=state.runtime.context??={};context.updatedAt=new Date().toISOString();context.lastAction={toolName:definition.id,at:context.updatedAt};
 if(definition.id==='windows.get_active'&&output.active)context.activeWindow={handle:output.active.handle,pid:output.active.pid,title:output.active.title};
 if(definition.id==='system.app.open'&&output.verification?.windows?.[0])context.activeWindow={...output.verification.windows[0],title:output.label||null};
 if(definition.id.startsWith('windows.')&&output.observed)context.activeWindow={handle:output.observed.handle,pid:output.observed.pid,title:output.observed.title};
 if(definition.id==='windows.close'&&context.activeWindow?.handle===output.target?.handle)delete context.activeWindow;
 if(definition.id.startsWith('browser.')&&output.url)context.browser={url:output.url,title:output.title||null};
 if(definition.id==='files.read')context.currentFile={path:output.path};
 if(definition.id==='screen.capture')context.latestArtifact={type:'screenshot',path:output.artifactPath,sha256:output.sha256};
 if(definition.id==='media.status'&&output.available)context.currentMedia={sessionId:output.sessionId,title:output.title||null,artist:output.artist||null};
 if(definition.id==='tasks.create'&&output.task?.id)context.latestTask={id:output.task.id,title:output.task.title};
}
