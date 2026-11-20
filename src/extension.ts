// Responsabilidad: punto de entrada de la extensión (activate / deactivate); todo lo demás vive en arranque.ts.
import * as vscode from 'vscode';
import { arrancar, desactivar } from './arranque';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await arrancar(context);
}

/** VS Code espera esta promesa (unos segundos): así el visor se cierra siempre con la extensión. */
export function deactivate(): Promise<void> {
  return desactivar();
}
