using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;

namespace DeskLinkOsk;

public partial class MainWindow : Window
{
    private const uint KeyUpFlag = 0x0002;
    private readonly HashSet<string> heldKeys = [];
    private readonly HashSet<string> pointerActivatedKeys = [];
    private readonly Dictionary<string, Button> keyButtons = [];
    private readonly CancellationTokenSource pipeCancellation = new();
    private sealed record KeySpec(string Label, string Key, double Width = 1);

    private static readonly KeySpec[][] Layout =
    [
        [new("Esc", "Escape"), new("F1", "F1"), new("F2", "F2"), new("F3", "F3"), new("F4", "F4"), new("F5", "F5"), new("F6", "F6"), new("F7", "F7"), new("F8", "F8"), new("F9", "F9"), new("F10", "F10"), new("F11", "F11"), new("F12", "F12"), new("Backspace", "Backspace", 2)],
        [new("`", "`"), new("1", "1"), new("2", "2"), new("3", "3"), new("4", "4"), new("5", "5"), new("6", "6"), new("7", "7"), new("8", "8"), new("9", "9"), new("0", "0"), new("-", "-"), new("=", "="), new("Backspace", "Backspace", 2)],
        [new("Tab", "Tab", 1.5), new("Q", "q"), new("W", "w"), new("E", "e"), new("R", "r"), new("T", "t"), new("Y", "y"), new("U", "u"), new("I", "i"), new("O", "o"), new("P", "p"), new("[", "["), new("]", "]"), new("\\", "\\"), new("Enter", "Enter", 1.5)],
        [new("Caps", "CapsLock", 1.8), new("A", "a"), new("S", "s"), new("D", "d"), new("F", "f"), new("G", "g"), new("H", "h"), new("J", "j"), new("K", "k"), new("L", "l"), new(";", ";"), new("'", "'"), new("Enter", "Enter", 2.2)],
        [new("Shift", "Shift", 2.2), new("Z", "z"), new("X", "x"), new("C", "c"), new("V", "v"), new("B", "b"), new("N", "n"), new("M", "m"), new(",", ","), new(".", "."), new("/", "/"), new("Shift", "Shift", 2.8)],
        [new("Ctrl", "Control", 1.4), new("Win", "Meta", 1.2), new("Alt", "Alt", 1.2), new("Space", " ", 5), new("Alt", "Alt", 1.2), new("←", "ArrowLeft"), new("↓", "ArrowDown"), new("↑", "ArrowUp"), new("→", "ArrowRight")]
    ];

    public MainWindow()
    {
        InitializeComponent();
        BuildKeyboard();
        _ = ListenForDeskLinkCommandsAsync(pipeCancellation.Token);
        Closed += (_, _) => { pipeCancellation.Cancel(); ReleaseAllKeys(); };
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        var source = (HwndSource)PresentationSource.FromVisual(this);
        source.AddHook(WindowMessageHook);
        const int GwlExStyle = -20;
        const long WsExNoActivate = 0x08000000L;
        var extendedStyle = GetWindowLongPtr(source.Handle, GwlExStyle).ToInt64();
        SetWindowLongPtr(source.Handle, GwlExStyle, new IntPtr(extendedStyle | WsExNoActivate));
    }

    private IntPtr WindowMessageHook(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        const int WmMouseActivate = 0x0021;
        const int MaNoActivate = 3;
        if (message == WmMouseActivate)
        {
            handled = true;
            return new IntPtr(MaNoActivate);
        }
        return IntPtr.Zero;
    }

    private void BuildKeyboard()
    {
        foreach (var row in Layout)
        {
            var grid = new Grid { Margin = new Thickness(0, 1, 0, 1) };
            foreach (var key in row) grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(key.Width, GridUnitType.Star) });
            for (var column = 0; column < row.Length; column++)
            {
                var key = row[column];
                var button = new Button { Content = key.Label, Tag = key.Key, Style = (Style)FindResource("KeyButton") };
                AutomationProperties.SetName(button, key.Key);
                AutomationProperties.SetHelpText(button, $"DeskLink OSK key {key.Key}");
                button.PreviewMouseLeftButtonDown += KeyPressed;
                button.PreviewMouseLeftButtonUp += KeyReleased;
                button.MouseLeave += KeyLeft;
                button.Click += KeyInvoked;
                keyButtons.TryAdd(key.Key, button);
                Grid.SetColumn(button, column);
                grid.Children.Add(button);
            }
            KeyboardRows.Children.Add(grid);
        }
    }

    private void KeyPressed(object sender, MouseButtonEventArgs e)
    {
        if (sender is not Button { Tag: string key }) return;
        pointerActivatedKeys.Add(key);
        PressKey(key);
        e.Handled = true;
    }

    private void KeyReleased(object sender, MouseEventArgs e)
    {
        if (sender is Button { Tag: string key }) ReleaseKey(key);
    }

    private void KeyLeft(object sender, MouseEventArgs e)
    {
        if (sender is not Button { Tag: string key }) return;
        ReleaseKey(key);
        pointerActivatedKeys.Remove(key);
    }

    private void KeyInvoked(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: string key }) return;
        // A physical mouse click already used the down/up handlers. UI
        // Automation invokes Click directly, so it reaches this path instead.
        if (pointerActivatedKeys.Remove(key)) return;
        PressKey(key);
        ReleaseKey(key);
    }

    private void PressKey(string key)
    {
        if (!heldKeys.Add(key)) return;
        if (!TryGetVirtualKey(key, out var virtualKey)) { StatusText.Text = $"{key} is not mapped yet."; return; }
        keybd_event(virtualKey, 0, 0, UIntPtr.Zero);
        StatusText.Text = $"Key down: {DisplayKey(key)}";
    }

    private void ReleaseKey(string key)
    {
        if (!heldKeys.Remove(key) || !TryGetVirtualKey(key, out var virtualKey)) return;
        keybd_event(virtualKey, 0, KeyUpFlag, UIntPtr.Zero);
        StatusText.Text = $"Key up: {DisplayKey(key)}";
    }

    private void ReleaseAllKeys()
    {
        foreach (var key in heldKeys.ToArray()) ReleaseKey(key);
    }

    private void ShowRemoteKey(string key, bool pressed)
    {
        if (!keyButtons.TryGetValue(key, out var button)) return;
        if (pressed)
        {
            button.Background = System.Windows.Media.Brushes.MediumSpringGreen;
            button.Foreground = System.Windows.Media.Brushes.MidnightBlue;
            StatusText.Text = $"Key down: {DisplayKey(key)}";
        }
        else
        {
            button.ClearValue(Button.BackgroundProperty);
            button.ClearValue(Button.ForegroundProperty);
            StatusText.Text = $"Key up: {DisplayKey(key)}";
        }
    }

    private async Task ListenForDeskLinkCommandsAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                using var pipe = new NamedPipeServerStream("DeskLinkOsk", PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                await pipe.WaitForConnectionAsync(cancellationToken);
                using var reader = new StreamReader(pipe);
                var line = await reader.ReadLineAsync(cancellationToken);
                if (string.IsNullOrWhiteSpace(line)) continue;
                using var message = JsonDocument.Parse(line);
                var root = message.RootElement;
                var type = root.GetProperty("type").GetString();
                var key = root.TryGetProperty("key", out var keyValue) ? keyValue.GetString() : null;
                await Dispatcher.InvokeAsync(() =>
                {
                    if (type == "release-input") foreach (var heldKey in heldKeys.ToArray()) ShowRemoteKey(heldKey, false);
                    else if (!string.IsNullOrEmpty(key) && type == "key-down") { heldKeys.Add(key); ShowRemoteKey(key, true); }
                    else if (!string.IsNullOrEmpty(key) && type == "key-up") { heldKeys.Remove(key); ShowRemoteKey(key, false); }
                });
            }
            catch (OperationCanceledException) { break; }
            catch (Exception error) { await Dispatcher.InvokeAsync(() => StatusText.Text = $"DeskLink pipe error: {error.Message}"); }
        }
    }

    private static string DisplayKey(string key) => key == " " ? "Space" : key;

    private static bool TryGetVirtualKey(string key, out byte virtualKey)
    {
        var specialKeys = new Dictionary<string, byte>
        {
            ["Backspace"] = 0x08, ["Tab"] = 0x09, ["Enter"] = 0x0D, ["Escape"] = 0x1B, [" "] = 0x20,
            ["Shift"] = 0x10, ["Control"] = 0x11, ["Alt"] = 0x12, ["Meta"] = 0x5B, ["CapsLock"] = 0x14,
            ["ArrowLeft"] = 0x25, ["ArrowUp"] = 0x26, ["ArrowRight"] = 0x27, ["ArrowDown"] = 0x28,
        };
        if (specialKeys.TryGetValue(key, out virtualKey)) return true;
        if (key.Length == 2 && key[0] == 'F' && int.TryParse(key[1..], out var functionNumber) && functionNumber is >= 1 and <= 12) { virtualKey = (byte)(0x6F + functionNumber); return true; }
        if (key.Length == 1) { virtualKey = (byte)(VkKeyScan(key[0]) & 0xFF); return virtualKey != 0xFF; }
        virtualKey = 0;
        return false;
    }

    private void AlwaysOnTopChanged(object sender, RoutedEventArgs e) => Topmost = AlwaysOnTopCheckBox.IsChecked == true;

    [DllImport("user32.dll")] private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);
    [DllImport("user32.dll")] private static extern short VkKeyScan(char character);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr", SetLastError = true)] private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr", SetLastError = true)] private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);
}
