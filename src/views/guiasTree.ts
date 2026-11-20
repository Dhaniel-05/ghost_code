// Responsabilidad: la vista «Guías» (árbol de guías, sus bloques y el progreso). Nunca muestra el código de los bloques.
import * as vscode from 'vscode';
import { Controlador } from '../controlador';

export type Nodo = { tipo: 'guia'; id: string } | { tipo: 'bloque'; id: string; indice: number };

export class GuiasTree implements vscode.TreeDataProvider<Nodo>, vscode.Disposable {
  private readonly cambio = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.cambio.event;
  private readonly suscripcion: vscode.Disposable;

  constructor(private readonly controlador: Controlador) {
    this.suscripcion = controlador.alCambiar(() => this.cambio.fire());
  }

  dispose(): void {
    this.suscripcion.dispose();
    this.cambio.dispose();
  }

  getChildren(nodo?: Nodo): Nodo[] {
    if (!nodo) return [...this.controlador.guias.keys()].map((id) => ({ tipo: 'guia', id }));
    const g = this.controlador.guias.get(nodo.id);
    if (!g || nodo.tipo !== 'guia') return [];
    return g.bloques.map((b) => ({ tipo: 'bloque', id: g.id, indice: b.indice }));
  }

  getTreeItem(nodo: Nodo): vscode.TreeItem {
    const g = this.controlador.guias.get(nodo.id);
    const discreto = this.controlador.vista().discreto;
    if (!g) return new vscode.TreeItem('(guía quitada)', vscode.TreeItemCollapsibleState.None);

    if (nodo.tipo === 'guia') {
      const posicion = [...this.controlador.guias.keys()].indexOf(g.id) + 1;
      const activa = this.controlador.guiaActiva()?.id === g.id;
      const estado = g.motor.estado();
      const item = new vscode.TreeItem(discreto ? `Guía ${posicion}` : g.nombre, activa ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${estado.insertados}/${estado.total}`;
      item.contextValue = activa ? 'guiaActiva' : 'guia';
      item.iconPath = new vscode.ThemeIcon(activa ? 'book' : 'circle-outline');
      if (!discreto) item.tooltip = g.ruta;
      return item;
    }

    const bloque = g.bloques.find((b) => b.indice === nodo.indice);
    const n = nodo.indice + 1;
    const item = new vscode.TreeItem(discreto || !bloque ? `Paso ${n}` : `${n}. ${bloque.titulo}`, vscode.TreeItemCollapsibleState.None);
    const e = g.motor.estado();
    if (nodo.indice < e.insertados) item.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    else if (nodo.indice === e.insertados) item.iconPath = new vscode.ThemeIcon('arrow-right');
    else item.iconPath = new vscode.ThemeIcon('circle-outline');
    item.contextValue = 'bloque';
    item.command = { command: 'ghostCode.selectBlock', title: 'Ver bloque en el visor', arguments: [g.id, nodo.indice] };
    return item;
  }
}
