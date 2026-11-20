// Responsabilidad: el indicador de la barra de estado ($(eye) / $(eye-closed)) con el progreso y el cambio rápido del visor.
import * as vscode from 'vscode';
import { Controlador } from '../controlador';

export class BarraEstado implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly suscripcion: vscode.Disposable;

  constructor(private readonly controlador: Controlador) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'ghostCode.toggleVisor';
    this.suscripcion = controlador.alCambiar(() => this.actualizar());
    this.actualizar();
  }

  actualizar(): void {
    const v = this.controlador.vista();
    const icono = v.tecleando ? '$(sync~spin)' : v.visorVisible ? '$(eye)' : '$(eye-closed)';
    this.item.text = `${icono} Ghost${v.progreso ? ` ${v.progreso}` : ''}`;
    this.item.tooltip = v.sinProteccion
      ? 'Ghost Code: este Windows no puede ocultar el visor de las capturas, así que no se mostrará.'
      : v.visorVisible
        ? 'Ghost Code: visor visible. Clic para ocultarlo.'
        : 'Ghost Code: visor oculto. Clic para mostrarlo.';
    this.item.backgroundColor = v.sinProteccion ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    if (v.mostrarBarra) this.item.show();
    else this.item.hide();
  }

  dispose(): void {
    this.suscripcion.dispose();
    this.item.dispose();
  }
}
