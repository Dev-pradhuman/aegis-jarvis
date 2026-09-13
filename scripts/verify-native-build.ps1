$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Add-Type -Path (Join-Path $root 'windows\DesktopInput.cs')
$expected=if([IntPtr]::Size -eq 8){40}else{28}
if([JarvisInput]::InputSize() -ne $expected){throw 'Desktop INPUT layout mismatch'}
$source=Get-Content -LiteralPath (Join-Path $root 'windows\voice-os-bridge.ps1') -Raw
$match=[regex]::Match($source,"(?s)\`$source\s*=\s*@'\r?\n(.*?)\r?\n'@")
if(!$match.Success){throw 'Voice bridge C# source not found'}
Add-Type -TypeDefinition $match.Groups[1].Value -ReferencedAssemblies System.Net.Http
$inputType=[JarvisVoiceHotkeys].GetNestedType('INPUT',[Reflection.BindingFlags]::NonPublic)
$size=[Runtime.InteropServices.Marshal]::SizeOf([type]$inputType)
if($size -ne $expected){throw 'Voice INPUT layout mismatch'}
@{desktopInputSize=[JarvisInput]::InputSize();voiceInputSize=$size;expected=$expected;keyboardEventsSent=0} | ConvertTo-Json -Compress
