// Responsabilidad: llamadas a user32.dll (protección de captura, siempre al frente, mostrar sin robar el foco).
using System.Runtime.InteropServices;

namespace GhostViewer;

internal static class Nativos
{
    public const uint WDA_EXCLUDEFROMCAPTURE = 0x11;

    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOACTIVATE = 0x0010;
    public static readonly IntPtr HWND_TOPMOST = new(-1);
    public static readonly IntPtr HWND_NOTOPMOST = new(-2);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint pdwAffinity);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);
}

internal static class BarraTitulo
{
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE_ANTIGUO = 19; // Windows 10 hasta la 1903
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private const int DWMWA_BORDER_COLOR = 34;                    // Windows 11
    private const int DWMWA_CAPTION_COLOR = 35;                   // Windows 11
    private const int DWMWA_TEXT_COLOR = 36;                      // Windows 11

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int atributo, ref int valor, int tamano);

    // Los colores van como COLORREF: 0x00BBGGRR
    private const int OscuroFondo = 0x17110D;  // #0d1117 (el mismo fondo de la página)
    private const int OscuroBorde = 0x3D3630;  // #30363d
    private const int OscuroTexto = 0x9E948B;  // #8b949e
    private const int ClaroFondo = 0xFFFFFF;
    private const int ClaroBorde = 0xDED7D0;   // #d0d7de
    private const int ClaroTexto = 0x28231F;   // #1f2328

    /// <summary>Barra de título del color del tema: modo oscuro nativo y, en Windows 11, color propio de barra, borde y texto.</summary>
    public static void Aplicar(IntPtr hwnd, bool oscuro)
    {
        if (hwnd == IntPtr.Zero) return;
        try
        {
            var modo = oscuro ? 1 : 0;
            if (DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref modo, sizeof(int)) != 0)
                DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_ANTIGUO, ref modo, sizeof(int));

            var fondo = oscuro ? OscuroFondo : ClaroFondo;
            var borde = oscuro ? OscuroBorde : ClaroBorde;
            var texto = oscuro ? OscuroTexto : ClaroTexto;
            DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, ref fondo, sizeof(int));
            DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, ref borde, sizeof(int));
            DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, ref texto, sizeof(int));
        }
        catch (Exception e) when (e is DllNotFoundException or EntryPointNotFoundException)
        {
            // Windows sin DWM: queda la barra de título normal
        }
    }
}

internal static class ProteccionCaptura
{
    /// <summary>Excluye la ventana de las capturas y verifica que quedó así. Falso si no se pudo (p. ej. Windows anterior a 10 versión 2004).</summary>
    public static bool Aplicar(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !Nativos.SetWindowDisplayAffinity(hwnd, Nativos.WDA_EXCLUDEFROMCAPTURE)) return false;
        return Vigente(hwnd);
    }

    public static bool Vigente(IntPtr hwnd) =>
        hwnd != IntPtr.Zero && Nativos.GetWindowDisplayAffinity(hwnd, out var afinidad) && afinidad == Nativos.WDA_EXCLUDEFROMCAPTURE;

    /// <summary>Siempre al frente sin mover, cambiar el tamaño ni activar la ventana.</summary>
    public static void SiempreAlFrente(IntPtr hwnd, bool valor) =>
        Nativos.SetWindowPos(hwnd, valor ? Nativos.HWND_TOPMOST : Nativos.HWND_NOTOPMOST, 0, 0, 0, 0,
            Nativos.SWP_NOMOVE | Nativos.SWP_NOSIZE | Nativos.SWP_NOACTIVATE);
}
