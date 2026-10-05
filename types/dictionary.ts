export type EntryStatus = 'draft' | 'review' | 'disputed' | 'confirmed';

export type Role = 'reviewer' | 'editor';

export interface DialectVariant {
  id: string;
  dialect: string;
  form: string;
  pronunciation: string;
  note: string;
}

export interface ExampleSentence {
  id: string;
  text: string;
  translation: string;
  source: string;
}

export interface DictionarySource {
  id: string;
  title: string;
  citation: string;
  url: string;
}

export interface ReviewComment {
  id: string;
  field: string;
  author: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
  replies: Array<{ id: string; author: string; message: string; createdAt: string }>;
}

export interface DictionaryEntry {
  id: string;
  headword: string;
  pronunciation: string;
  partOfSpeech: string;
  definition: string;
  dialectVariants: DialectVariant[];
  examples: ExampleSentence[];
  sources: DictionarySource[];
  synonyms: string[];
  status: EntryStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  reviewerComments: ReviewComment[];
  hasConflicts?: boolean;
}

export interface MergeConflict {
  id: string;
  entryId: string;
  /** 字段名；数组成员冲突时为 `dialectVariants` / `examples` / `sources` / `reviewerComments`；整词条冲突时为 `_deleted` / `_new` / `_collision` */
  field: string;
  /** 数组成员冲突时的成员 id */
  itemId?: string;
  /** 数组成员内部字段冲突时的子字段名 */
  subfield?: string;
  fieldLabel: string;
  localValue: unknown;
  packageValue: unknown;
  baseValue: unknown;
  resolution?: 'local' | 'package';
}

export type BatchStatus = 'merged' | 'conflict' | 'failed' | 'duplicate';

export interface PackageBatch {
  id: string;
  packageId: string;
  packageName?: string;
  importedAt: string;
  importedBy: string;
  baseRevision: number;
  localRevision: number;
  status: BatchStatus;
  detail: string;
  entryIds: string[];
  conflicts: MergeConflict[];
  /** 保留整批审校包，合入失败后可重试 */
  pkg: ReviewPackage;
}

export interface ReviewPackage {
  packageId: string;
  formatVersion: 2;
  exportedAt: string;
  exportedBy: string;
  /** 审校包导出时所基于的工作区修订，用于判断基础版本是否过期 */
  baseRevision: number;
  /** 共同祖先快照，用于三路合并 */
  baseEntries: DictionaryEntry[];
  /** 导出方的当前词条（含离线改动） */
  entries: DictionaryEntry[];
}

export interface ReviewBase {
  revision: number;
  entries: DictionaryEntry[];
}

export interface VersionRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryId?: string;
  before: DictionaryEntry[];
}

export interface AuditRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryIds: string[];
}

export interface DictionarySnapshot {
  revision: number;
  entries: DictionaryEntry[];
  versions: VersionRecord[];
  audit: AuditRecord[];
}

/** 持久化到浏览器本地的完整快照，在撤销重做快照基础上追加批次、角色与审校基线 */
export interface PersistedSnapshot extends DictionarySnapshot {
  schemaVersion: 2;
  batches: PackageBatch[];
  role: Role;
  reviewerName: string;
  editorName: string;
  reviewBase: ReviewBase | null;
}

export interface DuplicatePair {
  leftId: string;
  rightId: string;
  score: number;
  reasons: string[];
}
