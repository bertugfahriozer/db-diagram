import type { SchemaSnapshot, SchemaDiff } from '../db/types';

export function diffSchemas(before: SchemaSnapshot, after: SchemaSnapshot): SchemaDiff {
  const bTbls = new Set(before.tables.map(t => t.name));
  const aTbls = new Set(after.tables.map(t => t.name));

  const addedTables = [...aTbls].filter(n => !bTbls.has(n));
  const removedTables = [...bTbls].filter(n => !aTbls.has(n));

  const modifiedTables: SchemaDiff['modifiedTables'] = [];
  for (const name of [...aTbls].filter(n => bTbls.has(n))) {
    const bt = before.tables.find(t => t.name === name)!;
    const at = after.tables.find(t => t.name === name)!;
    const bc = new Set(bt.columns.map(c => c.name));
    const ac = new Set(at.columns.map(c => c.name));
    const bi = new Set(bt.indexes.map(i => i.name));
    const ai = new Set(at.indexes.map(i => i.name));
    const addedColumns = [...ac].filter(c => !bc.has(c));
    const removedColumns = [...bc].filter(c => !ac.has(c));
    const addedIndexes = [...ai].filter(i => !bi.has(i));
    const removedIndexes = [...bi].filter(i => !ai.has(i));
    if (addedColumns.length || removedColumns.length || addedIndexes.length || removedIndexes.length) {
      modifiedTables.push({ name, addedColumns, removedColumns, addedIndexes, removedIndexes });
    }
  }

  const bRels = new Set(before.relationships.map(r => r.constraintName));
  const aRels = new Set(after.relationships.map(r => r.constraintName));
  return {
    addedTables, removedTables, modifiedTables,
    addedRelationships: [...aRels].filter(r => !bRels.has(r)),
    removedRelationships: [...bRels].filter(r => !aRels.has(r)),
  };
}

export function diffSummary(diff: SchemaDiff): string {
  const parts: string[] = [];
  if (diff.addedTables.length) parts.push(`+${diff.addedTables.length} tablo`);
  if (diff.removedTables.length) parts.push(`-${diff.removedTables.length} tablo`);
  if (diff.modifiedTables.length) parts.push(`~${diff.modifiedTables.length} değişen`);
  if (diff.addedRelationships.length) parts.push(`+${diff.addedRelationships.length} ilişki`);
  if (diff.removedRelationships.length) parts.push(`-${diff.removedRelationships.length} ilişki`);
  return parts.length ? parts.join(', ') : 'Değişiklik yok';
}
