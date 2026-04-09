import { Client } from 'pg';
import type { SchemaSnapshot, TableDef, ColumnDef, IndexDef, RelationshipDef, AddColumnOptions, AddTableOptions, AddRelationshipOptions } from './types';

export class PostgreSQLDatabase {
  readonly dbType = 'postgresql' as const;
  private client: Client | null = null;
  private dbName = '';

  async connect(cfg: { host: string; port: number; user: string; password: string; database: string }): Promise<void> {
    if (this.client) await this.disconnect();
    this.client = new Client({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, connectionTimeoutMillis: 8000 });
    await this.client.connect();
    this.dbName = cfg.database;
  }

  async disconnect(): Promise<void> { if (this.client) { await this.client.end(); this.client = null; } }
  isConnected(): boolean { return this.client !== null; }
  getDatabase(): string { return this.dbName; }

  async getSchema(): Promise<SchemaSnapshot> {
    const tables = await this.getTables();
    const relationships = await this.getRelationships();
    return { database: this.dbName, tables, relationships };
  }

  private async getTables(): Promise<TableDef[]> {
    const res = await this.client!.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
    const tables: TableDef[] = [];
    for (const r of res.rows) {
      const columns = await this.getColumns(r.tablename);
      const indexes = await this.getIndexes(r.tablename);
      const cntRes = await this.client!.query(`SELECT reltuples::bigint AS n FROM pg_class WHERE relname = $1`, [r.tablename]);
      tables.push({ name: r.tablename, columns, indexes, comment: '', rowCount: Number(cntRes.rows[0]?.n ?? 0) });
    }
    return tables;
  }

  private async getColumns(table: string): Promise<ColumnDef[]> {
    const res = await this.client!.query(
      `SELECT c.column_name, c.udt_name, c.character_maximum_length, c.numeric_precision, c.numeric_scale,
              c.is_nullable, c.column_default,
              EXISTS(SELECT 1 FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                     WHERE kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY') AS is_pk,
              c.column_default LIKE '%nextval%' AS is_serial,
              EXISTS(SELECT 1 FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                     WHERE kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'UNIQUE') AS is_unique
       FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = $1 ORDER BY c.ordinal_position`,
      [table]
    );
    return res.rows.map(r => {
      let type = r.udt_name;
      if (r.character_maximum_length) type += `(${r.character_maximum_length})`;
      else if (r.numeric_precision && r.numeric_scale) type += `(${r.numeric_precision},${r.numeric_scale})`;
      return { name: r.column_name, type, nullable: r.is_nullable === 'YES', defaultValue: r.column_default, isPrimaryKey: r.is_pk, isAutoIncrement: r.is_serial, isUnique: r.is_unique, comment: '' };
    });
  }

  private async getIndexes(table: string): Promise<IndexDef[]> {
    const res = await this.client!.query(
      `SELECT i.relname AS idx, a.attname AS col, ix.indisunique AS uniq, ix.indisprimary AS prim, am.amname AS tp
       FROM pg_class t JOIN pg_index ix ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_am am ON am.oid = i.relam JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       WHERE t.relname = $1 ORDER BY i.relname`, [table]
    );
    const map = new Map<string, IndexDef>();
    for (const r of res.rows) {
      if (!map.has(r.idx)) map.set(r.idx, { name: r.idx, columns: [], unique: r.uniq, primary: r.prim, indexType: r.tp.toUpperCase() });
      map.get(r.idx)!.columns.push(r.col);
    }
    return [...map.values()];
  }

  private async getRelationships(): Promise<RelationshipDef[]> {
    const res = await this.client!.query(
      `SELECT tc.constraint_name, kcu.table_name AS ft, kcu.column_name AS fc, ccu.table_name AS tt, ccu.column_name AS tc2, rc.delete_rule, rc.update_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
    );
    return res.rows.map(r => ({ constraintName: r.constraint_name, fromTable: r.ft, fromColumn: r.fc, toTable: r.tt, toColumn: r.tc2, onDelete: r.delete_rule, onUpdate: r.update_rule }));
  }

  async addTable(opts: AddTableOptions): Promise<void> {
    const cols = opts.columns.map(c => { const t = c.isAutoIncrement ? (c.type.toLowerCase().includes('big') ? 'BIGSERIAL' : 'SERIAL') : c.type; return `"${c.name}" ${t}${c.nullable ? '' : ' NOT NULL'}`; });
    const pks = opts.columns.filter(c => c.isPrimaryKey).map(c => `"${c.name}"`);
    if (pks.length) cols.push(`PRIMARY KEY (${pks.join(', ')})`);
    await this.client!.query(`CREATE TABLE "${opts.name}" (${cols.join(', ')})`);
    if (opts.comment) await this.client!.query(`COMMENT ON TABLE "${opts.name}" IS $1`, [opts.comment]);
  }

  async addColumn(opts: AddColumnOptions): Promise<void> {
    const nn = opts.nullable ? '' : 'NOT NULL';
    const def = opts.defaultValue ? `DEFAULT ${opts.defaultValue}` : '';
    await this.client!.query(`ALTER TABLE "${opts.table}" ADD COLUMN "${opts.name}" ${opts.type} ${nn} ${def}`.trim());
    if (opts.comment) await this.client!.query(`COMMENT ON COLUMN "${opts.table}"."${opts.name}" IS $1`, [opts.comment]);
  }

  async addRelationship(opts: AddRelationshipOptions): Promise<void> {
    await this.client!.query(`ALTER TABLE "${opts.fromTable}" ADD CONSTRAINT "${opts.constraintName}" FOREIGN KEY ("${opts.fromColumn}") REFERENCES "${opts.toTable}"("${opts.toColumn}") ON DELETE ${opts.onDelete} ON UPDATE ${opts.onUpdate}`);
  }

  async dropTable(name: string): Promise<void> { await this.client!.query(`DROP TABLE "${name}" CASCADE`); }
  async dropColumn(table: string, col: string): Promise<void> { await this.client!.query(`ALTER TABLE "${table}" DROP COLUMN "${col}"`); }
  async dropRelationship(table: string, name: string): Promise<void> { await this.client!.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`); }
  async renameTable(o: string, n: string): Promise<void> { await this.client!.query(`ALTER TABLE "${o}" RENAME TO "${n}"`); }
  async executeRaw(sql: string): Promise<unknown> { return this.client!.query(sql); }

  async query(sql: string): Promise<Record<string, unknown>[]> {
    const result = await this.client!.query(sql);
    return result.rows as Record<string, unknown>[];
  }
}
