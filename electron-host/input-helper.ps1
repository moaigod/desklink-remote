Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DeskLinkInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern short VkKeyScan(char ch);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
}
'@

$keyMap = @{ Backspace = 0x08; Tab = 0x09; Enter = 0x0D; Escape = 0x1B; ' ' = 0x20; Shift = 0x10; Control = 0x11; Alt = 0x12; Meta = 0x5B; ArrowLeft = 0x25; ArrowUp = 0x26; ArrowRight = 0x27; ArrowDown = 0x28; Delete = 0x2E; Home = 0x24; End = 0x23; PageUp = 0x21; PageDown = 0x22 }
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
    if ($message.type -like 'mouse-*') {
      $x = [Math]::Max(0, [Math]::Min(1, [double]$payload.x))
      $y = [Math]::Max(0, [Math]::Min(1, [double]$payload.y))
      $left = [DeskLinkInput]::GetSystemMetrics(76); $top = [DeskLinkInput]::GetSystemMetrics(77)
      $width = [DeskLinkInput]::GetSystemMetrics(78); $height = [DeskLinkInput]::GetSystemMetrics(79)
      [DeskLinkInput]::SetCursorPos($left + [int]($x * ($width - 1)), $top + [int]($y * ($height - 1))) | Out-Null
      if ($message.type -eq 'mouse-down') { [DeskLinkInput]::mouse_event((if ($payload.button -eq 2) { 0x0008 } else { 0x0002 }), 0, 0, 0, [UIntPtr]::Zero) }
      if ($message.type -eq 'mouse-up') { [DeskLinkInput]::mouse_event((if ($payload.button -eq 2) { 0x0010 } else { 0x0004 }), 0, 0, 0, [UIntPtr]::Zero) }
    } elseif ($message.type -like 'key-*') {
      $vk = Get-VirtualKey $payload.key
      if ($null -ne $vk) { [DeskLinkInput]::keybd_event($vk, 0, (if ($message.type -eq 'key-up') { 0x0002 } else { 0 }), [UIntPtr]::Zero) }
    }
  } catch { }
}
