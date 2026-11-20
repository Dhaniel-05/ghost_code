// Responsabilidad: la ventana del visor: protegida contra captura, sin rastro en la barra de tareas, con WebView2 de solo lectura.
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace GhostViewer;

internal sealed class VisorForm : Form
{
    private readonly WebView2 _web = new();
    private readonly SalidaProtocolo _salida;
    private readonly List<string> _pendientes = new(); // mensajes para la página que llegaron antes de que cargara
    private bool _paginaLista;
    private bool _oscuro = true; // el visor arranca con el tema oscuro
    private int _totalBloques;

    /// <summary>Verdadero si la protección de captura (0x11) está aplicada y verificada.</summary>
    public bool Afinidad { get; private set; }

    public VisorForm(SalidaProtocolo salida)
    {
        _salida = salida;
        Text = "Ghost Code"; // título neutro: nunca el nombre del archivo guía
        FormBorderStyle = FormBorderStyle.SizableToolWindow; // ventana de herramientas: sin botón en la barra de tareas ni en Alt+Tab
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        MinimumSize = new Size(320, 200);
        BackColor = Color.FromArgb(13, 17, 23);
        _web.Dock = DockStyle.Fill;
        _web.DefaultBackgroundColor = Color.FromArgb(13, 17, 23);
        Controls.Add(_web);

        PosicionVentana.Restaurar(this);
        VisibleChanged += (_, _) => { if (!IsDisposed) _salida.VisibilidadCambiada(Visible); };
        ResizeEnd += (_, _) => PosicionVentana.Guardar(this);
        FormClosing += (_, e) =>
        {
            // La X solo oculta: la extensión es quien decide cuándo termina el visor
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };
    }

    // Mostrar sin robar el foco de lo que se esté escribiendo
    protected override bool ShowWithoutActivation => true;

    // Si Windows vuelve a crear la ventana, la protección se reaplica antes de que pueda verse
    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Afinidad = ProteccionCaptura.Aplicar(Handle);
        BarraTitulo.Aplicar(Handle, _oscuro);
    }

    protected override void OnMove(EventArgs e)
    {
        base.OnMove(e);
        if (Visible) PosicionVentana.Guardar(this);
    }

    /// <summary>Crea la ventana (sin mostrarla), aplica la protección y deja lista la página.</summary>
    public async Task IniciarAsync()
    {
        _ = Handle;   // crea el HWND de la ventana y aplica la protección
        _ = _web.Handle;

        var carpetaDatos = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GhostCode", "webview2");
        var entorno = await CoreWebView2Environment.CreateAsync(userDataFolder: carpetaDatos);
        await _web.EnsureCoreWebView2Async(entorno);
        ConfigurarWeb(_web.CoreWebView2);

        var cargada = new TaskCompletionSource();
        void AlNavegar(object? s, CoreWebView2NavigationCompletedEventArgs e)
        {
            _web.CoreWebView2.NavigationCompleted -= AlNavegar;
            if (e.IsSuccess) cargada.TrySetResult();
            else cargada.TrySetException(new InvalidOperationException($"La página del visor no cargó ({e.WebErrorStatus})."));
        }
        _web.CoreWebView2.NavigationCompleted += AlNavegar;
        _web.CoreWebView2.NavigateToString(Pagina.Cargar());
        await cargada.Task.WaitAsync(TimeSpan.FromSeconds(8));

        _paginaLista = true;
        foreach (var m in _pendientes) _web.CoreWebView2.PostWebMessageAsJson(m);
        _pendientes.Clear();
    }

    /// <summary>Ejecuta un comando de la extensión. Siempre en el hilo de la interfaz.</summary>
    public void Aplicar(Comando comando)
    {
        switch (comando)
        {
            case Mostrar: MostrarVentana(); break;
            case Ocultar: Hide(); break;
            case SiempreAlFrente s: ProteccionCaptura.SiempreAlFrente(Handle, s.Valor); break;
            case Tema t: AplicarTema(t.Valor); break;
            case CargarGuia g:
                _totalBloques = g.Bloques.Count;
                EnviarAPagina(JsonSerializer.Serialize(new
                {
                    tipo = "cargarGuia",
                    titulo = g.Titulo,
                    lenguaje = g.Lenguaje,
                    bloques = g.Bloques.Select(b => new { indice = b.Indice, titulo = b.Titulo, texto = b.Texto }),
                }));
                break;
            case SeleccionarBloque s:
                if (s.Indice >= _totalBloques) { Registro.Info($"seleccionarBloque: el índice {s.Indice} no existe en la guía cargada"); break; }
                EnviarAPagina(JsonSerializer.Serialize(new { tipo = "seleccionar", indice = s.Indice }));
                _salida.BloqueSeleccionado(s.Indice);
                break;
        }
    }

    private void MostrarVentana()
    {
        // Nunca se muestra código sin la protección verificada
        if (!Afinidad || !ProteccionCaptura.Vigente(Handle))
        {
            Afinidad = ProteccionCaptura.Aplicar(Handle);
            if (!Afinidad)
            {
                _salida.Error("No se pudo proteger la ventana contra capturas; el visor no se mostrará.", "sin-proteccion");
                return;
            }
        }
        if (!Visible) Show();
    }

    private void AplicarTema(string tema)
    {
        _oscuro = tema != "claro";
        BarraTitulo.Aplicar(Handle, _oscuro);
        var fondo = tema == "claro" ? Color.White : Color.FromArgb(13, 17, 23);
        BackColor = fondo;
        _web.DefaultBackgroundColor = fondo;
        EnviarAPagina(JsonSerializer.Serialize(new { tipo = "tema", valor = tema }));
    }

    private void EnviarAPagina(string json)
    {
        if (_paginaLista) _web.CoreWebView2.PostWebMessageAsJson(json);
        else _pendientes.Add(json);
    }

    // Solo lectura y sin red: nada de menús, atajos del navegador, ventanas nuevas, descargas ni permisos
    private void ConfigurarWeb(CoreWebView2 web)
    {
        var s = web.Settings;
        s.AreDefaultContextMenusEnabled = false;
        s.AreDevToolsEnabled = false;
        s.AreBrowserAcceleratorKeysEnabled = false;
        s.IsStatusBarEnabled = false;
        s.IsZoomControlEnabled = false;
        s.IsBuiltInErrorPageEnabled = false;
        s.IsPasswordAutosaveEnabled = false;
        s.IsGeneralAutofillEnabled = false;

        web.NavigationStarting += (_, e) =>
        {
            if (!e.Uri.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
        };
        web.NewWindowRequested += (_, e) => e.Handled = true;
        web.DownloadStarting += (_, e) => e.Cancel = true;
        web.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
        web.WebMessageReceived += AlRecibirMensajeDeLaPagina;
    }

    // Un clic del presentador sobre un bloque: la página avisa y se lo decimos a la extensión
    private void AlRecibirMensajeDeLaPagina(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var raiz = doc.RootElement;
            if (raiz.ValueKind == JsonValueKind.Object
                && raiz.TryGetProperty("tipo", out var tipo) && tipo.GetString() == "seleccionar"
                && raiz.TryGetProperty("indice", out var i) && i.TryGetInt32(out var indice) && indice >= 0)
            {
                _salida.BloqueSeleccionado(indice);
            }
        }
        catch (JsonException) { /* mensaje que no es nuestro: se ignora */ }
    }
}
