<script setup lang="ts">
import { computed } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import { FIELD_LABELS } from '~/utils/reviewPackage';
import type { DictionaryEntry, FieldConflict } from '~/types/dictionary';

const props = defineProps<{ entry: DictionaryEntry; compact?: boolean }>();
const store = useDictionaryStore();
const openConflicts = computed(() => props.entry.conflicts.filter((conflict) => conflict.status === 'open'));
const resolvedConflicts = computed(() => props.entry.conflicts.filter((conflict) => conflict.status === 'resolved'));

const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '（空）';
  if (typeof value === 'object') {
    if ((value as { deleted?: boolean }).deleted) return '删除此条内容';
    const source = value as Record<string, string>;
    return [source.headword, source.form, source.title, source.text, source.message, source.citation, source.definition].filter(Boolean).join(' / ') || JSON.stringify(value, null, 2);
  }
  return String(value);
};

const conflictTitle = (conflict: FieldConflict) => {
  const label = FIELD_LABELS[conflict.field] || conflict.field;
  if (conflict.scope === 'entry') return '词条删除 / 恢复冲突';
  if (conflict.scope === 'item') return `${label}内部记录冲突`;
  return `${label}字段冲突`;
};
</script>

<template>
  <section v-if="entry.conflicts.length" class="conflict-panel" :class="{ compact }">
    <header>
      <div><span class="eyebrow">FIELD CONFLICTS</span><h3>人工定夺（{{ openConflicts.length }}）</h3></div>
      <t-tag size="small" theme="danger" variant="light">{{ entry.conflicts.length }} 处留痕</t-tag>
    </header>
    <article v-for="conflict in openConflicts" :key="conflict.id" class="conflict-card">
      <div class="conflict-title"><strong>{{ conflictTitle(conflict) }}</strong><span>批次 {{ conflict.batchId }}</span></div>
      <div class="conflict-values">
        <div><small>本工作区</small><pre>{{ displayValue(conflict.localValue) }}</pre></div>
        <div><small>离线审校包</small><pre>{{ displayValue(conflict.incomingValue) }}</pre></div>
      </div>
      <div class="conflict-actions">
        <t-button size="small" variant="outline" :disabled="!store.isReviewer" @click="store.resolveConflict(entry.id, conflict.id, 'local')">保留本工作区</t-button>
        <t-button size="small" theme="primary" :disabled="!store.isReviewer" @click="store.resolveConflict(entry.id, conflict.id, 'incoming')">采用离线包</t-button>
        <span v-if="!store.isReviewer">仅主审可裁定</span>
      </div>
    </article>
    <details v-if="resolvedConflicts.length" class="resolved-conflicts">
      <summary>已裁定 {{ resolvedConflicts.length }} 处</summary>
      <div v-for="conflict in resolvedConflicts" :key="conflict.id" class="resolved-row">
        <strong>{{ conflictTitle(conflict) }}</strong><span>{{ conflict.resolution === 'local' ? '保留本工作区' : '采用离线包' }} · {{ conflict.resolvedBy }}</span>
      </div>
    </details>
  </section>
</template>
