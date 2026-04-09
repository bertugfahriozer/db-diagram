import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../db/DatabaseManager';
import type { SnapshotManager } from '../managers/SnapshotManager';
import type { ConnectionsProvider } from '../providers/ConnectionsProvider';
import type { SchemaSnapshot, AddColumnOptions, AddTableOptions, AddRelationshipOptions } from '../db/types';
import { diffSchemas, diffSummary } from '../managers/SchemaDiffManager';
import { generateSQL, generatePrisma, generateTypeORM } from '../managers/MigrationManager';

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

    // ── FIX 1: Load HTML from media file (correctly resolves {{N}} nonce) ──
    const mediaDir = vscode.Uri.joinPath(ctx.extensionUri, 'media');
    const htmlPath = path.join(ctx.extensionPath, 'media', 'diagram.html');
    const nonce = this._nonce();
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace(/\{\{N\}\}/g, nonce);
    panel.webview.html = html;

    // ── FIX 2: onDidDispose must NOT call panel.dispose() (it's already disposing) ──
    panel.onDidDispose(() => { DiagramPanel.current = undefined; });

    panel.webview.onDidReceiveMessage((m: Record<string, unknown>) => this._handle(m));
  }

  static createOrShow(
    ctx: vscode.ExtensionContext,
    db: DatabaseManager,
    snaps: SnapshotManager,
    tree: ConnectionsProvider
  ): void {
    if (DiagramPanel.current) {
      DiagramPanel.current._panel.reveal();
      DiagramPanel.current._refresh();
      return;
    }

    // ── FIX 3: Add media to localResourceRoots so webview can access it ──
    const mediaUri = vscode.Uri.joinPath(ctx.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      'dbDiagram',
      `DB Diagram — ${db.getDatabase()}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [ctx.extensionUri, mediaUri],
      }
    );

    DiagramPanel.current = new DiagramPanel(panel, ctx, db, snaps, tree);
    // ── FIX 4: No setTimeout hack — webview sends 'ready' when JS is loaded ──
    // _refresh() is triggered by the 'ready' message from webview
  }

  public dispose(): void {
    DiagramPanel.current = undefined;
    this._panel.dispose();
  }

  private async _handle(m: Record<string, unknown>): Promise<void> {
    const t = m.type as string;
    try {
      if (t === 'ready' || t === 'refresh') { await this._refresh(); return; }
      if (t === 'saveLayout') { this._layout = m.layout as Record<string, { x: number; y: number }>; return; }
      if (t === 'saveCollapsed') { this._collapsed = m.collapsed as string[]; return; }
      if (t === 'saveNotes') { this._notes = m.notes as Record<string, string>; return; }

      if (t === 'addTable') {
        await this.db.addTable(m.data as AddTableOptions);
        await this._refresh();
        this._ok('Tablo oluşturuldu.');
      } else if (t === 'addColumn') {
        await this.db.addColumn(m.data as AddColumnOptions);
        await this._refresh();
        this._ok('Kolon eklendi.');
      } else if (t === 'addRelationship') {
        await this.db.addRelationship(m.data as AddRelationshipOptions);
        await this._refresh();
        this._ok('İlişki oluşturuldu.');
      } else if (t === 'dropTable') {
        const d = m.data as { name: string };
        const ok = await vscode.window.showWarningMessage(
          `\`${d.name}\` silinsin mi? Bu işlem geri alınamaz.`, { modal: true }, 'Sil'
        );
        if (ok === 'Sil') { await this.db.dropTable(d.name); await this._refresh(); }
      } else if (t === 'dropColumn') {
        const d = m.data as { table: string; column: string };
        const ok = await vscode.window.showWarningMessage(
          `\`${d.column}\` kolonu silinsin mi?`, { modal: true }, 'Sil'
        );
        if (ok === 'Sil') { await this.db.dropColumn(d.table, d.column); await this._refresh(); }
      } else if (t === 'dropRelationship') {
        const d = m.data as { table: string; constraintName: string };
        await this.db.dropRelationship(d.table, d.constraintName);
        await this._refresh();
      } else if (t === 'executeRaw') {
        await this.db.executeRaw((m.data as { sql: string }).sql);
        await this._refresh();
        this._ok('SQL çalıştırıldı.');

      // ── Snapshots ──────────────────────────────────────────────────────
      } else if (t === 'saveSnapshot') {
        const schema = await this.db.getSchema();
        const snap = await this.snaps.save(schema, m.label as string);
        this._ok(`Snapshot "${snap.label}" kaydedildi.`);
        await this._sendSnaps();
      } else if (t === 'listSnapshots') {
        await this._sendSnaps();
      } else if (t === 'loadSnapshot') {
        const snap = await this.snaps.get(this.db.getDatabase(), m.id as string);
        if (snap) {
          this._send({ type: 'schema', data: snap.schema, layout: {}, collapsed: [], notes: this._notes });
          this._ok('Snapshot yüklendi (salt-okunur görünüm).');
        }
      } else if (t === 'deleteSnapshot') {
        await this.snaps.delete(this.db.getDatabase(), m.id as string);
        await this._sendSnaps();

      // ── Schema Diff ────────────────────────────────────────────────────
      } else if (t === 'diffWithSnapshot') {
        const snap = await this.snaps.get(this.db.getDatabase(), m.id as string);
        if (!snap) { this._err('Snapshot bulunamadı.'); return; }
        const current = await this.db.getSchema();
        const diff = diffSchemas(snap.schema, current);
        this._send({ type: 'diffResult', diff, summary: diffSummary(diff) });

      // ── Migration Export ───────────────────────────────────────────────
      } else if (t === 'exportMigration') {
        const d = m as { format: string; fromId: string };
        const current = await this.db.getSchema();
        let code = '';
        if (d.format === 'prisma') {
          code = generatePrisma(current);
        } else if (d.format === 'typeorm') {
          code = generateTypeORM(current);
        } else {
          const snap = d.fromId ? await this.snaps.get(this.db.getDatabase(), d.fromId) : null;
          const before: SchemaSnapshot = snap?.schema ?? { database: '', tables: [], relationships: [] };
          code = generateSQL(diffSchemas(before, current), current);
        }
        this._send({ type: 'migrationCode', code });

      // ── Query Builder ──────────────────────────────────────────────────
      } else if (t === 'executeQuery') {
        const sql = m.sql as string;
        try {
          // ── FIX 5: Use typed query() for clean row result (no mysql [rows,fields] tuple) ──
          const rows = await this.db.query(sql);
          this._send({ type: 'queryResult', rows });
        } catch (e: unknown) {
          this._send({ type: 'queryError', message: e instanceof Error ? e.message : String(e) });
        }
      }

    } catch (e: unknown) {
      this._err(e instanceof Error ? e.message : String(e));
    }
  }

  private async _refresh(): Promise<void> {
    try {
      if (!this.db.isConnected()) {
        this._err('Veritabanına bağlı değil.');
        return;
      }
      const schema = await this.db.getSchema();
      this._send({
        type: 'schema',
        data: schema,
        layout: this._layout,
        collapsed: this._collapsed,
        notes: this._notes,
        dbType: this.db.getDBType(),
      });
    } catch (e: unknown) {
      this._err('Şema yüklenemedi: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  private async _sendSnaps(): Promise<void> {
    const list = await this.snaps.list(this.db.getDatabase());
    this._send({
      type: 'snapshotList',
      snapshots: list.map(s => ({ id: s.id, label: s.label, capturedAt: s.capturedAt })),
    });
  }

  private _send(msg: object): void { this._panel.webview.postMessage(msg); }
  private _ok(msg: string): void { this._send({ type: 'success', message: msg }); }
  private _err(msg: string): void { this._send({ type: 'error', message: msg }); }

  private _nonce(): string {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => c[Math.floor(Math.random() * c.length)]).join('');
  }
}
