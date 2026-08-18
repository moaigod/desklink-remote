using System;
using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets;
using Nefarius.ViGEm.Client.Targets.Xbox360;

namespace DeskLink.ViGEm;

public static class ViGEmBridge
{
    private static ViGEmClient client;
    private static IXbox360Controller controller;

    public static string Update(bool[] pressed, float[] values, float[] axes)
    {
        try
        {
            EnsureController();
            SetButtons(pressed, values);
            controller.SetSliderValue(Xbox360Slider.LeftTrigger, ToTrigger(GetButtonValue(pressed, values, 6)));
            controller.SetSliderValue(Xbox360Slider.RightTrigger, ToTrigger(GetButtonValue(pressed, values, 7)));
            controller.SetAxisValue(Xbox360Axis.LeftThumbX, ToAxis(GetAxis(axes, 0)));
            controller.SetAxisValue(Xbox360Axis.LeftThumbY, ToAxis(-GetAxis(axes, 1)));
            controller.SetAxisValue(Xbox360Axis.RightThumbX, ToAxis(GetAxis(axes, 2)));
            controller.SetAxisValue(Xbox360Axis.RightThumbY, ToAxis(-GetAxis(axes, 3)));
            return "ready";
        }
        catch (Exception error)
        {
            Disconnect();
            return "error: " + error.Message;
        }
    }

    public static void Disconnect()
    {
        if (controller != null)
        {
            try { controller.Disconnect(); } catch { }
            controller = null;
        }
        if (client != null)
        {
            client.Dispose();
            client = null;
        }
    }

    private static void EnsureController()
    {
        if (controller is not null) return;
        client = new ViGEmClient();
        controller = client.CreateXbox360Controller();
        controller.Connect();
    }

    private static void SetButtons(bool[] pressed, float[] values)
    {
        var mapping = new (int browserButton, Xbox360Button xboxButton)[]
        {
            (0, Xbox360Button.A), (1, Xbox360Button.B), (2, Xbox360Button.X), (3, Xbox360Button.Y),
            (4, Xbox360Button.LeftShoulder), (5, Xbox360Button.RightShoulder),
            (8, Xbox360Button.Back), (9, Xbox360Button.Start), (10, Xbox360Button.LeftThumb),
            (11, Xbox360Button.RightThumb), (12, Xbox360Button.Up), (13, Xbox360Button.Down),
            (14, Xbox360Button.Left), (15, Xbox360Button.Right), (16, Xbox360Button.Guide)
        };
        foreach (var (browserButton, xboxButton) in mapping)
        {
            controller.SetButtonState(xboxButton, GetButtonValue(pressed, values, browserButton) >= 0.5f);
        }
    }

    private static float GetButtonValue(bool[] pressed, float[] values, int index)
    {
        if (pressed != null && index < pressed.Length && pressed[index]) return 1;
        if (values == null || index >= values.Length) return 0;
        return values[index];
    }

    private static float GetAxis(float[] axes, int index)
    {
        return axes == null || index >= axes.Length ? 0 : axes[index];
    }

    private static byte ToTrigger(float value) => (byte)Math.Max(0, Math.Min(255, Math.Round(Math.Max(0, Math.Min(1, value)) * 255)));
    private static short ToAxis(float value) => (short)Math.Max(-32767, Math.Min(32767, Math.Round(Math.Max(-1, Math.Min(1, value)) * 32767)));
}
