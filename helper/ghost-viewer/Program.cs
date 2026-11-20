// Responsabilidad: punto de entrada: arranca el visor, lee comandos de stdin y sale al recibir «cerrar» o al llegar el fin de stdin.
using System.Text;
using Microsoft.Web.WebView2.Core;

namespace GhostViewer;

internal static class Registro
{
    private static readonly StreamWriter Salida = new(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = true };
    private static readonly object Cerrojo = new();

    /// <summary>Diagnóstico para stderr (la extensión lo muestra en su canal de salida). Nunca va a stdout.</summary>
    public static void Info(string texto)
    {
        lock (Cerrojo)
        {
            try { Salida.WriteLine(texto); } catch (IOException) { }
        }
    }
}

internal static class Program
{
    private static int _codigoSalida;

    [STAThread]
    private static int Main()
    {
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

        var salida = new SalidaProtocolo(Console.OpenStandardOutput());
        var contexto = new ApplicationContext();
        var form = new VisorForm(salida);
        Application.ThreadException += (_, e) =>
        {
            Registro.Info($"excepción en la interfaz: {e.Exception}");
            salida.Error($"Error inesperado: {e.Exception.Message}", "excepcion");
        };

        _ = form.Handle; // crea la ventana en este hilo (sin mostrarla) para poder usar BeginInvoke ya
        form.BeginInvoke(async () => await ArrancarAsync(form, salida, contexto));
        Application.Run(contexto);

        // Salida inmediata: el fin de stdin debe terminar el proceso en menos de 1 s
        Environment.Exit(_codigoSalida);
        return _codigoSalida;
    }

    private static async Task ArrancarAsync(VisorForm form, SalidaProtocolo salida, ApplicationContext contexto)
    {
        try
        {
            await form.IniciarAsync();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            salida.Error("WebView2 no está instalado en este equipo.", "webview2-ausente");
            Salir(contexto, 2);
            return;
        }
        catch (Exception e)
        {
            Registro.Info($"no arrancó el visor: {e}");
            salida.Error($"No arrancó el visor: {e.Message}", "fallo-arranque");
            Salir(contexto, 2);
            return;
        }

        salida.Listo(form.Afinidad);
        if (!form.Afinidad)
            salida.Error("No se pudo proteger la ventana contra capturas (¿Windows anterior a 10 versión 2004?). El visor no mostrará código.", "sin-proteccion");

        var hilo = new Thread(() => LeerComandos(form, contexto)) { IsBackground = true, Name = "stdin" };
        hilo.Start();
    }

    private static void LeerComandos(VisorForm form, ApplicationContext contexto)
    {
        try
        {
            using var entrada = Console.OpenStandardInput();
            LectorLineas.Leer(
                entrada,
                linea =>
                {
                    if (!Protocolo.TryDecodificarComando(linea, out var comando, out var error))
                    {
                        Registro.Info($"línea inválida ignorada: {error}");
                        return;
                    }
                    EnHiloDeInterfaz(form, () =>
                    {
                        if (comando is Cerrar) Salir(contexto, 0);
                        else form.Aplicar(comando!);
                    });
                },
                motivo => Registro.Info($"línea descartada: {motivo}"));
        }
        catch (IOException) { /* el tubo se rompió: se trata como fin de stdin */ }

        // Fin de stdin (VS Code cerró o murió): salir para no quedar huérfanos
        EnHiloDeInterfaz(form, () => Salir(contexto, 0));
    }

    private static void EnHiloDeInterfaz(VisorForm form, Action accion)
    {
        try
        {
            if (!form.IsDisposed) form.BeginInvoke(accion);
        }
        catch (InvalidOperationException) { /* la ventana ya no existe */ }
    }

    private static void Salir(ApplicationContext contexto, int codigo)
    {
        _codigoSalida = codigo;
        contexto.ExitThread();
    }
}
