// Responsabilidad: protocolo NDJSON con la extensión: leer comandos (validación estricta) y escribir eventos. Mismo contrato que src/platform/protocolo.ts.
using System.Text;
using System.Text.Json;

namespace GhostViewer;

internal abstract record Comando;
internal sealed record Mostrar : Comando;
internal sealed record Ocultar : Comando;
internal sealed record Cerrar : Comando;
internal sealed record Traer : Comando;                // recuperar un visor perdido
internal sealed record Escudo(bool Valor) : Comando;    // cubrir o descubrir el código
internal sealed record Modo(string Valor) : Comando;    // normal | compacto | maximizado
internal sealed record CargarGuia(string Titulo, string Lenguaje, IReadOnlyList<BloqueGuia> Bloques) : Comando;
internal sealed record SeleccionarBloque(int Indice) : Comando;
internal sealed record SiempreAlFrente(bool Valor) : Comando;
internal sealed record Tema(string Valor) : Comando; // "claro" | "oscuro"
internal sealed record BloqueGuia(int Indice, string Titulo, string Texto);

internal static class Protocolo
{
    public const int Version = 1;
    public const int LimiteLineaBytes = 4 * 1024 * 1024;

    /// <summary>Lee una línea. Nunca lanza: devuelve falso con el motivo. Los campos desconocidos se ignoran.</summary>
    public static bool TryDecodificarComando(string linea, out Comando? comando, out string error)
    {
        comando = null;
        error = "";
        if (string.IsNullOrWhiteSpace(linea)) { error = "línea vacía"; return false; }

        JsonDocument documento;
        try { documento = JsonDocument.Parse(linea.Trim()); }
        catch (JsonException) { error = "no es JSON válido"; return false; }

        using (documento)
        {
            var raiz = documento.RootElement;
            if (raiz.ValueKind != JsonValueKind.Object) { error = "la línea debe ser un objeto JSON"; return false; }
            if (!raiz.TryGetProperty("tipo", out var tipo) || tipo.ValueKind != JsonValueKind.String) { error = "falta «tipo»"; return false; }

            switch (tipo.GetString())
            {
                case "mostrar": comando = new Mostrar(); return true;
                case "ocultar": comando = new Ocultar(); return true;
                case "cerrar": comando = new Cerrar(); return true;
                case "traer": comando = new Traer(); return true;
                case "escudo":
                    if (!TryBool(raiz, "valor", out var escudo)) { error = "escudo: «valor» debe ser verdadero o falso"; return false; }
                    comando = new Escudo(escudo);
                    return true;
                case "modo":
                    if (!TryTexto(raiz, "valor", out var modo) || (modo != "normal" && modo != "compacto" && modo != "maximizado")) { error = "modo: «valor» debe ser «normal», «compacto» o «maximizado»"; return false; }
                    comando = new Modo(modo);
                    return true;
                case "seleccionarBloque":
                    if (!TryIndice(raiz, "indice", out var indice)) { error = "seleccionarBloque: «indice» debe ser un entero mayor o igual que 0"; return false; }
                    comando = new SeleccionarBloque(indice);
                    return true;
                case "siempreAlFrente":
                    if (!TryBool(raiz, "valor", out var alFrente)) { error = "siempreAlFrente: «valor» debe ser verdadero o falso"; return false; }
                    comando = new SiempreAlFrente(alFrente);
                    return true;
                case "tema":
                    if (!TryTexto(raiz, "valor", out var tema) || (tema != "claro" && tema != "oscuro")) { error = "tema: «valor» debe ser «claro» u «oscuro»"; return false; }
                    comando = new Tema(tema);
                    return true;
                case "cargarGuia": return TryCargarGuia(raiz, out comando, out error);
                default: error = "comando desconocido"; return false;
            }
        }
    }

    private static bool TryCargarGuia(JsonElement raiz, out Comando? comando, out string error)
    {
        comando = null;
        error = "";
        if (!TryTexto(raiz, "titulo", out var titulo)) { error = "cargarGuia: «titulo» debe ser texto"; return false; }
        if (!TryTexto(raiz, "lenguaje", out var lenguaje)) { error = "cargarGuia: «lenguaje» debe ser texto"; return false; }
        if (!raiz.TryGetProperty("bloques", out var arreglo) || arreglo.ValueKind != JsonValueKind.Array) { error = "cargarGuia: «bloques» debe ser un arreglo"; return false; }

        var bloques = new List<BloqueGuia>();
        foreach (var b in arreglo.EnumerateArray())
        {
            if (b.ValueKind != JsonValueKind.Object || !TryIndice(b, "indice", out var i) || !TryTexto(b, "titulo", out var t) || !TryTexto(b, "texto", out var x))
            {
                error = "cargarGuia: cada bloque necesita «indice» entero, «titulo» y «texto»";
                return false;
            }
            bloques.Add(new BloqueGuia(i, t, x));
        }
        comando = new CargarGuia(titulo, lenguaje, bloques);
        return true;
    }

    // Un entero «seguro» como en JavaScript: 1.5, "2", -1 y 1e21 se rechazan; 1.0 se acepta (igual que JSON.parse)
    private static bool TryIndice(JsonElement objeto, string nombre, out int valor)
    {
        valor = 0;
        if (!objeto.TryGetProperty(nombre, out var e) || e.ValueKind != JsonValueKind.Number || !e.TryGetDouble(out var d)) return false;
        if (d < 0 || d > int.MaxValue || Math.Floor(d) != d) return false;
        valor = (int)d;
        return true;
    }

    private static bool TryTexto(JsonElement objeto, string nombre, out string valor)
    {
        valor = "";
        if (!objeto.TryGetProperty(nombre, out var e) || e.ValueKind != JsonValueKind.String) return false;
        valor = e.GetString() ?? "";
        return true;
    }

    private static bool TryBool(JsonElement objeto, string nombre, out bool valor)
    {
        valor = false;
        if (!objeto.TryGetProperty(nombre, out var e) || (e.ValueKind != JsonValueKind.True && e.ValueKind != JsonValueKind.False)) return false;
        valor = e.GetBoolean();
        return true;
    }
}

/// <summary>Escribe los eventos en stdout: una línea JSON cada uno, UTF-8 sin BOM, vaciando el flujo tras cada línea.</summary>
internal sealed class SalidaProtocolo
{
    private readonly Stream _flujo;
    private readonly object _cerrojo = new();

    public SalidaProtocolo(Stream flujo) => _flujo = flujo;

    public void Listo(bool afinidad) => Escribir(new { tipo = "listo", protocolo = Protocolo.Version, afinidad });
    public void BloqueSeleccionado(int indice) => Escribir(new { tipo = "bloqueSeleccionado", indice });
    public void VisibilidadCambiada(bool visible) => Escribir(new { tipo = "visibilidadCambiada", visible });
    public void EscudoCambiado(bool activo) => Escribir(new { tipo = "escudoCambiado", activo });
    public void ModoCambiado(string valor) => Escribir(new { tipo = "modoCambiado", valor });

    public void Error(string mensaje, string? codigo = null)
    {
        if (codigo is null) Escribir(new { tipo = "error", mensaje });
        else Escribir(new { tipo = "error", mensaje, codigo });
    }

    private void Escribir(object evento)
    {
        // El codificador por defecto escapa lo que no es ASCII (incluidos U+2028 y U+2029): la línea nunca se parte
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(evento) + "\n");
        lock (_cerrojo)
        {
            try
            {
                _flujo.Write(bytes, 0, bytes.Length);
                _flujo.Flush();
            }
            catch (IOException) { /* la extensión ya cerró el tubo: el fin de stdin nos hará salir */ }
        }
    }
}
