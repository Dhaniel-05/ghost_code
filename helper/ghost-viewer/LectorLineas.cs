// Responsabilidad: leer líneas de un flujo de bytes (separadas por \n) con tope de tamaño; una línea demasiado larga se descarta entera.
using System.Text;

namespace GhostViewer;

internal static class LectorLineas
{
    /// <summary>Bloquea hasta el fin del flujo (EOF). Ignora líneas vacías, quita el \r final y un posible BOM.</summary>
    public static void Leer(Stream entrada, Action<string> alLinea, Action<string> alDescartar, int maxBytes = Protocolo.LimiteLineaBytes)
    {
        var buffer = new byte[16 * 1024];
        var linea = new MemoryStream();
        var descartando = false;

        int leidos;
        while ((leidos = entrada.Read(buffer, 0, buffer.Length)) > 0)
        {
            var desde = 0;
            while (desde < leidos)
            {
                var salto = Array.IndexOf(buffer, (byte)'\n', desde, leidos - desde);
                var fin = salto < 0 ? leidos : salto;

                if (!descartando)
                {
                    if (linea.Length + (fin - desde) > maxBytes)
                    {
                        descartando = true;
                        linea.SetLength(0);
                        alDescartar($"línea de más de {maxBytes} bytes");
                    }
                    else
                    {
                        linea.Write(buffer, desde, fin - desde);
                    }
                }

                if (salto < 0) break;
                if (!descartando) Entregar(linea, alLinea);
                descartando = false;
                linea.SetLength(0);
                desde = salto + 1;
            }
        }
        if (!descartando && linea.Length > 0) Entregar(linea, alLinea);
    }

    private static void Entregar(MemoryStream linea, Action<string> alLinea)
    {
        var texto = Encoding.UTF8.GetString(linea.GetBuffer(), 0, (int)linea.Length).TrimStart('﻿');
        if (texto.EndsWith('\r')) texto = texto[..^1];
        if (texto.Trim().Length > 0) alLinea(texto);
    }
}
