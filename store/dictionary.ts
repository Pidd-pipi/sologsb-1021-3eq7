import { computed, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  AuditRecord, DictionaryEntry, DictionarySnapshot, DuplicatePair, EntryStatus, FieldConflict, PackagePlan, ReviewComment, ReviewPackage, UserRole, VersionRecord
} from '~/types/dictionary';
import { findDuplicates } from '~/utils/dictionary';
import {
  buildPackagePlan, clone, CONTENT_FIELDS, createReviewPackage, FIELD_LABELS, LOCAL_BATCH_ID, normalizeEntry, normalizeSnapshot, parseReviewPackage
} from '~/utils/reviewPackage';

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;

const seedEntries = (): DictionaryEntry[] => [
  {
    id: 'entry-001', headword: 'ŋgɨ³³', pronunciation: 'ŋgɨ˧˧（低平调）', partOfSpeech: '名词', definition: '山间常年不涸的小水潭；也用来比喻安静而可靠的人。',
    dialectVariants: [
      { id: 'v-1', dialect: '北坡话', form: 'ŋgɨ³³ tsha⁵⁵', pronunciation: 'ŋgɨ tsha', note: '强调泉水源头' },
      { id: 'v-2', dialect: '河谷话', form: 'a³³ ŋgɨ³³', pronunciation: 'a ŋgɨ', note: '前缀形式' }
    ],
    examples: [
      { id: 'ex-1', text: 'a³³ ŋgɨ³³ ma³³ ʔmɨ⁵⁵.', translation: '这个小水潭是甜的。', source: '民间故事·寻找水源' },
      { id: 'ex-2', text: 'ŋgɨ³³ tɕi⁵⁵ dza³³.', translation: '山泉到了冬天也不会干。', source: '访谈录音 2018-04' }
    ],
    sources: [
      { id: 'src-1', title: '北坡方言词汇表', citation: '李某某记录，1987，手稿第 42 页', url: '' },
      { id: 'src-2', title: '嘎木村发音人访谈', citation: '录音 A-2018-04-17，00:12:31', url: '' }
    ],
    synonyms: ['水潭', '泉水'], status: 'confirmed', notes: '声调标音经两位发音人复核。', createdAt: '2024-08-11T04:00:00.000Z', updatedAt: '2025-03-09T06:12:00.000Z',
    reviewerComments: [], batchId: LOCAL_BATCH_ID, requiresReconfirmation: false, conflicts: []
  },
  {
    id: 'entry-002', headword: 'dʑa⁵⁵', pronunciation: 'dʑa˥（高平调）', partOfSpeech: '动词', definition: '把谷物摊开晾晒；引申为耐心等待事情成熟。',
    dialectVariants: [{ id: 'v-3', dialect: '东南村话', form: 'dʑa⁵⁵ ka³³', pronunciation: 'dʑa ka', note: '带结果补语 habitual 形式' }],
    examples: [{ id: 'ex-3', text: 'kho⁵⁵ dʑa⁵⁵ tɕhi³³.', translation: '谷子已经摊开晒了。', source: '田野记录 2023-09-12' }],
    sources: [{ id: 'src-3', title: '东南村生产词调查', citation: '王某某，2023，词条 071', url: '' }],
    synonyms: ['晒', '等待'], status: 'review', notes: '“等待”的引申义需由审校人确认。', createdAt: '2024-10-01T06:00:00.000Z', updatedAt: '2025-02-18T02:00:00.000Z',
    reviewerComments: [{ id: 'c-1', field: 'definition', author: '主审·和老师', role: 'reviewer', message: '“等待”是短语层面的临时义还是固定引申义？请补充一条例句。', status: 'open', createdAt: '2025-02-18T02:00:00.000Z', replies: [] }],
    batchId: LOCAL_BATCH_ID, requiresReconfirmation: false, conflicts: []
  },
  {
    id: 'entry-003', headword: 'dʑa³³', pronunciation: 'dʑa˧（中调）', partOfSpeech: '动词', definition: '摊晒谷物，使水分蒸发。', dialectVariants: [], examples: [{ id: 'ex-4', text: 'dʑa³³ ko⁵⁵ kho⁵⁵.', translation: '把粮食拿去晒。', source: '语音调查 M-12' }], sources: [{ id: 'src-4', title: '方言调查卡片', citation: '1992，卡片 M-12', url: '' }], synonyms: ['晒粮'], status: 'disputed', notes: '与 dʑa⁵⁵ 可能是同一词条的声调变体。', createdAt: '2024-12-01T06:00:00.000Z', updatedAt: '2025-02-20T03:00:00.000Z', reviewerComments: [],
    batchId: LOCAL_BATCH_ID, requiresReconfirmation: false, conflicts: []
  },
  {
    id: 'entry-004', headword: 'ʔma³³', pronunciation: 'ʔma˧', partOfSpeech: '名词', definition: '母亲；也可用于称呼年长女性亲属。', dialectVariants: [{ id: 'v-4', dialect: '河西话', form: 'ma³³', pronunciation: 'ma', note: '喉塞音弱化' }], examples: [{ id: 'ex-5', text: 'ʔma³³, ŋa⁵⁵ tɕi³³ lo³³.', translation: '妈妈，我要回家了。', source: '日常生活会话 01' }], sources: [{ id: 'src-5', title: '亲缘称谓调查', citation: '赵某某，2011，表 3', url: '' }], synonyms: ['妈妈', '母亲'], status: 'draft', notes: '需补充敬称形式。', createdAt: '2025-01-11T04:00:00.000Z', updatedAt: '2025-01-11T04:00:00.000Z', reviewerComments: [],
    batchId: LOCAL_BATCH_ID, requiresReconfirmation: false, conflicts: []
  },
  {
    id: 'entry-005', headword: 'lo³³', pronunciation: 'lo˧', partOfSpeech: '方向词', definition: '表示向说话者所在位置移动，常与位移动词搭配。', dialectVariants: [], examples: [{ id: 'ex-6', text: 'a³³ mɨ⁵⁵ lo³³.', translation: '到这里来。', source: '语法调查句表 03' }], sources: [{ id: 'src-6', title: '动词方向范畴笔记', citation: '陈某某，2005，第 18 页', url: '' }], synonyms: ['来'], status: 'confirmed', notes: '', createdAt: '2024-09-18T02:00:00.000Z', updatedAt: '2025-01-04T02:00:00.000Z', reviewerComments: [],
    batchId: LOCAL_BATCH_ID, requiresReconfirmation: false, conflicts: []
  },
  {
    id: 'entry-006', headword: 'tsha⁵⁵', pronunciation: 'tsha˥', partOfSpeech: '名词', definition: '水源；泉水涌出的地方。', dialectVariants: [], examples: [{ id: 'ex-7', text: 'tsha⁵⁵ ʔmɨ⁵⁵ ma³³.', translation: '泉眼在这个地方。', source: '地名调查 2022-07' }], sources: [{ id: 'src-7', title: '村落地名调查', citation: '录音 C-2022-07，00:22:08', url: '' }], synonyms: ['泉眼', '水潭'], status: 'review', notes: '', createdAt: '2025-02-01T02:00:00.000Z', updatedAt: '2025-02-25T02:00:00.000Z',
    reviewerComments: [{ id: 'c-2', field: 'sources', author: '审校·罗老师', role: 'reviewer', message: '请把录音中发言人姓名补到资料来源。', status: 'open', createdAt: '2025-02-25T02:00:00.000Z', replies: [{ id: 'r-1', author: '编辑·阿木', role: 'editor', message: '已向调查员索取授权信息，暂以录音编号占位。', createdAt: '2025-02-26T01:00:00.000Z' }] }],
    batchId: LOCAL_BATCH_ID, requiresReconfirmation: false, conflicts: []
  }
].map((entry) => normalizeEntry(entry, LOCAL_BATCH_ID));

interface CommitOptions {
  resetConfirmed?: boolean;
  touchEntries?: boolean;
}

export const useDictionaryStore = defineStore('dictionary', () => {
  const revision = ref(1);
  const entries = reactive<DictionaryEntry[]>(seedEntries());
  const versions = reactive<VersionRecord[]>([]);
  const audit = reactive<AuditRecord[]>([{
    id: 'audit-seed', at: now(), action: '载入工作区', detail: '初始化 6 个词条、2 条待回复审校意见和 1 组疑似重复词条', entryIds: [], batchId: LOCAL_BATCH_ID, actorName: '系统', actorRole: 'system'
  }]);
  const selectedId = ref(entries[0]?.id ?? '');
  const hydrated = ref(false);
  const undoStack = ref<DictionarySnapshot[]>([]);
  const redoStack = ref<DictionarySnapshot[]>([]);
  const query = ref('');
  const statusFilter = ref<EntryStatus | 'all'>('all');
  const dialectFilter = ref('all');
  const fieldReplyDrafts = reactive<Record<string, string>>({});
  const currentRole = ref<UserRole>('reviewer');
  const currentBatchId = ref(LOCAL_BATCH_ID);
  const importedPackages = ref<DictionarySnapshot['importedPackages']>([]);

  const roleName = computed(() => currentRole.value === 'reviewer' ? '主审·和老师' : '编辑·阿木');
  const isEditor = computed(() => currentRole.value === 'editor');
  const isReviewer = computed(() => currentRole.value === 'reviewer');
  const selectedEntry = computed(() => entries.find((entry) => entry.id === selectedId.value) ?? entries[0]);
  const persistableSnapshot = computed<DictionarySnapshot>(() => ({
    revision: revision.value,
    entries: clone(entries),
    versions: clone(versions),
    audit: clone(audit),
    currentRole: currentRole.value,
    importedPackages: clone(importedPackages.value)
  }));
  const duplicates = computed<DuplicatePair[]>(() => findDuplicates(entries));
  const openComments = computed(() => entries.reduce((sum, entry) => sum + entry.reviewerComments.filter((comment) => comment.status === 'open').length, 0));
  const openConflicts = computed(() => entries.reduce((sum, entry) => sum + entry.conflicts.filter((conflict) => conflict.status === 'open').length, 0));
  const staleEntries = computed(() => entries.filter((entry) => entry.requiresReconfirmation).length);
  const deliveryBlockers = computed(() => openConflicts.value + staleEntries.value);
  const filteredEntries = computed(() => {
    const term = query.value.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter.value !== 'all' && entry.status !== statusFilter.value) return false;
      if (dialectFilter.value !== 'all' && !entry.dialectVariants.some((variant) => variant.dialect === dialectFilter.value)) return false;
      if (!term) return true;
      const haystack = [entry.headword, entry.definition, entry.partOfSpeech, entry.pronunciation, ...entry.synonyms, ...entry.sources.map((source) => source.title)].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  });
  const dialects = computed(() => [...new Set(entries.flatMap((entry) => entry.dialectVariants.map((variant) => variant.dialect)))].sort());

  function snapshot(): DictionarySnapshot {
    return {
      revision: revision.value,
      entries: clone(entries),
      versions: clone(versions),
      audit: clone(audit),
      currentRole: currentRole.value,
      importedPackages: clone(importedPackages.value)
    };
  }

  function restore(value: DictionarySnapshot) {
    revision.value = value.revision ?? 1;
    entries.splice(0, entries.length, ...clone(value.entries ?? []));
    versions.splice(0, versions.length, ...clone(value.versions ?? []));
    audit.splice(0, audit.length, ...clone(value.audit ?? []));
    currentRole.value = value.currentRole ?? 'reviewer';
    importedPackages.value = clone(value.importedPackages ?? []);
    currentBatchId.value = importedPackages.value[0]?.batchId ?? LOCAL_BATCH_ID;
    if (!entries.some((entry) => entry.id === selectedId.value)) selectedId.value = entries[0]?.id ?? '';
  }

  function commit(action: string, detail: string, entryIds: string[], mutation: () => void, options: CommitOptions = {}) {
    const touchEntries = options.touchEntries ?? true;
    undoStack.value = [...undoStack.value.slice(-49), snapshot()];
    redoStack.value = [];
    const before = clone(entries);
    mutation();
    entries.forEach((entry) => {
      if (!entryIds.includes(entry.id)) return;
      if (options.resetConfirmed && entry.status === 'confirmed') entry.status = 'review';
      if (touchEntries) entry.updatedAt = now();
    });
    revision.value += 1;
    versions.unshift({
      id: uid('version'), at: now(), action, detail, entryId: entryIds[0], batchId: currentBatchId.value,
      actorName: roleName.value, actorRole: currentRole.value, before
    });
    versions.splice(120);
    audit.unshift({ id: uid('audit'), at: now(), action, detail, entryIds, batchId: currentBatchId.value, actorName: roleName.value, actorRole: currentRole.value });
    audit.splice(300);
  }

  function createEntry() {
    if (!isEditor.value) return;
    const entry: DictionaryEntry = {
      id: uid('entry'), headword: '新词条', pronunciation: '', partOfSpeech: '', definition: '', dialectVariants: [], examples: [], sources: [], synonyms: [], status: 'draft', notes: '', createdAt: now(), updatedAt: now(), reviewerComments: [], batchId: currentBatchId.value, requiresReconfirmation: false, conflicts: []
    };
    commit('新建词条', '创建草稿词条', [entry.id], () => entries.unshift(entry));
    selectedId.value = entry.id;
  }

  function updateField<K extends keyof DictionaryEntry>(entryId: string, field: K, value: DictionaryEntry[K], label = String(field)) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value || JSON.stringify(entry[field]) === JSON.stringify(value)) return;
    const contentField = CONTENT_FIELDS.includes(field as typeof CONTENT_FIELDS[number]);
    commit('编辑字段', `${FIELD_LABELS[label] || label}发生更新`, [entryId], () => { entry[field] = value; }, { resetConfirmed: contentField });
  }

  function setStatus(entryId: string, status: EntryStatus) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || entry.status === status) return;
    if (status === 'review' && !isEditor.value) return;
    if (status === 'draft' && !isReviewer.value) return;
    if (status === 'disputed' && !isEditor.value) return;
    if (status === 'confirmed' && !isReviewer.value) return;
    if (status === 'confirmed' && entry.conflicts.some((conflict) => conflict.status === 'open')) return;
    const labels: Record<EntryStatus, string> = { draft: '草稿', review: '待审', disputed: '争议', confirmed: '已确认' };
    commit(status === 'draft' ? '退回词条' : '变更状态', `词条状态改为“${labels[status]}”`, [entryId], () => {
      entry.status = status;
      if (status === 'confirmed') entry.requiresReconfirmation = false;
    }, { touchEntries: false });
  }

  function addVariant(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value) return;
    const variant = { id: uid('variant'), dialect: '', form: '', pronunciation: '', note: '' };
    commit('新增方言变体', '添加一条方言变体', [entryId], () => entry.dialectVariants.push(variant), { resetConfirmed: true });
  }

  function updateVariant(entryId: string, variantId: string, field: 'dialect' | 'form' | 'pronunciation' | 'note', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const variant = entry?.dialectVariants.find((item) => item.id === variantId);
    if (!entry || !variant || !isEditor.value || variant[field] === value) return;
    commit('编辑方言变体', `${field}发生更新`, [entryId], () => { variant[field] = value; }, { resetConfirmed: true });
  }

  function removeVariant(entryId: string, variantId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value) return;
    commit('删除方言变体', '移除一条方言变体', [entryId], () => {
      const index = entry.dialectVariants.findIndex((variant) => variant.id === variantId);
      if (index >= 0) entry.dialectVariants.splice(index, 1);
    }, { resetConfirmed: true });
  }

  function addExample(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value) return;
    commit('新增例句', '添加一条例句', [entryId], () => entry.examples.push({ id: uid('example'), text: '', translation: '', source: '' }), { resetConfirmed: true });
  }

  function updateExample(entryId: string, exampleId: string, field: 'text' | 'translation' | 'source', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const example = entry?.examples.find((item) => item.id === exampleId);
    if (!entry || !example || !isEditor.value || example[field] === value) return;
    commit('编辑例句', `${field}发生更新`, [entryId], () => { example[field] = value; }, { resetConfirmed: true });
  }

  function removeExample(entryId: string, exampleId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value) return;
    commit('删除例句', '移除一条例句', [entryId], () => {
      const index = entry.examples.findIndex((item) => item.id === exampleId);
      if (index >= 0) entry.examples.splice(index, 1);
    }, { resetConfirmed: true });
  }

  function addSource(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value) return;
    commit('新增来源', '添加一条文献或录音来源', [entryId], () => entry.sources.push({ id: uid('source'), title: '', citation: '', url: '' }), { resetConfirmed: true });
  }

  function updateSource(entryId: string, sourceId: string, field: 'title' | 'citation' | 'url', value: string) {
    const entry = entries.find((item) => item.id === entryId);
    const source = entry?.sources.find((item) => item.id === sourceId);
    if (!entry || !source || !isEditor.value || source[field] === value) return;
    commit('编辑来源', `${field}发生更新`, [entryId], () => { source[field] = value; }, { resetConfirmed: true });
  }

  function removeSource(entryId: string, sourceId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value) return;
    commit('删除来源', '移除一条来源', [entryId], () => {
      const index = entry.sources.findIndex((source) => source.id === sourceId);
      if (index >= 0) entry.sources.splice(index, 1);
    }, { resetConfirmed: true });
  }

  function setSynonyms(entryId: string, synonyms: string[]) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value) return;
    commit('编辑同义词', `同义词更新为 ${synonyms.join('、') || '空'}`, [entryId], () => { entry.synonyms = synonyms; }, { resetConfirmed: true });
  }

  function addComment(entryId: string, field: string, message: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isReviewer.value || !message.trim()) return;
    const comment: ReviewComment = { id: uid('comment'), field, author: roleName.value, role: 'reviewer', message: message.trim(), status: 'open', createdAt: now(), replies: [] };
    commit('新增审校意见', `对“${FIELD_LABELS[field] || field}”添加审校意见`, [entryId], () => entry.reviewerComments.unshift(comment), { touchEntries: false });
  }

  function replyComment(entryId: string, commentId: string, message: string) {
    const entry = entries.find((item) => item.id === entryId);
    const comment = entry?.reviewerComments.find((item) => item.id === commentId);
    if (!entry || !comment || !isEditor.value || !message.trim()) return;
    commit('回复审校意见', `回复“${FIELD_LABELS[comment.field] || comment.field}”字段意见`, [entryId], () => comment.replies.push({ id: uid('reply'), author: roleName.value, role: 'editor', message: message.trim(), createdAt: now() }), { touchEntries: false });
  }

  function toggleComment(entryId: string, commentId: string) {
    const entry = entries.find((item) => item.id === entryId);
    const comment = entry?.reviewerComments.find((item) => item.id === commentId);
    if (!entry || !comment || !isReviewer.value) return;
    commit('处理审校意见', comment.status === 'open' ? '主审标记为已解决' : '主审重新打开意见', [entryId], () => {
      comment.status = comment.status === 'open' ? 'resolved' : 'open';
    }, { touchEntries: false });
  }

  function deleteEntry(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (!entry || !isEditor.value) return;
    commit('删除词条', `删除“${entry.headword}”`, [entryId], () => {
      const index = entries.findIndex((item) => item.id === entryId);
      if (index >= 0) entries.splice(index, 1);
      selectedId.value = entries[0]?.id ?? '';
    }, { touchEntries: false });
  }

  function mergeEntries(targetId: string, sourceIds: string[], selected: Record<string, 'target' | 'source' | 'combine'>) {
    if (!isEditor.value) return;
    const target = entries.find((entry) => entry.id === targetId);
    const sources = entries.filter((entry) => sourceIds.includes(entry.id));
    if (!target || !sources.length) return;
    commit('合并重复词条', `将 ${sources.length} 个重复词条合并到“${target.headword}”`, [targetId, ...sourceIds], () => {
      sources.forEach((source) => {
        const layers: Array<keyof DictionaryEntry> = ['dialectVariants', 'examples', 'sources', 'synonyms', 'reviewerComments'];
        layers.forEach((field) => {
          const targetValue = target[field] as unknown[];
          const sourceValue = source[field] as unknown[];
          targetValue.push(...clone(sourceValue));
        });
      });
      (['headword', 'pronunciation', 'partOfSpeech', 'definition', 'notes'] as const).forEach((field) => {
        const choice = selected[field] ?? 'target';
        if (choice === 'source') target[field] = sources[0]![field];
        if (choice === 'combine' && target[field] !== sources[0]![field]) target[field] = `${target[field]}；${sources[0]![field]}`;
      });
      target.status = 'disputed';
      target.requiresReconfirmation = true;
      target.conflicts = [];
      sourceIds.forEach((id) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index >= 0) entries.splice(index, 1);
      });
    });
  }

  function undo() {
    const value = undoStack.value.at(-1);
    if (!value) return;
    redoStack.value = [...redoStack.value, snapshot()];
    undoStack.value = undoStack.value.slice(0, -1);
    restore(value);
  }

  function redo() {
    const value = redoStack.value.at(-1);
    if (!value) return;
    undoStack.value = [...undoStack.value, snapshot()];
    redoStack.value = redoStack.value.slice(0, -1);
    restore(value);
  }

  function restoreVersion(versionId: string) {
    const version = versions.find((item) => item.id === versionId);
    if (!version) return;
    commit('恢复版本', `恢复 ${new Date(version.at).toLocaleString('zh-CN')} 之前的版本`, [], () => {
      entries.splice(0, entries.length, ...clone(version.before));
    }, { touchEntries: false });
  }

  function setRole(role: UserRole) {
    currentRole.value = role;
  }

  const arrayConflictFields = new Set(['dialectVariants', 'examples', 'sources', 'reviewerComments']);

  function resolveConflict(entryId: string, conflictId: string, choice: 'local' | 'incoming') {
    const entry = entries.find((item) => item.id === entryId);
    const conflict = entry?.conflicts.find((item) => item.id === conflictId);
    if (!entry || !conflict || !isReviewer.value || conflict.status === 'resolved') return;

    let resolvedEntryId = entry.id;
    if (conflict.scope === 'entry') {
      if (choice === 'local') {
        const index = entries.findIndex((item) => item.id === entry.id);
        if (index >= 0) entries.splice(index, 1);
        selectedId.value = entries[0]?.id ?? '';
        resolvedEntryId = entry.id;
      } else {
        const incoming = normalizeEntry(conflict.incomingValue, conflict.batchId);
        resolvedEntryId = incoming.id;
        if (conflict.localItemId) {
          if (incoming.id === entry.id) Object.assign(entry, incoming);
          else {
            const index = entries.findIndex((item) => item.id === entry.id);
            entries.splice(index, 1, incoming);
          }
        }
      }
    } else if (conflict.scope === 'item' && arrayConflictFields.has(conflict.field)) {
      const list = entry[conflict.field as 'dialectVariants'] as Array<{ id: string }>;
      if (choice === 'local') {
        const removeId = conflict.incomingItemId;
        if (removeId) {
          const index = list.findIndex((item) => item.id === removeId);
          if (index >= 0) list.splice(index, 1);
        } else if (!conflict.localItemId) list.splice(0, list.length);
      } else {
        if (conflict.localItemId) {
          const index = list.findIndex((item) => item.id === conflict.localItemId);
          if (index >= 0) list.splice(index, 1);
        }
        const copyIndex = conflict.incomingItemId ? list.findIndex((item) => item.id === conflict.incomingItemId) : -1;
        if (copyIndex >= 0) list.splice(copyIndex, 1);
        const incomingValue = conflict.incomingValue as { deleted?: boolean };
        if (!incomingValue.deleted) list.push(clone(incomingValue) as { id: string });
      }
    } else {
      if (choice === 'incoming') (entry as Record<string, unknown>)[conflict.field] = clone(conflict.incomingValue);
    }

    const resolvedEntry = entries.find((item) => item.id === resolvedEntryId);
    if (resolvedEntry) {
      const targetConflict = resolvedEntry.conflicts.find((item) => item.id === conflictId);
      if (targetConflict) {
        targetConflict.status = 'resolved';
        targetConflict.resolution = choice;
        targetConflict.resolvedBy = roleName.value;
        targetConflict.resolvedAt = now();
      }
      if (!resolvedEntry.conflicts.some((item) => item.status === 'open') && resolvedEntry.requiresReconfirmation && resolvedEntry.status === 'disputed') resolvedEntry.status = 'review';
    }
    revision.value += 1;
    audit.unshift({ id: uid('audit'), at: now(), action: '解决字段冲突', detail: `主审为“${FIELD_LABELS[conflict.field] || conflict.field}”选择${choice === 'local' ? '本工作区' : '离线包'}版本`, entryIds: [resolvedEntryId], batchId: currentBatchId.value, actorName: roleName.value, actorRole: 'reviewer' });
  }

  function previewImport(textValue: string): PackagePlan {
    const parsed = parseReviewPackage(textValue);
    return buildPackagePlan(persistableSnapshot.value, parsed);
  }

  function applyImportPlan(plan: PackagePlan): boolean {
    if (plan.duplicate) return false;
    undoStack.value = [...undoStack.value.slice(-49), snapshot()];
    redoStack.value = [];
    const before = clone(entries);
    const record = {
      packageId: plan.package.packageId,
      batchId: plan.package.batchId,
      importedAt: now(),
      exporterName: plan.package.exporterName,
      exporterRole: plan.package.exporterRole,
      baseRevision: plan.package.baseRevision,
      entryCount: plan.package.entries.length
    };
    entries.splice(0, entries.length, ...clone(plan.entries));
    versions.splice(0, versions.length, ...clone(plan.versions));
    audit.splice(0, audit.length, ...clone(plan.audit));
    importedPackages.value = [...importedPackages.value, record];
    currentBatchId.value = plan.package.batchId;
    revision.value += 1;
    versions.unshift({ id: uid('version'), at: now(), action: '导入审校包', detail: `导入批次 ${plan.package.batchId}，新增 ${plan.added}、更新 ${plan.updated}、删除 ${plan.deleted}，待裁定 ${plan.conflicts} 处`, entryId: plan.affectedIds[0], batchId: plan.package.batchId, actorName: roleName.value, actorRole: currentRole.value, before });
    versions.splice(240);
    audit.unshift({ id: uid('audit'), at: now(), action: '导入审校包', detail: `整批导入并保留批次：新增 ${plan.added}、更新 ${plan.updated}、删除 ${plan.deleted}、冲突 ${plan.conflicts}`, entryIds: plan.affectedIds, batchId: plan.package.batchId, actorName: roleName.value, actorRole: currentRole.value });
    audit.splice(600);
    if (!entries.some((entry) => entry.id === selectedId.value)) selectedId.value = entries[0]?.id ?? '';
    return true;
  }

  function hydrateFromBrowser() {
    try {
      const raw = localStorage.getItem('sologsb-1021-dictionary-v1');
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        const upgraded = Array.isArray(parsed)
          ? { revision: 1, entries: parsed, versions: [], audit: [], currentRole: 'reviewer', importedPackages: [] }
          : parsed;
        const migrated = normalizeSnapshot(upgraded);
        const legacySource = Array.isArray(parsed) ? {} : parsed as Record<string, unknown>;
        const firstLegacyEntry = Array.isArray(legacySource.entries) ? legacySource.entries[0] as Record<string, unknown> : {};
        const hadLegacyFields = Array.isArray(parsed) || !('currentRole' in legacySource) || !('importedPackages' in legacySource) || !('batchId' in firstLegacyEntry);
        restore(migrated);
        if (hadLegacyFields) {
          const at = now();
          audit.unshift({ id: uid('audit'), at, action: '旧数据升级', detail: '已为历史词条、版本和审计记录补齐批次与角色信息', entryIds: migrated.entries.map((entry) => entry.id), batchId: LEGACY_BATCH_ID, actorName: '系统', actorRole: 'system' });
          versions.unshift({ id: uid('version'), at, action: '旧数据升级', detail: '补齐批次与角色信息', batchId: LEGACY_BATCH_ID, actorName: '系统', actorRole: 'system', before: clone(migrated.entries) });
        }
      }
    } catch {
      localStorage.removeItem('sologsb-1021-dictionary-v1');
    } finally {
      hydrated.value = true;
    }
  }

  function exportPackage() {
    return JSON.stringify(persistableSnapshot.value, null, 2);
  }

  function exportReviewPackage(): string {
    const reviewPackage: ReviewPackage = createReviewPackage(persistableSnapshot.value, roleName.value, currentRole.value);
    return JSON.stringify(reviewPackage, null, 2);
  }

  return {
    revision, entries, versions, audit, selectedId, hydrated, query, statusFilter, dialectFilter, fieldReplyDrafts,
    currentRole, currentBatchId, importedPackages, roleName, isEditor, isReviewer,
    selectedEntry, filteredEntries, dialects, duplicates, openComments, openConflicts, staleEntries, deliveryBlockers, persistableSnapshot,
    canUndo: computed(() => undoStack.value.length > 0), canRedo: computed(() => redoStack.value.length > 0),
    createEntry, updateField, setStatus, addVariant, updateVariant, removeVariant, addExample, updateExample, removeExample,
    addSource, updateSource, removeSource, setSynonyms, addComment, replyComment, toggleComment, deleteEntry, mergeEntries,
    undo, redo, restoreVersion, setRole, resolveConflict, previewImport, applyImportPlan, hydrateFromBrowser, exportPackage, exportReviewPackage
  };
});
