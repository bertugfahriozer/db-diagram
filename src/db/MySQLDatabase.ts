import * as mysql from 'mysql2/promise';
import type { SchemaSnapshot, TableDef, ColumnDef, IndexDef, RelationshipDef, AddColumnOptions, AddTableOptions, AddRelationshipOptions } from './types';

export class MySQLDatabase {
  readonly dbType = 'mysql' as const;
  private conn: mysql.Connection | null = null;
  private dbName = '';

  async connect(cfg: { host: string; port: number; user: string; password: string; database: string }): Promise<void> {
    if (this.conn) await this.disconnect();
    this.conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database });
    await this.conn.ping();
    this.dbName = cfg.database;
  }

  async disconnect(): Promise<void> { if (this.conn) { await this.conn.end(); this.conn = null; } }
  isConnected(): boolean { return this.conn !== null; }
  getDatabase(): string { return this.dbName; }

  async getSchema(): Promise<SchemaSnapshot> {
    try {
      const tables = await this.getTables();
      const relationships = await this.getRelationships();
      console.log(`[MySQL] getSchema: ${tables.length} tables, ${relationships.length} relationships`);
      return { database: this.dbName, tables, relationships };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[MySQL] getSchema error:', msg);
      throw new Error(`Şema okunamadı: ${msg}`);
    }
  }

  private async getTables(): Promise<TableDef[]> {
    const [rows] = await this.conn!.execute<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [this.dbName]
    );
    console.log(`[MySQL] getTables: ${rows.length} rows from information_schema`);
    const tables: TableDef[] = [];
    for (const r of rows) {
      const columns = await this.getColumns(r.TABLE_NAME);
      const indexes = await this.getIndexes(r.TABLE_NAME);
      tables.push({ name: r.TABLE_NAME, columns, indexes, comment: r.TABLE_COMMENT || '', rowCount: r.TABLE_ROWS || 0 });
    }
    return tables;
  }

  private async getColumns(table: string): Promise<ColumnDef[]> {
    const [rows] = await this.conn!.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [this.dbName, table]
    );
    return rows.map(r => ({
      name: r.COLUMN_NAME, type: r.COLUMN_TYPE,
      nullable: r.IS_NULLABLE === 'YES', defaultValue: r.COLUMN_DEFAULT,
      isPrimaryKey: r.COLUMN_KEY === 'PRI',
      isAutoIncrement: String(r.EXTRA).includes('auto_increment'),
      isUnique: r.COLUMN_KEY === 'UNI', comment: r.COLUMN_COMMENT || '',
    }));
  }

  private async getIndexes(table: string): Promise<IndexDef[]> {
    const [rows] = await this.conn!.execute<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, INDEX_TYPE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [this.dbName, table]
    );
    const map = new Map<string, IndexDef>();
    for (const r of rows) {
      if (!map.has(r.INDEX_NAME)) map.set(r.INDEX_NAME, { name: r.INDEX_NAME, columns: [], unique: r.NON_UNIQUE === 0, primary: r.INDEX_NAME === 'PRIMARY', indexType: r.INDEX_TYPE });
      map.get(r.INDEX_NAME)!.columns.push(r.COLUMN_NAME);
    }
    return [...map.values()];
  }

  private async getRelationships(): Promise<RelationshipDef[]> {
    const [rows] = await this.conn!.execute<mysql.RowDataPacket[]>(
      `SELECT kcu.CONSTRAINT_NAME, kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE, rc.UPDATE_RULE
       FROM information_schema.KEY_COLUMN_USAGE kcu
       JOIN information_schema.REFERENTIAL_CONSTRAINTS rc ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
       WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`, [this.dbName]
    );
    return rows.map(r => ({ constraintName: r.CONSTRAINT_NAME, fromTable: r.TABLE_NAME, fromColumn: r.COLUMN_NAME, toTable: r.REFERENCED_TABLE_NAME, toColumn: r.REFERENCED_COLUMN_NAME, onDelete: r.DELETE_RULE, onUpdate: r.UPDATE_RULE }));
  }

  async addTable(opts: AddTableOptions): Promise<void> {
    const cols = opts.columns.map(c => `\`${c.name}\` ${c.type}${c.isAutoIncrement ? ' AUTO_INCREMENT' : ''} ${c.nullable ? 'NULL' : 'NOT NULL'}`);
    const pks = opts.columns.filter(c => c.isPrimaryKey).map(c => `\`${c.name}\``);
    if (pks.length) cols.push(`PRIMARY KEY (${pks.join(', ')})`);
    const cmt = opts.comment ? ` COMMENT='${opts.comment.replace(/'/g, "\\'")}'` : '';
    await this.conn!.execute(`CREATE TABLE \`${opts.name}\` (\n  ${cols.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4${cmt}`);
  }

  async addColumn(opts: AddColumnOptions): Promise<void> {
    const nn = opts.nullable ? 'NULL' : 'NOT NULL';
    const def = opts.defaultValue ? `DEFAULT '${opts.defaultValue}'` : '';
    const after = opts.afterColumn ? `AFTER \`${opts.afterColumn}\`` : '';
    const cmt = opts.comment ? `COMMENT '${opts.comment}'` : '';
    await this.conn!.execute(`ALTER TABLE \`${opts.table}\` ADD COLUMN \`${opts.name}\` ${opts.type} ${nn} ${def} ${cmt} ${after}`.replace(/\s+/g, ' ').trim());
  }

  async addRelationship(opts: AddRelationshipOptions): Promise<void> {
    await this.conn!.execute(`ALTER TABLE \`${opts.fromTable}\` ADD CONSTRAINT \`${opts.constraintName}\` FOREIGN KEY (\`${opts.fromColumn}\`) REFERENCES \`${opts.toTable}\`(\`${opts.toColumn}\`) ON DELETE ${opts.onDelete} ON UPDATE ${opts.onUpdate}`);
  }

  async dropTable(name: string): Promise<void> { await this.conn!.execute(`DROP TABLE \`${name}\``); }
  async dropColumn(table: string, col: string): Promise<void> { await this.conn!.execute(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``); }
  async dropRelationship(table: string, name: string): Promise<void> { await this.conn!.execute(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``); }
  async renameTable(o: string, n: string): Promise<void> { await this.conn!.execute(`RENAME TABLE \`${o}\` TO \`${n}\``); }
  async executeRaw(sql: string): Promise<unknown> { return this.conn!.execute(sql); }
}
