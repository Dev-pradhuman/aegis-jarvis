param([Parameter(Mandatory=$true)][string]$Operation)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class JarvisDesktop {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int x,y; }
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window,uint flags);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 public delegate bool EnumProc(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr p);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int command);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr process, ref uint length, StringBuilder id);
 public class Window {
  public string handle, title, executable, appId; public int pid; public bool active, minimized, maximized;
 }
 public static Window[] Windows() {
  var windows = new List<Window>(); var active = GetForegroundWindow();
  EnumWindows((h,p) => {
   if (!IsWindowVisible(h)) return true;
   var text = new StringBuilder(2048); GetWindowText(h,text,text.Capacity);
   if (text.Length == 0) return true;
   uint pid; GetWindowThreadProcessId(h,out pid);
   var w = new Window { handle=h.ToInt64().ToString(), title=text.ToString(), pid=(int)pid, active=h==active, minimized=IsIconic(h), maximized=IsZoomed(h) };
   try { using(var process = Process.GetProcessById((int)pid)) {
    try { w.executable=process.MainModule.FileName; } catch {}
    uint length=512; var id=new StringBuilder((int)length);
    if(GetApplicationUserModelId(process.Handle,ref length,id)==0) w.appId=id.ToString();
   }} catch {}
   windows.Add(w); return true;
  },IntPtr.Zero);
  return windows.ToArray();
 }
}
'@
try { [void][JarvisDesktop]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch {}
try {
  if ($Operation -match '^(computer|clipboard|mouse|screen)\.') {
    Add-Type -Path (Join-Path $PSScriptRoot 'DesktopInput.cs')
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
  }
  if($Operation -match '^audio\.') { Add-Type -Path (Join-Path $PSScriptRoot 'AudioControl.cs') }
  if($Operation -match '^media\.') {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
    function Await-WinRT($operation,[Type]$resultType){
      $method=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1})[0]
      $task=$method.MakeGenericMethod($resultType).Invoke($null,@($operation));$task.GetAwaiter().GetResult()
    }
    $manager=Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $session=$manager.GetCurrentSession()
  }
  if($Operation -match '^ui\.') {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    function Get-UiRoot {
      $handle=[IntPtr]([long]$request.windowHandle)
      $window=@([JarvisDesktop]::Windows() | Where-Object {$_.handle -eq $request.windowHandle -and $_.pid -eq $request.processId})
      if($window.Count -ne 1){throw 'WINDOW_NOT_FOUND'}
      if($Operation -match '^ui\.(invoke|set_value)$' -and [JarvisDesktop]::GetForegroundWindow() -ne $handle){throw 'WINDOW_NOT_FOCUSED'}
      $root=[Windows.Automation.AutomationElement]::FromHandle($handle)
      if($null -eq $root){throw 'UI_TARGET_NOT_FOUND'}
      return $root
    }
    function Convert-UiElement($element) {
      try {
        $current=$element.Current;$rect=$current.BoundingRectangle
        $runtimeId='';try{$runtimeId=($element.GetRuntimeId() -join '.')}catch{}
        return @{name=$current.Name;automationId=$current.AutomationId;controlType=($current.ControlType.ProgrammaticName -replace '^ControlType\.','');enabled=$current.IsEnabled;offscreen=$current.IsOffscreen;runtimeId=$runtimeId;bounds=@{x=[int]$rect.X;y=[int]$rect.Y;width=[int]$rect.Width;height=[int]$rect.Height}}
      }catch{return $null}
    }
    function Find-UiTargets($root,[string]$target,[string]$controlType) {
      $all=$root.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
      $exact=New-Object 'System.Collections.Generic.List[object]';$partial=New-Object 'System.Collections.Generic.List[object]'
      foreach($element in $all){
        try{
          $current=$element.Current;$type=($current.ControlType.ProgrammaticName -replace '^ControlType\.','')
          if($controlType -and $type -ine $controlType){continue}
          if($current.Name -ieq $target -or $current.AutomationId -ieq $target){$exact.Add($element)}
          elseif(($current.Name -and $current.Name.IndexOf($target,[StringComparison]::OrdinalIgnoreCase) -ge 0) -or ($current.AutomationId -and $current.AutomationId.IndexOf($target,[StringComparison]::OrdinalIgnoreCase) -ge 0)){$partial.Add($element)}
        }catch{}
      }
      if($exact.Count -gt 0){return @($exact.ToArray())};return @($partial.ToArray())
    }
  }
  switch ($Operation) {
    'media.status' {
      if($null -eq $session){$result=@{available=$false;reason='NO_MEDIA_SESSION';verified=$true}}
      else{
        $properties=Await-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $playback=$session.GetPlaybackInfo();$timeline=$session.GetTimelineProperties()
        $result=@{available=$true;sessionId=$session.SourceAppUserModelId;title=$properties.Title;artist=$properties.Artist;albumTitle=$properties.AlbumTitle;playbackStatus=$playback.PlaybackStatus.ToString();positionMs=[long]$timeline.Position.TotalMilliseconds;durationMs=[long]$timeline.EndTime.TotalMilliseconds;observedAt=[DateTime]::UtcNow.ToString('o');verified=$true}
      }
    }
    'media.action' {
      if($null -eq $session){throw 'NO_MEDIA_SESSION'}
      $expected=$null
      switch($request.action){
        'play' {$accepted=Await-WinRT ($session.TryPlayAsync()) ([bool]);$expected='Playing'}
        'pause' {$accepted=Await-WinRT ($session.TryPauseAsync()) ([bool]);$expected='Paused'}
        'toggle' {$accepted=Await-WinRT ($session.TryTogglePlayPauseAsync()) ([bool])}
        'next' {$accepted=Await-WinRT ($session.TrySkipNextAsync()) ([bool])}
        'previous' {$accepted=Await-WinRT ($session.TrySkipPreviousAsync()) ([bool])}
        default{throw 'INVALID_ARGUMENTS'}
      }
      if(!$accepted){throw 'EXECUTION_FAILED'}
      Start-Sleep -Milliseconds 200
      $actual=$session.GetPlaybackInfo().PlaybackStatus.ToString()
      $verified=if($null -ne $expected){$actual -eq $expected}else{$true}
      $result=@{accepted=$true;verified=$verified;action=$request.action;sessionId=$session.SourceAppUserModelId;playbackStatus=$actual;verification=if($null -ne $expected){'observed playback status'}else{'provider acknowledgement; track/state transition not proven'}}
    }
    'audio.status' {$result=@{volume=[Math]::Round([JarvisAudio]::Volume()*100);muted=[JarvisAudio]::Muted();verified=$true}}
    'audio.set' {
      if($null -ne $request.volume){[JarvisAudio]::SetVolume(([float]$request.volume/100))}
      if($null -ne $request.muted){[JarvisAudio]::SetMuted([bool]$request.muted)}
      $actualVolume=[Math]::Round([JarvisAudio]::Volume()*100);$actualMuted=[JarvisAudio]::Muted()
      $verified=(($null -eq $request.volume)-or($actualVolume -eq [int]$request.volume))-and(($null -eq $request.muted)-or($actualMuted -eq [bool]$request.muted))
      $result=@{volume=$actualVolume;muted=$actualMuted;verified=$verified}
    }
    'computer.state' { $result=@{ capsLock=[JarvisInput]::CapsLock(); modifiersReleased=[JarvisInput]::ModifiersReleased(); inputSize=[JarvisInput]::InputSize() } }
    'computer.type' {
      $handle=[IntPtr]([long]$request.windowHandle)
      $target=@([JarvisDesktop]::Windows() | Where-Object { $_.handle -eq $request.windowHandle -and $_.pid -eq $request.processId })
      if ($target.Count -ne 1 -or [JarvisDesktop]::GetForegroundWindow() -ne $handle) { throw 'WINDOW_NOT_FOCUSED' }
      $caps=[JarvisInput]::CapsLock(); $count=[JarvisInput]::Type([string]$request.text)
      $result=@{accepted=$true; characters=$count; capsLockUnchanged=([JarvisInput]::CapsLock() -eq $caps); modifiersReleased=[JarvisInput]::ModifiersReleased(); windowHandle=$request.windowHandle; processId=$request.processId; method='SendInput delivery; application content not read back'}
    }
    'computer.keypress' {
      $handle=[IntPtr]([long]$request.windowHandle)
      $target=@([JarvisDesktop]::Windows() | Where-Object { $_.handle -eq $request.windowHandle -and $_.pid -eq $request.processId })
      if ($target.Count -ne 1 -or [JarvisDesktop]::GetForegroundWindow() -ne $handle) { throw 'WINDOW_NOT_FOCUSED' }
      $caps=[JarvisInput]::CapsLock(); [JarvisInput]::Keypress([uint16[]]$request.codes)
      $result=@{accepted=$true; capsLockUnchanged=([JarvisInput]::CapsLock() -eq $caps); modifiersReleased=[JarvisInput]::ModifiersReleased(); windowHandle=$request.windowHandle; processId=$request.processId; method='SendInput delivery; shortcut effect not observed'}
    }
    'clipboard.read' { $text=[Windows.Forms.Clipboard]::GetText(); $result=@{text=$text; characters=$text.Length; verified=$true; format='text'} }
    'clipboard.write' {
      $text=[string]$request.text
      if ($text.Length -eq 0) { [Windows.Forms.Clipboard]::Clear() } else { [Windows.Forms.Clipboard]::SetText($text) }
      $result=@{verified=([Windows.Forms.Clipboard]::GetText() -ceq $text); characters=$text.Length; format='text'}
    }
    'mouse.position' { $point=[JarvisInput]::Position(); $result=@{x=$point.x;y=$point.y;verified=$true} }
    'screen.topology' {
      $result=@{displays=@([Windows.Forms.Screen]::AllScreens | ForEach-Object { @{id=$_.DeviceName;primary=$_.Primary;x=$_.Bounds.X;y=$_.Bounds.Y;width=$_.Bounds.Width;height=$_.Bounds.Height} });verified=$true}
    }
    'screen.capture' {
      $bounds=[Windows.Forms.SystemInformation]::VirtualScreen
      if($request.scope -eq 'monitor') {
        $display=@([Windows.Forms.Screen]::AllScreens | Where-Object {$_.DeviceName -eq $request.monitorId})
        if($display.Count -ne 1){throw 'INVALID_ARGUMENTS'}
        $bounds=$display[0].Bounds
      } elseif($request.scope -eq 'window') {
        $target=@([JarvisDesktop]::Windows() | Where-Object {$_.handle -eq $request.windowHandle -and $_.pid -eq $request.processId})
        if($target.Count -ne 1){throw 'WINDOW_NOT_FOUND'}
        $rect=New-Object JarvisDesktop+Rect
        if(![JarvisDesktop]::GetWindowRect([IntPtr]([long]$request.windowHandle),[ref]$rect)){throw 'WINDOW_NOT_FOUND'}
        $windowBounds=New-Object Drawing.Rectangle($rect.left,$rect.top,($rect.right-$rect.left),($rect.bottom-$rect.top))
        $bounds=[Drawing.Rectangle]::Intersect($bounds,$windowBounds)
      } elseif($request.scope -ne 'desktop'){throw 'INVALID_ARGUMENTS'}
      if($bounds.Width -le 0 -or $bounds.Height -le 0 -or ([long]$bounds.Width*$bounds.Height) -gt 48000000){throw 'INVALID_ARGUMENTS'}
      $bitmap=New-Object Drawing.Bitmap($bounds.Width,$bounds.Height)
      $graphics=[Drawing.Graphics]::FromImage($bitmap)
      $stream=New-Object IO.MemoryStream
      try {
        $graphics.CopyFromScreen($bounds.Location,[Drawing.Point]::Empty,$bounds.Size)
        $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
        $result=@{pngBase64=[Convert]::ToBase64String($stream.ToArray());width=$bounds.Width;height=$bounds.Height;x=$bounds.X;y=$bounds.Y;observedAt=[DateTime]::UtcNow.ToString('o');method='visible desktop pixels; occluded windows are not reconstructed'}
      } finally {$stream.Dispose();$graphics.Dispose();$bitmap.Dispose()}
    }
    'mouse.move' {
      $inside=$false
      foreach($display in [Windows.Forms.Screen]::AllScreens) { if($display.Bounds.Contains([int]$request.x,[int]$request.y)){$inside=$true} }
      if(!$inside){throw 'INVALID_ARGUMENTS'}
      $targetX=[int]$request.x;$targetY=[int]$request.y
      [JarvisInput]::Move($targetX,$targetY)
      Start-Sleep -Milliseconds 10
      $point=[JarvisInput]::Position()
      $verified=((([int]$point.x) -eq $targetX) -and (([int]$point.y) -eq $targetY))
      $result=@{x=$point.x;y=$point.y;targetX=$targetX;targetY=$targetY;verified=$verified}
    }
    'mouse.action' {
      $handle=[IntPtr]([long]$request.windowHandle)
      $target=@([JarvisDesktop]::Windows() | Where-Object {$_.handle -eq $request.windowHandle -and $_.pid -eq $request.processId})
      if($target.Count -ne 1 -or [JarvisDesktop]::GetForegroundWindow() -ne $handle){throw 'WINDOW_NOT_FOCUSED'}
      $rect=New-Object JarvisDesktop+Rect
      if(![JarvisDesktop]::GetWindowRect($handle,[ref]$rect)){throw 'WINDOW_NOT_FOUND'}
      $point=[JarvisInput]::Position()
      $nativePoint=New-Object JarvisDesktop+Point;$nativePoint.x=$point.x;$nativePoint.y=$point.y
      if([JarvisDesktop]::GetAncestor([JarvisDesktop]::WindowFromPoint($nativePoint),2) -ne $handle){throw 'WINDOW_NOT_FOCUSED'}
      if($point.x -lt $rect.left -or $point.x -ge $rect.right -or $point.y -lt $rect.top -or $point.y -ge $rect.bottom){throw 'INVALID_ARGUMENTS'}
      if(![JarvisInput]::ModifiersReleased()){throw 'KEYBOARD_BUSY'}
      if(![JarvisInput]::ButtonsReleased()){throw 'INPUT_BUSY'}
      switch($request.action){
        'click' {[JarvisInput]::Click($false,1)}
        'double_click' {[JarvisInput]::Click($false,2)}
        'right_click' {[JarvisInput]::Click($true,1)}
        'scroll' {[JarvisInput]::MouseEvent(0x0800,([int]$request.amount*120))}
        'drag' {
          if($request.x -lt $rect.left -or $request.x -ge $rect.right -or $request.y -lt $rect.top -or $request.y -ge $rect.bottom){throw 'INVALID_ARGUMENTS'}
          try {
            [JarvisInput]::MouseEvent(2)
            for($step=1;$step -le 12;$step++){
              [JarvisInput]::Move([int]($point.x+($request.x-$point.x)*$step/12),[int]($point.y+($request.y-$point.y)*$step/12))
              Start-Sleep -Milliseconds 16
            }
          }finally{[JarvisInput]::MouseEvent(4)}
        }
        default {throw 'INVALID_ARGUMENTS'}
      }
      $after=[JarvisInput]::Position()
      $result=@{accepted=$true;verified=$true;action=$request.action;windowHandle=$request.windowHandle;processId=$request.processId;x=$after.x;y=$after.y;method='Native input delivery; application effect not observed'}
    }
    'ui.inspect' {
      $root=Get-UiRoot;$all=$root.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
      $controls=New-Object 'System.Collections.Generic.List[object]';$limit=[Math]::Min(500,$all.Count)
      for($index=0;$index -lt $limit;$index++){ $item=Convert-UiElement $all.Item($index);if($null -ne $item -and ($item.name -or $item.automationId)){$controls.Add($item)} }
      $result=@{windowHandle=$request.windowHandle;processId=$request.processId;controls=@($controls.ToArray());totalControls=$all.Count;truncated=($all.Count -gt $limit);grounding='windows-ui-automation';verified=$true}
    }
    'ui.find' {
      $root=Get-UiRoot;$matches=Find-UiTargets $root ([string]$request.target) ([string]$request.controlType)
      $items=New-Object 'System.Collections.Generic.List[object]';foreach($element in ($matches | Select-Object -First 20)){ $item=Convert-UiElement $element;if($null -ne $item){$items.Add($item)} }
      $result=@{windowHandle=$request.windowHandle;processId=$request.processId;target=$request.target;matches=@($items.ToArray());matchCount=$matches.Count;confidence=if($matches.Count -eq 1){1}else{0};grounding='windows-ui-automation';verified=$true}
    }
    'ui.set_value' {
      $root=Get-UiRoot;$matches=Find-UiTargets $root ([string]$request.target) ([string]$request.controlType)
      if($matches.Count -eq 0){throw 'UI_TARGET_NOT_FOUND'};if($matches.Count -gt 1){throw 'UI_TARGET_AMBIGUOUS'}
      $pattern=$null;if(!$matches[0].TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)){throw 'CAPABILITY_UNAVAILABLE'}
      $pattern.SetValue([string]$request.text);$actual=$pattern.Current.Value
      $result=@{accepted=$true;verified=($actual -ceq [string]$request.text);target=$request.target;characters=$actual.Length;grounding='windows-ui-automation-value-pattern';windowHandle=$request.windowHandle;processId=$request.processId}
    }
    'ui.invoke' {
      $root=Get-UiRoot;$matches=Find-UiTargets $root ([string]$request.target) ([string]$request.controlType)
      if($matches.Count -eq 0){throw 'UI_TARGET_NOT_FOUND'};if($matches.Count -gt 1){throw 'UI_TARGET_AMBIGUOUS'}
      $before=@([JarvisDesktop]::Windows() | ForEach-Object {$_.handle+'|'+$_.title+'|'+$_.active}) -join ';';$pattern=$null;$method=$null
      if($matches[0].TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$pattern.Invoke();$method='InvokePattern'}
      elseif($matches[0].TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern,[ref]$pattern)){$pattern.Select();$method='SelectionItemPattern'}
      elseif($matches[0].TryGetCurrentPattern([Windows.Automation.TogglePattern]::Pattern,[ref]$pattern)){$pattern.Toggle();$method='TogglePattern'}
      elseif($matches[0].TryGetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern,[ref]$pattern)){$pattern.Expand();$method='ExpandCollapsePattern'}
      else{throw 'CAPABILITY_UNAVAILABLE'}
      Start-Sleep -Milliseconds 300;$after=@([JarvisDesktop]::Windows() | ForEach-Object {$_.handle+'|'+$_.title+'|'+$_.active}) -join ';';$changed=$before -cne $after
      $result=@{accepted=$true;verified=$changed;observedChange=$changed;target=$request.target;grounding=('windows-ui-automation-'+$method);windowHandle=$request.windowHandle;processId=$request.processId}
    }
    'apps.index' {
      $items = New-Object 'System.Collections.Generic.List[object]'
      $warnings = New-Object 'System.Collections.Generic.List[string]'
      try {
        foreach ($app in Get-StartApps) { $items.Add(@{ name=$app.Name; appId=$app.AppID; kind='appId'; target=$app.AppID; source='start-apps' }) }
      } catch { $warnings.Add('Start app enumeration unavailable') }
      $shell = New-Object -ComObject WScript.Shell
      foreach ($menu in @([Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms'))) {
        if (!(Test-Path -LiteralPath $menu)) { continue }
        foreach ($file in Get-ChildItem -LiteralPath $menu -Filter '*.lnk' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1500) {
          try {
            $link=$shell.CreateShortcut($file.FullName)
            if ($link.TargetPath -and [IO.Path]::GetExtension($link.TargetPath) -ieq '.exe' -and (Test-Path -LiteralPath $link.TargetPath -PathType Leaf)) {
              $items.Add(@{ name=$file.BaseName; target=$file.FullName; executable=$link.TargetPath; kind='shortcut'; source='start-menu' })
            }
          } catch { $warnings.Add('A Start Menu shortcut could not be inspected') }
        }
      }
      foreach ($registryPath in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths','HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths')) {
        if (!(Test-Path -LiteralPath $registryPath)) { continue }
        foreach ($entry in Get-ChildItem -LiteralPath $registryPath -ErrorAction SilentlyContinue) {
          $target=[string]$entry.GetValue(''); $target=$target.Trim('"')
          if ([IO.Path]::GetExtension($target) -ieq '.exe' -and (Test-Path -LiteralPath $target -PathType Leaf)) {
            $name=[IO.Path]::GetFileNameWithoutExtension($target)
            try { $description=[Diagnostics.FileVersionInfo]::GetVersionInfo($target).FileDescription; if ($description) { $name=$description } } catch {}
            $items.Add(@{ name=$name; target=$target; executable=$target; kind='executable'; source='app-paths' })
          }
        }
      }
      foreach ($browserRoot in @('HKCU:\Software\Clients\StartMenuInternet','HKLM:\Software\Clients\StartMenuInternet')) {
        if (!(Test-Path -LiteralPath $browserRoot)) { continue }
        foreach ($browser in Get-ChildItem -LiteralPath $browserRoot -ErrorAction SilentlyContinue) {
          try {
            $name=[string]$browser.GetValue(''); if (!$name) { $name=$browser.PSChildName }
            $command=[string](Get-ItemProperty -LiteralPath ($browser.PSPath+'\shell\open\command') -ErrorAction Stop).'(default)'
            $browserTarget=$null
            if ($command -match '^\s*"([^"]+\.exe)"') { $browserTarget=$Matches[1] }
            elseif ($command -match '^\s*([^\s]+\.exe)') { $browserTarget=$Matches[1] }
            if ($browserTarget -and (Test-Path -LiteralPath $browserTarget -PathType Leaf)) {
              $items.Add(@{ name=$name; target=$browserTarget; executable=$browserTarget; kind='executable'; source='registered-browser'; browser=$true })
            }
          } catch { $warnings.Add('A registered browser could not be inspected') }
        }
      }
      $result=@{ apps=@($items.ToArray()); warnings=@($warnings.ToArray()); observedAt=[DateTime]::UtcNow.ToString('o') }
    }
    'windows.list' { $result=@{ windows=@([JarvisDesktop]::Windows()); observedAt=[DateTime]::UtcNow.ToString('o') } }
    'processes.list' {
      $limit=[Math]::Min(100,[Math]::Max(1,[int]$request.limit))
      $minimum=[Math]::Max(0,[double]$request.minMemoryMb)
      $processes=@(Get-Process -ErrorAction SilentlyContinue |
        Where-Object { ([double]$_.WorkingSet64 / 1MB) -ge $minimum } |
        Sort-Object WorkingSet64 -Descending |
        Select-Object -First $limit |
        ForEach-Object {
          @{
            processId=[int]$_.Id
            name=[string]$_.ProcessName
            workingSetMb=[Math]::Round(([double]$_.WorkingSet64 / 1MB),1)
            privateMemoryMb=[Math]::Round(([double]$_.PrivateMemorySize64 / 1MB),1)
          }
        })
      $result=@{processes=$processes;count=$processes.Count;sortedBy='workingSetMb';observedAt=[DateTime]::UtcNow.ToString('o');verified=$true}
    }
    'windows.action' {
      $handle=[IntPtr]([long]$request.handle)
      $window=@([JarvisDesktop]::Windows() | Where-Object { $_.handle -eq $request.handle -and $_.pid -eq $request.pid })
      if ($window.Count -ne 1) { throw 'WINDOW_NOT_FOUND' }
      switch ($request.action) {
        'focus' { if ([JarvisDesktop]::IsIconic($handle)) { [void][JarvisDesktop]::ShowWindowAsync($handle,9) }; [void][JarvisDesktop]::SetForegroundWindow($handle) }
        'minimize' { [void][JarvisDesktop]::ShowWindowAsync($handle,6) }
        'maximize' { [void][JarvisDesktop]::ShowWindowAsync($handle,3) }
        'restore' { [void][JarvisDesktop]::ShowWindowAsync($handle,9) }
        'close' { [void][JarvisDesktop]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero) }
        default { throw 'INVALID_ARGUMENTS' }
      }
      Start-Sleep -Milliseconds 150
      $result=@{ windows=@([JarvisDesktop]::Windows()); target=$request.handle; observedAt=[DateTime]::UtcNow.ToString('o') }
    }
    'apps.launch' {
      $target=[string]$request.target
      if ($request.kind -eq 'appId') {
        if ($target -notmatch '^[A-Za-z0-9._!{}\\-]+$') { throw 'INVALID_ARGUMENTS' }
        $info=New-Object Diagnostics.ProcessStartInfo; $info.FileName='explorer.exe'; $info.Arguments='shell:AppsFolder\'+$target; $info.UseShellExecute=$true
      } else {
        if (![IO.Path]::IsPathRooted($target) -or !(Test-Path -LiteralPath $target -PathType Leaf) -or [IO.Path]::GetExtension($target) -notin @('.exe','.lnk')) { throw 'APP_LAUNCH_FAILED' }
        $info=New-Object Diagnostics.ProcessStartInfo; $info.FileName=$target; $info.UseShellExecute=$true
      }
      $process=[Diagnostics.Process]::Start($info)
      $result=@{ requested=$true; pid=if($process){$process.Id}else{$null}; observedAt=[DateTime]::UtcNow.ToString('o') }
    }
    default { throw 'INVALID_ARGUMENTS' }
  }
  @{ok=$true; result=$result} | ConvertTo-Json -Compress -Depth 8
} catch {
  $code=if($_.Exception.Message -match '(WINDOW_NOT_FOUND|WINDOW_NOT_FOCUSED|UI_TARGET_NOT_FOUND|UI_TARGET_AMBIGUOUS|CAPABILITY_UNAVAILABLE|INVALID_ARGUMENTS|APP_LAUNCH_FAILED|INPUT_REJECTED|INPUT_BUSY|KEYBOARD_BUSY|KEYBOARD_STATE_CHANGED|NO_MEDIA_SESSION)'){$Matches[1]}else{'EXECUTION_FAILED'}
  @{ok=$false; error=@{code=$code; message='Windows operation could not be completed'; exceptionType=$_.Exception.GetType().Name; errorId=$_.FullyQualifiedErrorId}} | ConvertTo-Json -Compress -Depth 4
  exit 1
}
