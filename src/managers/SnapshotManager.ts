import * as vscode from 'vscode';
import type { SchemaSnapshot } from '../db/types';

export interface Snapshot { id: string; label: string; capturedAt: string; schema: SchemaSnapshot; }

export class SnapshotManager {
  constructor(private ctx: vscode.ExtensionContext) {}

  private key(db: string): string { return `dbdiagram.snaps.${db}`; }

  async save(schema: SchemaSnapshot, label?: string): Promise<Snapshot> {
    const snap: Snapshot = { id: Date.now().toString(36), label: label || new Date().toLocaleString('tr-TR'), capturedAt: new Date().toISOString(), schema };
    const list = await this.list(schema.database);
    list.unshift(snap);
    await this.ctx.globalState.update(this.key(schema.database), list.slice(0, 50));
    return snap;
  }

  async list(database: string): Promise<Snapshot[]> {
    return this.ctx.globalState.get<Snapshot[]>(this.key(database)) ?? [];
  }

  async get(database: string, id: string): Promise<Snapshot | undefined> {
    return (await this.list(database)).find(s => s.id === id);
  }

  async delete(database: string, id: string): Promise<void> {
    await this.ctx.globalState.update(this.key(database), (await this.list(database)).filter(s => s.id !== id));
  }
}
