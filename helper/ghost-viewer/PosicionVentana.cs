// Responsabilidad: recordar el tamaño y la posición de la ventana entre sesiones (en la carpeta de datos del usuario, nunca junto a la guía).
using System.Text.Json;

namespace GhostViewer;

internal static class PosicionVentana
{
    internal sealed record Guardado(int X, int Y, int Ancho, int Alto);

    private static string Archivo =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GhostCode", "ventana.json");

    public static void Restaurar(Form form)
    {
        var pantalla = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        var predeterminado = new Rectangle(pantalla.Right - 540, pantalla.Bottom - 664, 520, 640);
        form.Bounds = Rectangle.Intersect(predeterminado, pantalla);

        try
        {
            if (!File.Exists(Archivo)) return;
            var g = JsonSerializer.Deserialize<Guardado>(File.ReadAllText(Archivo));
            if (g is null || g.Ancho < 320 || g.Alto < 200) return;
            var rect = new Rectangle(g.X, g.Y, g.Ancho, g.Alto);
            // Solo si sigue cayendo en alguna pantalla (puede que se haya desconectado un monitor)
            if (Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(rect))) form.Bounds = rect;
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException) { /* se usa la posición por defecto */ }
    }

    public static void Guardar(Form form)
    {
        if (form.WindowState != FormWindowState.Normal) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Archivo)!);
            var b = form.Bounds;
            File.WriteAllText(Archivo, JsonSerializer.Serialize(new Guardado(b.X, b.Y, b.Width, b.Height)));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { /* no es grave */ }
    }
}
