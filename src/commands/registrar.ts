// Responsabilidad: registrar los comandos «ghostCode.*» y conectarlos con el controlador.
import * as vscode from 'vscode';
import { Controlador } from '../controlador';
import { Nodo } from '../views/guiasTree';

export function registrarComandos(contexto: vscode.ExtensionContext, c: Controlador): void {
  const registrar = (nombre: string, manejador: (...args: any[]) => unknown) =>
    contexto.subscriptions.push(vscode.commands.registerCommand(`ghostCode.${nombre}`, manejador));

  // Desde el botón de la pestaña o el Explorador llega el archivo; desde la paleta, nada (se usa el editor activo)
  registrar('ghostMode', (uri?: vscode.Uri) => c.modoFantasma(uri));
  registrar('toggleVisor', () => c.alternarVisor());
  registrar('toggleSiempreAlFrente', () => c.alternarSiempreAlFrente());
  registrar('loadGuide', (uri?: vscode.Uri) => c.cargarDesdeUri(uri));
  registrar('useActiveFileAsGuide', () => c.usarArchivoActual());
  registrar('nextBlock', () => c.siguiente());
  registrar('typeNextBlock', () => c.teclear());
  registrar('prevBlock', () => c.retroceder());
  registrar('cancelTyping', () => c.cancelarTecleo());
  registrar('selectBlock', (guiaId: string, indice: number) => c.seleccionarBloque(guiaId, indice));
  // Desde el árbol llega el nodo; desde la paleta, nada (se usa la guía activa)
  registrar('activateGuide', (nodo?: Nodo) => c.activar(nodo?.id));
  registrar('removeGuide', (nodo?: Nodo) => c.quitar(nodo?.id));
  registrar('resetGuide', () => c.reiniciar());
  registrar('showOutput', () => c.log.show());
}
