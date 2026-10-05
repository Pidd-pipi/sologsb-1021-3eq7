<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';

const store = useDictionaryStore();
const emit = defineEmits<{ versions: [] }>();
const commentField = ref('definition');
const commentText = ref('');
const filter = ref<'all' | 'open' | 'resolved'>('all');
const entry = computed(() => store.selectedEntry);
const comments = computed(() => (entry.value?.reviewerComments ?? []).filter((comment) => filter.value === 'all' || comment.status === filter.value));
const fieldLabels: Record<string, string> = {
  headword: '词形', pronunciation: '发音', partOfSpeech: '词性', definition: '释义', dialectVariants: '方言变体', examples: '例句', sources: '来源', synonyms: '同义词', notes: '备注'
};

const addComment = () => {
  if (!entry.value || !commentText.value.trim() || !store.isReviewer) return;
  store.addComment(entry.value.id, commentField.value, commentText.value);
  commentText.value = '';
};
</script>

<template>
  <aside v-if="entry" class="panel review-panel">
    <div class="panel-head review-head">
      <div><span class="eyebrow">03 / REVIEW</span><h2>审校与回复</h2></div>
      <div class="review-actions">
        <t-button size="small" variant="outline" theme="warning" :disabled="!store.isReviewer" @click="store.setStatus(entry.id, 'draft')">退回</t-button>
        <t-button size="small" theme="success" :disabled="!store.isReviewer || entry.conflicts.some((item) => item.status === 'open')" @click="store.setStatus(entry.id, 'confirmed')">确认</t-button>
        <button class="version-link" @click="emit('versions')">版本 {{ store.versions.length }}</button>
      </div>
    </div>
    <div class="review-summary">
      <div><strong>{{ entry.reviewerComments.filter((item) => item.status === 'open').length }}</strong><span>待处理</span></div>
      <div><strong>{{ entry.reviewerComments.filter((item) => item.status === 'resolved').length }}</strong><span>已解决</span></div>
      <div><strong>{{ entry.dialectVariants.length }}</strong><span>方言变体</span></div>
    </div>
    <div class="comment-filter">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button :class="{ active: filter === 'open' }" @click="filter = 'open'">待回复</button>
      <button :class="{ active: filter === 'resolved' }" @click="filter = 'resolved'">已解决</button>
    </div>
    <div class="comment-list">
      <article v-for="comment in comments" :key="comment.id" class="comment-card" :class="{ resolved: comment.status === 'resolved' }">
        <header><t-tag size="small" variant="light" :theme="comment.status === 'open' ? 'warning' : 'success'">{{ fieldLabels[comment.field] || comment.field }}</t-tag><span>{{ comment.author }}</span><time>{{ new Date(comment.createdAt).toLocaleDateString('zh-CN') }}</time></header>
        <p>{{ comment.message }}</p>
        <div v-for="reply in comment.replies" :key="reply.id" class="reply"><strong>{{ reply.author }}</strong><span>{{ reply.message }}</span><time>{{ new Date(reply.createdAt).toLocaleString('zh-CN') }}</time></div>
        <div class="reply-box">
          <t-textarea v-model="store.fieldReplyDrafts[comment.id]" :autosize="{ minRows: 1, maxRows: 3 }" :disabled="!store.isEditor" placeholder="编辑逐字段回复这条意见…" />
          <t-button size="small" theme="primary" variant="outline" :disabled="!store.isEditor" @click="store.replyComment(entry!.id, comment.id, store.fieldReplyDrafts[comment.id] || ''); store.fieldReplyDrafts[comment.id] = ''">回复</t-button>
        </div>
        <button class="resolve-button" :disabled="!store.isReviewer" @click="store.toggleComment(entry!.id, comment.id)">{{ comment.status === 'open' ? '✓ 主审标记为解决' : '↺ 主审重新打开' }}</button>
      </article>
      <t-empty v-if="!comments.length" description="当前筛选下没有审校意见" />
    </div>
    <div v-if="store.isReviewer" class="new-comment">
      <div class="new-comment-title"><strong>主审新增逐字段意见</strong><span>Ctrl + Enter 提交</span></div>
      <t-select v-model="commentField" size="small">
        <t-option v-for="(label, field) in fieldLabels" :key="field" :value="field" :label="label" />
      </t-select>
      <t-textarea v-model="commentText" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="指出需要修改、补充或确认的内容" @keydown.ctrl.enter="addComment" @keydown.meta.enter="addComment" />
      <t-button block theme="primary" size="small" :disabled="!commentText.trim()" @click="addComment">提交审校意见</t-button>
    </div>
    <div v-else class="role-note">当前为编辑视角：可回复意见；确认、退回、解决和新增意见由主审完成。</div>
  </aside>
</template>
