import { MySQLDatabase } from './MySQLDatabase';
import { PostgreSQLDatabase } from './PostgreSQLDatabase';
import type { SchemaSnapshot, AddColumnOptions, AddTableOptions, AddRelationshipOptions, DBType } from './types';

type Adapter = MySQLDatabase | PostgreSQLDatabase;

export class DatabaseManager {
  private adapter: Adapter | null = null;

  async connect(cfg: { type: DBType; host: string; port: number; user: string; password: string; database: string }): Promise<void> {
    if (this.adapter) await this.disconnect();
    this.adapter = cfg.type === 'postgresql' ? new PostgreSQLDatabase() : new MySQLDatabase();
    await this.adapter.connect(cfg);
  }

  async disconnect(): Promise<void> { await this.adapter?.disconnect(); this.adapter = null; }
  isConnected(): boolean { return this.adapter?.isConnected() ?? false; }
  getDatabase(): string { return this.adapter?.getDatabase() ?? ''; }
  getDBType(): DBType | null { return (this.adapter as Adapter | null)?.dbType ?? null; }

  async getSchema(): Promise<SchemaSnapshot> {
    if (!this.adapter) throw new Error('Veritabanına bağlı değil.');
    return this.adapter.getSchema();
  }

  async addTable(o: AddTableOptions): Promise<void> { return this.adapter!.addTable(o); }
  async addColumn(o: AddColumnOptions): Promise<void> { return this.adapter!.addColumn(o); }
  async addRelationship(o: AddRelationshipOptions): Promise<void> { return this.adapter!.addRelationship(o); }
  async dropTable(n: string): Promise<void> { return this.adapter!.dropTable(n); }
  async dropColumn(t: string, c: string): Promise<void> { return this.adapter!.dropColumn(t, c); }
  async dropRelationship(t: string, n: string): Promise<void> { return this.adapter!.dropRelationship(t, n); }
  async renameTable(o: string, n: string): Promise<void> { return this.adapter!.renameTable(o, n); }
  async executeRaw(sql: string): Promise<unknown> { return this.adapter!.executeRaw(sql); }
}
