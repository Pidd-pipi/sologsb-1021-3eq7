import type {
  ActorRole,
  AuditRecord,
  DictionaryEntry,
  DictionarySnapshot,
  EntryStatus,
  FieldConflict,
  PackageImportRecord,
  PackagePlan,
  ReviewComment,
  ReviewPackage,
  ReviewReply,
  UserRole,
  VersionRecord
} from '~/types/dictionary';

export const LEGACY_BATCH_ID = 'batch-legacy-upgrade';
export const LOCAL_BATCH_ID = 'batch-local-workspace';

export const SCALAR_FIELDS = ['headword', 'pronunciation', 'partOfSpeech', 'definition', 'notes'] as const;
export const RECORD_ARRAY_FIELDS = ['dialectVariants', 'examples', 'sources'] as const;
export const CONTENT_FIELDS = [...SCALAR_FIELDS, 'dialectVariants', 'examples', 'sources', 'synonyms'] as const;
export const SEMANTIC_FIELDS = [...CONTENT_FIELDS, 'status', 'reviewerComments'] as const;

export const FIELD_LABELS: Record<string, string> = {
  headword: '词形',
  pronunciation: '发音',
  partOfSpeech: '词性',
  definition: '释义',
  notes: '备注',
  dialectVariants: '方言变体',
  examples: '例句',
  sources: '来源',
  synonyms: '同义词',
  reviewerComments: '审校意见',
  status: '状态',
  __deleted__: '词条删除'
};

const nowIso = () => new Date().toISOString();
const statuses: EntryStatus[] = ['draft', 'review', 'disputed', 'confirmed'];

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export const inferRole = (author = ''): ActorRole => {
  if (author.includes('主审') || author.includes('审校')) return 'reviewer';
  if (author.includes('编辑')) return 'editor';
  return 'unknown';
};

const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = '') => (typeof value === 'string' || typeof value === 'number' ? String(value) : fallback);
const shortHash = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  return hash.toString(36).padStart(8, '0').slice(-8);
};

export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const packageFingerprint = (value: unknown) => shortHash(stableStringify(value));

const normalizeStatus = (value: unknown): EntryStatus => {
  const candidate = text(value);
  return (statuses as string[]).includes(candidate) ? candidate as EntryStatus : 'draft';
};

const normalizeReply = (value: unknown, index = 0): ReviewReply => {
  const item = asObject(value);
  const author = text(item.author, '离线编辑');
  return {
    id: text(item.id, `reply-${index}-${shortHash(text(item.message))}`),
    author,
    role: (['editor', 'reviewer', 'unknown', 'system'].includes(text(item.role)) ? text(item.role) : inferRole(author)) as ActorRole,
    message: text(item.message),
    createdAt: text(item.createdAt, nowIso())
  };
};

const normalizeComment = (value: unknown, index = 0): ReviewComment => {
  const item = asObject(value);
  const author = text(item.author, '主审·和老师');
  return {
    id: text(item.id, `comment-${index}-${shortHash(text(item.message))}`),
    field: text(item.field, 'definition'),
    author,
    role: (['editor', 'reviewer', 'unknown', 'system'].includes(text(item.role)) ? text(item.role) : inferRole(author)) as ActorRole,
    message: text(item.message),
    status: text(item.status) === 'resolved' ? 'resolved' : 'open',
    createdAt: text(item.createdAt, nowIso()),
    replies: asArray(item.replies).map((reply, replyIndex) => normalizeReply(reply, replyIndex))
  };
};

const normalizeConflict = (value: unknown, batchId: string): FieldConflict => {
  const item = asObject(value);
  const status = text(item.status) === 'resolved' ? 'resolved' : 'open';
  return {
    id: text(item.id, `conflict-${shortHash(stableStringify(value))}`),
    field: text(item.field, 'definition'),
    scope: ['entry', 'field', 'item'].includes(text(item.scope)) ? text(item.scope) as FieldConflict['scope'] : 'field',
    localValue: item.localValue ?? '',
    incomingValue: item.incomingValue ?? '',
    localItemId: text(item.localItemId) || undefined,
    incomingItemId: text(item.incomingItemId) || undefined,
    batchId: text(item.batchId, batchId),
    status,
    resolution: item.resolution === 'local' || item.resolution === 'incoming' ? item.resolution : undefined,
    resolvedBy: text(item.resolvedBy) || undefined,
    resolvedAt: text(item.resolvedAt) || undefined
  };
};

export const normalizeEntry = (value: unknown, batchId = LEGACY_BATCH_ID): DictionaryEntry => {
  const item = asObject(value);
  const createdAt = text(item.createdAt, nowIso());
  return {
    id: text(item.id, `entry-${shortHash(stableStringify(value))}`),
    headword: text(item.headword, ''),
    pronunciation: text(item.pronunciation, ''),
    partOfSpeech: text(item.partOfSpeech, ''),
    definition: text(item.definition, ''),
    dialectVariants: asArray(item.dialectVariants).map((variant, index) => {
      const source = asObject(variant);
      return {
        id: text(source.id, `variant-${index}-${shortHash(text(source.form))}`),
        dialect: text(source.dialect),
        form: text(source.form),
        pronunciation: text(source.pronunciation),
        note: text(source.note)
      };
    }),
    examples: asArray(item.examples).map((example, index) => {
      const source = asObject(example);
      return {
        id: text(source.id, `example-${index}-${shortHash(text(source.text))}`),
        text: text(source.text),
        translation: text(source.translation),
        source: text(source.source)
      };
    }),
    sources: asArray(item.sources).map((sourceValue, index) => {
      const source = asObject(sourceValue);
      return {
        id: text(source.id, `source-${index}-${shortHash(text(source.title))}`),
        title: text(source.title),
        citation: text(source.citation),
        url: text(source.url)
      };
    }),
    synonyms: asArray(item.synonyms).map((synonym) => text(synonym)).filter(Boolean),
    status: normalizeStatus(item.status),
    notes: text(item.notes, ''),
    createdAt,
    updatedAt: text(item.updatedAt, createdAt),
    reviewerComments: asArray(item.reviewerComments).map((comment, index) => normalizeComment(comment, index)),
    batchId: text(item.batchId, batchId),
    requiresReconfirmation: Boolean(item.requiresReconfirmation),
    conflicts: asArray(item.conflicts).map((conflict) => normalizeConflict(conflict, batchId))
  };
};

const normalizeVersion = (value: unknown, batchId: string): VersionRecord => {
  const item = asObject(value);
  const actorName = text(item.actorName, text(item.action).includes('导入') ? '系统' : '历史用户');
  return {
    id: text(item.id, `version-${shortHash(stableStringify(value))}`),
    at: text(item.at, nowIso()),
    action: text(item.action, '历史操作'),
    detail: text(item.detail, ''),
    entryId: text(item.entryId) || undefined,
    batchId: text(item.batchId, batchId),
    actorName,
    actorRole: (['editor', 'reviewer', 'unknown', 'system'].includes(text(item.actorRole)) ? text(item.actorRole) : actorName === '系统' ? 'system' : inferRole(actorName)) as ActorRole,
    before: asArray(item.before).map((entry) => normalizeEntry(entry, batchId))
  };
};

const normalizeAudit = (value: unknown, batchId: string): AuditRecord => {
  const item = asObject(value);
  const actorName = text(item.actorName, text(item.action).includes('导入') ? '系统' : '历史用户');
  return {
    id: text(item.id, `audit-${shortHash(stableStringify(value))}`),
    at: text(item.at, nowIso()),
    action: text(item.action, '历史操作'),
    detail: text(item.detail, ''),
    entryIds: asArray(item.entryIds).map((id) => text(id)),
    batchId: text(item.batchId, batchId),
    actorName,
    actorRole: (['editor', 'reviewer', 'unknown', 'system'].includes(text(item.actorRole)) ? text(item.actorRole) : actorName === '系统' ? 'system' : inferRole(actorName)) as ActorRole
  };
};

const normalizeImportRecord = (value: unknown): PackageImportRecord => {
  const item = asObject(value);
  return {
    packageId: text(item.packageId),
    batchId: text(item.batchId, LEGACY_BATCH_ID),
    importedAt: text(item.importedAt, nowIso()),
    exporterName: text(item.exporterName, '离线编辑'),
    exporterRole: (['editor', 'reviewer', 'unknown', 'system'].includes(text(item.exporterRole)) ? text(item.exporterRole) : inferRole(text(item.exporterName))) as ActorRole,
    baseRevision: Number(item.baseRevision ?? 1) || 1,
    entryCount: Number(item.entryCount ?? 0) || 0
  };
};

export const normalizeSnapshot = (value: unknown): DictionarySnapshot => {
  const item = asObject(value);
  return {
    revision: Number(item.revision ?? 1) || 1,
    entries: asArray(item.entries).map((entry) => normalizeEntry(entry, LEGACY_BATCH_ID)),
    versions: asArray(item.versions).map((version) => normalizeVersion(version, LEGACY_BATCH_ID)),
    audit: asArray(item.audit).map((record) => normalizeAudit(record, LEGACY_BATCH_ID)),
    currentRole: item.currentRole === 'editor' || item.currentRole === 'reviewer' ? item.currentRole as UserRole : 'reviewer',
    importedPackages: asArray(item.importedPackages).map(normalizeImportRecord)
  };
};

const makeConflict = (part: Omit<FieldConflict, 'id' | 'status' | 'batchId'> & { batchId: string; id?: string }): FieldConflict => ({
  ...part,
  id: part.id || `conflict-${part.scope}-${part.field}-${part.localItemId ?? ''}-${part.incomingItemId ?? ''}-${shortHash(stableStringify([part.localValue, part.incomingValue]))}`,
  status: 'open',
  batchId: part.batchId
});

const semanticPick = (entry: DictionaryEntry | null | undefined, fields: readonly string[] = SEMANTIC_FIELDS) => {
  if (!entry) return null;
  return Object.fromEntries(fields.map((field) => [field, (entry as unknown as Record<string, unknown>)[field]]));
};

const entryContentSignature = (entry: DictionaryEntry | null | undefined) => stableStringify(semanticPick(entry, CONTENT_FIELDS));
const entrySemanticSignature = (entry: DictionaryEntry | null | undefined) => stableStringify(semanticPick(entry, SEMANTIC_FIELDS));
const commentSignature = (comment: ReviewComment) => stableStringify({ field: comment.field, author: comment.author, message: comment.message, status: comment.status, replies: comment.replies });

const incomingCopyId = (id: string, batchId: string) => `${id}--incoming-${shortHash(batchId)}`;

function mergeScalarFields(local: DictionaryEntry, base: DictionaryEntry | null, incoming: DictionaryEntry, batchId: string) {
  const conflicts: FieldConflict[] = [];
  SCALAR_FIELDS.forEach((field) => {
    const localValue = local[field];
    const incomingValue = incoming[field];
    const baseValue = base?.[field];
    if (localValue === incomingValue) return;
    if (base && localValue === baseValue) {
      (local as unknown as Record<string, unknown>)[field] = incomingValue;
      return;
    }
    if (base && incomingValue === baseValue) return;
    conflicts.push(makeConflict({ scope: 'field', field, localValue, incomingValue, batchId }));
  });
  return conflicts;
}

function mergeStatus(local: DictionaryEntry, base: DictionaryEntry | null, incoming: DictionaryEntry, batchId: string) {
  const conflicts: FieldConflict[] = [];
  if (local.status !== incoming.status && (!base || (local.status !== base.status && incoming.status !== base.status && local.status !== incoming.status))) {
    conflicts.push(makeConflict({ scope: 'field', field: 'status', localValue: local.status, incomingValue: incoming.status, batchId }));
  } else if (local.status === base?.status) {
    local.status = incoming.status;
  }
  return conflicts;
}

function mergeRecordArray(field: typeof RECORD_ARRAY_FIELDS[number], local: DictionaryEntry, base: DictionaryEntry | null, incoming: DictionaryEntry, batchId: string) {
  const localItems = [...local[field]] as Array<{ id: string }>;
  const baseItems = (base?.[field] ?? []) as Array<{ id: string }>;
  const incomingItems = incoming[field] as Array<{ id: string }>;
  const conflicts: FieldConflict[] = [];
  const ids = [...new Set([...localItems, ...baseItems, ...incomingItems].map((item) => item.id))];
  const byId = (items: Array<{ id: string }>, id: string) => items.find((item) => item.id === id);
  const output: Array<{ id: string }> = [];

  ids.forEach((id) => {
    const localItem = byId(localItems, id);
    const baseItem = byId(baseItems, id);
    const incomingItem = byId(incomingItems, id);
    if (baseItem) {
      if (!localItem && !incomingItem) return;
      if (!localItem && incomingItem && sameJson(baseItem, incomingItem)) return;
      if (localItem && !incomingItem && sameJson(baseItem, localItem)) return;
      if (localItem && !incomingItem) {
        output.push(localItem);
        if (!sameJson(baseItem, localItem)) conflicts.push(makeConflict({ scope: 'item', field, localValue: localItem, incomingValue: { deleted: true }, localItemId: id, batchId }));
        return;
      }
      if (!localItem && incomingItem) {
        output.push(incomingItem);
        if (!sameJson(baseItem, incomingItem)) conflicts.push(makeConflict({ scope: 'item', field, localValue: { deleted: true }, incomingValue: incomingItem, incomingItemId: id, batchId }));
        return;
      }
    }
    if (localItem && incomingItem) {
      if (sameJson(localItem, incomingItem)) {
        output.push(localItem);
        return;
      }
      if (baseItem && sameJson(localItem, baseItem)) {
        output.push(incomingItem);
        return;
      }
      if (baseItem && sameJson(incomingItem, baseItem)) {
        output.push(localItem);
        return;
      }
      output.push(localItem);
      const copy = clone(incomingItem);
      copy.id = incomingCopyId(id, batchId);
      output.push(copy);
      conflicts.push(makeConflict({ scope: 'item', field, localValue: localItem, incomingValue: incomingItem, localItemId: localItem.id, incomingItemId: copy.id, batchId }));
      return;
    }
    const item = localItem || incomingItem;
    if (item) output.push(item);
  });

  (local as unknown as Record<string, unknown>)[field] = output;
  return conflicts;
}

function mergeSynonyms(local: DictionaryEntry, base: DictionaryEntry | null, incoming: DictionaryEntry) {
  const baseValues = new Set(base?.synonyms ?? []);
  const localValues = new Set(local.synonyms);
  const incomingValues = new Set(incoming.synonyms);
  const values = [...new Set([...local.synonyms, ...(base?.synonyms ?? []), ...incoming.synonyms])];
  if (!base) {
    local.synonyms = [...new Set([...local.synonyms, ...incoming.synonyms])];
    return [];
  }
  local.synonyms = values.filter((value) => {
    const inLocal = localValues.has(value);
    const inIncoming = incomingValues.has(value);
    const inBase = baseValues.has(value);
    return inBase ? inLocal && inIncoming : inLocal || inIncoming;
  });
  return [] as FieldConflict[];
}

function mergeReplies(local: ReviewComment, base: ReviewComment | null, incoming: ReviewComment) {
  const replies = new Map<string, ReviewReply>();
  [...local.replies, ...(base?.replies ?? []), ...incoming.replies].forEach((reply) => {
    if (!replies.has(reply.id)) replies.set(reply.id, clone(reply));
  });
  local.replies = [...replies.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeComments(local: DictionaryEntry, base: DictionaryEntry | null, incoming: DictionaryEntry, batchId: string) {
  const conflicts: FieldConflict[] = [];
  const output: ReviewComment[] = [];
  const localMap = new Map(local.reviewerComments.map((item) => [item.id, item]));
  const baseMap = new Map((base?.reviewerComments ?? []).map((item) => [item.id, item]));
  const incomingMap = new Map(incoming.reviewerComments.map((item) => [item.id, item]));
  const ids = new Set([...localMap.keys(), ...baseMap.keys(), ...incomingMap.keys()]);

  ids.forEach((id) => {
    const localThread = localMap.get(id);
    const baseThread = baseMap.get(id);
    const incomingThread = incomingMap.get(id);
    if (baseThread && !localThread && !incomingThread) return;
    if (baseThread && localThread && !incomingThread && commentSignature(localThread) === commentSignature(baseThread)) return;
    if (baseThread && !localThread && incomingThread && commentSignature(incomingThread) === commentSignature(baseThread)) return;

    if (localThread && incomingThread) {
      if (commentSignature(localThread) === commentSignature(incomingThread)) {
        output.push(localThread);
        return;
      }
      if (baseThread && commentSignature(localThread) === commentSignature(baseThread)) {
        output.push(clone(incomingThread));
        return;
      }
      if (baseThread && commentSignature(incomingThread) === commentSignature(baseThread)) {
        output.push(localThread);
        return;
      }
      const merged = clone(localThread);
      mergeReplies(merged, baseThread ?? null, incomingThread);
      const topFields: Array<keyof ReviewComment> = ['field', 'message', 'status'];
      const topChanged = topFields.some((key) => {
        const localValue = localThread[key];
        const incomingValue = incomingThread[key];
        const baseValue = baseThread ? baseThread[key] : undefined;
        return !baseThread ? localValue !== incomingValue : localValue !== baseValue && incomingValue !== baseValue;
      });
      if (topChanged) {
        output.push(merged);
        const copy = clone(incomingThread);
        copy.id = incomingCopyId(id, batchId);
        output.push(copy);
        conflicts.push(makeConflict({ scope: 'item', field: 'reviewerComments', localValue: localThread, incomingValue: incomingThread, localItemId: id, incomingItemId: copy.id, batchId }));
      } else {
        output.push(merged);
      }
      return;
    }

    const only = localThread || incomingThread;
    if (!only) return;
    if (baseThread && commentSignature(only) !== commentSignature(baseThread)) {
      output.push(clone(only));
      conflicts.push(makeConflict({
        scope: 'item',
        field: 'reviewerComments',
        localValue: localThread ? only : { deleted: true },
        incomingValue: incomingThread ? only : { deleted: true },
        localItemId: localThread?.id,
        incomingItemId: incomingThread?.id,
        batchId
      }));
    } else {
      output.push(clone(only));
    }
  });

  local.reviewerComments = output;
  return conflicts;
}

function mergeConflicts(local: DictionaryEntry, incoming: DictionaryEntry) {
  const known = new Map(local.conflicts.map((conflict) => [conflict.id, conflict]));
  incoming.conflicts.forEach((conflict) => {
    if (!known.has(conflict.id)) local.conflicts.push(clone(conflict));
  });
}

interface EntryMergeOutcome {
  entry: DictionaryEntry | null;
  added: boolean;
  updated: boolean;
  deleted: boolean;
  unchanged: boolean;
  conflicts: number;
  staleEntry: boolean;
  contentEdited: boolean;
}

function mergeExistingEntry(local: DictionaryEntry, base: DictionaryEntry | null, incoming: DictionaryEntry, batchId: string, stale: boolean): EntryMergeOutcome {
  const beforeContent = entryContentSignature(local);
  const beforeSemantic = entrySemanticSignature(local);
  if (beforeSemantic === entrySemanticSignature(incoming)) {
    return { entry: local, added: false, updated: false, deleted: false, unchanged: true, conflicts: 0, staleEntry: false, contentEdited: false };
  }
  if (base && entrySemanticSignature(base) === entrySemanticSignature(incoming)) {
    return { entry: local, added: false, updated: false, deleted: false, unchanged: true, conflicts: 0, staleEntry: false, contentEdited: false };
  }
  const packageEdited = !base || entrySemanticSignature(base) !== entrySemanticSignature(incoming);

  const startConflicts = local.conflicts.length;
  if (base && entrySemanticSignature(base) === entrySemanticSignature(local)) {
    const preservedConflicts = local.conflicts;
    const updated = clone(incoming);
    updated.conflicts = preservedConflicts;
    updated.batchId = batchId;
    local = Object.assign(local, updated);
  } else {
    const conflicts = [
      ...mergeScalarFields(local, base, incoming, batchId),
      ...mergeStatus(local, base, incoming, batchId),
      ...RECORD_ARRAY_FIELDS.flatMap((field) => mergeRecordArray(field, local, base, incoming, batchId)),
      ...mergeSynonyms(local, base, incoming),
      ...mergeComments(local, base, incoming, batchId)
    ];
    local.conflicts.push(...conflicts);
  }
  mergeConflicts(local, incoming);

  const contentEdited = beforeContent !== entryContentSignature(local);
  const staleEntry = stale && packageEdited;
  const hasNewConflict = local.conflicts.filter((conflict) => conflict.status === 'open').length > startConflicts || incoming.conflicts.some((conflict) => conflict.status === 'open');
  local.batchId = batchId;
  local.updatedAt = incoming.updatedAt;
  if (hasNewConflict) {
    local.status = 'disputed';
    local.requiresReconfirmation = true;
  } else if (staleEntry) {
    local.requiresReconfirmation = true;
    if (local.status === 'confirmed') local.status = 'review';
  }

  return { entry: local, added: false, updated: true, deleted: false, unchanged: false, conflicts: local.conflicts.filter((item) => item.status === 'open').length, staleEntry, contentEdited };
}

function mergeIncomingEntry(local: DictionaryEntry | null, base: DictionaryEntry | null, incoming: DictionaryEntry, batchId: string, stale: boolean): EntryMergeOutcome {
  if (local) return mergeExistingEntry(local, base, incoming, batchId, stale);
  const entry = clone(incoming);
  entry.batchId = batchId;
  const contentEdited = base ? entryContentSignature(base) !== entryContentSignature(entry) : true;
  if (!base) {
    if (stale && entry.status === 'confirmed') {
      entry.status = 'review';
      entry.requiresReconfirmation = true;
    }
    return { entry, added: true, updated: false, deleted: false, unchanged: false, conflicts: entry.conflicts.filter((item) => item.status === 'open').length, staleEntry: stale, contentEdited };
  }

  // 本地已删除，离线包修改了同一词条：保留恢复与删除两份决定。
  entry.conflicts.push(makeConflict({ scope: 'entry', field: '__deleted__', localValue: { deleted: true }, incomingValue: clone(incoming), incomingItemId: incoming.id, batchId }));
  entry.status = 'disputed';
  entry.requiresReconfirmation = true;
  return { entry, added: true, updated: false, deleted: false, unchanged: false, conflicts: entry.conflicts.length, staleEntry: stale, contentEdited: true };
}

const mergeHistory = <T extends { id: string; at: string }>(local: T[], incoming: T[]) => {
  const known = new Set(local.map((item) => item.id));
  const merged = [...local];
  incoming.forEach((item) => {
    if (!known.has(item.id)) merged.push(clone(item));
  });
  return merged.sort((a, b) => b.at.localeCompare(a.at));
};

export function buildPackagePlan(current: DictionarySnapshot, rawPackage: unknown): PackagePlan {
  const reviewPackage = normalizeReviewPackage(rawPackage, current.revision);
  const duplicate = current.importedPackages.some((item) => item.packageId === reviewPackage.packageId);
  if (duplicate) {
    return {
      package: reviewPackage,
      duplicate: true,
      stale: reviewPackage.baseRevision < current.revision,
      entries: clone(current.entries),
      versions: clone(current.versions),
      audit: clone(current.audit),
      affectedIds: [],
      added: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      conflicts: 0,
      staleEntries: 0,
      needsConfirmation: 0
    };
  }

  const stale = reviewPackage.baseRevision < current.revision;
  const entries = clone(current.entries);
  const localMap = new Map(entries.map((entry) => [entry.id, entry]));
  const baseMap = new Map(reviewPackage.base.entries.map((entry) => [entry.id, entry]));
  const incomingMap = new Map(reviewPackage.entries.map((entry) => [entry.id, entry]));
  const affectedIds: string[] = [];
  let added = 0;
  let updated = 0;
  let deleted = 0;
  let unchanged = 0;
  let staleEntries = 0;

  reviewPackage.entries.forEach((incomingSource) => {
    const incoming = normalizeEntry(incomingSource, reviewPackage.batchId);
    const outcome = mergeIncomingEntry(localMap.get(incoming.id) ?? null, baseMap.get(incoming.id) ?? null, incoming, reviewPackage.batchId, stale);
    if (outcome.unchanged) {
      unchanged += 1;
      return;
    }
    affectedIds.push(incoming.id);
    if (outcome.entry) {
      const existing = localMap.get(incoming.id);
      if (existing) Object.assign(existing, outcome.entry);
      else {
        entries.push(outcome.entry);
        localMap.set(outcome.entry.id, outcome.entry);
      }
      added += outcome.added ? 1 : 0;
      updated += outcome.updated ? 1 : 0;
      staleEntries += outcome.staleEntry ? 1 : 0;
    }
  });

  // 全量包中缺失的基准词条：安全删除；本地也改过则保留并生成词条级冲突。
  baseMap.forEach((baseEntry, id) => {
    if (incomingMap.has(id)) return;
    const local = localMap.get(id);
    if (!local) return;
    affectedIds.push(id);
    if (entrySemanticSignature(local) === entrySemanticSignature(baseEntry)) {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) entries.splice(index, 1);
      localMap.delete(id);
      deleted += 1;
    } else {
      local.conflicts.push(makeConflict({ scope: 'entry', field: '__deleted__', localValue: clone(local), incomingValue: { deleted: true }, localItemId: id, batchId: reviewPackage.batchId }));
      local.status = 'disputed';
      local.requiresReconfirmation = true;
      local.batchId = reviewPackage.batchId;
      updated += 1;
      staleEntries += stale ? 1 : 0;
    }
  });

  const versions = mergeHistory(current.versions, reviewPackage.versions.map((version) => normalizeVersion(version, reviewPackage.batchId))).slice(0, 240);
  const audit = mergeHistory(current.audit, reviewPackage.audit.map((record) => normalizeAudit(record, reviewPackage.batchId))).slice(0, 600);
  const conflicts = entries.reduce((sum, entry) => sum + entry.conflicts.filter((conflict) => conflict.status === 'open').length, 0);
  const needsConfirmation = entries.filter((entry) => entry.requiresReconfirmation).length;

  return {
    package: reviewPackage,
    duplicate: false,
    stale,
    entries,
    versions,
    audit,
    affectedIds: [...new Set(affectedIds)],
    added,
    updated,
    deleted,
    unchanged,
    conflicts,
    staleEntries,
    needsConfirmation
  };
}

export function createReviewPackage(snapshot: DictionarySnapshot, actorName: string, actorRole: UserRole): ReviewPackage {
  const timestamp = nowIso();
  const batchId = `batch-${shortHash(`${timestamp}-${snapshot.revision}-${Math.random()}`)}`;
  const base = {
    revision: snapshot.revision,
    entries: clone(snapshot.entries),
    versions: clone(snapshot.versions),
    audit: clone(snapshot.audit)
  };
  const packageWithoutId = {
    kind: 'offline-review-package/v2' as const,
    batchId,
    createdAt: timestamp,
    exportedAt: timestamp,
    exporterName: actorName,
    exporterRole: actorRole,
    baseRevision: snapshot.revision,
    revision: snapshot.revision,
    entries: clone(snapshot.entries),
    versions: clone(snapshot.versions),
    audit: clone(snapshot.audit),
    base,
    importedPackages: clone(snapshot.importedPackages)
  };
  return { ...packageWithoutId, packageId: `package-${shortHash(stableStringify(packageWithoutId))}` };
}

export function normalizeReviewPackage(raw: unknown, currentRevision?: number): ReviewPackage {
  const item = asObject(raw);
  if (item.kind === 'offline-review-package/v2') {
    const batchId = text(item.batchId, `batch-${shortHash(stableStringify(raw))}`);
    const base = asObject(item.base);
    const baseRevision = Number(item.baseRevision ?? base.revision ?? currentRevision ?? 1) || 1;
    return {
      kind: 'offline-review-package/v2',
      packageId: text(item.packageId, `package-${packageFingerprint(raw)}`),
      batchId,
      createdAt: text(item.createdAt, nowIso()),
      exportedAt: text(item.exportedAt, text(item.createdAt, nowIso())),
      exporterName: text(item.exporterName, '离线编辑'),
      exporterRole: item.exporterRole === 'editor' || item.exporterRole === 'reviewer' ? item.exporterRole : (inferRole(text(item.exporterName)) === 'editor' ? 'editor' : 'reviewer'),
      baseRevision,
      revision: Number(item.revision ?? baseRevision) || baseRevision,
      entries: asArray(item.entries).map((entry) => normalizeEntry(entry, batchId)),
      versions: asArray(item.versions).map((version) => normalizeVersion(version, batchId)),
      audit: asArray(item.audit).map((record) => normalizeAudit(record, batchId)),
      base: {
        revision: Number(base.revision ?? baseRevision) || baseRevision,
        entries: asArray(base.entries).map((entry) => normalizeEntry(entry, batchId)),
        versions: asArray(base.versions).map((version) => normalizeVersion(version, batchId)),
        audit: asArray(base.audit).map((record) => normalizeAudit(record, batchId))
      },
      importedPackages: asArray(item.importedPackages).map(normalizeImportRecord)
    };
  }

  // 兼容旧备份：以当前内容作为共同基准，并由内容指纹保证同一文件重复导入幂等。
  const snapshot = normalizeSnapshot(raw);
  const packageId = `package-legacy-${packageFingerprint(snapshot)}`;
  const batchId = `batch-legacy-${shortHash(packageId)}`;
  return {
    kind: 'offline-review-package/v2',
    packageId,
    batchId,
    createdAt: nowIso(),
    exportedAt: nowIso(),
    exporterName: '旧版数据包',
    exporterRole: 'reviewer',
    baseRevision: snapshot.revision,
    revision: snapshot.revision,
    entries: snapshot.entries,
    versions: snapshot.versions,
    audit: snapshot.audit,
    base: {
      revision: snapshot.revision,
      entries: clone(snapshot.entries),
      versions: snapshot.versions,
      audit: snapshot.audit
    }
  };
}

export function parseReviewPackage(textValue: string): ReviewPackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textValue);
  } catch {
    throw new Error('文件不是有效的 JSON 审校包');
  }
  const item = asObject(parsed);
  if (!item.kind && (!Array.isArray(item.entries) || !asArray(item.entries).length)) throw new Error('审校包中没有词条数据');
  if (item.kind && item.kind !== 'offline-review-package/v2') throw new Error('不支持的审校包版本');
  return normalizeReviewPackage(parsed);
}
