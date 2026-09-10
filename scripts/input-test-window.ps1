$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class TestWindowVisibility { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd); }'
$form=New-Object Windows.Forms.Form
$form.Text='JARVIS controlled input verification'
$form.Width=600;$form.Height=200
$box=New-Object Windows.Forms.TextBox
$box.Multiline=$true;$box.Dock='Fill'
$form.Controls.Add($box)
$box.add_KeyDown({param($sender,$eventArgs)
  if($eventArgs.Control -and $eventArgs.KeyCode -eq [Windows.Forms.Keys]::A){$box.SelectAll();$eventArgs.SuppressKeyPress=$true;[Console]::WriteLine('{"type":"shortcut","keys":"Ctrl+A"}')}
})
$box.add_TextChanged({
  $hash=[Security.Cryptography.SHA256]::Create()
  try { $digest=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($box.Text))).Replace('-','').ToLowerInvariant() } finally {$hash.Dispose()}
  [Console]::WriteLine((@{type='text';hash=$digest;length=$box.Text.Length}|ConvertTo-Json -Compress))
})
$form.add_Shown({[void][TestWindowVisibility]::ShowWindow($form.Handle,5);$form.Activate();[void]$box.Focus();[Console]::WriteLine((@{type='ready';handle=$form.Handle.ToInt64().ToString();processId=$PID}|ConvertTo-Json -Compress))})
try {[Windows.Forms.Application]::Run($form)} finally {$form.Dispose()}
