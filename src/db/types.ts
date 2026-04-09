export type DBType = 'mysql' | 'postgresql';

export interface ConnectionConfig {
  id: string;
  name: string;
  type: DBType;
  host: string;
  port: number;
  user: string;
  database: string;
}

export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  isUnique: boolean;
  comment: string;
}

export interface IndexDef {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
  indexType: string;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  indexes: IndexDef[];
  comment: string;
  rowCount: number;
}

export interface RelationshipDef {
  constraintName: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface SchemaSnapshot {
  database: string;
  tables: TableDef[];
  relationships: RelationshipDef[];
}

export interface SchemaDiff {
  addedTables: string[];
  removedTables: string[];
  modifiedTables: {
    name: string;
    addedColumns: string[];
    removedColumns: string[];
    addedIndexes: string[];
    removedIndexes: string[];
  }[];
  addedRelationships: string[];
  removedRelationships: string[];
}

export interface AddColumnOptions {
  table: string; name: string; type: string; nullable: boolean;
  defaultValue?: string; afterColumn?: string; comment?: string;
}

export interface AddTableOptions {
  name: string;
  columns: { name: string; type: string; nullable: boolean; isPrimaryKey: boolean; isAutoIncrement: boolean }[];
  comment?: string;
}

export interface AddRelationshipOptions {
  constraintName: string; fromTable: string; fromColumn: string;
  toTable: string; toColumn: string; onDelete: string; onUpdate: string;
}
