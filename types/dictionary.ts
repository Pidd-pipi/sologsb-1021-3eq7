export type EntryStatus = 'draft' | 'review' | 'disputed' | 'confirmed';
export type UserRole = 'editor' | 'reviewer';
export type ActorRole = UserRole | 'unknown' | 'system';
export type ConflictStatus = 'open' | 'resolved';
export type ConflictChoice = 'local' | 'incoming';
export type ConflictScope = 'entry' | 'field' | 'item';

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

export interface ReviewReply {
  id: string;
  author: string;
  role?: ActorRole;
  message: string;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  field: string;
  author: string;
  role?: ActorRole;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
  replies: ReviewReply[];
}

export interface FieldConflict {
  id: string;
  field: string;
  scope: ConflictScope;
  localValue: unknown;
  incomingValue: unknown;
  localItemId?: string;
  incomingItemId?: string;
  batchId: string;
  status: ConflictStatus;
  resolution?: ConflictChoice;
  resolvedBy?: string;
  resolvedAt?: string;
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
  batchId: string;
  requiresReconfirmation: boolean;
  conflicts: FieldConflict[];
}

export interface VersionRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryId?: string;
  batchId: string;
  actorName: string;
  actorRole: ActorRole;
  before: DictionaryEntry[];
}

export interface AuditRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryIds: string[];
  batchId: string;
  actorName: string;
  actorRole: ActorRole;
}

export interface PackageImportRecord {
  packageId: string;
  batchId: string;
  importedAt: string;
  exporterName: string;
  exporterRole: ActorRole;
  baseRevision: number;
  entryCount: number;
}

export interface DictionarySnapshot {
  revision: number;
  entries: DictionaryEntry[];
  versions: VersionRecord[];
  audit: AuditRecord[];
  currentRole: UserRole;
  importedPackages: PackageImportRecord[];
}

export interface ReviewPackage {
  kind: 'offline-review-package/v2';
  packageId: string;
  batchId: string;
  createdAt: string;
  exportedAt: string;
  exporterName: string;
  exporterRole: UserRole;
  baseRevision: number;
  revision: number;
  entries: DictionaryEntry[];
  versions: VersionRecord[];
  audit: AuditRecord[];
  base: {
    revision: number;
    entries: DictionaryEntry[];
    versions: VersionRecord[];
    audit: AuditRecord[];
  };
  importedPackages?: PackageImportRecord[];
}

export interface PackagePlan {
  package: ReviewPackage;
  duplicate: boolean;
  stale: boolean;
  entries: DictionaryEntry[];
  versions: VersionRecord[];
  audit: AuditRecord[];
  affectedIds: string[];
  added: number;
  updated: number;
  deleted: number;
  unchanged: number;
  conflicts: number;
  staleEntries: number;
  needsConfirmation: number;
}

export interface DuplicatePair {
  leftId: string;
  rightId: string;
  score: number;
  reasons: string[];
}
