// Responsabilidad: la ventana del visor: protegida contra captura, sin rastro en la barra de tareas, con WebView2 de solo lectura,
// escudo para cubrir el código, modos (normal, barra compacta, maximizado) y recuperación si se pierde.
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace GhostViewer;

internal sealed class VisorForm : Form
{
    private static readonly Size MinimoNormal = new(320, 200);
    private static readonly Size ClienteCompacto = new(300, 44);

    private readonly WebView2 _web = new();
    private readonly SalidaProtocolo _salida;
    private readonly List<string> _pendientes = new(); // mensajes para la página que llegaron antes de que cargara
    private bool _paginaLista;
    private bool _oscuro = true; // el visor arranca con el tema oscuro
    private bool _alFrente = true;
    private bool _escudo;
    private string _modo = "normal";
    private Rectangle? _boundsNormal; // dónde estaba la ventana normal al pasar a compacto o maximizado
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
        MinimumSize = MinimoNormal;
        BackColor = Color.FromArgb(13, 17, 23);
        _web.Dock = DockStyle.Fill;
        _web.DefaultBackgroundColor = Color.FromArgb(13, 17, 23);
        Controls.Add(_web);

        PosicionVentana.Restaurar(this);
        VisibleChanged += (_, _) =>
        {
            if (IsDisposed) return;
            // «Siempre al frente» pedido con la ventana aún oculta no se conserva al mostrarla: se aplica de nuevo al verse
            if (Visible) ProteccionCaptura.SiempreAlFrente(Handle, _alFrente);
            _salida.VisibilidadCambiada(Visible);
        };
        ResizeEnd += (_, _) => GuardarPosicion();
        // Sin botón en la barra de tareas, una ventana minimizada no se podría recuperar: nunca se queda minimizada
        SizeChanged += (_, _) =>
        {
            if (WindowState == FormWindowState.Minimized && !IsDisposed) BeginInvoke(() => WindowState = FormWindowState.Normal);
        };
        FormClosing += (_, e) =>
        {
            // La X solo oculta: la extensión es quien decide cuándo termina el visor
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };
        // Al compartir pantalla o conectar un monitor cambia la disposición: la ventana no debe quedar fuera de lo visible
        SystemEvents.DisplaySettingsChanged += AlCambiarPantallas;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) SystemEvents.DisplaySettingsChanged -= AlCambiarPantallas;
        base.Dispose(disposing);
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
        if (Visible) GuardarPosicion();
    }

    // Solo se recuerda la posición de la ventana normal (no la barra compacta ni la maximizada)
    private void GuardarPosicion()
    {
        if (_modo == "normal") PosicionVentana.Guardar(this);
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
            case Traer: RecuperarVentana(); break;
            case SiempreAlFrente s:
                _alFrente = s.Valor;
                ProteccionCaptura.SiempreAlFrente(Handle, s.Valor);
                break;
            case Tema t: AplicarTema(t.Valor); break;
            case Escudo e: AplicarEscudo(e.Valor); break;
            case Modo m: AplicarModo(m.Valor); break;
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

    /// <summary>Nunca se muestra código sin la protección de captura verificada.</summary>
    private bool ProteccionLista()
    {
        if (Afinidad && ProteccionCaptura.Vigente(Handle)) return true;
        Afinidad = ProteccionCaptura.Aplicar(Handle);
        if (!Afinidad) _salida.Error("No se pudo proteger la ventana contra capturas; el visor no se mostrará.", "sin-proteccion");
        return Afinidad;
    }

    private void MostrarVentana()
    {
        if (!ProteccionLista()) return;
        AsegurarVisible();
        if (Visible) _salida.VisibilidadCambiada(true); // ya se veía: se confirma igual (la extensión espera la respuesta)
        else Show();                                    // al mostrarse, VisibleChanged avisa
    }

    /// <summary>
    /// «Traer el visor aquí»: lo restaura si estuviera minimizado, lo mueve a una pantalla visible, lo muestra y lo sube por encima de todo.
    /// </summary>
    private void RecuperarVentana()
    {
        if (!ProteccionLista()) return;
        if (WindowState != FormWindowState.Normal) WindowState = FormWindowState.Normal;
        if (_modo == "maximizado") Bounds = Screen.FromControl(this).WorkingArea;
        else AsegurarVisible();
        var yaVisible = Visible;
        if (!yaVisible) Show();
        // Subirlo en el orden de ventanas: se pone «siempre al frente» y, si no se quería así, se quita en seguida
        ProteccionCaptura.SiempreAlFrente(Handle, true);
        if (!_alFrente) ProteccionCaptura.SiempreAlFrente(Handle, false);
        if (yaVisible) _salida.VisibilidadCambiada(true);
    }

    /// <summary>Si la ventana quedó fuera de todas las pantallas (monitor desconectado, cambio de resolución…), la lleva a la principal.</summary>
    private void AsegurarVisible()
    {
        var r = Bounds;
        var seVe = Screen.AllScreens.Any(s =>
        {
            var i = Rectangle.Intersect(s.WorkingArea, r);
            return i.Width >= 80 && i.Height >= 40;
        });
        if (seVe) return;
        var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        var ancho = Math.Min(r.Width, area.Width);
        var alto = Math.Min(r.Height, area.Height);
        Bounds = new Rectangle(area.Right - ancho - 20, area.Bottom - alto - 20, ancho, alto);
    }

    private void AlCambiarPantallas(object? sender, EventArgs e)
    {
        if (IsDisposed || !IsHandleCreated) return;
        BeginInvoke(() =>
        {
            if (_modo == "maximizado") Bounds = Screen.FromControl(this).WorkingArea;
            else AsegurarVisible();
        });
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

    /// <summary>Escudo: la página cubre el código con un panel opaco. El estado vive aquí; la página solo lo muestra.</summary>
    private void AplicarEscudo(bool valor)
    {
        _escudo = valor;
        EnviarAPagina(JsonSerializer.Serialize(new { tipo = "escudo", valor }));
        _salida.EscudoCambiado(valor);
    }

    /// <summary>Normal, barra compacta flotante (siempre visible, no se pierde) o área de trabajo completa.</summary>
    private void AplicarModo(string modo)
    {
        if (modo != _modo)
        {
            if (_modo == "normal") _boundsNormal = Bounds;
            var origen = _boundsNormal ?? Bounds;
            _modo = modo; // antes de mover la ventana: así OnMove no guarda la posición de la barra compacta ni la maximizada
            switch (modo)
            {
                case "normal":
                    MinimumSize = MinimoNormal;
                    Bounds = origen;
                    AsegurarVisible();
                    break;
                case "compacto":
                    MinimumSize = Size.Empty;
                    ClientSize = ClienteCompacto;
                    Location = new Point(origen.Right - Width, origen.Top); // se encoge hacia su esquina superior derecha
                    AsegurarVisible();
                    break;
                case "maximizado":
                    MinimumSize = MinimoNormal;
                    Bounds = Screen.FromControl(this).WorkingArea;
                    break;
            }
            EnviarAPagina(JsonSerializer.Serialize(new { tipo = "modo", valor = modo }));
        }
        _salida.ModoCambiado(modo);
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

    // Lo que hace el presentador dentro de la página: clic en un bloque, en el ojo (escudo) o en los botones de tamaño
    private void AlRecibirMensajeDeLaPagina(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var raiz = doc.RootElement;
            if (raiz.ValueKind != JsonValueKind.Object || !raiz.TryGetProperty("tipo", out var tipo)) return;
            switch (tipo.GetString())
            {
                case "seleccionar" when raiz.TryGetProperty("indice", out var i) && i.TryGetInt32(out var indice) && indice >= 0:
                    _salida.BloqueSeleccionado(indice);
                    break;
                case "escudo" when raiz.TryGetProperty("valor", out var v) && (v.ValueKind == JsonValueKind.True || v.ValueKind == JsonValueKind.False):
                    AplicarEscudo(v.GetBoolean());
                    break;
                case "modo" when raiz.TryGetProperty("valor", out var m) && m.ValueKind == JsonValueKind.String
                                 && m.GetString() is "normal" or "compacto" or "maximizado":
                    AplicarModo(m.GetString()!);
                    break;
            }
        }
        catch (JsonException) { /* mensaje que no es nuestro: se ignora */ }
    }
}
