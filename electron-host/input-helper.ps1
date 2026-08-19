Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DeskLinkInput {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool SetDllDirectory(string lpPathName);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string className, string windowName);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, int data, UIntPtr extra);
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

public static class DeskLinkViGEm {
  [StructLayout(LayoutKind.Sequential, Pack=1)] public struct XUSB_REPORT {
    public ushort wButtons;
    public byte bLeftTrigger;
    public byte bRightTrigger;
    public short sThumbLX;
    public short sThumbLY;
    public short sThumbRX;
    public short sThumbRY;
  }
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr vigem_alloc();
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern void vigem_free(IntPtr client);
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern uint vigem_connect(IntPtr client);
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern void vigem_disconnect(IntPtr client);
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr vigem_target_x360_alloc();
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern void vigem_target_free(IntPtr target);
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern uint vigem_target_add(IntPtr client, IntPtr target);
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern void vigem_target_remove(IntPtr client, IntPtr target);
  [DllImport("vigemclient.dll", CallingConvention=CallingConvention.Cdecl)] public static extern uint vigem_target_x360_update(IntPtr client, IntPtr target, ref XUSB_REPORT report);
}

public static class DeskLinkInterception {
  [StructLayout(LayoutKind.Sequential)] public struct KeyStroke { public ushort code; public ushort state; public ushort information; }
  [StructLayout(LayoutKind.Sequential)] public struct MouseStroke { public ushort state; public ushort flags; public short rolling; public int x; public int y; public uint information; }
  [DllImport("interception.dll", CallingConvention=CallingConvention.Cdecl)] public static extern IntPtr interception_create_context();
  [DllImport("interception.dll", CallingConvention=CallingConvention.Cdecl)] public static extern void interception_destroy_context(IntPtr context);
  [DllImport("interception.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int interception_is_keyboard(int device);
  [DllImport("interception.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int interception_is_mouse(int device);
  [DllImport("interception.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int interception_get_hardware_id(IntPtr context, int device, IntPtr buffer, uint bufferSize);
  [DllImport("interception.dll", CallingConvention=CallingConvention.Cdecl)] public static extern int interception_send(IntPtr context, int device, ref KeyStroke stroke, uint count);
  [DllImport("interception.dll", CallingConvention=CallingConvention.Cdecl, EntryPoint="interception_send")] public static extern int interception_send_mouse(IntPtr context, int device, ref MouseStroke stroke, uint count);
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
$useDeskLinkOsk = $false
$useInterceptionKeyboard = $false
$useInterceptionMouse = $false
$interceptionContext = [IntPtr]::Zero
$interceptionUnavailable = $false
$interceptionHeld = @{}
$interceptionKeyboardDevice = 3
$interceptionMouseContext = [IntPtr]::Zero
$interceptionMouseUnavailable = $false
$interceptionMouseHeld = @{}
$interceptionMouseDevice = 11
$viGemBridgeLoaded = $false
$viGemUnavailable = $false

function Stop-ViGEmController {
  if ($viGemBridgeLoaded) { try { [DeskLink.ViGEm.ViGEmBridge]::Disconnect() } catch { } }
}

function Start-ViGEmController {
  if ($viGemBridgeLoaded) { return $true }
  if ($viGemUnavailable) { return $false }
  $bridgeDirectory = Join-Path $PSScriptRoot 'vigem-bridge\publish'
  $clientAssembly = Join-Path $bridgeDirectory 'Nefarius.ViGEm.Client.dll'
  $bridgeAssembly = Join-Path $bridgeDirectory 'DeskLinkViGEmBridge.dll'
  if (-not (Test-Path -LiteralPath $clientAssembly) -or -not (Test-Path -LiteralPath $bridgeAssembly)) {
    $script:viGemUnavailable = $true
    [Console]::Error.WriteLine('ViGEm controller bridge is missing from DeskLink. Reinstall the latest DeskLink host app.')
    return $false
  }
  try {
    Add-Type -Path $clientAssembly
    Add-Type -Path $bridgeAssembly
    $script:viGemBridgeLoaded = $true
    return $true
  } catch {
    [Console]::Error.WriteLine("ViGEm controller bridge could not load: $($_.Exception.Message)")
    $script:viGemUnavailable = $true
    return $false
  }
}

function Update-ViGEmController($controller) {
  if (-not (Start-ViGEmController)) { return }
  $buttons = @($controller.buttons)
  [bool[]]$pressed = @($buttons | ForEach-Object { [bool]$_.pressed })
  [single[]]$values = @($buttons | ForEach-Object { [single]$_.value })
  [single[]]$axes = @($controller.axes | ForEach-Object { [single]$_ })
  $result = [DeskLink.ViGEm.ViGEmBridge]::Update($pressed, $values, $axes)
  if ($result -ne 'ready') { [Console]::Error.WriteLine("ViGEm controller support failed: $result") }
}

$interceptionScanCodes = @{
  Escape=0x01; Digit1=0x02; Digit2=0x03; Digit3=0x04; Digit4=0x05; Digit5=0x06; Digit6=0x07; Digit7=0x08; Digit8=0x09; Digit9=0x0A; Digit0=0x0B; Minus=0x0C; Equal=0x0D; Backspace=0x0E; Tab=0x0F
  KeyQ=0x10; KeyW=0x11; KeyE=0x12; KeyR=0x13; KeyT=0x14; KeyY=0x15; KeyU=0x16; KeyI=0x17; KeyO=0x18; KeyP=0x19; BracketLeft=0x1A; BracketRight=0x1B; Enter=0x1C
  ControlLeft=0x1D; KeyA=0x1E; KeyS=0x1F; KeyD=0x20; KeyF=0x21; KeyG=0x22; KeyH=0x23; KeyJ=0x24; KeyK=0x25; KeyL=0x26; Semicolon=0x27; Quote=0x28; Backquote=0x29
  ShiftLeft=0x2A; Backslash=0x2B; KeyZ=0x2C; KeyX=0x2D; KeyC=0x2E; KeyV=0x2F; KeyB=0x30; KeyN=0x31; KeyM=0x32; Comma=0x33; Period=0x34; Slash=0x35; ShiftRight=0x36; NumpadMultiply=0x37; AltLeft=0x38; Space=0x39; CapsLock=0x3A
  F1=0x3B; F2=0x3C; F3=0x3D; F4=0x3E; F5=0x3F; F6=0x40; F7=0x41; F8=0x42; F9=0x43; F10=0x44; NumLock=0x45; ScrollLock=0x46
  Numpad7=0x47; Numpad8=0x48; Numpad9=0x49; NumpadSubtract=0x4A; Numpad4=0x4B; Numpad5=0x4C; Numpad6=0x4D; NumpadAdd=0x4E; Numpad1=0x4F; Numpad2=0x50; Numpad3=0x51; Numpad0=0x52; NumpadDecimal=0x53; F11=0x57; F12=0x58
  NumpadEnter=0x1C; ControlRight=0x1D; NumpadDivide=0x35; AltRight=0x38; Home=0x47; ArrowUp=0x48; PageUp=0x49; ArrowLeft=0x4B; ArrowRight=0x4D; End=0x4F; ArrowDown=0x50; PageDown=0x51; Insert=0x52; Delete=0x53; MetaLeft=0x5B; MetaRight=0x5C; ContextMenu=0x5D
}
$interceptionExtendedCodes = @('NumpadEnter','ControlRight','NumpadDivide','AltRight','Home','ArrowUp','PageUp','ArrowLeft','ArrowRight','End','ArrowDown','PageDown','Insert','Delete','MetaLeft','MetaRight','ContextMenu')

function Stop-InterceptionKeyboard {
  if ($interceptionContext -ne [IntPtr]::Zero) {
    foreach ($held in @($interceptionHeld.Values)) {
      $stroke = New-Object DeskLinkInterception+KeyStroke
      $stroke.code = [uint16]$held.code; $stroke.state = [uint16]($held.state -bor 0x01)
      try { [DeskLinkInterception]::interception_send($interceptionContext, $interceptionKeyboardDevice, [ref]$stroke, 1) | Out-Null } catch { }
    }
    try { [DeskLinkInterception]::interception_destroy_context($interceptionContext) } catch { }
  }
  $script:interceptionContext = [IntPtr]::Zero
  $script:interceptionHeld = @{}
}

function Find-InterceptionKeyboardDevice {
  # Interception assigns keyboard slots separately on every Windows PC. The
  # previous fixed slot (3) only worked by coincidence on the developer PC.
  # Prefer a device's primary HID keyboard interface (MI_00), then fall back
  # to the first available keyboard device.
  $fallback = $null
  for ($device = 1; $device -le 10; $device++) {
    $buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal(500)
    try {
      $length = [DeskLinkInterception]::interception_get_hardware_id($interceptionContext, $device, $buffer, 500)
      if ($length -le 0) { continue }
      $hardwareId = [Runtime.InteropServices.Marshal]::PtrToStringUni($buffer)
      if ($null -eq $fallback) { $fallback = @{ device = $device; hardwareId = $hardwareId } }
      if ($hardwareId -match '&MI_00(?:&|$)') { return @{ device = $device; hardwareId = $hardwareId } }
    } catch {
      continue
    } finally {
      [Runtime.InteropServices.Marshal]::FreeHGlobal($buffer)
    }
  }
  return $fallback
}

function Start-InterceptionKeyboard {
  if ($interceptionContext -ne [IntPtr]::Zero) { return $true }
  if ($interceptionUnavailable) { return $false }
  $libraryPath = Join-Path $PSScriptRoot 'interception-bridge\interception.dll'
  if (-not (Test-Path -LiteralPath $libraryPath)) { [Console]::Error.WriteLine('Interception keyboard bridge is missing from DeskLink.'); $script:interceptionUnavailable = $true; return $false }
  [DeskLinkInput]::SetDllDirectory((Split-Path -Parent $libraryPath)) | Out-Null
  try {
    $script:interceptionContext = [DeskLinkInterception]::interception_create_context()
    if ($interceptionContext -eq [IntPtr]::Zero) { throw 'Could not create an Interception context.' }
    $keyboardDevice = Find-InterceptionKeyboardDevice
    if ($null -eq $keyboardDevice) { throw 'No installed Interception keyboard device was found.' }
    $script:interceptionKeyboardDevice = [int]$keyboardDevice.device
    [Console]::Error.WriteLine("Interception game keyboard bridge connected to device $interceptionKeyboardDevice ($($keyboardDevice.hardwareId)).")
    return $true
  } catch { [Console]::Error.WriteLine("Interception keyboard bridge failed: $($_.Exception.Message)"); Stop-InterceptionKeyboard; $script:interceptionUnavailable = $true; return $false }
}

function Send-InterceptionKey($payload, $isUp) {
  if (-not (Start-InterceptionKeyboard)) { return $false }
  $codeName = [string]$payload.code
  if (-not $interceptionScanCodes.ContainsKey($codeName)) { [Console]::Error.WriteLine("Interception does not map '$codeName'."); return $false }
  $state = if ($interceptionExtendedCodes -contains $codeName) { 0x02 } else { 0x00 }
  if ($isUp) { $state = $state -bor 0x01 }
  $stroke = New-Object DeskLinkInterception+KeyStroke
  $stroke.code = [uint16]$interceptionScanCodes[$codeName]; $stroke.state = [uint16]$state
  $sent = [DeskLinkInterception]::interception_send($interceptionContext, $interceptionKeyboardDevice, [ref]$stroke, 1)
  if ($sent -ne 1) { [Console]::Error.WriteLine('Interception could not send the key.'); return $false }
  if ($isUp) { $script:interceptionHeld.Remove($codeName) } else { $script:interceptionHeld[$codeName] = @{ code = $stroke.code; state = ($state -band 0xFE) } }
  return $true
}

function Stop-InterceptionMouse {
  if ($interceptionMouseContext -ne [IntPtr]::Zero) {
    foreach ($button in @($interceptionMouseHeld.Keys)) {
      $stroke = New-Object DeskLinkInterception+MouseStroke
      $stroke.state = [uint16](if ($button -eq 2) { 0x0008 } elseif ($button -eq 1) { 0x0020 } else { 0x0002 })
      try { [DeskLinkInterception]::interception_send_mouse($interceptionMouseContext, $interceptionMouseDevice, [ref]$stroke, 1) | Out-Null } catch { }
    }
    try { [DeskLinkInterception]::interception_destroy_context($interceptionMouseContext) } catch { }
  }
  $script:interceptionMouseContext = [IntPtr]::Zero
  $script:interceptionMouseHeld = @{}
}

function Start-InterceptionMouse {
  if ($interceptionMouseContext -ne [IntPtr]::Zero) { return $true }
  if ($interceptionMouseUnavailable) { return $false }
  $libraryPath = Join-Path $PSScriptRoot 'interception-bridge\interception.dll'
  if (-not (Test-Path -LiteralPath $libraryPath)) { [Console]::Error.WriteLine('Interception mouse bridge is missing from DeskLink.'); $script:interceptionMouseUnavailable = $true; return $false }
  [DeskLinkInput]::SetDllDirectory((Split-Path -Parent $libraryPath)) | Out-Null
  try {
    $script:interceptionMouseContext = [DeskLinkInterception]::interception_create_context()
    if ($interceptionMouseContext -eq [IntPtr]::Zero) { throw 'Could not create an Interception mouse context.' }
    if (-not [DeskLinkInterception]::interception_is_mouse($interceptionMouseDevice)) { throw 'Interception mouse device is unavailable.' }
    [Console]::Error.WriteLine("Interception game mouse bridge connected to device $interceptionMouseDevice.")
    return $true
  } catch { [Console]::Error.WriteLine("Interception mouse bridge failed: $($_.Exception.Message)"); Stop-InterceptionMouse; $script:interceptionMouseUnavailable = $true; return $false }
}

function Send-InterceptionMouseRelative($payload) {
  if (-not (Start-InterceptionMouse)) { return $false }
  $dx = [int]$payload.dx; $dy = [int]$payload.dy
  if ($dx -gt 500) { $dx = 500 } elseif ($dx -lt -500) { $dx = -500 }
  if ($dy -gt 500) { $dy = 500 } elseif ($dy -lt -500) { $dy = -500 }
  if ($dx -eq 0 -and $dy -eq 0) { return $true }
  $stroke = New-Object DeskLinkInterception+MouseStroke
  $stroke.flags = [uint16]0x0008
  $stroke.x = $dx; $stroke.y = $dy
  $sent = [DeskLinkInterception]::interception_send_mouse($interceptionMouseContext, $interceptionMouseDevice, [ref]$stroke, 1)
  if ($sent -ne 1) { [Console]::Error.WriteLine('Interception could not send mouse movement.'); return $false }
  return $true
}

function Send-InterceptionMouseButton($payload) {
  if (-not (Start-InterceptionMouse)) { return $false }
  $button = [int]$payload.button; $isDown = [bool]$payload.down
  $state = if ($button -eq 2) { if ($isDown) { 0x0004 } else { 0x0008 } } elseif ($button -eq 1) { if ($isDown) { 0x0010 } else { 0x0020 } } else { if ($isDown) { 0x0001 } else { 0x0002 } }
  $stroke = New-Object DeskLinkInterception+MouseStroke
  $stroke.state = [uint16]$state
  $sent = [DeskLinkInterception]::interception_send_mouse($interceptionMouseContext, $interceptionMouseDevice, [ref]$stroke, 1)
  if ($sent -ne 1) { [Console]::Error.WriteLine('Interception could not send a mouse button.'); return $false }
  if ($isDown) { $script:interceptionMouseHeld[$button] = $true } else { $script:interceptionMouseHeld.Remove($button) }
  return $true
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
  $normalizedKey = [string]$key
  if ($normalizedKey.Length -eq 1) { $normalizedKey = $normalizedKey.ToLowerInvariant() }
  $point = Get-OskKeyPoint $normalizedKey
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
    if ($message.type -eq 'set-desklink-osk-mode') {
      $useDeskLinkOsk = [bool]$payload.enabled
      [Console]::Error.WriteLine("DeskLink OSK input mode: $useDeskLinkOsk")
      continue
    }
    if ($message.type -eq 'set-interception-keyboard-mode') {
      $useInterceptionKeyboard = [bool]$payload.enabled
      if (-not $useInterceptionKeyboard) { Stop-InterceptionKeyboard }
      [Console]::Error.WriteLine("Interception game keyboard mode: $useInterceptionKeyboard")
      continue
    }
    if ($message.type -eq 'set-interception-mouse-mode') {
      $useInterceptionMouse = [bool]$payload.enabled
      if (-not $useInterceptionMouse) { Stop-InterceptionMouse }
      [Console]::Error.WriteLine("Interception game mouse mode: $useInterceptionMouse")
      continue
    }
    if ($message.type -eq 'release-input') {
      Stop-ViGEmController
      Stop-InterceptionKeyboard
      Stop-InterceptionMouse
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
    if ($message.type -eq 'gamepad-state') {
      $controllers = @($payload.controllers)
      if ($controllers.Count -gt 0) { Update-ViGEmController $controllers[0] } else { Stop-ViGEmController }
      continue
    }
    if ($message.type -eq 'mouse-relative') {
      if ($useInterceptionMouse -and (Send-InterceptionMouseRelative $payload)) { continue }
      # Relative movement is for pointer-locked games which intentionally keep
      # their Windows cursor centered. Do not turn it into an absolute position.
      $dx = [int]$payload.dx; $dy = [int]$payload.dy
      if ($dx -gt 500) { $dx = 500 } elseif ($dx -lt -500) { $dx = -500 }
      if ($dy -gt 500) { $dy = 500 } elseif ($dy -lt -500) { $dy = -500 }
      if ($dx -ne 0 -or $dy -ne 0) {
        [DeskLinkInput]::mouse_event(0x0001, $dx, $dy, 0, [UIntPtr]::Zero)
      }
      continue
    }
    if ($message.type -eq 'mouse-button') {
      if ($useInterceptionMouse -and (Send-InterceptionMouseButton $payload)) { continue }
      $buttonFlag = if ($payload.button -eq 2) {
        if ($payload.down) { 0x0008 } else { 0x0010 }
      } else {
        if ($payload.down) { 0x0002 } else { 0x0004 }
      }
      [DeskLinkInput]::mouse_event($buttonFlag, 0, 0, 0, [UIntPtr]::Zero)
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
      continue
    } elseif ($useInterceptionKeyboard -and $message.type -eq 'key-down' -and (Send-InterceptionKey $payload $false)) {
      continue
    } elseif ($useInterceptionKeyboard -and $message.type -eq 'key-up' -and (Send-InterceptionKey $payload $true)) {
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

Stop-ViGEmController
Stop-InterceptionKeyboard
Stop-InterceptionMouse
