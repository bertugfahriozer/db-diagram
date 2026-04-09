import * as vscode from 'vscode';
import { DatabaseManager } from './db/DatabaseManager';
import { ConnectionsProvider } from './providers/ConnectionsProvider';
import { SnapshotManager } from './managers/SnapshotManager';
import { ConnectionPanel } from './panels/ConnectionPanel';
import { DiagramPanel } from './panels/DiagramPanel';

export function activate(ctx: vscode.ExtensionContext): void {
  const db = new DatabaseManager();
  const snaps = new SnapshotManager(ctx);
  const tree = new ConnectionsProvider(ctx);

  // Sidebar tree view
  vscode.window.registerTreeDataProvider('dbDiagramConnections', tree);

  ctx.subscriptions.push(
    // Open connect form
    vscode.commands.registerCommand('dbDiagram.connect', () => {
      ConnectionPanel.show(ctx, db, tree, snaps);
    }),

    // Connect from saved connection in sidebar
    vscode.commands.registerCommand('dbDiagram.connectSaved', async (id: string) => {
      const cfg = (await tree.list()).find(c => c.id === id);
      if (!cfg) { vscode.window.showErrorMessage('Connection not found.'); return; }
      const password = await tree.getPassword(id);
      try {
        await db.connect({ ...cfg, password });
        DiagramPanel.createOrShow(ctx, db, snaps, tree);
      } catch (e: unknown) {
        vscode.window.showErrorMessage(`Connection error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),

    // Open diagram (if already connected)
    vscode.commands.registerCommand('dbDiagram.openDiagram', () => {
      if (!db.isConnected()) {
        ConnectionPanel.show(ctx, db, tree, snaps);
      } else {
        DiagramPanel.createOrShow(ctx, db, snaps, tree);
      }
    }),

    // Delete saved connection from sidebar
    vscode.commands.registerCommand('dbDiagram.deleteConnection', async (item) => {
      const id = item?.cfg?.id;
      if (!id) return;
      const ok = await vscode.window.showWarningMessage('Delete this connection?', { modal: true }, 'Delete');
      if (ok === 'Delete') await tree.delete(id);
    }),

    // Disconnect
    vscode.commands.registerCommand('dbDiagram.disconnect', async () => {
      await db.disconnect();
      DiagramPanel.current?.dispose();
      vscode.window.showInformationMessage('DB Diagram: Disconnected.');
    }),
  );
}

export function deactivate(): void {
  /* no-op — adapter disconnects when GC'd */
}
