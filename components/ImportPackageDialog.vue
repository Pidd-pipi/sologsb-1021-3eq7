<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import type { PackagePlan } from '~/types/dictionary';

const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ imported: [PackagePlan] }>();
const store = useDictionaryStore();
const fileName = ref('');
const error = ref('');
const plan = ref<PackagePlan | null>(null);

const packageMeta = computed(() => plan.value?.package);

const reset = () => {
  fileName.value = '';
  error.value = '';
  plan.value = null;
};

watch(visible, (open) => {
  if (!open) window.setTimeout(reset, 150);
});

const chooseFile = () => document.querySelector<HTMLInputElement>('.import-package-input')?.click();

const readFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  error.value = '';
  plan.value = null;
  if (!file) return;
  fileName.value = file.name;
  try {
    const content = await file.text();
    plan.value = store.previewImport(content);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '无法读取审校包';
  } finally {
    input.value = '';
  }
};

const applyPlan = () => {
  if (!plan.value || plan.value.duplicate) return;
  const result = store.applyImportPlan(plan.value);
  if (result) {
    emit('imported', plan.value);
    visible.value = false;
  }
};
</script>

<template>
  <t-dialog v-model:visible="visible" header="导入离线审校包" width="680px" :footer="false">
    <div class="import-dialog">
      <input class="import-package-input" type="file" accept=".json,application/json" hidden @change="readFile" />
      <div class="import-drop" :class="{ selected: fileName }">
        <div><strong>选择审校包</strong><p>支持新版离线包，也兼容旧版备份 JSON；解析阶段不改动工作区。</p></div>
        <t-button theme="primary" variant="outline" @click="chooseFile">浏览文件</t-button>
      </div>

      <t-alert v-if="fileName && !error" theme="primary" :message="`已选择：${fileName}`" class="import-alert" />
      <t-alert v-if="error" theme="danger" :message="error" class="import-alert" />

      <div v-if="plan" class="import-plan">
        <t-alert v-if="plan.duplicate" theme="success" title="同一个包已导入过">系统按 packageId 识别到重复导入，本次不会增加任何记录，也不会改动工作区。</t-alert>
        <t-alert v-else-if="plan.stale" theme="warning" title="基础版本已过期">该包基于较早修订生成。无冲突改动会纳入，但受影响词条需主审重新确认，不能直接交付。</t-alert>
        <t-alert v-else theme="success" title="基础版本匹配">未发现基础版本过期，非冲突改动可直接纳入。</t-alert>

        <dl class="package-meta">
          <div><dt>批次</dt><dd>{{ packageMeta?.batchId }}</dd></div>
          <div><dt>发出人</dt><dd>{{ packageMeta?.exporterName }} · {{ packageMeta?.exporterRole === 'reviewer' ? '主审' : '编辑' }}</dd></div>
          <div><dt>基础修订</dt><dd>r{{ packageMeta?.baseRevision }} / 当前 r{{ store.revision }}</dd></div>
          <div><dt>词条数</dt><dd>{{ packageMeta?.entries.length }}</dd></div>
        </dl>

        <div class="plan-stats">
          <span><strong>{{ plan.added }}</strong>新增</span>
          <span><strong>{{ plan.updated }}</strong>更新</span>
          <span><strong>{{ plan.deleted }}</strong>删除</span>
          <span><strong>{{ plan.unchanged }}</strong>无变化</span>
          <span class="danger"><strong>{{ plan.conflicts }}</strong>待裁定</span>
          <span class="warning"><strong>{{ plan.staleEntries }}</strong>需重审</span>
        </div>
      </div>

      <div class="dialog-actions">
        <t-button variant="outline" @click="visible = false">取消</t-button>
        <t-button theme="primary" :disabled="!plan || plan.duplicate" @click="applyPlan">整批合入</t-button>
      </div>
    </div>
  </t-dialog>
</template>
