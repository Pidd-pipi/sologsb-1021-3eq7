<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import EntrySidebar from '~/components/EntrySidebar.vue';
import EntryEditor from '~/components/EntryEditor.vue';
import ReviewPanel from '~/components/ReviewPanel.vue';
import DuplicateMergeDialog from '~/components/DuplicateMergeDialog.vue';
import DeleteImpactDialog from '~/components/DeleteImpactDialog.vue';
import VersionDrawer from '~/components/VersionDrawer.vue';
import ImportPackageDialog from '~/components/ImportPackageDialog.vue';
import { useDictionaryStore } from '~/store/dictionary';
import { referencesToEntry } from '~/utils/dictionary';
import type { DictionaryEntry } from '~/types/dictionary';

const store = useDictionaryStore();
const duplicateOpen = ref(false);
const versionsOpen = ref(false);
const deleteOpen = ref(false);
const deleteTarget = ref<DictionaryEntry | null>(null);
const importOpen = ref(false);
const statusText = ref('本地数据已同步');

const impacts = computed(() => deleteTarget.value ? referencesToEntry(store.entries, deleteTarget.value) : []);

const openDelete = () => {
  deleteTarget.value = store.selectedEntry ?? null;
  deleteOpen.value = true;
};

const confirmDelete = () => {
  if (!deleteTarget.value) return;
  const name = deleteTarget.value.headword;
  store.deleteEntry(deleteTarget.value.id);
  deleteOpen.value = false;
  statusText.value = `已删除“${name}”，可在版本记录中恢复`;
  window.setTimeout(() => { statusText.value = '本地数据已同步'; }, 3200);
};

const openDuplicates = () => {
  if (!store.duplicates.length) {
    statusText.value = '当前没有检测到高度相似的重复词条';
    window.setTimeout(() => { statusText.value = '本地数据已同步'; }, 2600);
    return;
  }
  duplicateOpen.value = true;
};

const downloadJson = (content: string, prefix: string) => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const exportData = () => downloadJson(store.exportPackage(), '濒危语言词典备份');

const exportReview = () => {
  if (store.deliveryBlockers) {
    statusText.value = `仍有 ${store.openConflicts} 处冲突、${store.staleEntries} 条需重审，暂不能交付审校包`;
    window.setTimeout(() => { statusText.value = '本地数据已同步'; }, 3600);
    return;
  }
  downloadJson(store.exportReviewPackage(), '濒危语言离线审校包');
  statusText.value = '新审校包已包含基础版本、批次与角色信息，可交给下一位';
  window.setTimeout(() => { statusText.value = '本地数据已同步'; }, 3600);
};

const importFinished = () => {
  statusText.value = '审校包已整批合入；可在词条中处理冲突和重审标记';
  window.setTimeout(() => { statusText.value = '本地数据已同步'; }, 3800);
};

const moveEntry = (delta: number) => {
  const list = store.filteredEntries;
  const index = list.findIndex((entry) => entry.id === store.selectedId);
  const next = list[Math.max(0, Math.min(list.length - 1, index + delta))];
  if (next) store.selectedId = next.id;
};

const keyboard = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  const editing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? store.redo() : store.undo();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); store.redo(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); exportData(); return; }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); store.createEntry(); return; }
  if (editing) return;
  if (event.key === '/') { event.preventDefault(); document.querySelector<HTMLInputElement>('.entry-sidebar input')?.focus(); }
  if (event.key.toLowerCase() === 'j') { event.preventDefault(); moveEntry(1); }
  if (event.key.toLowerCase() === 'k') { event.preventDefault(); moveEntry(-1); }
  if (event.key.toLowerCase() === 'd') { event.preventDefault(); openDuplicates(); }
  if (event.key.toLowerCase() === 'v') { event.preventDefault(); versionsOpen.value = true; }
};

onMounted(() => window.addEventListener('keydown', keyboard));
onBeforeUnmount(() => window.removeEventListener('keydown', keyboard));
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><div class="brand-seal">语</div><div><h1>濒危语言词典编辑与审校</h1><p>ENDANGERED LANGUAGE LEXICON WORKBENCH</p></div></div>
      <div class="offline-status"><span class="online-dot" />{{ statusText }}</div>
      <div class="top-actions">
        <t-select v-model="store.currentRole" size="small" class="role-select" :popup-props="{ attach: 'body' }">
          <t-option value="reviewer" label="主审" />
          <t-option value="editor" label="编辑" />
        </t-select>
        <t-button variant="text" theme="default" :disabled="!store.canUndo" @click="store.undo">撤销</t-button>
        <t-button variant="text" theme="default" :disabled="!store.canRedo" @click="store.redo">重做</t-button>
        <t-button variant="outline" theme="default" @click="importOpen = true">导入审校包</t-button>
        <t-button variant="outline" theme="default" @click="exportData">备份</t-button>
        <t-button variant="outline" theme="default" :disabled="!!store.deliveryBlockers" @click="exportReview">导出审校包</t-button>
        <t-button theme="primary" :disabled="!store.isEditor" @click="store.createEntry">＋ 新建词条</t-button>
      </div>
    </header>

    <section class="project-bar">
      <div><span class="eyebrow">COMMUNITY DICTIONARY · 离线工作区</span><h2>词汇整理与审校</h2><p>从田野记录到确认词条，逐字段保留修改依据、审校回复和版本历史。</p></div>
      <div class="project-stats">
        <div><strong>{{ store.entries.length }}</strong><span>词条</span></div>
        <div><strong>{{ store.entries.filter((entry) => entry.status === 'review').length }}</strong><span>待审</span></div>
        <div><strong>{{ store.entries.filter((entry) => entry.status === 'disputed').length }}</strong><span>争议</span></div>
        <div><strong>{{ store.openComments }}</strong><span>待回复意见</span></div>
        <div><strong>{{ store.openConflicts }}</strong><span>待裁定冲突</span></div>
        <div><strong>{{ store.staleEntries }}</strong><span>需重新确认</span></div>
        <div><strong>{{ store.duplicates.length }}</strong><span>疑似重复</span></div>
      </div>
    </section>

    <main class="workspace">
      <EntrySidebar @create="store.createEntry" @duplicates="openDuplicates" @versions="versionsOpen = true" />
      <EntryEditor />
      <ReviewPanel @versions="versionsOpen = true" />
    </main>

    <section class="bottom-bar">
      <div class="method-card"><span class="method-index">01</span><div><strong>角色分工审校</strong><p>编辑维护词条并回复；确认、退回、解决意见和冲突裁定只由主审完成。</p></div></div>
      <div class="method-card"><span class="method-index">02</span><div><strong>三方合并与重审</strong><p>离线包按基础版本合入；同字段双改保留两份，过期或已确认改动必须重新确认。</p></div></div>
      <div class="method-card"><span class="method-index">03</span><div><strong>整批幂等交接</strong><span>失败可原样重试，同一 packageId 不重复入账；新包携带批次、角色和基础快照。</span></div></div>
      <div class="keyboard-card"><kbd>J/K</kbd><span>切换词条</span><kbd>/</kbd><span>搜索</span><kbd>D</kbd><span>查重</span><kbd>V</kbd><span>版本</span></div>
    </section>

    <footer class="footer-bar">
      <span>当前修订 r{{ store.revision }} · 批次 {{ store.currentBatchId }} · {{ store.roleName }} · {{ store.hydrated ? '浏览器本地保存已启用' : '正在载入本地数据' }}</span>
      <button v-if="store.selectedEntry && store.isEditor" class="delete-link" @click="openDelete">删除当前词条并检查引用</button>
      <span v-else-if="store.selectedEntry">主审不能直接编辑或删除词条</span>
    </footer>

    <ClientOnly>
      <DuplicateMergeDialog v-model="duplicateOpen" :pairs="store.duplicates" />
      <DeleteImpactDialog v-model="deleteOpen" :entry="deleteTarget" :impacts="impacts" @confirm="confirmDelete" />
      <VersionDrawer v-model="versionsOpen" />
      <ImportPackageDialog v-model="importOpen" @imported="importFinished" />
    </ClientOnly>
  </div>
</template>
