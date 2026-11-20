// Responsabilidad: armar la página del visor con sus recursos incluidos en el ejecutable (sin red, sin archivos sueltos).
using System.Text;

namespace GhostViewer;

internal static class Pagina
{
    public static string Cargar() =>
        Leer("visor.html")
            .Replace("/*{{CSS_CLARO}}*/", Leer("github.min.css"))
            .Replace("/*{{CSS_OSCURO}}*/", Leer("github-dark.min.css"))
            .Replace("/*{{HLJS}}*/", Leer("highlight.min.js"));

    private static string Leer(string nombre)
    {
        using var flujo = typeof(Pagina).Assembly.GetManifestResourceStream(nombre)
            ?? throw new InvalidOperationException($"Falta el recurso incluido «{nombre}».");
        using var lector = new StreamReader(flujo, Encoding.UTF8);
        return lector.ReadToEnd();
    }
}
