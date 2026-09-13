using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class JarvisInput {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int x,y; }
 [StructLayout(LayoutKind.Sequential)] struct Keyboard { public ushort key,scan; public uint flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct Mouse { public int x,y; public uint data,flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Keyboard keyboard; [FieldOffset(0)] public Mouse mouse; }
 [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Union data; }
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,Input[] input,int size);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] static extern short GetKeyState(int key);
 [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 public static int InputSize() { return Marshal.SizeOf(typeof(Input)); }
 static readonly int[] modifiers = { 0x10,0x11,0x12,0x5B,0x5C };
 public static bool ModifiersReleased() { foreach(int key in modifiers) if((GetAsyncKeyState(key)&0x8000)!=0) return false; return true; }
 public static bool CapsLock() { return (GetKeyState(0x14)&1)!=0; }
 public static bool ButtonsReleased() { return (GetAsyncKeyState(1)&0x8000)==0&&(GetAsyncKeyState(2)&0x8000)==0&&(GetAsyncKeyState(4)&0x8000)==0; }
 static Input Key(ushort key,ushort scan,uint flags) { var i=new Input(); i.type=1;i.data.keyboard.key=key;i.data.keyboard.scan=scan;i.data.keyboard.flags=flags;return i; }
 static void Send(Input[] inputs) { if(SendInput((uint)inputs.Length,inputs,InputSize()) != inputs.Length) throw new InvalidOperationException("INPUT_REJECTED"); }
 public static int Type(string text) {
  if(!ModifiersReleased()) throw new InvalidOperationException("KEYBOARD_BUSY");
  bool caps=CapsLock(); int count=0;
  foreach(char ch in text) {
   var down=Key(0,ch,4); var up=Key(0,ch,6);
   try { Send(new Input[]{down,up}); count++; }
   catch { SendInput(1,new Input[]{up},InputSize()); throw; }
  }
  if(CapsLock()!=caps || !ModifiersReleased()) throw new InvalidOperationException("KEYBOARD_STATE_CHANGED");
  return count;
 }
 public static void Keypress(ushort[] keys) {
  if(!ModifiersReleased()) throw new InvalidOperationException("KEYBOARD_BUSY");
  bool caps=CapsLock(); var inputs=new List<Input>();
  foreach(ushort key in keys) inputs.Add(Key(key,0,Extended(key)));
  for(int i=keys.Length-1;i>=0;i--) inputs.Add(Key(keys[i],0,Extended(keys[i])|2));
  try { Send(inputs.ToArray()); }
  catch { for(int i=keys.Length-1;i>=0;i--) SendInput(1,new Input[]{Key(keys[i],0,Extended(keys[i])|2)},InputSize()); throw; }
  if(CapsLock()!=caps || !ModifiersReleased()) throw new InvalidOperationException("KEYBOARD_STATE_CHANGED");
 }
 static uint Extended(ushort key) { return (key>=0x21&&key<=0x28)||key==0x2D||key==0x2E||key==0x5B||key==0x5C ? 1u:0u; }
 public static Point Position() { Point point; if(!GetCursorPos(out point)) throw new InvalidOperationException("INPUT_REJECTED");return point; }
 public static void Move(int x,int y) { if(!SetCursorPos(x,y)) throw new InvalidOperationException("INPUT_REJECTED"); }
 public static void MouseEvent(uint flags,int data=0) { var i=new Input();i.type=0;i.data.mouse.flags=flags;i.data.mouse.data=unchecked((uint)data);Send(new Input[]{i}); }
 public static void Click(bool right,int count) {
  if(!ModifiersReleased()||!ButtonsReleased()) throw new InvalidOperationException("INPUT_BUSY");
  uint down=right?8u:2u;uint up=right?16u:4u;
  for(int n=0;n<count;n++) { try { MouseEvent(down); } finally { MouseEvent(up); } }
 }
}
