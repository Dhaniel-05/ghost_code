// Responsabilidad: poner en marcha y apagar la extensión (une el controlador, los comandos y las vistas).
import * as vscode from 'vscode';
import { registrarComandos } from './commands/registrar';
import { Controlador } from './controlador';
import { Dependencias } from './dependencias';
import { BarraEstado } from './views/statusBar';
import { GuiasTree } from './views/guiasTree';

let controlador: Controlador | undefined;

/** Si el arranque falla, el motivo exacto sale en un mensaje y en el canal «Ghost Code» (no deja los botones sin respuesta). */
export async function arrancar(contexto: vscode.ExtensionContext, deps: Dependencias = {}): Promise<void> {
  const log = vscode.window.createOutputChannel('Ghost Code');
  contexto.subscriptions.push(log);
  const version = (contexto.extension.packageJSON as { version?: string }).version;
  log.appendLine(`Iniciando Ghost Code v${version} en ${vscode.env.appName} ${vscode.version}`);
  try {
    const c = new Controlador(contexto, deps, log);
    contexto.subscriptions.push(c);
    registrarComandos(contexto, c);
    const arbol = new GuiasTree(c);
    contexto.subscriptions.push(arbol, vscode.window.createTreeView('ghostCode.guias', { treeDataProvider: arbol, showCollapseAll: true }), new BarraEstado(c));
    await c.iniciar();
    controlador = c;
    log.appendLine('Extensión iniciada correctamente.');
  } catch (e) {
    const err = e as Error;
    log.appendLine(`ERROR al iniciar: ${err?.stack || err?.message || String(e)}`);
    void vscode.window.showErrorMessage(`Ghost Code no pudo iniciar: ${err?.message || String(e)}`, 'Ver detalles').then((p) => p && log.show());
    throw e;
  }
}

/** Cierra el visor y cancela lo pendiente; se puede llamar varias veces y sin haber activado. */
export async function desactivar(): Promise<void> {
  const c = controlador;
  controlador = undefined;
  if (c) await c.detener();
}
