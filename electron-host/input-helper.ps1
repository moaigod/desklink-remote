Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DeskLinkInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string className, string windowName);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern short VkKeyScan(char ch);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public static uint SendUnicode(char character) {
    var inputs = new INPUT[2];
    inputs[0].type = 1; inputs[0].U.ki.wScan = character; inputs[0].U.ki.dwFlags = 0x0004;
    inputs[1].type = 1; inputs[1].U.ki.wScan = character; inputs[1].U.ki.dwFlags = 0x0004 | 0x0002;
    return SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
  }
}
'@

$keyMap = @{
  Backspace = 0x08; Tab = 0x09; Enter = 0x0D; Escape = 0x1B; ' ' = 0x20
  Shift = 0x10; Control = 0x11; Alt = 0x12; Meta = 0x5B; CapsLock = 0x14
  ArrowLeft = 0x25; ArrowUp = 0x26; ArrowRight = 0x27; ArrowDown = 0x28
  Home = 0x24; End = 0x23; PageUp = 0x21; PageDown = 0x22; Insert = 0x2D; Delete = 0x2E
  Pause = 0x13; PrintScreen = 0x2C; ScrollLock = 0x91; NumLock = 0x90; ContextMenu = 0x5D
  BrowserBack = 0xA6; BrowserForward = 0xA7; BrowserRefresh = 0xA8; BrowserStop = 0xA9; BrowserSearch = 0xAA; BrowserFavorites = 0xAB; BrowserHome = 0xAC
  AudioVolumeMute = 0xAD; AudioVolumeDown = 0xAE; AudioVolumeUp = 0xAF; MediaTrackNext = 0xB0; MediaTrackPrevious = 0xB1; MediaStop = 0xB2; MediaPlayPause = 0xB3
}
$targetBounds = $null
$useOnScreenKeyboard = $false
$useDeskLinkOsk = $false
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-DeskLinkOskWindow {
  $appRoot = Split-Path -Parent $PSScriptRoot
  $exePath = Join-Path $appRoot 'desklink-osk\releases\DeskLinkOSK-0.1.0\DeskLinkOsk.exe'
  $process = Get-Process -Name DeskLinkOsk -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $process) {
    if (-not (Test-Path -LiteralPath $exePath)) {
      [Console]::Error.WriteLine("DeskLink OSK mode: app not found at $exePath")
      return $null
    }
    Start-Process -FilePath $exePath
    for ($attempt = 0; $attempt -lt 15 -and -not $process; $attempt++) {
      Start-Sleep -Milliseconds 100
      $process = Get-Process -Name DeskLinkOsk -ErrorAction SilentlyContinue | Select-Object -First 1
    }
  }
  if (-not $process) { return $null }
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    $window = $windows | Where-Object { $_.Current.ProcessId -eq $process.Id } | Select-Object -First 1
    if ($window) { return $window }
    Start-Sleep -Milliseconds 100
  }
  return $null
}

function Invoke-DeskLinkOskKey($key) {
  $window = Get-DeskLinkOskWindow
  if (-not $window) { [Console]::Error.WriteLine('DeskLink OSK mode: window was not found.'); return $false }
  $name = if ($key -and $key.Length -eq 1) { $key.ToLowerInvariant() } else { [string]$key }
  try {
    $condition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Button
    )
    $button = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition) |
      Where-Object { $_.Current.Name -eq $name } | Select-Object -First 1
    if (-not $button) { [Console]::Error.WriteLine("DeskLink OSK mode: key '$name' was not found."); return $false }
    $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
    return $true
  } catch {
    [Console]::Error.WriteLine("DeskLink OSK mode: could not invoke '$name': $($_.Exception.Message)")
    return $false
  }
}

function Send-DeskLinkOskCommand($type, $key) {
  Get-DeskLinkOskWindow | Out-Null
  try {
    $pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', 'DeskLinkOsk', [System.IO.Pipes.PipeDirection]::Out)
    $pipe.Connect(500)
    $writer = New-Object System.IO.StreamWriter($pipe)
    $writer.AutoFlush = $true
    $writer.WriteLine((@{ type = $type; key = $key } | ConvertTo-Json -Compress))
    $writer.Dispose()
    $pipe.Dispose()
    return $true
  } catch {
    [Console]::Error.WriteLine("DeskLink OSK mode: pipe command failed: $($_.Exception.Message)")
    return $false
  }
}

function Get-OskKeyPoint($key) {
  $topRow = @('Escape', '`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=')
  $numberRow = @('Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\')
  $letterRow = @('CapsLock', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'")
  $bottomRow = @('Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/')
  $functionIndex = [array]::IndexOf($topRow, $key)
  if ($functionIndex -ge 0) { return @{ x = 0.007 + (($functionIndex + 0.5) / 16.0 * 0.698); y = 0.375 } }
  if ($key -eq 'Backspace') { return @{ x = 0.007 + (15.0 / 16.0 * 0.698); y = 0.375 } }
  $numberIndex = [array]::IndexOf($numberRow, $key)
  if ($numberIndex -ge 0) { return @{ x = 0.007 + (($numberIndex + 0.5) / 16.0 * 0.698); y = 0.505 } }
  if ($key -eq 'Delete') { return @{ x = 0.007 + (15.0 / 16.0 * 0.698); y = 0.505 } }
  $letterIndex = [array]::IndexOf($letterRow, $key)
  if ($letterIndex -ge 0) { return @{ x = 0.007 + (($letterIndex + 0.5) / 16.0 * 0.698); y = 0.635 } }
  if ($key -eq 'Enter') { return @{ x = 0.007 + (14.6 / 16.0 * 0.698); y = 0.635 } }
  $bottomIndex = [array]::IndexOf($bottomRow, $key)
  if ($bottomIndex -ge 0) { return @{ x = 0.007 + (($bottomIndex + 0.5) / 16.0 * 0.698); y = 0.770 } }
  if ($key -eq ' ') { return @{ x = 0.007 + (7.8 / 16.0 * 0.698); y = 0.900 } }
  if ($key -eq 'Control') { return @{ x = 0.007 + (1.6 / 16.0 * 0.698); y = 0.900 } }
  if ($key -eq 'Alt') { return @{ x = 0.007 + (3.4 / 16.0 * 0.698); y = 0.900 } }
  $nav = @{ Home = @(0.755, 0.375); PageUp = @(0.835, 0.375); End = @(0.755, 0.505); PageDown = @(0.835, 0.505); Insert = @(0.755, 0.635); Pause = @(0.835, 0.635); PrintScreen = @(0.755, 0.770); ScrollLock = @(0.835, 0.770); ArrowLeft = @(0.495, 0.900); ArrowDown = @(0.540, 0.900); ArrowUp = @(0.585, 0.900); ArrowRight = @(0.630, 0.900) }
  if ($nav.ContainsKey($key)) { return @{ x = $nav[$key][0]; y = $nav[$key][1] } }
  return $null
}

function Invoke-OskKey($key) {
  if (-not $key) { return $false }
  $point = Get-OskKeyPoint ([string]$key)
  if (-not $point) { [Console]::Error.WriteLine("DeskLink OSK mode: '$key' is not mapped."); return $false }
  $osk = Get-Process -Name osk -ErrorAction SilentlyContinue | Select-Object -First 1
  $handle = if ($osk) { $osk.MainWindowHandle } else { [IntPtr]::Zero }
  if ($handle -eq [IntPtr]::Zero) {
    Start-Process "$env:WINDIR\System32\osk.exe"
    for ($attempt = 0; $attempt -lt 10 -and $handle -eq [IntPtr]::Zero; $attempt++) {
      Start-Sleep -Milliseconds 100
      $osk = Get-Process -Name osk -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($osk) { $handle = $osk.MainWindowHandle }
    }
  }
  $rect = New-Object DeskLinkInput+RECT
  if ($handle -eq [IntPtr]::Zero -or -not [DeskLinkInput]::GetWindowRect($handle, [ref]$rect)) {
    [Console]::Error.WriteLine('DeskLink OSK mode: On-Screen Keyboard did not open.')
    return $false
  }
  $x = $rect.Left + [int](($rect.Right - $rect.Left) * [double]$point.x)
  $y = $rect.Top + [int](($rect.Bottom - $rect.Top) * [double]$point.y)
  [DeskLinkInput]::SetCursorPos($x, $y)
  [DeskLinkInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [DeskLinkInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  return $true
}

function Get-VirtualKey($key) {
  if ($keyMap.ContainsKey($key)) { return [byte]$keyMap[$key] }
  if ($key -and $key.Length -eq 1) { return [byte]([DeskLinkInput]::VkKeyScan($key[0]) -band 0xFF) }
  if ($key -match '^F([1-9]|1[0-2])$') { return [byte](0x6F + [int]$Matches[1]) }
  return $null
}

while (($line = [Console]::In.ReadLine()) -ne $null) {
  try {
    $message = $line | ConvertFrom-Json
    $payload = $message.payload
    if ($message.type -eq 'configure-display') {
      $targetBounds = @{ x = [int]$payload.x; y = [int]$payload.y; width = [int]$payload.width; height = [int]$payload.height }
      continue
    }
    if ($message.type -eq 'set-osk-mode') {
      $useOnScreenKeyboard = [bool]$payload.enabled
      if ($useOnScreenKeyboard) { $useDeskLinkOsk = $false }
      if ($useOnScreenKeyboard) {
        Start-Process "$env:WINDIR\System32\osk.exe"
        [Console]::Error.WriteLine('DeskLink OSK mode: enabled. Keyboard input will click Windows On-Screen Keyboard.')
      } else {
        [Console]::Error.WriteLine('DeskLink OSK mode: disabled. Keyboard input will use normal injection.')
      }
      continue
    }
    if ($message.type -eq 'set-desklink-osk-mode') {
      $useDeskLinkOsk = [bool]$payload.enabled
      [Console]::Error.WriteLine("DeskLink OSK input mode: $useDeskLinkOsk")
      continue
    }
    if ($message.type -eq 'release-input') {
      if ($useDeskLinkOsk) { Send-DeskLinkOskCommand 'release-input' $null | Out-Null }
      # Browser focus can disappear before keyup. Never leave modifiers held.
      foreach ($key in @(0x10, 0x11, 0x12, 0x5B, 0x5C)) {
        [DeskLinkInput]::keybd_event($key, 0, 0x0002, [UIntPtr]::Zero)
      }
      [DeskLinkInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      [DeskLinkInput]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
      continue
    }
    if ($message.type -eq 'host-alt-tab') {
      # Send a complete shortcut in one host-side operation. This avoids the
      # viewer OS stealing Alt+Tab or leaving Alt held after it changes focus.
      [DeskLinkInput]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
      [DeskLinkInput]::keybd_event(0x09, 0, 0, [UIntPtr]::Zero)
      [DeskLinkInput]::keybd_event(0x09, 0, 0x0002, [UIntPtr]::Zero)
      [DeskLinkInput]::keybd_event(0x12, 0, 0x0002, [UIntPtr]::Zero)
      continue
    }
    if ($message.type -like 'mouse-*') {
      # Keep the fractional browser coordinates. PowerShell can select the
      # integer Math.Min/Max overload here, which rounds input to 0 or 1.
      $x = [double]$payload.x
      $y = [double]$payload.y
      if ($x -lt 0.0) { $x = 0.0 } elseif ($x -gt 1.0) { $x = 1.0 }
      if ($y -lt 0.0) { $y = 0.0 } elseif ($y -gt 1.0) { $y = 1.0 }
      if ($targetBounds) {
        $left = $targetBounds.x; $top = $targetBounds.y; $width = $targetBounds.width; $height = $targetBounds.height
      } else {
        $left = [DeskLinkInput]::GetSystemMetrics(76); $top = [DeskLinkInput]::GetSystemMetrics(77)
        $width = [DeskLinkInput]::GetSystemMetrics(78); $height = [DeskLinkInput]::GetSystemMetrics(79)
      }
      $targetX = $left + [int]($x * ($width - 1))
      $targetY = $top + [int]($y * ($height - 1))
      # Windows maps absolute injected input to the entire virtual desktop using
      # a 0–65535 range. This avoids the DPI/desktop-session quirks of SetCursorPos.
      $virtualLeft = [DeskLinkInput]::GetSystemMetrics(76); $virtualTop = [DeskLinkInput]::GetSystemMetrics(77)
      $virtualWidth = [DeskLinkInput]::GetSystemMetrics(78); $virtualHeight = [DeskLinkInput]::GetSystemMetrics(79)
      $absoluteX = [uint32][Math]::Round(65535 * (($targetX - $virtualLeft) / [Math]::Max(1, $virtualWidth - 1)))
      $absoluteY = [uint32][Math]::Round(65535 * (($targetY - $virtualTop) / [Math]::Max(1, $virtualHeight - 1)))
      [DeskLinkInput]::mouse_event((0x0001 -bor 0x8000 -bor 0x4000), $absoluteX, $absoluteY, 0, [UIntPtr]::Zero)
      if ($message.type -eq 'mouse-down') {
        $downFlag = if ($payload.button -eq 2) { 0x0008 } else { 0x0002 }
        [DeskLinkInput]::mouse_event($downFlag, 0, 0, 0, [UIntPtr]::Zero)
      }
      if ($message.type -eq 'mouse-up') {
        $upFlag = if ($payload.button -eq 2) { 0x0010 } else { 0x0004 }
        [DeskLinkInput]::mouse_event($upFlag, 0, 0, 0, [UIntPtr]::Zero)
      }
      if ($message.type -eq 'mouse-click') {
        if ($payload.button -eq 2) {
          [DeskLinkInput]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
          [DeskLinkInput]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
        } else {
          [DeskLinkInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
          [DeskLinkInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
        }
      }
      if ($message.type -eq 'mouse-scroll') {
        $wheelDelta = [int]$payload.delta
        if ($wheelDelta -gt 960) { $wheelDelta = 960 }
        if ($wheelDelta -lt -960) { $wheelDelta = -960 }
        if ($wheelDelta -ne 0) {
            [DeskLinkInput]::mouse_event(0x0800, 0, 0, $wheelDelta, [UIntPtr]::Zero)
        }
      }
    } elseif ($useDeskLinkOsk -and $message.type -eq 'text') {
      foreach ($character in [string]$payload.text) {
        [DeskLinkInput]::SendUnicode([char]$character) | Out-Null
      }
    } elseif ($useDeskLinkOsk -and $message.type -eq 'key-down') {
      $vk = Get-VirtualKey $payload.key
      if ($null -ne $vk) { [DeskLinkInput]::keybd_event($vk, 0, 0, [UIntPtr]::Zero) }
    } elseif ($useDeskLinkOsk -and $message.type -eq 'key-up') {
      $vk = Get-VirtualKey $payload.key
      if ($null -ne $vk) { [DeskLinkInput]::keybd_event($vk, 0, 0x0002, [UIntPtr]::Zero) }
    } elseif ($useOnScreenKeyboard -and $message.type -eq 'text') {
      foreach ($character in [string]$payload.text) { Invoke-OskKey ([string]$character) | Out-Null }
    } elseif ($useOnScreenKeyboard -and $message.type -eq 'key-down') {
      Invoke-OskKey ([string]$payload.key) | Out-Null
    } elseif ($useOnScreenKeyboard -and $message.type -eq 'key-up') {
      # Windows On-Screen Keyboard buttons are clicked, not held. Ignore key-up.
      continue
    } elseif ($message.type -eq 'text') {
      foreach ($character in [string]$payload.text) {
        $sent = [DeskLinkInput]::SendUnicode([char]$character)
        if ($sent -ne 2) { throw "SendInput injected $sent of 2 Unicode keyboard events." }
      }
    } elseif ($message.type -like 'key-*') {
      $vk = Get-VirtualKey $payload.key
      if ($null -ne $vk) {
        $keyFlags = 0
        if ($message.type -eq 'key-up') { $keyFlags = 0x0002 }
        [DeskLinkInput]::keybd_event($vk, 0, $keyFlags, [UIntPtr]::Zero)
      }
    }
  } catch { [Console]::Error.WriteLine($_.Exception.Message) }
}
