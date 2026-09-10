import test from 'node:test';import assert from 'node:assert/strict';import {audioControl} from '../server/audioControl.js';import {executeToolCall} from '../server/toolExecutor.js';
test('relative volume clamps and verifies actual endpoint state',async()=>{
 let state={volume:98,muted:false};const bridge=async(op,args)=>op==='audio.status'?{...state,verified:true}:(state={volume:args.volume??state.volume,muted:args.muted??state.muted,verified:true});
 assert.equal((await audioControl('volume_up',{amount:5},{bridge})).volume,100);
 assert.equal((await audioControl('volume_down',{amount:25},{bridge})).volume,75);
 assert.equal((await audioControl('toggle_mute',{}, {bridge})).muted,true);
});
test('audio tools use canonical Runs and reject invalid ranges',async()=>{
 const state={runs:[],approvals:[],activity:[],runtime:{}};
 const desktopOptions={bridge:async(op,args)=>op==='audio.status'?{volume:40,muted:false,verified:true}:{volume:args.volume,muted:false,verified:true}};
 const result=await executeToolCall({toolName:'audio.set_volume',arguments:{volume:45}},{state,desktopOptions});
 assert.equal(result.verified,true);assert.equal(state.runs.length,1);
 const invalid=await executeToolCall({toolName:'audio.set_volume',arguments:{volume:101}},{state,desktopOptions});
 assert.equal(invalid.error.code,'INVALID_ARGUMENTS');
});
