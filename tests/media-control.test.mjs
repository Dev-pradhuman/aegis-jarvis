import test from 'node:test';import assert from 'node:assert/strict';import {mediaControl} from '../server/mediaControl.js';import {executeToolCall} from '../server/toolExecutor.js';import {routeRequest} from '../server/router.js';
test('media status preserves explicit no-session state',async()=>{
 const output=await mediaControl('status',{bridge:async(op)=>{assert.equal(op,'media.status');return{available:false,reason:'NO_MEDIA_SESSION',verified:true};}});assert.equal(output.available,false);
 const state={runs:[],approvals:[],activity:[],runtime:{}};const result=await executeToolCall({toolName:'media.status',arguments:{}},{state,desktopOptions:{bridge:async()=>output}});assert.equal(result.verified,true);
});
test('media control forwards one structured action and verifies acknowledgement',async()=>{
 const state={runs:[],approvals:[],activity:[],runtime:{}};let seen;
 const result=await executeToolCall({toolName:'media.pause',arguments:{}},{state,desktopOptions:{bridge:async(op,args)=>{seen={op,args};return{accepted:true,verified:true,action:'pause'};}}});
 assert.deepEqual(seen,{op:'media.action',args:{action:'pause'}});assert.equal(result.verified,true);
});
test('audio and media natural language use deterministic canonical routes',()=>{
 assert.deepEqual(routeRequest('Set volume to 40%').args,{volume:40});assert.equal(routeRequest('Set volume to 40%').capability,'audio.set_volume');
 assert.equal(routeRequest('Volume down 10').capability,'audio.volume_down');assert.equal(routeRequest('Pause').capability,'media.pause');assert.equal(routeRequest('Next song').capability,'media.next');
});
