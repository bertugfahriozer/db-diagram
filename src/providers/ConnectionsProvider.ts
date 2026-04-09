import * as vscode from 'vscode';
import type { ConnectionConfig, DBType } from '../db/types';

const KEY = 'dbdiagram.connections';

export class ConnectionsProvider implements vscode.TreeDataProvider<ConnItem> {
  private _change = new vscode.EventEmitter<ConnItem | undefined>();
  readonly onDidChangeTreeData = this._change.event;

  constructor(private ctx: vscode.ExtensionContext) {}

  refresh(): void { this._change.fire(undefined); }
  getTreeItem(e: ConnItem): vscode.TreeItem { return e; }

  async getChildren(): Promise<ConnItem[]> {
    const list = await this.list();
    return list.map(c => new ConnItem(c));
  }

  async list(): Promise<ConnectionConfig[]> {
    return this.ctx.globalState.get<ConnectionConfig[]>(KEY) ?? [];
  }

  async save(cfg: ConnectionConfig, password: string): Promise<void> {
    const list = await this.list();
    const idx = list.findIndex(c => c.id === cfg.id);
    if (idx >= 0) list[idx] = cfg; else list.push(cfg);
    await this.ctx.globalState.update(KEY, list);
    await this.ctx.secrets.store(`dbdiagram.pw.${cfg.id}`, password);
    this.refresh();
  }

  async getPassword(id: string): Promise<string> {
    return (await this.ctx.secrets.get(`dbdiagram.pw.${id}`)) ?? '';
  }

  async delete(id: string): Promise<void> {
    await this.ctx.globalState.update(KEY, (await this.list()).filter(c => c.id !== id));
    await this.ctx.secrets.delete(`dbdiagram.pw.${id}`);
    this.refresh();
  }
}

export class ConnItem extends vscode.TreeItem {
  constructor(public readonly cfg: ConnectionConfig) {
    super(cfg.name || `${cfg.database}@${cfg.host}`, vscode.TreeItemCollapsibleState.None);
    const emoji = cfg.type === 'postgresql' ? '🐘' : '🐬';
    this.description = `${emoji} ${cfg.host}:${cfg.port}/${cfg.database}`;
    this.iconPath = new vscode.ThemeIcon('database');
    this.contextValue = 'dbConnection';
    this.tooltip = `${cfg.type.toUpperCase()} — ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`;
    this.command = { command: 'dbDiagram.connectSaved', title: 'Connect', arguments: [cfg.id] };
  }
}
