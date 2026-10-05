import type { DictionaryEntry, MergeConflict, ReviewPackage } from '~/types/dictionary';

export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const ak = Object.keys(a as Record<string, unknown>).sort();
  const bk = Object.keys(b as Record<string, unknown>).sort();
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const scalarFields = ['headword', 'pronunciation', 'partOfSpeech', 'definition', 'notes'] as const;
const objectArrayFields = ['dialectVariants', 'examples', 'sources', 'reviewerComments'] as const;

export const fieldLabels: Record<string, string> = {
  headword: '词形', pronunciation: '发音', partOfSpeech: '词性', definition: '释义', notes: '编者备注',
  dialectVariants: '方言变体', examples: '例句', sources: '来源', reviewerComments: '审校意见', synonyms: '同义词'
};

const subfieldLabels: Record<string, string> = {
  dialect: '方言点', form: '词形', pronunciation: '读音', note: '使用说明',
  text: '原文', translation: '译文', source: '出处',
  title: '名称', citation: '引用信息', url: '链接',
  author: '作者', message: '内容'
};

export const subfieldLabel = (subfield?: string): string => (subfield ? (subfieldLabels[subfield] ?? subfield) : '');

let conflictSeq = 0;
const makeConflict = (
  entryId: string, field: string, fieldLabel: string,
  localValue: unknown, packageValue: unknown, baseValue: unknown,
  extra?: { itemId?: string; subfield?: string }
): MergeConflict => ({
  id: `conflict-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}-${conflictSeq++}`,
  entryId, field, fieldLabel, localValue, packageValue, baseValue, ...extra
});

export interface MergeResult {
  entries: DictionaryEntry[];
  conflicts: MergeConflict[];
  changedEntryIds: string[];
  stale: boolean;
}

/**
 * 三路合并：以审校包的 baseEntries 为共同祖先，对比工作区当前词条与包内词条。
 * - 仅一方改动：直接采纳
 * - 双方同字段改动且内容一致：直接采纳
 * - 双方同字段改动且不一致：保留双方版本，记录冲突供主审定夺
 * - 基础版本过期（baseRevision < 当前修订）：不自动交付，全部改动标记为待重新确认
 */
export function computeMerge(localEntries: DictionaryEntry[], pkg: ReviewPackage, currentRevision: number): MergeResult {
  const stale = pkg.baseRevision < currentRevision;
  const baseMap = new Map(pkg.baseEntries.map((e) => [e.id, e]));
  const merged = clone(localEntries);
  const conflicts: MergeConflict[] = [];
  const changedEntryIds = new Set<string>();

  for (const pkgEntry of pkg.entries) {
    const baseEntry = baseMap.get(pkgEntry.id);
    const localIndex = merged.findIndex((e) => e.id === pkgEntry.id);
    const localEntry = localIndex >= 0 ? merged[localIndex] : undefined;

    if (!baseEntry) {
      if (!localEntry) {
        if (!stale) { merged.push(clone(pkgEntry)); changedEntryIds.add(pkgEntry.id); }
        else conflicts.push(makeConflict(pkgEntry.id, '_new', '新增词条', null, pkgEntry, null));
      } else {
        conflicts.push(makeConflict(pkgEntry.id, '_collision', '词条ID冲突', localEntry, pkgEntry, null));
      }
    } else if (!localEntry) {
      conflicts.push(makeConflict(pkgEntry.id, '_deleted', '词条已删除', null, pkgEntry, baseEntry));
    } else {
      const entryConflicts = mergeEntry(localEntry, baseEntry, pkgEntry, stale);
      conflicts.push(...entryConflicts);
      changedEntryIds.add(pkgEntry.id);
    }
  }
  return { entries: merged, conflicts, changedEntryIds: [...changedEntryIds], stale };
}

function mergeEntry(local: DictionaryEntry, base: DictionaryEntry, pkg: DictionaryEntry, stale: boolean): MergeConflict[] {
  const conflicts: MergeConflict[] = [];
  for (const field of scalarFields) {
    const c = mergeScalar(local, base, pkg, field, stale);
    if (c) conflicts.push(c);
  }
  for (const field of objectArrayFields) {
    conflicts.push(...mergeObjectArray(local, base, pkg, field, stale));
  }
  const syn = mergeStringArray(local, base, pkg, 'synonyms', stale);
  if (syn) conflicts.push(syn);
  return conflicts;
}

function mergeScalar(local: DictionaryEntry, base: DictionaryEntry, pkg: DictionaryEntry, field: typeof scalarFields[number], stale: boolean): MergeConflict | null {
  const lv = local[field], bv = base[field], pv = pkg[field];
  const pkgChanged = !deepEqual(pv, bv);
  const localChanged = !deepEqual(lv, bv);
  if (!pkgChanged) return null;
  if (!localChanged) {
    if (!stale) local[field] = clone(pv);
    else return makeConflict(local.id, field, fieldLabels[field], lv, pv, bv);
    return null;
  }
  if (deepEqual(lv, pv)) return null;
  return makeConflict(local.id, field, fieldLabels[field], lv, pv, bv);
}

function mergeObjectArray(local: DictionaryEntry, base: DictionaryEntry, pkg: DictionaryEntry, field: typeof objectArrayFields[number], stale: boolean): MergeConflict[] {
  const conflicts: MergeConflict[] = [];
  const localArrays = local as unknown as Record<string, unknown[]>;
  const baseArrays = base as unknown as Record<string, unknown[]>;
  const pkgArrays = pkg as unknown as Record<string, unknown[]>;
  const baseMap = new Map(baseArrays[field].map((item) => [(item as { id: string }).id, item]));
  const pkgMap = new Map(pkgArrays[field].map((item) => [(item as { id: string }).id, item]));
  const localMap = new Map(localArrays[field].map((item) => [(item as { id: string }).id, item]));
  const result: unknown[] = [];
  const allIds = new Set([...baseMap.keys(), ...pkgMap.keys(), ...localMap.keys()]);

  for (const id of allIds) {
    const bItem = baseMap.get(id) as Record<string, unknown> | undefined;
    const pItem = pkgMap.get(id) as Record<string, unknown> | undefined;
    const lItem = localMap.get(id) as Record<string, unknown> | undefined;
    if (!bItem) {
      if (pItem && lItem) {
        if (deepEqual(pItem, lItem)) result.push(clone(lItem));
        else {
          result.push(clone(lItem));
          conflicts.push(makeConflict(local.id, field, fieldLabels[field], lItem, pItem, null, { itemId: id }));
        }
      } else if (pItem) {
        if (!stale) result.push(clone(pItem));
        else conflicts.push(makeConflict(local.id, field, fieldLabels[field], null, pItem, null, { itemId: id }));
      } else if (lItem) {
        result.push(clone(lItem));
      }
    } else if (!pItem) {
      if (lItem) {
        result.push(clone(lItem));
        conflicts.push(makeConflict(local.id, field, fieldLabels[field], lItem, null, bItem, { itemId: id }));
      }
    } else if (!lItem) {
      if (!stale) result.push(clone(pItem));
      else conflicts.push(makeConflict(local.id, field, fieldLabels[field], null, pItem, bItem, { itemId: id }));
    } else {
      const pChanged = !deepEqual(pItem, bItem);
      const lChanged = !deepEqual(lItem, bItem);
      if (!pChanged) result.push(clone(lItem));
      else if (!lChanged) {
        if (!stale) result.push(clone(pItem));
        else {
          result.push(clone(lItem));
          conflicts.push(makeConflict(local.id, field, fieldLabels[field], lItem, pItem, bItem, { itemId: id }));
        }
      } else if (deepEqual(pItem, lItem)) {
        result.push(clone(lItem));
      } else {
        const { item, conflicts: itemConflicts } = mergeObjectItem(local.id, field, lItem, bItem, pItem, stale);
        result.push(item);
        conflicts.push(...itemConflicts);
      }
    }
  }
  localArrays[field] = result;
  return conflicts;
}

function mergeObjectItem(entryId: string, field: string, lItem: Record<string, unknown>, bItem: Record<string, unknown>, pItem: Record<string, unknown>, stale: boolean): { item: Record<string, unknown>; conflicts: MergeConflict[] } {
  const item = clone(lItem);
  const conflicts: MergeConflict[] = [];
  const itemFields = Object.keys(lItem).filter((k) => k !== 'id');
  for (const f of itemFields) {
    const lv = lItem[f], bv = bItem[f], pv = pItem[f];
    const pChanged = !deepEqual(pv, bv);
    const lChanged = !deepEqual(lv, bv);
    if (!pChanged) continue;
    if (!lChanged) {
      if (!stale) item[f] = clone(pv);
      else conflicts.push(makeConflict(entryId, field, fieldLabels[field], lv, pv, bv, { itemId: lItem.id as string, subfield: f }));
      continue;
    }
    if (deepEqual(lv, pv)) continue;
    conflicts.push(makeConflict(entryId, field, fieldLabels[field], lv, pv, bv, { itemId: lItem.id as string, subfield: f }));
  }
  return { item, conflicts };
}

function mergeStringArray(local: DictionaryEntry, base: DictionaryEntry, pkg: DictionaryEntry, field: 'synonyms', stale: boolean): MergeConflict | null {
  const lv = local[field], bv = base[field], pv = pkg[field];
  const norm = (arr: string[]) => [...arr].sort();
  const pkgChanged = !deepEqual(norm(pv), norm(bv));
  const localChanged = !deepEqual(norm(lv), norm(bv));
  if (!pkgChanged) return null;
  if (!localChanged) {
    if (!stale) local[field] = clone(pv);
    else return makeConflict(local.id, field, fieldLabels[field], lv, pv, bv);
    return null;
  }
  if (deepEqual(norm(lv), norm(pv))) return null;
  const pkgAdded = pv.filter((s) => !bv.includes(s));
  const pkgRemoved = bv.filter((s) => !pv.includes(s));
  const localAdded = lv.filter((s) => !bv.includes(s));
  const localRemoved = bv.filter((s) => !lv.includes(s));
  const merged = [...new Set([...bv, ...pkgAdded, ...localAdded])].filter((s) => !(pkgRemoved.includes(s) && localRemoved.includes(s)));
  local[field] = merged;
  return makeConflict(local.id, field, fieldLabels[field], lv, pv, bv);
}

/** 按主审的定夺把冲突的一方写回词条 */
export function applyConflictResolution(entries: DictionaryEntry[], conflict: MergeConflict, side: 'local' | 'package', pkg: ReviewPackage): DictionaryEntry[] {
  const result = clone(entries);
  const entry = result.find((e) => e.id === conflict.entryId);
  if (!entry) return result;
  const value = side === 'package' ? conflict.packageValue : conflict.localValue;

  if (conflict.field === '_deleted') {
    if (side === 'package') {
      const pkgEntry = pkg.entries.find((e) => e.id === conflict.entryId);
      if (pkgEntry) {
        const idx = result.findIndex((e) => e.id === conflict.entryId);
        if (idx >= 0) result[idx] = clone(pkgEntry);
        else result.push(clone(pkgEntry));
      }
    }
    return result;
  }
  if (conflict.field === '_new') {
    if (side === 'package') {
      const pkgEntry = pkg.entries.find((e) => e.id === conflict.entryId);
      if (pkgEntry && !result.some((e) => e.id === pkgEntry.id)) result.push(clone(pkgEntry));
    }
    return result;
  }
  if (conflict.field === '_collision') {
    if (side === 'package') {
      const pkgEntry = pkg.entries.find((e) => e.id === conflict.entryId);
      const idx = result.findIndex((e) => e.id === conflict.entryId);
      if (pkgEntry && idx >= 0) result[idx] = clone(pkgEntry);
    }
    return result;
  }

  if (conflict.itemId) {
    const entryRecord = entry as unknown as Record<string, unknown>;
    const arr = entryRecord[conflict.field] as unknown[];
    const idx = arr.findIndex((item) => (item as { id: string }).id === conflict.itemId);
    if (conflict.subfield) {
      if (idx >= 0) (arr[idx] as Record<string, unknown>)[conflict.subfield] = clone(value);
    } else if (value === null || value === undefined) {
      if (idx >= 0) arr.splice(idx, 1);
    } else if (idx >= 0) {
      arr[idx] = clone(value);
    } else {
      arr.push(clone(value));
    }
    return result;
  }

  (entry as unknown as Record<string, unknown>)[conflict.field] = clone(value);
  return result;
}
