import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../db/DatabaseManager';
import type { SnapshotManager } from '../managers/SnapshotManager';
import type { ConnectionsProvider } from '../providers/ConnectionsProvider';
import type { SchemaSnapshot, AddColumnOptions, AddTableOptions, AddRelationshipOptions } from '../db/types';
import { diffSchemas, diffSummary } from '../managers/SchemaDiffManager';
import { generateSQL, generatePrisma, generateTypeORM } from '../managers/MigrationManager';

const outputChannel = vscode.window.createOutputChannel('DB Diagram');

export class DiagramPanel {
  public static current: DiagramPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _layout: Record<string, { x: number; y: number }> = {};
  private _collapsed: string[] = [];
  private _notes: Record<string, string> = {};

  private constructor(
    panel: vscode.WebviewPanel,
    private ctx: vscode.ExtensionContext,
    private db: DatabaseManager,
    private snaps: SnapshotManager,
    private tree: ConnectionsProvider
  ) {
    this._panel = panel;
    const htmlPath = path.join(ctx.extensionPath, 'media', 'diagram.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace(/{{N}}/g, this._nonce());
    panel.webview.html = html;
    panel.onDidDispose(() => { DiagramPanel.current = undefined; panel.dispose(); });
    panel.webview.onDidReceiveMessage((m: Record<string, unknown>) => this._handle(m));
  }

  static createOrShow(ctx: vscode.ExtensionContext, db: DatabaseManager, snaps: SnapshotManager, tree: ConnectionsProvider): void {
    if (DiagramPanel.current) { DiagramPanel.current._panel.reveal(); DiagramPanel.current._refresh(); return; }
    const panel = vscode.window.createWebviewPanel('dbDiagram', `DB Diagram — ${db.getDatabase()}`,
      vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    DiagramPanel.current = new DiagramPanel(panel, ctx, db, snaps, tree);
    setTimeout(() => {
      if (DiagramPanel.current) {
        DiagramPanel.current._refresh();
      }
    }, 500);
  }

  private async _handle(m: Record<string, unknown>): Promise<void> {
    const t = m.type as string;
    try {
      if (t === 'ready' || t === 'refresh') { await this._refresh(); return; }
      if (t === 'saveLayout') { this._layout = m.layout as Record<string, { x: number; y: number }>; return; }
      if (t === 'saveCollapsed') { this._collapsed = (m.collapsed as string[]); return; }
      if (t === 'saveNotes') { this._notes = m.notes as Record<string, string>; return; }

      if (t === 'addTable') { await this.db.addTable(m.data as AddTableOptions); await this._refresh(); this._ok('Table created.'); }
      else if (t === 'addColumn') { await this.db.addColumn(m.data as AddColumnOptions); await this._refresh(); this._ok('Column added.'); }
      else if (t === 'addRelationship') { await this.db.addRelationship(m.data as AddRelationshipOptions); await this._refresh(); this._ok('Relation created.'); }
      else if (t === 'dropTable') {
        const ok = await vscode.window.showWarningMessage(`Delete \`${(m.data as { name: string }).name}\`?`, { modal: true }, 'Delete');
        if (ok === 'Delete') { await this.db.dropTable((m.data as { name: string }).name); await this._refresh(); }
      }
      else if (t === 'dropColumn') {
        const d = m.data as { table: string; column: string };
        const ok = await vscode.window.showWarningMessage(`Delete \`${d.column}\`?`, { modal: true }, 'Delete');
        if (ok === 'Delete') { await this.db.dropColumn(d.table, d.column); await this._refresh(); }
      }
      else if (t === 'dropRelationship') {
        const d = m.data as { table: string; constraintName: string };
        await this.db.dropRelationship(d.table, d.constraintName); await this._refresh();
      }
      else if (t === 'executeRaw') { await this.db.executeRaw((m.data as { sql: string }).sql); await this._refresh(); this._ok('SQL executed.'); }

      else if (t === 'saveSnapshot') {
        const schema = await this.db.getSchema();
        const snap = await this.snaps.save(schema, m.label as string);
        this._ok(`Snapshot "${snap.label}" saved.`);
        this._sendSnaps();
      }
      else if (t === 'listSnapshots') { this._sendSnaps(); }
      else if (t === 'loadSnapshot') {
        const snap = await this.snaps.get(this.db.getDatabase(), m.id as string);
        if (snap) { this._panel.webview.postMessage({ type: 'schema', data: snap.schema, layout: {}, collapsed: [], notes: this._notes }); this._ok('Snapshot loaded (read-only).'); }
      }
      else if (t === 'deleteSnapshot') {
        await this.snaps.delete(this.db.getDatabase(), m.id as string);
        this._sendSnaps();
      }

      else if (t === 'diffWithSnapshot') {
        const snap = await this.snaps.get(this.db.getDatabase(), m.id as string);
        if (!snap) { this._err('Snapshot not found.'); return; }
        const current = await this.db.getSchema();
        const diff = diffSchemas(snap.schema, current);
        this._panel.webview.postMessage({ type: 'diffResult', diff, summary: diffSummary(diff) });
      }

      else if (t === 'exportMigration') {
        const d = m as { format: string; fromId: string };
        const current = await this.db.getSchema();
        let code = '';
        if (d.format === 'prisma') code = generatePrisma(current);
        else if (d.format === 'typeorm') code = generateTypeORM(current);
        else {
          const snap = d.fromId ? await this.snaps.get(this.db.getDatabase(), d.fromId) : null;
          const before = snap?.schema ?? { database: '', tables: [], relationships: [] };
          const diff = diffSchemas(before, current);
          code = generateSQL(diff, current);
        }
        this._panel.webview.postMessage({ type: 'migrationCode', code });
      }

      else if (t === 'executeQuery') {
        const sql = m.sql as string;
        try {
          const rows = await this.db.executeRaw(sql) as unknown[];
          const data = Array.isArray(rows) ? rows[0] : rows;
          this._panel.webview.postMessage({ type: 'queryResult', rows: Array.isArray(data) ? data : [data] });
        } catch (e: unknown) {
          this._panel.webview.postMessage({ type: 'queryError', message: e instanceof Error ? e.message : String(e) });
        }
      }

    } catch (e: unknown) { this._err(e instanceof Error ? e.message : String(e)); }
  }

  private async _refresh(): Promise<void> {
    try {
      outputChannel.appendLine('[_refresh] Starting...');
      if (!this.db.isConnected()) {
        outputChannel.appendLine('[_refresh] NOT CONNECTED');
        this._err('Not connected to database. Please connect first.');
        return;
      }
      outputChannel.appendLine('[_refresh] Connected, fetching schema...');
      const schema = await this.db.getSchema();
      outputChannel.appendLine(`[_refresh] Schema: ${schema.tables.length} tables, ${schema.relationships.length} relationships`);
      if (schema.tables.length > 0) {
        outputChannel.appendLine(`[_refresh] First table: ${schema.tables[0].name} (${schema.tables[0].columns.length} columns)`);
      }
      this._panel.webview.postMessage({ type: 'schema', data: schema, layout: this._layout, collapsed: this._collapsed, notes: this._notes, dbType: this.db.getDBType() });
      outputChannel.appendLine('[_refresh] Message sent to webview');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      outputChannel.appendLine(`[_refresh] ERROR: ${msg}`);
      this._err('Failed to load schema: ' + msg);
    }
  }

  private async _sendSnaps(): Promise<void> {
    const list = await this.snaps.list(this.db.getDatabase());
    this._panel.webview.postMessage({ type: 'snapshotList', snapshots: list.map(s => ({ id: s.id, label: s.label, capturedAt: s.capturedAt })) });
  }

  private _ok(msg: string): void { this._panel.webview.postMessage({ type: 'success', message: msg }); }
  private _err(msg: string): void { this._panel.webview.postMessage({ type: 'error', message: msg }); }
  public dispose(): void { DiagramPanel.current = undefined; this._panel.dispose(); }
  private _nonce(): string {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => c[Math.floor(Math.random() * c.length)]).join('');
  }
}
