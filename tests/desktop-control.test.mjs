import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApplicationIndex, resolveInstalledApplication, resolveInstalledBrowser } from '../server/applicationIndex.js';
import { resolveWindow, windowAction } from '../server/windowControl.js';
import { routeRequest } from '../server/router.js';
import { executeToolCall } from '../server/toolExecutor.js';
import { keyCodes } from '../server/desktopInput.js';
import { readFile } from 'node:fs/promises';
import { listProcessesByMemory } from '../server/processControl.js';

const apps = [
  { name: 'Visual Studio Code', kind: 'executable', target: 'C:\\Code.exe', executable: 'C:\\Code.exe' },
  { name: 'Visual Studio', kind: 'executable', target: 'C:\\devenv.exe', executable: 'C:\\devenv.exe' },
];
test('dynamic app names and aliases preserve Visual Studio distinction', async () => {
  for (const name of ['vscode', 'VS Code', 'code']) assert.equal((await resolveInstalledApplication(name, { apps })).name, 'Visual Studio Code');
  assert.equal((await resolveInstalledApplication('Visual Studio', { apps })).name, 'Visual Studio');
  await assert.rejects(resolveInstalledApplication('visual', { apps }), (e) => e.code === 'APP_AMBIGUOUS');
  await assert.rejects(resolveInstalledApplication('missing', { apps }), (e) => e.code === 'APP_NOT_FOUND');
  await assert.rejects(resolveInstalledApplication('code; shutdown', { apps }), (e) => e.code === 'INVALID_ARGUMENTS');
});
test('duplicate same-executable discovery entries merge but distinct installations remain ambiguous', async () => {
  assert.equal(normalizeApplicationIndex([apps[0], { ...apps[0], target: 'C:\\Code.lnk', kind: 'shortcut' }]).length, 1);
  await assert.rejects(resolveInstalledApplication('Visual Studio Code', { apps: [apps[0], { ...apps[0], target: 'D:\\Code.exe', executable: 'D:\\Code.exe' }] }), (e) => e.code === 'APP_AMBIGUOUS');
});
test('named browser resolution only considers registered browser records', async () => {
  const candidates = [
    { name: 'Zen', kind: 'shortcut', target: 'C:\\Users\\Test\\Zen.lnk', executable: 'C:\\Program Files\\Zen Browser\\zen.exe' },
    { name: 'Zen Browser', kind: 'executable', target: 'C:\\Program Files\\Zen Browser\\zen.exe', executable: 'C:\\Program Files\\Zen Browser\\zen.exe', browser: true },
    { name: 'Notepad', kind: 'executable', target: 'C:\\Windows\\notepad.exe', executable: 'C:\\Windows\\notepad.exe' },
  ];
  const zen = await resolveInstalledBrowser('Zen', { apps: candidates });
  assert.equal(zen.name, 'Zen Browser');
  assert.equal(zen.browser, true);
  await assert.rejects(resolveInstalledBrowser('Notepad', { apps: candidates }), (error) => error.code === 'APP_NOT_FOUND');
});
test('window resolution requires a unique title or exact handle', () => {
  const windows = [{ handle: '1', title: 'Notes - Notepad' }, { handle: '2', title: 'Other - Notepad' }];
  assert.equal(resolveWindow('2', windows).handle, '2');
  assert.throws(() => resolveWindow('Notepad', windows), (e) => e.code === 'WINDOW_AMBIGUOUS');
  assert.throws(() => resolveWindow('unknown', windows), (e) => e.code === 'WINDOW_NOT_FOUND');
});
test('window mutation verifies observed state and carries PID identity', async () => {
  const window = { handle: '10', pid: 5, title: 'Test', active: true, minimized: false };
  const bridge = async (op, input) => { if (op === 'windows.action') { assert.equal(input.pid, 5); return { windows: [{ ...window, minimized: true }] }; } return { windows: [window] }; };
  assert.equal((await windowAction('minimize', '10', { bridge })).verified, true);
  await assert.rejects(windowAction('close', '10', { bridge }), (e) => e.code === 'VERIFICATION_FAILED');
});
test('desktop routes reach canonical tools and store verified Runs', async () => {
  assert.equal(routeRequest('Open VS Code').capability, 'system.app.open');
  assert.equal(routeRequest('Minimize Chrome').capability, 'windows.minimize');
  const state = { runs: [], approvals: [], activity: [], runtime: {} };
  const result = await executeToolCall({ toolName: 'windows.list', arguments: {} }, { state, desktopOptions: { bridge: async () => ({ windows: [], observedAt: new Date().toISOString() }) } });
  assert.equal(result.status, 'completed'); assert.equal(result.verified, true); assert.equal(state.runs.length, 1);
});

test('RAM process inventory is bounded, read-only, and verified through the canonical executor', async () => {
  const observed = { processes: [{ processId: 7, name: 'example', workingSetMb: 512.4, privateMemoryMb: 400 }], count: 1, sortedBy: 'workingSetMb', observedAt: new Date().toISOString(), verified: true };
  const bridge = async (operation, input) => {
    assert.equal(operation, 'processes.list');
    assert.deepEqual(input, { limit: 10, minMemoryMb: 100 });
    return observed;
  };
  assert.deepEqual(await listProcessesByMemory({ limit: 10, minMemoryMb: 100 }, { platform: 'win32', bridge }), observed);
  const state = { runs: [], approvals: [], activity: [], runtime: {} };
  const result = await executeToolCall({ toolName: 'system.processes.list', arguments: { limit: 10, minMemoryMb: 100 } }, { state, desktopOptions: { platform: 'win32', bridge } });
  assert.equal(result.status, 'completed');
  assert.equal(result.verified, true);
  assert.equal(result.output.processes[0].name, 'example');
  assert.equal(state.runs[0].toolCalls[0].toolName, 'system.processes.list');
});

test('structured key combinations reject lock keys and malformed chords', () => {
  assert.deepEqual(keyCodes('Ctrl+Alt+J'), [17,18,74]);
  assert.deepEqual(keyCodes('Win+Shift'), [91,16]);
  assert.deepEqual(keyCodes('Ctrl+Space'), [17,32]);
  for (const key of ['CapsLock', 'Ctrl++J', 'Ctrl+Ctrl', 'Fn+Alt']) assert.throws(() => keyCodes(key), (e) => e.code === 'INVALID_ARGUMENTS');
});

test('clipboard read requires approval and does not persist private text', async () => {
  const state = { runs: [], approvals: [], activity: [], runtime: {} }; let calls=0;
  const desktopOptions = { bridge: async () => { calls++; return { verified:true,text:'controlled-private-value',characters:24 }; } };
  const pending = await executeToolCall({toolName:'clipboard.read',arguments:{}},{state,desktopOptions});
  assert.equal(pending.status,'waiting_for_approval'); assert.equal(calls,0);
  pending.approval.status='approved';
  const result=await executeToolCall({toolName:'clipboard.read',arguments:{},approvalId:pending.approval.id},{state,desktopOptions});
  assert.equal(result.output.text,'controlled-private-value'); assert.equal(result.verified,true);
  assert.doesNotMatch(JSON.stringify(state),/controlled-private-value/);
});

test('keyboard delivery cannot pass verification with changed modifier state', async () => {
  const state={runs:[],approvals:[],activity:[],runtime:{}};
  const args={windowHandle:'10',processId:5,text:'Hello'};
  const pending=await executeToolCall({toolName:'computer.type',arguments:args},{state});
  pending.approval.status='approved';
  const result=await executeToolCall({toolName:'computer.type',arguments:args,approvalId:pending.approval.id},{state,desktopOptions:{bridge:async()=>({accepted:true,capsLockUnchanged:true,modifiersReleased:false})}});
  assert.equal(result.status,'failed_verification');
  assert.doesNotMatch(JSON.stringify(state.runs),/"text":"Hello"/);
});

test('Windows PowerShell input bridge uses supported uint16 array cast and stdin payload', async () => {
  const source=await readFile(new URL('../windows/desktop-native.ps1',import.meta.url),'utf8');
  assert.match(source,/Keypress\(\[uint16\[\]\]/);
  assert.doesNotMatch(source,/\[ushort\[\]\]/);
  assert.match(source,/Console\]::In.ReadToEnd/);
});

test('mouse mutations require approval and carry exact foreground identity',async()=>{
  for(const [tool,args] of [
    ['mouse.click',{windowHandle:'7',processId:9}],
    ['mouse.double_click',{windowHandle:'7',processId:9}],
    ['mouse.right_click',{windowHandle:'7',processId:9}],
    ['mouse.scroll',{windowHandle:'7',processId:9,amount:-2}],
    ['mouse.drag',{windowHandle:'7',processId:9,x:100,y:200}],
  ]){
    const state={runs:[],approvals:[],activity:[],runtime:{}};let called=0;
    const pending=await executeToolCall({toolName:tool,arguments:args},{state,desktopOptions:{bridge:async(op,input)=>{called++;assert.equal(op,'mouse.action');assert.equal(input.windowHandle,'7');return{accepted:true,verified:true};}}});
    assert.equal(pending.status,'waiting_for_approval');assert.equal(called,0);
    pending.approval.status='approved';
    const result=await executeToolCall({toolName:tool,arguments:args,approvalId:pending.approval.id},{state,desktopOptions:{bridge:async(op,input)=>{called++;assert.equal(input.action,tool.split('.')[1]);return{accepted:true,verified:true};}}});
    assert.equal(result.verified,true);assert.equal(called,1);
  }
});
