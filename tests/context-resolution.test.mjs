import test from 'node:test';import assert from 'node:assert/strict';
import {contextualToolRoute,updateEphemeralContext} from '../server/contextResolver.js';

test('ephemeral desktop and browser context resolves safe pronoun commands',()=>{
 const state={runtime:{}};updateEphemeralContext(state,{id:'windows.get_active'}, {active:{handle:'91',pid:7,title:'Notepad'}});
 assert.deepEqual(contextualToolRoute('close it',state).args,{target:'91'});assert.equal(contextualToolRoute('maximize this window',state).capability,'windows.maximize');
 updateEphemeralContext(state,{id:'browser.read'},{url:'https://example.com',title:'Example'});assert.equal(contextualToolRoute('go back',state).capability,'browser.back');assert.equal(contextualToolRoute('reload it',state).capability,'browser.reload');
});

test('context resolver refuses ungrounded pronouns',()=>{
 assert.equal(contextualToolRoute('close it',{runtime:{}}),null);assert.equal(contextualToolRoute('send this to Arjun',{runtime:{context:{activeWindow:{handle:'1'}}}}),null);
});

test('sensitive tool content never enters ephemeral context',()=>{
 const state={runtime:{}};updateEphemeralContext(state,{id:'clipboard.read',sensitiveOutput:true},{text:'private',verified:true});assert.deepEqual(state.runtime,{});
});
