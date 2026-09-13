using System;
using System.Runtime.InteropServices;
public static class JarvisAudio {
 enum DataFlow { Render, Capture, All }
 enum Role { Console, Multimedia, Communications }
 [Flags] enum ClsCtx : uint { InprocServer=1, InprocHandler=2, LocalServer=4, RemoteServer=16, All=23 }
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
 [ComImport,InterfaceType(ComInterfaceType.InterfaceIsIUnknown),Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
 interface IDeviceEnumerator { int NotImpl1(); [PreserveSig]int GetDefaultAudioEndpoint(DataFlow flow,Role role,out IDevice device); }
 [ComImport,InterfaceType(ComInterfaceType.InterfaceIsIUnknown),Guid("D666063F-1587-4E43-81F1-B948E807363F")]
 interface IDevice { [PreserveSig]int Activate(ref Guid iid,ClsCtx context,IntPtr activationParams,[MarshalAs(UnmanagedType.IUnknown)]out object instance); }
 [ComImport,InterfaceType(ComInterfaceType.InterfaceIsIUnknown),Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
 interface IEndpointVolume {
  int RegisterControlChangeNotify(IntPtr notify);int UnregisterControlChangeNotify(IntPtr notify);int GetChannelCount(out uint count);
  int SetMasterVolumeLevel(float level,Guid context);int SetMasterVolumeLevelScalar(float level,Guid context);int GetMasterVolumeLevel(out float level);int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint channel,float level,Guid context);int SetChannelVolumeLevelScalar(uint channel,float level,Guid context);int GetChannelVolumeLevel(uint channel,out float level);int GetChannelVolumeLevelScalar(uint channel,out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)]bool mute,Guid context);int GetMute(out bool mute);int GetVolumeStepInfo(out uint step,out uint count);int VolumeStepUp(Guid context);int VolumeStepDown(Guid context);int QueryHardwareSupport(out uint mask);int GetVolumeRange(out float min,out float max,out float increment);
 }
 static IEndpointVolume Open(out object raw,out IDevice device,out object enumerator) {
  enumerator=new DeviceEnumerator();device=null;raw=null;
  int hr=((IDeviceEnumerator)enumerator).GetDefaultAudioEndpoint(DataFlow.Render,Role.Multimedia,out device);if(hr!=0)Marshal.ThrowExceptionForHR(hr);
  Guid iid=typeof(IEndpointVolume).GUID;hr=device.Activate(ref iid,ClsCtx.All,IntPtr.Zero,out raw);if(hr!=0)Marshal.ThrowExceptionForHR(hr);return (IEndpointVolume)raw;
 }
 static void Close(object raw,IDevice device,object enumerator) { if(raw!=null)Marshal.ReleaseComObject(raw);if(device!=null)Marshal.ReleaseComObject(device);if(enumerator!=null)Marshal.ReleaseComObject(enumerator); }
 public static float Volume() {object r=null,e=null;IDevice d=null;try{var v=Open(out r,out d,out e);float value;Marshal.ThrowExceptionForHR(v.GetMasterVolumeLevelScalar(out value));return value;}finally{Close(r,d,e);} }
 public static bool Muted() {object r=null,e=null;IDevice d=null;try{var v=Open(out r,out d,out e);bool value;Marshal.ThrowExceptionForHR(v.GetMute(out value));return value;}finally{Close(r,d,e);} }
 public static void SetVolume(float value) {object r=null,e=null;IDevice d=null;try{var v=Open(out r,out d,out e);Marshal.ThrowExceptionForHR(v.SetMasterVolumeLevelScalar(Math.Max(0,Math.Min(1,value)),Guid.Empty));}finally{Close(r,d,e);} }
 public static void SetMuted(bool value) {object r=null,e=null;IDevice d=null;try{var v=Open(out r,out d,out e);Marshal.ThrowExceptionForHR(v.SetMute(value,Guid.Empty));}finally{Close(r,d,e);} }
}
