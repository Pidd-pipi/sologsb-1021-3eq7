<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import { fieldLabels, subfieldLabel } from '~/utils/merge';
import type { MergeConflict, PackageBatch } from '~/types/dictionary';

const visible = defineModel<boolean>({ required: true });
const store = useDictionaryStore();
const expandedBatchId = ref<string | null>(null);

const statusMeta: Record<PackageBatch['status'], { label: string; theme: 'default' | 'success' | 'warning' | 'danger' }> = {
  merged: { label: '已合入', theme: 'success' },
  conflict: { label: '待确认', theme: 'warning' },
  failed: { label: '合入失败', theme: 'danger' },
  duplicate: { label: '重复导入', theme: 'default' }
};

const sortedBatches = computed(() => [...store.batches].sort((a, b) => b.importedAt.localeCompare(a.importedAt)));

const conflictTitle = (conflict: MergeConflict) => {
  if (conflict.field === '_deleted') return '整词条 · 本地已删除';
  if (conflict.field === '_new') return '整词条 · 包内新增';
  if (conflict.field === '_collision') return '整词条 · ID 冲突';
  const base = fieldLabels[conflict.field] ?? conflict.field;
  if (conflict.itemId) {
    const sub = conflict.subfield ? ` · ${subfieldLabel(conflict.subfield)}` : '';
    return `${base} · 成员 ${conflict.itemId.slice(-6)}${sub}`;
  }
  return base;
};

const conflictEntryName = (conflict: MergeConflict) => {
  const entry = store.entries.find((e) => e.id === conflict.entryId);
  return entry?.headword || conflict.entryId;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '—';
  if (Array.isArray(value)) return `[${value.length} 项]`;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const toggleExpand = (batchId: string) => {
  expandedBatchId.value = expandedBatchId.value === batchId ? null : batchId;
};

const resolve = (batchId: string, conflictId: string, side: 'local' | 'package') => {
  store.resolveConflict(batchId, conflictId, side);
};
</script>

<template>
  <t-drawer v-model:visible="visible" header="审校包批次" size="720px" :footer="false">
    <div class="batch-drawer">
      <div class="batch-intro">
        <strong>{{ store.batches.length }}</strong><span>个导入批次</span>
        <p>同一审校包重复导入不会增加记录。合入失败可重试并保留整批；基础版本过期时需重新确认后才能交付。</p>
      </div>

      <div v-if="!sortedBatches.length" class="batch-empty">
        <t-empty description="还没有导入过审校包" />
      </div>

      <div v-for="batch in sortedBatches" :key="batch.id" class="batch-item">
        <div class="batch-head">
          <div class="batch-title-line">
            <strong>{{ batch.packageName }}</strong>
            <t-tag size="small" variant="light" :theme="statusMeta[batch.status].theme">{{ statusMeta[batch.status].label }}</t-tag>
          </div>
          <div class="batch-meta">
            <span>{{ new Date(batch.importedAt).toLocaleString('zh-CN') }}</span>
            <span>导入人：{{ batch.importedBy }}</span>
            <span>基础版本 r{{ batch.baseRevision }} → 当前 r{{ batch.localRevision }}</span>
          </div>
          <p class="batch-detail">{{ batch.detail }}</p>
          <div class="batch-actions">
            <t-button v-if="batch.status === 'conflict'" size="small" theme="warning" variant="outline" @click="toggleExpand(batch.id)">
              {{ expandedBatchId === batch.id ? '收起冲突' : `解决 ${batch.conflicts.filter((c) => !c.resolution).length} 处冲突` }}
            </t-button>
            <t-button v-if="batch.status === 'failed'" size="small" theme="danger" variant="outline" @click="store.retryBatch(batch.id)">重试合入</t-button>
            <t-button size="small" variant="text" @click="store.dismissBatch(batch.id)">移除批次</t-button>
          </div>
        </div>

        <div v-if="expandedBatchId === batch.id && batch.conflicts.length" class="conflict-list">
          <div v-for="conflict in batch.conflicts" :key="conflict.id" class="conflict-card" :class="{ resolved: !!conflict.resolution }">
            <div class="conflict-head">
              <strong>{{ conflictTitle(conflict) }}</strong>
              <span class="conflict-entry">{{ conflictEntryName(conflict) }}</span>
            </div>
            <div class="conflict-compare">
              <div class="conflict-side" :class="{ chosen: conflict.resolution === 'local' }">
                <span class="side-label">本地版本</span>
                <pre>{{ formatValue(conflict.localValue) }}</pre>
                <t-button size="small" variant="outline" :disabled="!!conflict.resolution" @click="resolve(batch.id, conflict.id, 'local')">采用本地</t-button>
              </div>
              <div class="conflict-side" :class="{ chosen: conflict.resolution === 'package' }">
                <span class="side-label">审校包版本</span>
                <pre>{{ formatValue(conflict.packageValue) }}</pre>
                <t-button size="small" theme="primary" variant="outline" :disabled="!!conflict.resolution" @click="resolve(batch.id, conflict.id, 'package')">采用包版本</t-button>
              </div>
            </div>
            <div v-if="conflict.resolution" class="conflict-resolved-note">已采用{{ conflict.resolution === 'local' ? '本地' : '审校包' }}版本</div>
          </div>
        </div>
      </div>
    </div>
  </t-drawer>
</template>
