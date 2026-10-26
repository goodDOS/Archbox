<template>
  <!-- 文档已不存在（被删除 / 已被他人移除）：刷新时静默发现，不再弹错误气泡也不强行跳转。
       展示占位并给出「返回上级大区 / 回到首页」出口，由用户自行决定去向。 -->
  <div v-if="loaded && unavailable && !editing" class="card empty-block">
    <Icon name="warn" :size="22" />
    <h3>{{ t('post.notFoundTitle') }}</h3>
    <p>{{ t('post.notFoundBody') }}</p>
    <div class="empty-actions">
      <button class="btn" @click="back">{{ t('post.backToRegion') }}</button>
      <button class="btn btn-primary" @click="goto('home')">{{ t('post.backHome') }}</button>
    </div>
  </div>
  <div v-else-if="loaded">
    <!-- ===== 查看模式 ===== -->
    <template v-if="!editing">
      <div class="page-head sticky-head">
        <!-- ★ title-selectable（Beta.172 需求 5）：文档标题需要可选可复制。
             用户要把文档标题原文复制出去（贴进台账、邮件、聊天），
             而 body 上的全局 user-select:none 会把它连带锁死。
             这里用独立的语义类名而不是靠 `.page-head h1` 这种后代选择器 ——
             同一条 .page-head 在编辑模式下写的是「编辑文档 / 新建文档」，
             那是界面文案不该被选中；靠后代选择器没法把两者区分开。
             样式定义在 src/styles/base.css 的「放开组」。 -->
        <h1 class="title-selectable" style="font-size: 18px">{{ post.title }}</h1>
        <span class="badge" v-if="post.status === 'draft'">{{ t('post.draftBadge') }}</span>
        <div class="spacer"></div>
        <!-- ★ 页内查找（Beta.183）：此按钮是「点击路径」的入口，只在**查看模式**渲染。
             它落在 v-if="!editing" 的 <template> 内（见本文件上方），而编辑模式走
             v-else 分支、不渲染 .post-main。
             ★ Beta.315（任务418）起编辑态也支持页内查找（标题/字段/正文混合引擎）；
               彼时编辑态入口只有 Ctrl+F。★ Beta.329（用户需求「预览前加页内搜索按钮」）
               起编辑态页头也补了这枚按钮，与查看态同款同 key（见下方 v-else 分支）——
               查找范围恒为「正在编辑的内容」，两侧语义一致，不再是「编辑态无按钮」。 -->
        <button
          class="btn btn-icon"
          @click="findOpen"
          :title="t('post.findInPageTitle')"
          :aria-label="t('post.findInPageAria')"
        >
          <Icon name="search" :size="16" />
        </button>
        <!-- ★ 分享（Beta.242）：收进下拉，导出 Markdown 在前、导出 PDF 在后，
             与设置页「文档包导入导出」那组的后两项逐字同序（DataSection.vue:66-67）。
             位置在「历史版本」之前。导出是读操作，故不绑 canEdit —— 只读文档也能导出分享。 -->
        <ShareMenu @export-md="exportOneMd" @export-pdf="exportOnePdf" />
        <!-- 版本号口径：当前内容也占一个版本号（saveVersion 保证最新版本 = 当前落库内容），
             故这里直接显示最新版本号，让用户在打开历史面板之前就知道「我在哪一版」。
             空文档没有版本时（versions 为空）退回到只显示条数。
             数据取自 post:get 的 versions（= listVersions），与面板同一份，标记必然一致。 -->
        <button
          class="btn btn-icon"
          @click="showVersions = !showVersions"
          :title="`${t('post.versionHistoryCount', { n: post.versions.length })}${post.versions.length ? ` · ${t('post.current')} v${post.versions[0].version_no}` : ''}`"
          :aria-label="t('post.versionHistory')"
        >
          <Icon name="clock" :size="16" /><span class="btn-count">{{ post.versions.length }}</span>
        </button>
        <span class="badge warn" v-if="!canEdit" :title="t('post.readonlyTip')">{{ t('post.readonly') }}</span>
        <button
          class="btn btn-icon btn-danger"
          v-if="canEdit"
          @click="del"
          :disabled="!store.writable"
          :title="t('post.deleteDoc')"
          :aria-label="t('post.deleteDoc')"
        >
          <Icon name="trash" :size="16" />
        </button>
        <button
          class="btn btn-icon btn-primary"
          v-if="canEdit"
          @click="enterEdit"
          :disabled="!store.writable"
          :title="t('post.editDoc')"
          :aria-label="t('post.editDoc')"
        >
          <Icon name="edit" :size="16" />
        </button>
      </div>

      <div class="post-layout" :class="{ 'with-versions': showVersions }">
        <!-- ★ 页内查找范围容器（Beta.184 起由渲染端 postFind 引擎负责）。
             ★★ 重要认知：查找范围 = src/utils/postFind.js 直接扫描的 **文章标题 + 字段数据 + 正文**：
               · 标题：.page-head h1.title-selectable
               · 字段数据：.post-main .fields-card
               · 正文：.post-main .post-content
             其余全部不扫描：页头按钮/徽章、.meta.card（大区/分类/标签/作者/时间/ID）、
             .versions（历史版本列表）、左侧导航、标题栏、查找条自身、右侧历史版本栏。

             ★ 旧方案用主进程注入 CSS 排除，现方案直接不扫描非内容元素，无需 content-visibility。
             ★ 不能把范围提到 .post-layout 或 .post-main 上：那会把元信息/版本侧栏一起圈进来。
             ★ 历史版本预览弹层有自己的范围（.pv-head .pv-title + .pv-body.post-content），
               与主页面互斥，避免弹层打开时同时命中背后正文。 -->
        <div class="post-main card-stack" data-find-scope>
          <div class="meta card">
            <div class="meta-row">
              <span class="region-dot" :style="{ background: post.rcolor }"></span>
              <span>{{ post.rname }}</span>
              <span class="sep">/</span>
              <span>{{ post.cname || t('common.unclassified') }}</span>
            </div>
            <div class="meta-row" v-if="post.tags && post.tags.length">
              <span class="chip" v-for="tag in post.tags" :key="tag"># {{ tag }}</span>
            </div>
            <div class="meta-row dim">
              <span class="author-link" @click="gotoAuthor"
                >{{ t('post.metaAuthor') }}{{ post.author_name || '—' }}</span
              >
              <span>{{ t('post.metaCreated') }}{{ withTz(post.created_at) }}</span>
              <span>{{ t('post.metaUpdated') }}{{ withTz(post.updated_at) }}</span>
              <span>{{ t('post.metaDocId') }}{{ post.id }}</span>
              <span
                v-if="post.imported_at"
                class="imp-mark"
                :title="t('post.sourceLabel') + (post.imported_from || t('post.docPack'))"
              >
                {{ t('post.sourceLabel') }}{{ t('post.sourceDocPack') }} · {{ withTz(post.imported_at) }}
              </span>
              <span
                v-if="post.copied_at"
                class="copy-mark"
                :title="
                  t('post.sourceLabel') +
                  (post.copied_from || t('post.lanShare')) +
                  (post.origin_author ? '\n' + t('post.originAuthorColon') + post.origin_author : '')
                "
              >
                {{ t('post.sourceLabel') }}{{ t('post.sourceLanCopy') }} · {{ withTz(post.copied_at)
                }}<template v-if="post.origin_author">
                  · {{ t('post.originAuthor') }} {{ post.origin_author }}</template
                >
              </span>
            </div>
          </div>

          <div class="card fields-card" v-if="fieldList.length">
            <div class="fc-title">{{ t('post.fieldData') }}</div>
            <div class="x-scroll">
              <table class="tbl">
                <tbody>
                  <tr v-for="f in fieldList" :key="f.code">
                    <td style="width: 200px; color: var(--text-2)">
                      {{ f.name }} <code class="fcode">{{ f.code }}</code>
                    </td>
                    <td>
                      <template v-if="f.type === 'url' && f.value">
                        <a :href="f.value" target="_blank" rel="noopener">{{ f.value }}</a>
                      </template>
                      <b v-else>{{ f.value || '—' }}</b>
                      <span class="badge warn" v-if="f.unique_field && f.value" :title="t('post.uniqueFieldTip')">{{
                        t('post.uniqueField')
                      }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card body-card">
            <div class="post-content" v-html="renderedHtml" @click="onContentClick"></div>
          </div>
        </div>

        <!-- 历史版本侧栏 -->
        <VersionHistory
          v-if="showVersions"
          :versions="versions"
          :busy="busy"
          :writable="store.writable && canEdit"
          @preview="previewVersion"
          @compare="openDiff"
          @restore="restore"
        />
      </div>
    </template>

    <!-- ===== 编辑模式（同页面切换） ===== -->
    <template v-else>
      <div class="page-head">
        <button class="btn btn-sm" @click="cancelEdit">← {{ t('post.cancelEdit') }}</button>
        <h1 style="font-size: 18px">{{ form.id ? t('post.editDoc') : t('post.newDoc') }}</h1>
        <span class="badge">{{ regionName }}</span>
        <div class="spacer"></div>
        <!-- ★ Beta.319：页头动作按钮改纯图标（用户要求「文档编辑顶部的这些按钮改为纯图标」）。
             纯图标必须有 title + aria-label 双线索（见 ui-theme-rules 第 8 节），
             两者都走 t()，不硬编码中文；徽标数字仍以 <span> 叠加在图标右上角。 -->
        <button
          class="btn btn-icon"
          v-if="!form.id"
          @click="openDrafts"
          :title="t('post.draftsTip')"
          :aria-label="t('post.draftBox')"
        >
          <Icon name="edit" :size="16" />
          <span v-if="draftCount" class="draft-badge">{{ draftCount }}</span>
        </button>
        <button
          class="btn btn-icon"
          v-if="!form.id"
          @click="openTemplates"
          :title="t('post.templatesTip')"
          :aria-label="t('post.template')"
        >
          <Icon name="layers" :size="16" />
          <span v-if="templateCount" class="draft-badge">{{ templateCount }}</span>
        </button>
        <!-- ★ Beta.329（用户需求：「另存为前加预览按钮、预览前加页内搜索按钮」）：
             页内查找 —— 编辑态查找能力自 Beta.315/#418 起就存在（标题框/字段框 overlay
             + 正文 PM 装饰混合引擎，见 utils/editFind.js），入口原只有 Ctrl+F；
             用户明确要求补一枚按钮入口，与查看态页头那枚同款：同图标 search、
             同 title/aria-label（post.findInPageTitle / findInPageAria）。
             FindBar 是 App.vue 全局挂件（v-if 只看 findState.open），findOpen 在
             编辑态与查看态行为一致。查找范围恒为「正在编辑的内容」，与 data-find-scope
             无关 —— 故下方预览弹层不需要、也不应该带该标记（带上也不会被 editFind 读取，
             只是误导后来者以为编辑态查找按容器圈范围）。 -->
        <button
          class="btn btn-icon"
          @click="findOpen"
          :title="t('post.findInPageTitle')"
          :aria-label="t('post.findInPageAria')"
        >
          <Icon name="search" :size="16" />
        </button>
        <!-- ★ Beta.329（用户需求）：预览 —— 「保存前先看渲染效果」，不必先落库再回查看态。
             渲染内容 = contentHtml（onUpdate 实时跟随 editor.getHTML()）过
             safeHtml + markSelectableMedia，与查看态 renderedHtml 同一条净化链路，
             保存后看到的就是预览里看到的（XSS 口径不因弹层而降级）。
             弹层复用历史版本预览的 .pv-* 形制（同源样式，不另起一套）。 -->
        <button
          class="btn btn-icon"
          @click="editPreviewOpen = true"
          :title="t('post.previewEditTip')"
          :aria-label="t('common.preview')"
        >
          <Icon name="eye" :size="16" />
        </button>
        <!-- 保存组：主按钮「保存」+ 收纳式的「另存为」。
             原先这里有 4 个并列按钮（草稿箱 / 模板 / 存为草稿复选框 / 存为模板）+ 保存，
             挤成一排且语义重叠（草稿箱 vs 存为草稿、模板 vs 存为模板）。
             现在：状态类入口（草稿箱、模板）留作图标按钮，动作类（存为草稿、存为模板）
             收进「另存为」下拉 —— 一个是「去翻列表」，一个是「往列表里放」，本来就不该并排。
             ★ Beta.324：「另存为」改用 Dropdown 的 icon-btn 皮肤（32×32、图标 16px，
             与左侧草稿箱/模板、右侧「保存」三个 .btn.btn-icon 逐像素同尺寸）。
             此前误用 toolbar 皮肤（28px 高、约 39px 宽、图标 15px），用户反馈「大小不一」。 -->
        <div class="save-group">
          <Dropdown
            class="save-as"
            variant="icon-btn"
            icon="save-as"
            :model-value="''"
            :options="saveAsOptions"
            :label-key="'post.saveAs'"
            :disabled="!form.title || busy || !store.writable"
            @change="onSaveAs"
          />
          <button
            class="btn btn-primary btn-icon"
            :disabled="!form.title || busy || !store.writable"
            :title="busy ? t('post.saving') : t('common.save')"
            :aria-label="busy ? t('post.saving') : t('common.save')"
            @click="save()"
          >
            <Icon name="save" :size="16" />
          </button>
        </div>
      </div>

      <!-- 标签云弹窗：点标签即多选，标签过多时在框内滚动（见 TagCloud.vue 顶部说明） -->
      <TagCloud
        v-if="tagCloudOpen"
        :tags="allTags"
        :selected="form.tags"
        :max="MAX_TAGS"
        :can-create="store.writable"
        @close="tagCloudOpen = false"
        @apply="applyTagCloud"
        @created="createTagFromCloud"
      />

      <div class="edit-layout">
        <div class="card-stack">
          <div class="card" style="padding: 16px">
            <input
              class="input title-input"
              v-model.trim="form.title"
              maxlength="200"
              :placeholder="t('post.titlePlaceholder')"
              ref="titleRef"
              :disabled="!store.writable"
              data-find-input
              @input="markDirty"
            />
            <div style="display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; align-items: center">
              <!-- ★ Beta.253：大区下拉必须排在分类**前面**（用户明确要求）。
                   归属层级是大区 → 分类 → 文档，下拉顺序照抄这个层级，用户从左往右读就是
                   「先选归到哪个大区，再选大区下的哪个分类」，与心智模型一致。
                   切换大区会清空分类并重拉分类列表（见 onRegionChange），
                   否则会落库出「B 大区的文档挂在 A 大区分类下」这种自相矛盾的数据。
                   ★ Beta.270：每个填写框前置固定类型标签（大区/分类/标签）——
                   占位文本选中后即消失，只有常驻标签能持续标明字段类型。 -->
              <label class="field-label" style="margin: 0">{{ t('post.regionLabel') }}</label>
              <!-- ★ Beta.279：新建态也可切换大区。
                   此前这里是 `:disabled="!editing || !form.id || !store.writable"`，
                   即只有「编辑已有文档」才放开 —— 从 A 大区点进新建、填到一半发现该归 B，
                   只能取消重来。大区是文档的一级归类，和标题一样属于随手就要能改的属性，
                   没理由新建时锁死；改成只按可写权限判断。
                   联动（清空分类 + 重拉列表 + 编号前缀）见 onRegionChange，两条路径共用。 -->
              <Dropdown
                v-model="form.regionId"
                :options="regionOptions"
                style="max-width: 220px"
                :disabled="!store.writable"
                @change="onRegionChange"
              />
              <!-- ★ 需求：大区名后跟纯「+」按钮，点击新建大区并自动选用（复用全局 .btn-icon） -->
              <button
                class="btn btn-icon"
                :disabled="!store.writable"
                :title="t('post.newRegionTip')"
                :aria-label="t('post.newRegionTip')"
                @click="openRegionModal"
              >
                +
              </button>
              <label class="field-label" style="margin: 0">{{ t('post.categoryLabel') }}</label>
              <Dropdown
                v-model="form.categoryId"
                :options="categoryOptions"
                style="max-width: 220px"
                @change="markDirty"
              />
              <!-- ★ 需求：分类名后跟纯「+」按钮，点击新建分类并自动选用（保留原 openCatModal 逻辑） -->
              <button
                class="btn btn-icon"
                :disabled="!store.writable"
                :title="t('post.newCatTip')"
                :aria-label="t('post.newCatTip')"
                @click="openCatModal"
              >
                +
              </button>
            </div>
            <!-- ★ 需求：无大区时引导新建大区 -->
            <div v-if="!store.regions.length && store.writable" class="no-region-guide">
              {{ t('post.noRegionGuide') }}
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; align-items: center">
              <label class="field-label" style="margin: 0">{{ t('post.tagsLabel') }}</label>
              <div class="tags-editor">
                <span class="chip" v-for="(tag, i) in form.tags" :key="tag + i">
                  # {{ tag }}<span class="x" @click="removeTag(i)">✕</span>
                </span>
                <!-- ★ Beta.279：标签选择改为「标签云弹窗」，不再用原生 <datalist>。
                     原实现的 datalist 由 OS 原生绘制：无边框、无内边距、不跟主题，
                     标签一多就铺满整屏成一块黑块，且无法滚动（用户截图即此）。
                     输入框保留「打字 + 回车」的快路径（临时标签不该强迫先建再选），
                     右侧按钮开标签云做浏览式挑选。 -->
                <input
                  class="tag-input"
                  v-model="tagInput"
                  :placeholder="
                    form.tags.length >= MAX_TAGS ? t('post.tagsMax', { n: MAX_TAGS }) : t('post.tagsAddHint')
                  "
                  maxlength="20"
                  :disabled="!store.writable || form.tags.length >= MAX_TAGS"
                  @keyup.enter="addTag"
                  @keydown.delete="store.writable && form.tags.length && !tagInput && form.tags.pop()"
                />
                <button
                  type="button"
                  class="tag-cloud-btn"
                  :disabled="!store.writable || form.tags.length >= MAX_TAGS"
                  :title="t('post.tagCloudOpen')"
                  @click="openTagCloud"
                >
                  <Icon name="tag" :size="14" /> {{ t('post.tagCloudBtn') }}
                </button>
              </div>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; align-items: center">
              <label class="field-label" style="margin: 0">{{ t('post.docNo') }}</label>
              <input
                class="input"
                v-model.trim="form.no"
                maxlength="40"
                :placeholder="t('post.noPlaceholder')"
                style="max-width: 280px"
                :disabled="!store.writable"
                @input="markDirty"
              />
            </div>
          </div>

          <!-- 富文本编辑器（类 WordPress）：Beta.326 起移除「代码视图」（用户要求
               「删除代码预览模式并清除相关代码」）。编辑器恒为富文本态；原先那对
               普通/代码 切换标签、HTML 源码序列化、内联图占位符折叠与浮层按钮、
               保存前的占位符完好校验、editFind 的 .code-area 查找目标一并移除。
               若将来要恢复此功能，先读 git 历史里 Beta.322–325 的几轮整改
               （只读化、占位符浮层、schema 外标签检出），那些坑不会随功能回来而自动消失。 -->
          <div class="card" style="padding: 16px">
            <!-- ★ Beta.328：工具栏按主流文字工具（Word / WPS 的「开始」功能区）重排，
                 并一次落实用户七点要求：
                 ① 移除页内查找按钮（编辑态入口统一走 Ctrl+F，见本文件页头按钮注释）；
                 ② emoji 移到插入图片前（同属「插入」组，表情比图片更常用）；
                 ③ 移除行内代码按钮；
                 ④ 移除插入链接按钮，并**禁止插入链接**（StarterKit link:false，
                    粘贴网页带 <a> 也只落纯文本，不生成链接标记）；
                 ⑤ 文字颜色 / 背景高亮图标改 WPS / Office 样式（见 ColorPicker）；
                 ⑥ 分组顺序：撤销重做 │ 字号+行内格式 │ 字色/高亮 │ 段落块级 │ 插入 │ 清除格式；
                 ⑦ 字号触发器显示当前字号，下拉可选预设或自定义像素值。
                 图标 + title(悬停) + aria-label(读屏) 三件套由 t() 提供，
                 不硬编码中文（ui-theme-rules 第 8 节，standardize 会扫描断言两者齐全）。 -->
            <div class="editor-toolbar">
              <!-- 撤销 / 重做（ProseMirror 事务级历史栈） -->
              <button
                class="tb-btn"
                :title="t('post.tbUndo')"
                :aria-label="t('post.tbUndo')"
                :disabled="!store.writable || !editor || !editor.can().undo()"
                @mousedown.prevent
                @click="TB.undo"
              >
                <Icon name="rotate-ccw" :size="15" />
              </button>
              <button
                class="tb-btn"
                :title="t('post.tbRedo')"
                :aria-label="t('post.tbRedo')"
                :disabled="!store.writable || !editor || !editor.can().redo()"
                @mousedown.prevent
                @click="TB.redo"
              >
                <Icon name="rotate-cw" :size="15" />
              </button>
              <span class="tb-sep"></span>
              <!-- 字号：触发器即「字号框」——显示当前字号（Word 形态，未设为默认字号），
                   下拉含预设与自定义像素行（Beta.328 用户要求「显示当前字号并可自定义」）。 -->
              <Dropdown
                class="tb-dd tb-dd-fs"
                variant="toolbar"
                :model-value="curFontSize"
                :options="fontSizeOptions"
                :trigger-label="fontSizeTriggerLabel"
                :disabled="!store.writable"
                @change="onFontSizeChange"
              >
                <!-- 自定义像素行：填整数 px 回车或点确定即用。
                     @mousedown.stop 必须保留——.dd-popup 上有 @mousedown.prevent
                     （防点选项抢走编辑器焦点），不截停会让输入框无法获得焦点。 -->
                <template #extra>
                  <div class="tb-fs-custom" @mousedown.stop>
                    <input
                      v-model="fsDraft"
                      class="tb-fs-num"
                      type="number"
                      min="8"
                      max="96"
                      step="1"
                      inputmode="numeric"
                      :placeholder="t('post.fontSizeCustom')"
                      :aria-label="t('post.fontSizeCustom')"
                      @keydown.enter.stop.prevent="applyCustomFontSize"
                    />
                    <span class="tb-fs-unit">px</span>
                    <button class="btn btn-sm btn-primary" :disabled="!fsDraft" @click="applyCustomFontSize">
                      {{ t('common.confirm') }}
                    </button>
                  </div>
                </template>
              </Dropdown>
              <!-- 行内格式 -->
              <button
                class="tb-btn"
                :class="{ on: isOn('bold') }"
                :title="t('post.tbBold')"
                :aria-label="t('post.tbBold')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.bold"
              >
                <Icon name="bold" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('italic') }"
                :title="t('post.tbItalic')"
                :aria-label="t('post.tbItalic')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.italic"
              >
                <Icon name="italic" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('underline') }"
                :title="t('post.tbUnderline')"
                :aria-label="t('post.tbUnderline')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.underline"
              >
                <Icon name="underline" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('strike') }"
                :title="t('post.tbStrike')"
                :aria-label="t('post.tbStrike')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.strike"
              >
                <Icon name="strikethrough" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('superscript') }"
                :title="t('post.tbSuper')"
                :aria-label="t('post.tbSuper')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.super"
              >
                <Icon name="superscript" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('subscript') }"
                :title="t('post.tbSub')"
                :aria-label="t('post.tbSub')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.sub"
              >
                <Icon name="subscript" :size="15" />
              </button>
              <span class="tb-sep"></span>
              <!-- 文字颜色 / 高亮：WPS / Office 样式图标（A+色条 / 荧光笔+色条），
                   图标与色条都实时回显光标处颜色（Beta.320 起，见 ColorPicker 注释） -->
              <ColorPicker
                v-if="store.writable"
                class="tb-cp"
                compact
                :model-value="curColor"
                :active="!!curColor"
                purpose="text"
                title-key="post.tbTextColor"
                @update:model-value="TB.setColor"
              />
              <ColorPicker
                v-if="store.writable"
                class="tb-cp"
                compact
                :model-value="curHighlight"
                :active="!!curHighlight"
                purpose="highlight"
                title-key="post.tbHighlight"
                @update:model-value="TB.setHighlight"
              />
              <span class="tb-sep"></span>
              <!-- 段落 / 块级格式（Word 的「段落」组：标题→正文→列表→引用→代码块→分割线→对齐） -->
              <button
                class="tb-btn"
                :class="{ on: isOn('heading', { level: 2 }) }"
                :title="t('post.tbH1')"
                :aria-label="t('post.tbH1')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.h1"
              >
                <Icon name="heading-1" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('heading', { level: 3 }) }"
                :title="t('post.tbH2')"
                :aria-label="t('post.tbH2')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.h2"
              >
                <Icon name="heading-2" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('paragraph') }"
                :title="t('post.tbParagraph')"
                :aria-label="t('post.tbParagraph')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.paragraph"
              >
                <Icon name="pilcrow" :size="15" />
              </button>
              <button
                class="tb-btn"
                :title="t('post.tbInsertParagraph')"
                :aria-label="t('post.tbInsertParagraph')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.splitPara"
              >
                <Icon name="corner-down-left" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('bulletList') }"
                :title="t('post.tbUl')"
                :aria-label="t('post.tbUl')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.ul"
              >
                <Icon name="list-ul" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('orderedList') }"
                :title="t('post.tbOl')"
                :aria-label="t('post.tbOl')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.ol"
              >
                <Icon name="list-ol" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('blockquote') }"
                :title="t('post.tbQuote')"
                :aria-label="t('post.tbQuote')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.quote"
              >
                <Icon name="quote" :size="15" />
              </button>
              <button
                class="tb-btn"
                :class="{ on: isOn('codeBlock') }"
                :title="t('post.tbCodeBlock')"
                :aria-label="t('post.tbCodeBlock')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.codeBlock"
              >
                <Icon name="code-block" :size="15" />
              </button>
              <button
                class="tb-btn"
                :title="t('post.tbHr')"
                :aria-label="t('post.tbHr')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.hr"
              >
                <Icon name="minus" :size="15" />
              </button>
              <!-- 对齐：触发器图标随当前对齐方式变化（Beta.319） -->
              <Dropdown
                class="tb-dd"
                variant="toolbar"
                :icon="alignIcon"
                :model-value="curAlign"
                :options="alignOptions"
                :label-key="'post.tbAlign'"
                :disabled="!store.writable"
                @change="onAlignChange"
              />
              <span class="tb-sep"></span>
              <!-- 插入：emoji 在图片前（Beta.328 用户要求）。面板分类固定（不存最近使用），
                   默认插入到光标处，底栏可切换为「复制到剪贴板」以便在标题/标签等非富文本控件里用。 -->
              <EmojiPicker ref="emojiRef" :disabled="!store.writable" @pick="onEmojiPick" />
              <button
                class="tb-btn"
                :title="t('post.tbImage')"
                :aria-label="t('post.tbImage')"
                @mousedown.prevent
                @click="insertImage"
                :disabled="!store.writable"
              >
                <Icon name="image" :size="15" />
              </button>
              <span class="tb-sep"></span>
              <button
                class="tb-btn"
                :title="t('post.tbClearFormat')"
                :aria-label="t('post.tbClearFormat')"
                :disabled="!store.writable"
                @mousedown.prevent
                @click="TB.clearFormat"
              >
                <Icon name="eraser" :size="15" />
              </button>
            </div>
            <EditorContent
              class="editor-area"
              :editor="editor"
              :data-readonly="!store.writable"
              @click="onEditorAreaClick"
            />
            <!-- 图片尺寸条（Beta.316，需求 4）：仅当光标停在一张图上才出现。
                 放在工具栏之外、编辑区之下 —— 工具栏是"随时可用的通用工具"，
                 而这一排只对选中的图片有意义，混进工具栏会让它频繁进出、把按钮推走。

                 ★ Beta.324 排版重构（对应用户截图里的三个问题）★
                 1. 「输入框压在单位下拉上方」—— 根因是 .isb-input 从未写过样式：
                    input 是 inline-block，Dropdown 的根是 display:inline-block; width:100%
                    的盒子，两者必然纵向堆叠。现在 .isb-input 显式 inline-flex，
                    数字框与单位控件焊成一行（见样式段注释）。
                 2. 「只能填一个数值」—— 原先只有宽度一格。补高度输入框：
                    高度恒为像素（百分比高度以容器高度为基准，流式正文里不可控，
                    论证见 utils/imageSize.js 的 heightForWidth 注释）；
                    锁比例时改高会按原图比例反推宽。
                 3. 「预制百分比整排缺失」—— IMAGE_PCT_STEPS 漏了 import，
                    v-for 遍历 undefined 静默渲染为空（不报错、不留痕）。
                    补 import 即恢复，本轮另由 image-size.test.mjs 焊住。 -->
            <div class="img-size-bar" v-if="selectedImage !== null">
              <span class="isb-label">{{ t('post.imgSizeLabel') }}</span>
              <!-- 宽：数字 + 单位下拉（像素 / 百分比两套并存，用户要求「可自定义像素」）。
                   数字与单位分开：单位用下拉，避免用户手打 "480px" 时把单位打错。 -->
              <span class="isb-cap">{{ t('post.imgSizeWidth') }}</span>
              <div class="isb-input">
                <input
                  class="isb-num"
                  type="number"
                  inputmode="numeric"
                  :min="imgUnit === 'px' ? IMAGE_PX_MIN : 1"
                  :max="imgUnit === 'px' ? IMAGE_PX_MAX : 100"
                  v-model="imgSizeDraft"
                  :placeholder="t('post.imgSizeAuto')"
                  :disabled="!store.writable"
                  :aria-label="t('post.imgSizeWidth')"
                  @keydown.enter.prevent="commitImageSize"
                  @blur="commitImageSize"
                />
                <Dropdown
                  class="isb-unit"
                  variant="form"
                  :model-value="imgUnit"
                  :options="IMG_UNIT_OPTIONS"
                  :disabled="!store.writable"
                  :title="t('post.imgSizeUnit')"
                  @update:model-value="setImgUnit"
                />
              </div>
              <!-- 高：恒为像素（无百分比选项，理由见上方注释第 2 条） -->
              <span class="isb-cap">{{ t('post.imgSizeHeight') }}</span>
              <div class="isb-input">
                <input
                  class="isb-num"
                  type="number"
                  inputmode="numeric"
                  :min="IMAGE_PX_MIN"
                  :max="IMAGE_PX_MAX"
                  v-model="imgHeightDraft"
                  :placeholder="t('post.imgSizeAuto')"
                  :disabled="!store.writable"
                  :aria-label="t('post.imgSizeHeight')"
                  @keydown.enter.prevent="commitImageHeight"
                  @blur="commitImageHeight"
                />
                <span class="isb-unit-fixed" :title="t('post.imgHeightPxOnly')">px</span>
              </div>
              <!-- 锁定比例：改宽自动按原图比例算高、改高反推宽（用户要求「可选锁定比例」） -->
              <button
                class="tb-btn isb-lock"
                :class="{ on: imgLockRatio }"
                :disabled="!store.writable"
                :title="imgLockRatio ? t('post.imgLockOn') : t('post.imgLockOff')"
                :aria-label="imgLockRatio ? t('post.imgLockOn') : t('post.imgLockOff')"
                :aria-pressed="imgLockRatio"
                @mousedown.prevent
                @click="toggleImgLock"
              >
                <Icon name="lock" :size="15" />
              </button>
              <span class="tb-sep"></span>
              <button
                v-for="opt in IMAGE_PCT_STEPS"
                :key="opt"
                class="tb-btn isb-btn"
                :class="{ on: imgUnit === '%' && imgSizeDraft === opt }"
                :disabled="!store.writable"
                :title="t('post.imgSizePctTip', { n: opt })"
                :aria-label="t('post.imgSizePctTip', { n: opt })"
                @mousedown.prevent
                @click="setImagePct(opt)"
              >
                {{ opt }}%
              </button>
              <span class="tb-sep"></span>
              <!-- 查看原图：用户要求「应当是一个全屏符号」。
                   原先是眼睛图标（eye），语义是「看一眼」；全屏符号（maximize）才表达
                   「铺满屏幕地看」。图表里另有 expand，那是对角双箭头，语义偏「展开面板」。 -->
              <button
                class="tb-btn"
                :title="t('post.imgZoomOpen')"
                :aria-label="t('post.imgZoomOpen')"
                @mousedown.prevent
                @click="openLightboxForSelection"
              >
                <Icon name="maximize" :size="15" />
              </button>
            </div>
          </div>
        </div>

        <!-- 字段编辑侧栏 -->
        <FieldRenderer
          :defs="defs"
          :fields="form.fields"
          :writable="store.writable"
          :skipped="skipRequired"
          :selected="fieldSel"
          @add="mField = {}"
        />
      </div>
    </template>

    <MergeDialog
      v-if="conflicts"
      :conflicts="conflicts"
      @merge="onMerge"
      @forceNew="onForceNew"
      @cancel="conflicts = null"
      @view="
        id => {
          conflicts = null;
          load(id);
        }
      "
    />

    <!-- 草稿箱（收纳自「所有文档」页）：由「新建文档」页头部按钮进入，选中草稿即载入继续编辑 -->
    <Modal v-if="showDrafts" :title="t('post.draftBox')" icon="edit" max-width="560px" @close="showDrafts = false">
      <div class="empty" v-if="!draftRows.length" style="padding: 24px 10px">{{ t('post.draftBoxEmpty') }}</div>
      <div class="draft-list" v-else>
        <div class="draft-item" v-for="d in draftRows" :key="d.id">
          <div class="draft-item-main" @click="pickDraft(d)">
            <b class="draft-item-title">{{ d.title || t('post.unnamedDraft') }}</b>
            <span class="draft-item-meta">
              <span>{{ d.rname ? d.rname + ' / ' : '' }}{{ d.cname || t('common.unclassified') }}</span>
              <span>{{ t('post.updatedAt') }} {{ withTz(d.updated_at) }}</span>
            </span>
          </div>
          <button class="btn btn-sm btn-danger" @click.stop="delDraft(d)" :title="t('post.deleteDraft')">
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- 模板（复用草稿箱的收纳与展示逻辑）：由「新建文档」页头部按钮进入，选中模板即载入预填内容 -->
    <Modal
      v-if="showTemplates"
      :title="t('post.newFromTemplate')"
      icon="layers"
      max-width="560px"
      @close="showTemplates = false"
    >
      <div class="empty" v-if="!templateRows.length" style="padding: 24px 10px">{{ t('post.templateBoxEmpty') }}</div>
      <div class="draft-list" v-else>
        <div class="draft-item" v-for="tpl in templateRows" :key="tpl.id">
          <div class="draft-item-main" @click="pickTemplate(tpl)">
            <b class="draft-item-title">{{ tpl.title || t('post.unnamedTemplate') }}</b>
            <span class="draft-item-meta">
              <span>{{ tpl.rname ? tpl.rname + ' / ' : '' }}{{ tpl.cname || t('common.unclassified') }}</span>
              <span>{{ t('post.noLabel') }} {{ tpl.no || '—' }}</span>
            </span>
          </div>
          <button class="btn btn-sm btn-danger" @click.stop="delTemplate(tpl)" :title="t('post.deleteTemplate')">
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- 历史版本预览（只读）：不改动当前文档，仅把该版本的内容渲染出来供比对 -->
    <Modal
      v-if="previewVer"
      :title="`${t('common.preview')} v${previewVer.version_no}`"
      icon="clock"
      max-width="820px"
      @close="closePreview"
    >
      <template #default="{ requestClose }">
        <div class="pv-head">
          <div class="pv-meta">
            <span>{{ t('post.createdAt') }} {{ withTz(previewVer.created_at) }}</span>
            <span>·</span>
            <span>{{ previewVer.user_name || t('post.system') }}</span>
            <span>·</span>
            <span>{{ previewVer.status === 'draft' ? t('post.draftBadge') : t('post.published') }}</span>
          </div>
          <div class="pv-title">{{ previewVer.title || t('post.untitled') }}</div>
          <!-- ★ Beta.258：把归属与编号一并显示。
             快照存了 region_id/category_id/no，但一直只渲染了标题/标签/正文，
             于是「这一版和当前版差在哪」在快照预览里根本看不出来 ——
             用户只能另开对比弹窗。而大区/分类恰恰是纯元数据改动里最常变的两项。 -->
          <div class="pv-meta pv-meta-sub" v-if="previewVer.rname || previewVer.cname || previewVer.no">
            <span class="region-dot" :style="{ background: regionColorOf(previewVer.region_id) }"></span>
            <span>{{ previewVer.rname || t('post.noRegion') }}</span>
            <template v-if="previewVer.cname">
              <span class="sep">/</span>
              <span>{{ previewVer.cname }}</span>
            </template>
            <span class="sep">·</span>
            <span>{{ t('post.noLabel') }} {{ previewVer.no || '—' }}</span>
          </div>
          <div class="pv-tags" v-if="previewVer.tags && previewVer.tags.length">
            <span class="chip" v-for="tag in previewVer.tags" :key="tag"># {{ tag }}</span>
          </div>
        </div>

        <!-- ★ Beta.253：历史版本的字段数据。
           用户反馈「历史版本与快照没有包含字段数据」—— 数据一直都在快照里
           （getVersionSnapshot 返回 snap.fields），缺的是这块渲染。
           与详情页「字段数据」同形制：表格式、字段名 + code、值。
           没有字段可显示时整块不出现（不留一个空标题占位）。 -->
        <div class="pv-scroll">
          <!-- ★ 字段与正文一起滚动：历史版本快照里的「字段数据」和正文属于同一份
             只读视图，分开滚动会导致字段固定、正文单独滚，用户在长字段/长正文
             场景下无法一屏到底查看。因此把 pv-fields 也放进 pv-scroll。 -->
          <div class="pv-fields" v-if="previewFieldList.length">
            <div class="pv-fields-title">{{ t('post.fieldDataCount', { n: previewFieldList.length }) }}</div>
            <div class="x-scroll">
              <table class="tbl">
                <tbody>
                  <tr v-for="f in previewFieldList" :key="f.code">
                    <td style="width: 200px; color: var(--text-2)">
                      {{ f.name }} <code class="fcode">{{ f.code }}</code>
                    </td>
                    <td>
                      <template v-if="f.type === 'url' && f.value">
                        <a :href="f.value" target="_blank" rel="noopener">{{ f.value }}</a>
                      </template>
                      <b v-else>{{ f.value || '—' }}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ★ data-find-scope：预览历史版本时，查找范围 = 这份版本快照。
             预览弹层是独立于 .post-main 的另一套内容（渲染的是 previewHtml，
             不是当前正文），若不给它标记，查找会因为没有范围容器而退化成
             「整页查找」，从而把弹层背后的原页面正文也搜出来 —— 用户会看到
             计数翻倍、跳转跑到弹层后面去。 -->
          <div class="pv-body post-content" data-find-scope v-html="previewHtml"></div>
        </div>

        <div class="pv-note">
          <Icon name="info" :size="14" />
          <span>{{ t('post.previewNote') }}</span>
        </div>

        <div class="modal-foot">
          <!-- requestClose 先播退场动画再真正置空 previewVer -->
          <button class="btn" @click="requestClose">{{ t('common.close') }}</button>
          <button class="btn btn-primary" v-if="store.writable && canEdit" @click="restoreFromPreview" :disabled="busy">
            {{ t('post.restoreToThis') }}
          </button>
        </div>
      </template>
    </Modal>

    <!-- 编辑内容预览（Beta.329，用户需求「另存为前加预览按钮」）：
         渲染的是「正在编辑、尚未保存」的内容（editPreviewHtml 实时跟随 contentHtml），
         与历史版本预览（previewVer，落库快照）是两份不同数据，故独立一个弹层、
         不共用 previewVer 状态。形制复用 .pv-*（同源样式，不另起一套）。
         ★ 刻意不带 data-find-scope：编辑态查找范围恒为「正在编辑的内容」——
           editFind 只扫 .edit-layout 内的输入框与 PM 正文，不读容器标记；
           弹层是正文的静态副本，圈进去只会误导后来者。 -->
    <Modal v-if="editPreviewOpen" :title="t('common.preview')" icon="eye" max-width="820px" @close="closeEditPreview">
      <template #default="{ requestClose }">
        <div class="pv-head">
          <div class="pv-title">{{ form.title || t('post.untitled') }}</div>
          <!-- 元信息行照查看态形状：大区（带色点）/ 分类 / 编号 / 发布状态。
               保存后查看态能看到的一切，预览时先看到，避免「存完才发现归错区」。 -->
          <div class="pv-meta">
            <span class="region-dot" :style="{ background: editPreviewRegionColor }"></span>
            <span>{{ editPreviewRegionName || t('post.noRegion') }}</span>
            <template v-if="editPreviewCatName">
              <span class="sep">/</span>
              <span>{{ editPreviewCatName }}</span>
            </template>
            <span class="sep">·</span>
            <span>{{ t('post.noLabel') }} {{ form.no || '—' }}</span>
            <span class="sep">·</span>
            <span>{{ form.status === 'draft' ? t('post.draftBadge') : t('post.published') }}</span>
          </div>
        </div>
        <div class="pv-scroll">
          <div class="pv-body post-content" v-html="editPreviewHtml"></div>
        </div>
        <div class="pv-note">
          <Icon name="info" :size="14" />
          <span>{{ t('post.editPreviewNote') }}</span>
        </div>
        <div class="modal-foot">
          <!-- requestClose 先播退场动画再真正关闭（与历史版本预览同口径） -->
          <button class="btn" @click="requestClose">{{ t('common.close') }}</button>
        </div>
      </template>
    </Modal>

    <!-- 版本对比（只读并排）：与「预览」不同，这里左右两栏都是当前正文与快照正文。
         ★ 必须挂在 .post-layout 之外：.versions 是 postfind.test.mjs 断言的
           「0 命中」区域，若对比视图落在它内部或带上 data-find-scope，
           会抢占 postFind.scopes() 的第一优先级，把预览弹层的查找范围顶掉。 -->
    <VersionDiffModal
      v-if="diffState"
      :diff="diffState.diff"
      :version="diffState.version"
      :now="post.updated_at || ''"
      :current-user="store.user && store.user.name"
      @close="diffState = null"
      @zoom="openLightbox($event.src, $event.alt)"
    />

    <!-- 图片原尺寸浮窗（Beta.316，需求 4）：编辑态与查看态共用。
         挂在最外层（与 MergeDialog 同级），避免被 .post-main 的查找范围圈进来，
         也避免放在 v-if="!editing" 分支里导致编辑态用不了。 -->
    <ImageLightbox v-if="lightbox" :src="lightbox.src" :alt="lightbox.alt" @close="lightbox = null" />

    <!-- 快捷新建大区 / 分类 / 字段（复用聚合管理的 Modal，保存后刷新下拉与字段侧栏） -->
    <RegionModal v-if="mRegion" :value="mRegion" @close="mRegion = null" @saved="onRegionSaved" />
    <CategoryModal v-if="mCat" :value="mCat" :regions="store.regions" @close="mCat = null" @saved="onCatSaved" />
    <FieldModal v-if="mField" :value="mField" @close="mField = null" @saved="onFieldSaved" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  store,
  goto,
  bus,
  clearDirty,
  setLeaveGuard,
  clearLeaveGuard,
  findOpen,
  findState,
  findSet,
  refreshRegions
} from '../store';
import { t } from '../i18n';
import { toast, toastErr, toastOk, okMsg, run } from '../feedback';
import { A } from '../api';
import { useSubmit } from '../composables/useSubmit';
import { usePostExports } from '../composables/useExports';
import { confirm } from '../composables/useConfirm';
import { registerEditorCtx } from '../composables/useContextMenu';
import { safeHtml, markSelectableMedia } from '../utils/sanitize';
import {
  normalizeSize,
  parseSize,
  heightForWidth,
  IMAGE_PCT_STEPS,
  IMAGE_PX_MIN,
  IMAGE_PX_MAX
} from '../utils/imageSize';
import { buildPostDiff } from '../utils/postDiff';
import { withTz } from '../utils/timefmt';
import { EditorFind, registerEditorFindProvider, clearEditorFindProvider } from '../utils/editorFind';
import Icon from '../components/Icon.vue';
import MergeDialog from '../components/MergeDialog.vue';
import Modal from '../components/Modal.vue';
import RegionModal from '../components/RegionModal.vue';
import CategoryModal from '../components/taxonomy/CategoryModal.vue';
import FieldModal from '../components/taxonomy/FieldModal.vue';
import FieldRenderer from '../components/post/FieldRenderer.vue';
import VersionHistory from '../components/post/VersionHistory.vue';
import ShareMenu from '../components/post/ShareMenu.vue';
import VersionDiffModal from '../components/post/VersionDiffModal.vue';
import ImageLightbox from '../components/post/ImageLightbox.vue';
import EmojiPicker from '../components/post/EmojiPicker.vue';
import TagCloud from '../components/post/TagCloud.vue';
import Dropdown from '../components/Dropdown.vue';
import ColorPicker from '../components/ColorPicker.vue';
// Beta.328：computeFixedPosition 随链接浮层一起移除（最后的使用点已删），
// 弹层定位统一由 Dropdown / ColorPicker / EmojiPicker 各自封装，本文件不再自算坐标。
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';

/**
 * Highlight 的粘贴兼容版（Beta.315）。
 *
 * 【为什么 extend】外部网页的高亮底色普遍写成 <span style="background-color:...">
 * （浏览器 / Word 复制的通用形态），而官方 Highlight 的 parseHTML 只挂 mark 标签，
 * span 上的 background-color 没有任何 mark 认领 → ProseMirror 静默剥离。
 * 实测对照：同一样式的 color 保留（TextStyle 认领 span）、background-color 丢失，
 * 保存侧 sanitize-html 与渲染侧 DOMPurify 双层白名单均有 background-color —— 根因在
 * schema 解析层，与净化无关，故只能从 parseHTML 规则补。
 *
 * ★ PM 的 style 规则 getAttrs 收到的是「属性值字符串」而非 DOM 元素
 *   （prosemirror-model matchStyle：rule.getAttrs(value)，value 形如 'rgb(255, 255, 0)'）。
 *   写成 element.style.backgroundColor 会直接 TypeError。
 * ★ 不限标签：span / b / td 等任何带 background-color 的元素都解析为 highlight，
 *   与编辑器内「高亮」工具语义一致（段落底色即整段高亮）。
 */
const HighlightPaste = Highlight.extend({
  parseHTML() {
    const parent = typeof this.parent === 'function' ? this.parent() : [];
    return [...parent, { style: 'background-color', getAttrs: value => ({ color: value }) }];
  }
});

/**
 * 正文图片扩展（Beta.316，用户需求 4：「图片应可设置显示大小，点击可浮窗显示原尺寸」）。
 *
 * 【为什么 extend 而不是装 resize 插件】
 *   @tiptap/extension-image 没有尺寸能力，社区插件（tiptap-extension-resize-image 等）
 *   会引入拖拽手柄、额外的 node view 与运行时依赖。而本项目只需要「四档百分比宽度」：
 *   加一个 width 属性 + parseHTML/renderHTML 对齐即可，零新依赖（运行时依赖白名单红线）。
 *
 * 【width 用百分比而不是像素】
 *   正文宽度随窗口/主题字号变化。写死 px 会让同一篇文档在窄窗口里溢出，而百分比
 *   「占正文宽度的多少」在任何窗口下都是用户想表达的意思。
 *   四档 25/50/75/100 与主进程 core.js 的 allowedStyles 白名单严格一致 ——
 *   编辑器能产出的值，净化层一定放行；净化层放行的值，编辑器一定认。
 *
 * 【缺省不写 width 属性】
 *   未设置宽度的图片（历史文档全部如此）输出里不带 width/style，渲染与改动前一致。
 */
const ImageSized = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      /* ★ Beta.322：宽高改为「像素 + 百分比两套单位并存」，并支持锁定比例。
       *
       * 属性与内联 style 的关系（这是本项目踩过两次的坑）：
       *   HTML 的 width/height 属性在**没有 CSS 宽度**时按「像素」解释。
       *   旧实现只写 width="25"，本意是 25%，实际渲染成 25 像素 ——
       *   「发布后图片变得很小」就是这么来的。而只写 style 又会在
       *   导出/再解析时丢掉尺寸。故两处都写，且属性侧一律写**解析后的数值**，
       *   单位信息只由 style 承载。
       *
       * ★ style 必须在 width 这一处一次写全 ★
       *   Tiptap 对多个属性各自返回的 style 是**后者覆盖前者**（不是合并），
       *   若 width 返回 "width:50%"、height 再返回 "height:300px"，
       *   最终只剩 height，宽度丢失。故把两者的 style 串在 width 的 renderHTML 里一次给出。
       */
      width: {
        default: null,
        parseHTML: el => {
          // 优先内联 style（带单位，最准）；退回属性时按像素理解（与浏览器一致）
          const fromStyle = normalizeSize(el.style && el.style.width);
          if (fromStyle) return fromStyle;
          const attr = (el.getAttribute('width') || '').trim();
          if (!attr) return null;
          // 纯数字属性：浏览器按像素处理，故补 px（不是 %）
          return normalizeSize(/^\d+$/.test(attr) ? `${attr}px` : attr);
        },
        renderHTML: attrs => {
          if (!attrs.width) return {};
          const p = parseSize(attrs.width);
          if (!p) return {};
          const h = parseSize(attrs.height);
          let style = `width: ${attrs.width}`;
          if (h && h.unit === 'px') style += `; height: ${h.n}px`;
          const out = { width: String(p.n), style };
          // 高度属性只在锁比例时存在；写进去便于导出后再解析
          if (h && h.unit === 'px') out.height = String(h.n);
          return out;
        }
      },
      // 高度单独作为属性存在（供 updateAttributes 语义清晰），但 style 由 width 统一输出
      height: {
        default: null,
        parseHTML: el => normalizeSize(el.style && el.style.height) || null,
        renderHTML: () => ({})
      }
    };
  }
}).configure({ inline: true, allowBase64: true });

const loaded = ref(false);
const editing = ref(false);
const busy = ref(false);
const post = ref({ versions: [] });
const versions = ref([]);
// 当前文档已不可用（被删除 / 不存在）：由全局刷新静默发现后置真，视图改显示占位提示。
// 用于取代原先「弹错误气泡 + 强行跳转」的粗暴处理——刷新是只读操作，不应弹错也不应改导航位置。
const unavailable = ref(false);
const defs = ref([]);
const cats = ref([]);
const categoryOptions = computed(() => [
  { value: null, label: t('common.unclassified') },
  ...cats.value.map(c => ({ value: c.id, label: c.name }))
]);
const allTags = ref([]);
const showVersions = ref(false);
// 单篇分享导出（Beta.242）：后端两条独立通道 post:exportMd / post:exportPdf，
// 传的是文档 id（不是筛选条件），故用独立的 usePostExports 而非批量那套 useExports。
const postIdForExport = computed(() => post.value.id);
const { exportOneMd, exportOnePdf } = usePostExports(postIdForExport);
const conflicts = ref(null);
// 编辑起点的原始值（进入编辑态时快照，新建态为 null）。
// 保存前查重时用来判断"本次是否真的改过这个字段"：
// 值没变的字段不参与查重，避免历史遗留的重复值把用户永久锁死。
// 详见 electron/db/posts.js 的 checkDuplicates 注释。
const originalFields = ref(null);
const originalTitle = ref(null);
// 草稿箱：收纳自「所有文档」页，仅在新建模式下从页面头部按钮进入
const showDrafts = ref(false);
const draftRows = ref([]);
const draftCount = computed(() => draftRows.value.length);
// 模板（复用草稿箱的收纳与展示逻辑）：编辑态「存为模板」+ 新建页「从模板新建」
const showTemplates = ref(false);
const templateRows = ref([]);
const templateCount = computed(() => templateRows.value.length);
// 快捷新建大区/分类/字段（编辑页内联入口，复用聚合管理的 Modal）
const mRegion = ref(null);
const mCat = ref(null);
const mField = ref(null);
let regionIdsBefore = new Set(); // 打开大区弹窗前的已有 id 快照，保存后按差集定位新建大区
let catIdsBefore = new Set(); // 打开分类弹窗前的已有 id 快照，保存后按差集定位新建分类
// 必填字段「暂不填」勾选状态：{ 字段code: true }，勾选后本次保存跳过该项必填校验
const skipRequired = reactive({});
// 字段多选：{ 字段code: true }，仅勾选的字段才渲染填写框并参与保存
const fieldSel = reactive({});
const tagInput = ref('');
// 标签云弹窗开关（Beta.279：取代原生 datalist）
const tagCloudOpen = ref(false);
// 单篇文档的标签上限：后端 resolveTagIds 只取前 20 个、输入框 maxlength 20 是名称长度，
// 这里 10 是「个数」上限。原先是散在模板与函数里的 6 个裸 10，改口径时要一处不漏地找，
// 收成一个常量，模板直接读它（constants 必须 expose 到模板，见 return / defineExpose 不需要，
// script setup 顶层常量本来就对模板可见）。
const MAX_TAGS = 10;
const titleRef = ref(null);
// 正文同步：ProseMirror 文档不是响应式，经 onUpdate 手动同步，才能纳入变更追踪
const contentHtml = ref('');
/* ---- 富文本编辑器（Tiptap / ProseMirror，Beta.315 起取代 contenteditable + execCommand）----
 *
 * 【为什么换】execCommand 是已废弃的浏览器遗留 API：撤销栈不可控（浏览器栈与我们的
 *   脏数据比对各玩各的）、粘贴不净化（外部网页样式直接灌进正文）、标记嵌套混乱
 *   （<b><i></b></i> 这类非法结构随时出现）。ProseMirror 的 schema 白名单天然解决
 *   后两个问题，事务级撤销栈解决第一个。
 *
 * 【扩展清单口径】bold/italic/underline/strike/heading/list/quote/hr/codeBlock/history
 *   已在 StarterKit 3.x 内置（3.32 起 underline/link 也并入，勿再单装扩展包）；
 *   Image 必须显式 allowBase64 —— 3.6+ 起默认拒绝 data: URI，而本项目图片全部
 *   base64 内联（数据铁律），不开启等于库存图片在编辑器里集体消失。
 *   inline: true 让图片成为行内节点，与「图片插在段落中」的既有形态一致。
 * ★ Beta.328：`link: false` 彻底摘除链接扩展（用户要求「禁止插入链接」）。
 *   按钮/浮层只是入口，粘贴网页里的 <a>、从别处拖入的链接照样能造出链接标记，
 *   所以必须从 schema 上禁掉：扩展不在表里，ProseMirror 解析 <a> 时
 *   mark 无对应类型直接丢弃（文本保留、不成链接），输入裸网址也只是纯文本。
 *   代价：存量正文里的历史链接在编辑器载入时会被剥成纯文本；用户一旦保存，
 *   落库正文即不再带链接 —— 与「放弃旧数据兼容」的既定口径一致，
 *   查看态（safeHtml）仍按原样渲染存量内容，不会 silently 改写未编辑的文档。
 */

/* ★ 选区版本号（Beta.320）：驱动工具栏所有「随光标变化」的状态重算。
 *
 * 【为什么必须有这个变量】
 *   ProseMirror 的 state 是普通对象，不是 Vue 响应式数据。光标移动时
 *   `editor.value.state.selection` 变了，但 Vue 收不到任何通知 ——
 *   于是所有 `computed(() => editor.value.isActive(...))` 都不会重算。
 *   现象：光标从「红色加粗文字」移到「黑色正文」后，
 *       加粗按钮仍是按下态、颜色按钮仍显示红色。
 *
 * 【为什么用自增数字而不是把 selection 存进 ref】
 *   存 selection 对象需要保持引用不变才能触发，容易踩「同一个对象赋回去不算变化」
 *   的坑；自增计数最笨也最可靠：每次选区变化就 +1，computed 依赖它即可。
 *
 * 【为什么同时挂 onUpdate / onCreate】
 *   onSelectionUpdate 覆盖光标移动与拖选；但「内容变化」也可能改变当前格式
 *   （例如撤销一步、粘贴一段带格式的文字），此时选区未动，仍要重算一次。
 */
const selectionTick = ref(0);
const bumpSelection = () => {
  selectionTick.value++;
};

/* 【模板统一入口】工具栏按钮的「按下态」只走这一个函数。
 *   为什么要函数、不各写 `editor && editor.isActive('x')`：
 *   模板里直接取 `editor.value.isActive(...)` 不属于响应式依赖，光标动了不会重渲染。
 *   把 `selectionTick` 的读取收进这里，模板每处调用都是一次依赖登记，
 *   加粗/斜体/标题/列表/引用/代码块/链接……全部一次修好，不必逐处补 `void`。
 *   参数透传，故 `isOn('heading', { level: 2 })` 这类带属性的判断照样可用。 */
const isOn = (name, attrs) => {
  void selectionTick.value;
  const e = editor.value;
  return !!e && e.isActive(name, attrs);
};

const editor = useEditor({
  extensions: [
    // link: false —— 禁止插入链接（Beta.328，理由见上方头注释）
    StarterKit.configure({ link: false }),
    ImageSized,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Superscript,
    Subscript,
    TextStyle,
    Color,
    FontSize,
    // HighlightPaste：官方 Highlight + span 等不限标签的 background-color 解析规则
    // （粘贴网页高亮不丢底色；编辑器内 setHighlight / unsetHighlight 行为不变）
    HighlightPaste.configure({ multicolor: true }),
    // placeholder 传函数：文案在使用时求值，切换语言后新渲染的编辑器即用新语言
    Placeholder.configure({
      placeholder: () => t('post.editorPlaceholder'),
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty'
    }),
    // EditorFind（Beta.315 / #418）：编辑态页内查找的正文高亮。查询由 editFind 写入
    // editorFindQuery，本扩展只按它生成 PM decoration；空事务即可驱动重算
    // （见 utils/editorFind.js 头注释里的 prosemirror-view 实证）。
    EditorFind
  ],
  content: '',
  editorProps: {
    attributes: { spellcheck: 'false' }
  },
  onUpdate: () => {
    contentHtml.value = editor.value ? editor.value.getHTML() : '';
    markDirty();
    // 内容变了当前格式可能也变了（撤销、粘贴带格式文本），工具栏要重算
    bumpSelection();
  },
  // ★ 光标移动 / 拖选：工具栏全部格式状态依赖这里刷新（见 selectionTick 注释）
  onSelectionUpdate: bumpSelection,
  onCreate: bumpSelection
});
// 只读态（数据库不可写 / 全局只读模式）：同步禁用编辑
watch(
  () => store.writable,
  w => {
    if (editor.value) editor.value.setEditable(!!w);
  }
);
// 编辑态任意用户输入即标记脏数据（双保险，确保离开守卫一定能检测到修改）
function markDirty() {
  if (tracking.value) store.dirty = true;
}
// 编辑基线快照 + 是否正在追踪修改的开关
const editSnapshot = ref('');
const tracking = ref(false);
// 编辑表单：必须在 snapshot 计算属性之前声明，否则 watch(snapshot) 初始化求值时
// 会立即访问 form 而触发 TDZ（Cannot access 'form' before initialization）
// ★ Beta.253：编辑态新增「所属大区」下拉后，大区不再只有「文档原值 / 进入时上下文」两个来源，
//   用户可以在编辑页把它改掉。故必须单独存一份 form.regionId —— 它是唯一权威的"本次提交用哪个大区"。
//   新建态：由进入时的上下文（区域页/分类页/首页）决定，仍取 store.params.regionId。
//   编辑态：enterEdit() 从文档原值初始化；用户改了下拉就跟着变；未改则与文档原值一致。
//   不能沿用 post.value.region_id —— 那是"库里现在是什么"，不是"用户想提交什么"。
const form = reactive({
  id: null,
  title: '',
  regionId: null,
  categoryId: null,
  tags: [],
  fields: {},
  status: 'published',
  no: ''
});
// 当前编辑内容快照（标题/分类/状态/标签/字段/正文），任意字段变更都会触发重算
// Beta.327：tags 与 buildDraft 同走 cleanTags —— 两条链路口径一致，
//   删掉空 chip 后「表单 ≠ 基线」的比对才不会与「后端判无改动」打架。
const snapshot = computed(() =>
  JSON.stringify({
    title: form.title,
    categoryId: form.categoryId,
    status: form.status,
    tags: cleanTags(form.tags),
    fields: form.fields,
    content: contentHtml.value
  })
);
// 自动比对：仅当实际内容与基线不同才把 store.dirty 置真（即"有修改"才算脏，而非进入编辑即脏）
watch(snapshot, () => {
  if (tracking.value) store.dirty = snapshot.value !== editSnapshot.value;
});

// 自定义字段由 FieldRenderer 直接写入 form.fields，深度监听以确保编辑即标记脏
watch(
  () => form.fields,
  () => markDirty(),
  { deep: true }
);

const renderedHtml = computed(() => markSelectableMedia(safeHtml(post.value.content_html)));
// 归属：无主文档（author_id 为空）任何人可改；否则仅创建者可改（后端同样强制拦截）
const canEdit = computed(() => {
  const a = post.value.author_id;
  return !a || String(a) === String(store.user && store.user.id);
});
// 仅展示本文实际填写过的字段：未使用（值为空）的字段不展示
const fieldList = computed(() =>
  defs.value
    .map(d => ({ ...d, value: (post.value.fields || {})[d.code] || '' }))
    .filter(f => String(f.value).trim() !== '')
);
const regionName = computed(() => {
  const rid = form.id ? post.value.region_id : store.params.regionId;
  const r = store.regions.find(x => x.id === rid);
  return r ? r.name : '';
});
// ★ Beta.253：历史版本预览的字段列表。
// 【用户报的缺陷】「历史版本与快照没有包含字段数据」—— 后端 getVersionSnapshot
//   一直有返回 fields（已实测：快照 JSON 里 5 个字段一个不少），
//   是**预览弹层压根没渲染这一块**，只画了标题/标签/正文。
//   于是用户看到的历史版本像"缺了一半信息"：正文是旧的，字段却不可见，
//   无法判断「当时那个编号到底是哪个」。
// 【口径】与详情页的 fieldList 保持一致（未填写的字段不展示），
//   这样"预览 v1"和"看当前文档"两块字段区的形状完全一样，可直接对照。
//   字段名走 defs 的 code→name 映射；defs 里没有的 code（字段定义后来被删过）
//   兜底显示 code 本身，绝不静默丢弃 —— 历史快照的价值就在于完整。
const previewFieldList = computed(() => {
  const snap = previewVer.value;
  if (!snap) return [];
  const f = snap.fields || {};
  return Object.keys(f)
    .map(code => {
      const d = defs.value.find(x => x.code === code);
      return { code, name: d ? d.name : code, type: d ? d.type : '', value: f[code] || '' };
    })
    .filter(x => String(x.value).trim() !== '');
});
// 当前文档所属大区 id —— 快捷新建分类/字段时的默认归属大区。
// ★ Beta.279：新建态也必须读 form.regionId，不能读 store.params.regionId。
//   大区下拉解锁之后，新建态用户随时可能把大区从 A 改成 B；若这里仍取「进入上下文」，
//   点「新建分类」会把分类建在 A 大区下，再自动选用到一篇归属 B 大区的文档上 ——
//   正是 onRegionChange 严防的「跨大区挂分类」，且这次是静默产生的。
//   编辑态 form.regionId 在 enterEdit 里已初始化为文档当前大区，两者行为一致。
const currentRegionId = computed(() => form.regionId || post.value.region_id || store.params.regionId);

// 本次提交要写入的大区 id（唯一权威来源）。
// ★ Beta.253：此前 buildDraft() 直接取 post.value.region_id（"库里现在是什么"），
//   有了编辑态大区下拉后，这个来源必须换成 form.regionId（"用户想提交什么"）。
//   两者只在「用户改了大区」时不同，而那正是这个下拉存在的意义 —— 用旧来源会让下拉形同虚设：
//   界面显示已切到 B 大区，落库写的却还是 A 大区，用户会以为"改了没生效"。
//   兼容两个空值来源：新建态走 store.params.regionId；两处都空则原样返回（由 save() 拦「缺少所属大区」）。
// ★ Beta.279：不再按 form.id 分叉 —— 新建态同样以 form.regionId 为准
//   （它进页时已初始化为 store.params.regionId，之后用户改了就以改后为准）。
//   旧写法 `if (form.id) return form.regionId; return store.params.regionId` 会让
//   新建态的大区下拉完全失效：界面切到 B，落库仍是进页时的 A。
const draftRegionId = computed(() => form.regionId || store.params.regionId);

function back() {
  // 返回上级大区。优先用文档自身的 region_id：
  // 详情模式下 form.id 为 null（仅 enterEdit 时才赋值），旧写法
  //   `form.id ? post.value.region_id : store.params.regionId`
  // 会走 store.params.regionId；而各入口（首页/大区页/搜索/所有文档）
  // 都是 goto('post', { id })，params 里没有 regionId → undefined → 误跳首页。
  // 删除文档后回到上级大区尤其依赖这里，故改为直接取文档所属大区。
  // 返回值：goto 是 async，返回其 Promise 供调用方 await（删除路径需要等导航真正完成）。
  const rid = (post.value && post.value.region_id) || store.params.regionId;
  return rid ? goto('region', { id: rid }) : goto('home');
}

function gotoAuthor() {
  if (!post.value.author_id) return;
  goto('posts', { authorId: post.value.author_id, authorName: post.value.author_name });
}

// 已被删除的文档 id：删除成功后记下，防止任何滞后的 reloadCurrent()/watch 再次
// 拉取该 id 时误报「文档不存在」（那是删除流程的正常结果，不该当成错误提示）。
let deletedId = null;
// 本页是否正在「删除后离开」：删除成功 → back() → 组件卸载之间有一小段窗口期，
// 期间 store.params 会被 goto() 改写，从而触发 watch(() => store.params, init)；
// 而 init() 会拿 store.params.id（其实是【大区 id】）去 load()，把大区 id 当成
// 文档 id 拉取 —— posts 与 regions 的主键各自 AUTOINCREMENT、编号空间重叠，
// 于是要么加载到无关文档，要么返回 null 误弹「文档不存在」。
// 置此标志后，离场窗口内 init()/reloadCurrent() 一律直接返回，不再取数。
let leavingAfterDelete = false;

async function load(id) {
  if (leavingAfterDelete) return false;
  if (deletedId != null && String(deletedId) === String(id)) return false;
  const p = await A.post({ id });
  if (!p) {
    toast(t('post.notFound'), 'err');
    back();
    return false;
  }
  unavailable.value = false;
  post.value = p;
  versions.value = p.versions || [];
  loaded.value = true;
  // 浏览打点：供托盘菜单「最近浏览」使用（主进程落地 userData/view-history.json）。
  // fire-and-forget：失败只影响托盘列表新鲜度，不阻断面开文档本身。
  // 只在打开已存在文档时记 —— 新建态（form.id 为空）没有"浏览"可言。
  try {
    A.markView && A.markView({ id: p.id, title: p.title });
  } catch (e) {
    /* 静默 */
  }
  return true;
}

async function enterEdit() {
  editing.value = true;
  form.id = post.value.id;
  form.title = post.value.title;
  form.regionId = post.value.region_id; // ★ Beta.253：编辑态大区下拉的初值 = 文档当前所属大区
  form.categoryId = post.value.category_id;
  // Beta.327：载入即过 cleanTags —— 存量文档若带空名标签（旧版本写入），
  // 界面不再渲染空 chip；与后端读侧过滤（TRIM(t.name)<>''）双保险
  form.tags = cleanTags(post.value.tags);
  form.fields = { ...(post.value.fields || {}) };
  form.status = post.value.status;
  form.no = post.value.no || '';
  // ★ 记录编辑起点，供保存时的查重做「本次是否改过该字段」的比对。
  //   不记的话，历史遗留的重复值会把用户永久锁死：那个字段本次没动，
  //   却每次保存都被「发现字段重复」拦住，三个按钮里没有一个能保存他的修改。
  //   详见 electron/db/posts.js 的 checkDuplicates 注释。
  //   必须是深拷贝的纯值：form.fields 后续会被就地改写，引用同一对象会一起变。
  originalFields.value = JSON.parse(JSON.stringify(post.value.fields || {}));
  originalTitle.value = post.value.title || '';
  tracking.value = false;
  await nextTick();
  const html = post.value.content_html || '';
  if (editor.value) editor.value.commands.setContent(html, false);
  contentHtml.value = html;
  editSnapshot.value = snapshot.value;
  store.dirty = false;
  tracking.value = true;
  resetSkipRequired();
  syncFieldSel(post.value.fields);
  if (titleRef.value) titleRef.value.focus();
}

async function newPostMode() {
  editing.value = true;
  form.id = null;
  form.title = '';
  form.regionId = store.params.regionId; // ★ Beta.253：新建态的大区由进入上下文决定
  form.categoryId = store.params.categoryId || null;
  form.tags = [];
  form.fields = {};
  form.status = 'published';
  form.no = '';
  // 新建态没有"原值"可比 —— 清空后 checkDuplicates 会回到全量查重（所有非空值都查），
  // 与改动前的行为一致。若不清空，上一次编辑留下的旧基准会误豁免本次的新值。
  originalFields.value = null;
  originalTitle.value = null;
  tracking.value = false;
  await nextTick();
  if (editor.value) editor.value.commands.setContent('', false);
  contentHtml.value = '';
  editSnapshot.value = snapshot.value;
  store.dirty = false;
  tracking.value = true;
  if (titleRef.value) titleRef.value.focus();
  resetSkipRequired();
  resetFieldSel();
  loadDrafts(); // 非阻塞：仅刷新头部「草稿箱」按钮的徽标数量
  loadTemplates(); // 非阻塞：仅刷新头部「模板」按钮的徽标数量
}

async function cancelEdit() {
  if (store.dirty) {
    const ok = await confirm(t('post.confirmDiscardEdit'), { danger: true });
    if (!ok) return;
  }
  clearDirty();
  editing.value = false;
  // ★ Beta.257：取消编辑的去向按「本页是不是这条文档的详情页」分流。
  //   编辑模式是**同页切换**（v-if="!editing" / v-else），不是另开一个页面，
  //   所以「取消」的自然语义是「回到我刚才看的那个详情」，
  //   而不是把用户甩回上级大区让他自己再找回来 —— 之前一律 back() 就是这个 bug。
  //   判据用 post.value.id === form.id：说明当前详情页渲染的正是这条文档，
  //   属于「详情 → 编辑 → 取消」的往返，落下 editing=false 即完成返回；
  //   查看模式渲染的是 post.value（未被表单改动污染），所以无需重新 load()。
  //   真正的「新建文档」form.id 为 null，没有可回退的详情页，仍走 back()。
  if (post.value && form.id && post.value.id === form.id) return;
  back();
}

/* ---- 草稿箱（唯一入口：新建文档页头部按钮）---- */
async function loadDrafts() {
  try {
    const r = await A.posts({ status: 'draft', limit: 500, offset: 0 });
    draftRows.value = r.rows || [];
  } catch (e) {
    /* 拉取失败不阻塞新建，徽标保持原值 */
  }
}
async function openDrafts() {
  await loadDrafts();
  showDrafts.value = true;
}
async function pickDraft(d) {
  if (busy.value || d.id === form.id) {
    showDrafts.value = false;
    return;
  }
  if (store.dirty) {
    const ok = await confirm(t('post.confirmOpenDraft'), { danger: true });
    if (!ok) return;
  }
  showDrafts.value = false;
  clearDirty();
  if (await load(d.id)) {
    cats.value = await A.cats({ regionId: post.value.region_id });
    await enterEdit();
  }
}

/* ---- 模板（复用草稿箱的收纳与展示）：编辑态「存为模板」 + 新建页「从模板新建」 ---- */
async function loadTemplates() {
  try {
    const r = await A.posts({ status: 'template', limit: 500, offset: 0 });
    templateRows.value = r.rows || [];
  } catch (e) {
    /* 拉取失败不阻塞新建 */
  }
}
async function openTemplates() {
  await loadTemplates();
  showTemplates.value = true;
}
async function pickTemplate(tpl) {
  if (busy.value) return;
  if (store.dirty) {
    const ok = await confirm(t('post.confirmUseTemplate'), { danger: true });
    if (!ok) return;
  }
  showTemplates.value = false;
  clearDirty();
  // 把大区上下文切到模板所属大区，保证分类下拉与编号前缀一致（改属性不触发 init watch）
  if (tpl.region_id) store.params.regionId = tpl.region_id;
  // 载入模板预填内容到「新建」编辑态（form.id 置空，编号留空由系统生成）
  form.id = null;
  form.title = tpl.title || '';
  form.regionId = tpl.region_id || store.params.regionId; // ★ Beta.253：模板自带大区优先
  form.categoryId = tpl.category_id || null;
  // Beta.327：模板同样可能带存量空标签，载入即清洗（与 enterEdit 同口径）
  form.tags = cleanTags(tpl.tags);
  form.fields = { ...(tpl.fields || {}) };
  form.status = 'published';
  form.no = '';
  tracking.value = false;
  await nextTick();
  const html = tpl.content_html || '';
  if (editor.value) editor.value.commands.setContent(html, false);
  contentHtml.value = html;
  editSnapshot.value = snapshot.value;
  store.dirty = false;
  tracking.value = true;
  if (titleRef.value) titleRef.value.focus();
  await nextTick();
  cats.value = await A.cats({ regionId: store.params.regionId });
  syncFieldSel(tpl.fields);
}
/* ---- 另存为（存为草稿 / 存为模板）----
 * 这两件事此前是「存为草稿」复选框 + 「存为模板」图标按钮，与旁边的
 * 「草稿箱」「模板」图标挤在一排，四个控件语义两两重叠。现收进一个下拉：
 * 下拉里是「动作」，页头上留的是「入口」。 */
const saveAsOptions = computed(() => [
  { value: 'draft', label: t('post.saveAsDraftItem'), icon: 'edit' },
  { value: 'template', label: t('post.saveAsTemplate'), icon: 'layers' }
]);

function onSaveAs(v) {
  if (v === 'draft') saveAsDraftNow();
  else if (v === 'template') saveAsTemplate();
}

/* 存为草稿：以 status='draft' 立即落库（而不是像原来那样先勾复选框、再点保存），
 * 让「另存为」的每一项都是「点完就生效」的同等语义。 */
async function saveAsDraftNow() {
  await save('draft');
}

async function saveAsTemplate() {
  if (!form.title || busy.value) return;
  const draft = buildDraft();
  draft.id = null;
  draft.status = 'template';
  draft.no = ''; // 模板不储存文档编号，仅保留其余全部内容（标题/分类/字段/标签/正文）
  busy.value = true;
  try {
    await A.postSave(draft);
    toastOk(t('post.savedAsTemplate'));
    // 模板同样占用大区 post_count（口径为 deleted_at IS NULL，不限 status）
    bus.emit('refresh');
  } catch (e) {
    toastErr(e);
  } finally {
    busy.value = false;
  }
}
async function delTemplate(tpl) {
  await submit(() => A.postDelete({ id: tpl.id }), {
    password: true,
    passwordMessage: t('post.delTemplatePwd', { title: tpl.title || t('post.unnamedTemplate') }),
    ok: t('post.templateDeleted'),
    then: () => {
      templateRows.value = templateRows.value.filter(x => x.id !== tpl.id);
      bus.emit('refresh');
    }
  });
}
async function delDraft(d) {
  await submit(() => A.postDelete({ id: d.id }), {
    password: true,
    passwordMessage: t('post.delDraftPwd', { title: d.title || t('post.unnamedDraft') }),
    ok: t('post.draftDeleted'),
    then: () => {
      draftRows.value = draftRows.value.filter(x => x.id !== d.id);
      bus.emit('refresh');
    }
  });
}

/* ---- 必填字段「暂不填」：每次进入编辑模式重置勾选（勾选仅对本次保存生效）---- */
function resetSkipRequired() {
  Object.keys(skipRequired).forEach(k => {
    delete skipRequired[k];
  });
}
/* ---- 字段多选：根据已填值同步勾选（编辑已有文档时还原已填字段；新建时清空）---- */
function resetFieldSel() {
  Object.keys(fieldSel).forEach(k => {
    delete fieldSel[k];
  });
}
function syncFieldSel(fieldsObj) {
  resetFieldSel();
  const f = fieldsObj || {};
  defs.value.forEach(d => {
    if (String(f[d.code] || '').trim() !== '') fieldSel[d.code] = true;
  });
}

/* ---- 快捷新建大区 / 分类 / 字段（编辑页内联入口）---- */
function openRegionModal() {
  regionIdsBefore = new Set(store.regions.map(r => r.id));
  mRegion.value = { name: '', code: '' };
}
async function onRegionSaved() {
  mRegion.value = null;
  await refreshRegions();
  // 按差集定位刚新建的大区并自动选用，省去手动再选一步
  const fresh = store.regions.find(r => !regionIdsBefore.has(r.id));
  if (fresh) {
    form.regionId = fresh.id;
    await onRegionChange();
  }
}
function openCatModal() {
  if (!currentRegionId.value) {
    toast(t('post.noRegionForCat'), 'err');
    return;
  }
  catIdsBefore = new Set(cats.value.map(c => c.id));
  mCat.value = { regionId: currentRegionId.value };
}
async function onCatSaved() {
  mCat.value = null;
  cats.value = await A.cats({ regionId: currentRegionId.value });
  // 按差集定位刚新建的分类并自动选用，省去手动再选一步
  const fresh = cats.value.find(c => !catIdsBefore.has(c.id));
  if (fresh) form.categoryId = fresh.id;
}

/* ---- 「所属大区」下拉（Beta.253 编辑态引入，Beta.279 新建态放开）----
 *
 * 【为什么要有这个下拉】此前编辑页只能显示大区名（只读 badge），想把一条文档
 *   挪到别的大区，只能删了重建。大区是文档的**一级归类**，也是最常需要纠正的属性
 *   （归档时选错大区是高频失误），必须可改。
 *
 * 【联动链】大区一变，两件事必须跟着变，否则会写出脏数据：
 *   ① **分类**：分类是大区的子集（categories.region_id）。大区改了，
 *      原分类必然不属于新大区 —— 必须清空已选分类并重新拉新大区的分类列表。
 *      不清空的话，落库就是「B 大区的文档挂着 A 大区分类」，两处数据自相矛盾。
 *   ② **文档编号前缀**：后端按「大区-分类-年份-序号」生成编号（见保存接口）。
 *      已存在的编号保持不动（formId 有值时后端不重算），新编号才会用新大区前缀。
 *
 * 【适用范围】Beta.279 起**新建态与编辑态都可切换**。
 *   旧决策是「新建态由进入上下文（store.params.regionId）决定，不给下拉」，
 *   实际用起来是个硬伤：从 A 大区点进新建、填到一半才发现该归 B，只能取消重来。
 *   现在两条路径共用本函数 —— 新建态改大区同样要清分类、重拉列表，
 *   否则保存下去就是跨大区挂分类。权威来源统一为 form.regionId（见 draftRegionId），
 *   权限上只要求 store.writable：大区列表本来就是「我能访问的大区」。
 */
const regionOptions = computed(() => store.regions.map(r => ({ value: r.id, label: r.name })));
async function onRegionChange() {
  // 大区换了 → 分类的归属父级也换了，旧选中项必须作废（否则跨大区挂分类）
  form.categoryId = null;
  markDirty();
  if (!draftRegionId.value) {
    cats.value = [];
    return;
  }
  try {
    cats.value = await A.cats({ regionId: draftRegionId.value });
  } catch (e) {
    // 拉取失败只影响下拉可选项，不清空已选值，也不阻塞保存（后端仍会校验归属）
    cats.value = [];
  }
}

async function onFieldSaved() {
  mField.value = null;
  defs.value = await A.fields();
}

/* ---- 书写工具（Tiptap chain）----
 * 所有命令统一走 editor.chain().focus()：focus 保证命令作用于编辑器当前选区，
 * 与旧实现 exec() 里的 editorRef.focus() 语义一致。
 * run() 只构建一次 chain（避免 ed() && ed() 双链路的重复 focus），
 * 且编辑器未就绪 / 只读态下点击一律安全无操作。
 * isEditable 是纵深防线：模板按钮已按 store.writable 置 disabled，
 * 这里再兜一次 —— 万一 writable 与 setEditable 出现时序窗口（watch 是异步派发的），
 * 命令也不会写进只读文档。 */
function chainRun(fn) {
  if (!editor.value || !editor.value.isEditable) return;
  fn(editor.value.chain().focus()).run();
}
const TB = {
  undo: () => chainRun(c => c.undo()),
  redo: () => chainRun(c => c.redo()),
  bold: () => chainRun(c => c.toggleBold()),
  italic: () => chainRun(c => c.toggleItalic()),
  underline: () => chainRun(c => c.toggleUnderline()),
  strike: () => chainRun(c => c.toggleStrike()),
  super: () => chainRun(c => c.toggleSuperscript()),
  sub: () => chainRun(c => c.toggleSubscript()),
  h1: () => chainRun(c => c.toggleHeading({ level: 2 })),
  h2: () => chainRun(c => c.toggleHeading({ level: 3 })),
  paragraph: () => chainRun(c => c.setParagraph()),
  splitPara: () => chainRun(c => c.splitBlock()),
  ul: () => chainRun(c => c.toggleBulletList()),
  ol: () => chainRun(c => c.toggleOrderedList()),
  quote: () => chainRun(c => c.toggleBlockquote()),
  hr: () => chainRun(c => c.setHorizontalRule()),
  codeBlock: () => chainRun(c => c.toggleCodeBlock()),
  clearFormat: () => chainRun(c => c.unsetAllMarks().clearNodes()),
  setColor: c => chainRun(ch => ch.setColor(c)),
  setHighlight: c => chainRun(ch => ch.setHighlight({ color: c })),
  setFontSize: s => chainRun(ch => ch.setFontSize(s))
};

/* ---- 排版下拉：对齐 / 字号（文字颜色与高亮复用 ColorPicker 取色器）---- */
/* 对齐四项各自有图形（Lucide text-align-*）。★ 触发器图标随当前值变化 ★
 * 原先触发器固定画一个「四条横线」的图形，和下拉里四个选项图几乎一样，
 * 用户分不清哪个是状态、哪个是按钮；现在触发器直接显示当前对齐形。 */
const ALIGN_ITEMS = [
  { value: 'left', key: 'post.alignLeft', icon: 'align-left' },
  { value: 'center', key: 'post.alignCenter', icon: 'align-center' },
  { value: 'right', key: 'post.alignRight', icon: 'align-right' },
  { value: 'justify', key: 'post.alignJustify', icon: 'align-justify' }
];
const alignOptions = computed(() => ALIGN_ITEMS.map(a => ({ value: a.value, label: t(a.key), icon: a.icon })));
/** 触发器图标 = 当前对齐项的图标（分辨不出时回落左对齐） */
const alignIcon = v => (ALIGN_ITEMS.find(a => a.value === v) || ALIGN_ITEMS[0]).icon;
const curAlign = computed(() => {
  // isOn 内部读 selectionTick：光标移入另一段对齐方式不同的文字时，触发器图标要跟着换
  const hit = ALIGN_ITEMS.find(a => isOn({ textAlign: a.value }));
  return hit ? hit.value : 'left';
});
function onAlignChange(v) {
  // ★ Beta.319 修：原先写的是 run(c => c.setTextAlign(v))，但本文件只有 chainRun，
  // 从来没有 run。调用未定义标识符 → 抛 ReferenceError，被上层 catch 成
  // 「Cannot read properties of undefined (reading 'setTextAlign')」，
  // 表现为「改对齐方式完全没反应」。对齐扩展本身是注册过的（TextAlign.configure），
  // 错的只是这一处调用方式。走 chainRun 与其它格式按钮同一路径。
  chainRun(c => c.setTextAlign(v));
}
/* ---- 字号（Beta.328：改为「Word 字号框」形态）----
 * 【用户原话】「字号选择按钮应当显示当前字号并可自定义」。
 * 【为什么选项改成数字】原先五档是「小号/正常/大号/特大」的语义名，
 *   触发器又是个固定图标 —— 用户既看不出当前是几号字，自定义值（如 17px）
 *   也不在选项里、selectedLabel 匹配不上只会显示占位符。
 *   现在选项直接标像素值，触发器经 Dropdown 的 triggerLabel 显示当前值，
 *   未设置时显示「默认字号」；自定义行经 #extra 插槽挂在下拉尾部。
 * 【i18n 口径】只有「默认字号」需要翻译（其余是数字，数字不翻译）；
 *   文案在 computed 里求值，切语言即时生效（ui-theme-rules 第 3 节）。 */
const FONT_SIZES = [
  { value: '', key: 'post.fontSizeDefault' },
  { value: '12px' },
  { value: '14px' },
  { value: '16px' },
  { value: '20px' }
];
const fontSizeOptions = computed(() => FONT_SIZES.map(f => ({ value: f.value, label: f.key ? t(f.key) : f.value })));
/** 触发器显示文字：当前字号（含自定义值）；未设置显示「默认字号」 */
const fontSizeTriggerLabel = computed(() => curFontSize.value || t('post.fontSizeDefault'));
const curFontSize = computed(() => {
  if (!isOn('textStyle')) return ''; // isOn 顺带登记了选区依赖
  return editor.value.getAttributes('textStyle').fontSize || '';
});
function onFontSizeChange(v) {
  if (v) TB.setFontSize(v);
  else chainRun(c => c.unsetFontSize());
}
/* 自定义像素字号：输入框 + 确定。取值范围 8–96 px（正文场景的实用区间），
 * 越界时钳到边界并提示，不静默丢用户输入。 */
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 96;
const fsDraft = ref('');
function applyCustomFontSize() {
  const n = parseInt(fsDraft.value, 10);
  if (!Number.isFinite(n)) return;
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n));
  if (clamped !== n) toast(t('post.fontSizeRange', { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX }));
  TB.setFontSize(`${clamped}px`);
  fsDraft.value = '';
}
// 当前光标处的文字颜色 / 高亮色（供 ColorPicker 回显；'' 表示未设置）
// ★ 走 isOn：光标移到别处时按钮要立刻显示那一段的真实颜色
const curColor = computed(() => (isOn('textStyle') ? editor.value.getAttributes('textStyle').color || '' : ''));
const curHighlight = computed(() => (isOn('highlight') ? editor.value.getAttributes('highlight').color || '' : ''));

/* ---- emoji 面板（Beta.322）----
 * 两种落地方式共用同一份字符表（src/utils/emoji.js）：
 *   插入 → ProseMirror insertContent（走 chainRun，与其它工具栏命令同一条路径，自动进撤销栈）
 *   复制 → 系统剪贴板，供标题 / 标签 / 搜索框等非富文本控件使用
 * ★ 复制走 navigator.clipboard：本渲染层此前已在 SharePanel 用过（同一环境、同一权限），
 *   不另开 IPC 通道。preload 里虽有 copyText，但渲染层从未接入，不为一个 emoji 新起一条链路。 */
const emojiRef = ref(null);
async function onEmojiPick({ emoji, copy }) {
  if (copy) {
    try {
      await navigator.clipboard.writeText(emoji);
      toastOk(t('post.emojiCopied', { e: emoji }));
    } catch (e) {
      toastErr(e, t('post.emojiCopyFailed'));
    }
    return;
  }
  // 先把焦点还给编辑器再插入：面板按钮被点击后焦点在按钮上，不还回去光标会丢失
  if (emojiRef.value) emojiRef.value.setRestoreFocus(() => editor.value && editor.value.commands.focus());
  chainRun(c => c.insertContent(emoji));
}

/* ---- 插入图片 ----
 * Beta.328：原先此处的「链接按钮 + 地址浮层」整段移除（用户要求禁止插入链接）。
 * 禁链接不靠删按钮——粘贴网页、拖入同样能造出链接标记，根除办法是
 * StarterKit.configure({ link: false }) 把扩展摘掉（见 useEditor 处注释）。
 * 这段历史（linkPop 定位 / Esc 关闭 / 预填改链接）在 git 历史 Beta.315–327 可查。 */
async function insertImage() {
  try {
    const r = await A.imgUpload();
    if (!r) return;
    // 与 chainRun 同一道纵深：模板 disabled 之外，只读编辑器一律不插
    if (editor.value && editor.value.isEditable) {
      editor.value
        .chain()
        .focus()
        .insertContent({ type: 'image', attrs: { src: r.url, alt: t('post.image') } })
        .run();
    }
    toastOk(t('post.imageInserted'));
  } catch (e) {
    toastErr(e);
  }
}

/* ---- 图片显示大小 + 原尺寸浮窗 ----
 *
 * 【Beta.322 重做，用户四点要求】① 尺寸可自定义像素 ② 可选锁定比例
 *   ③ 查看原图的图标要是全屏符号 ④ 防止代码模式把图片改坏、适应窗口/原尺寸按钮无效、关闭按钮错位。
 *
 * 【尺寸模型】
 *   宽度存 CSS 值字符串：'480px' 或 '50%'（见 utils/imageSize.js）。
 *   null = 未设置，按容器自适应（历史文档的原行为，不能被新逻辑改变）。
 *   高度只在「锁定比例」时写入，且一律是像素 —— 理由见 utils/imageSize.js 头注释。
 *
 * 【为什么需要一个「编辑缓冲」】
 *   输入框允许用户把 480 删成 4 再补成 4800，中间态全是非法值。
 *   若每次 input 都直接写进文档，ProseMirror 会收到一堆非法 attrs，
 *   撤销栈也被塞满中间态。故：输入时只改本地 draft，失焦/回车才提交。
 */

/** 光标所在图片的 attrs（宽度/高度/原图尺寸），不在图上时返回 null */
const curImage = computed(() => {
  // 同「随光标变化」一族：不读 tick 的话光标挪到另一张图时尺寸条不更新
  if (!isOn('image')) return null;
  return editor.value.getAttributes('image') || {};
});

/**
 * 是否有选中图片 —— 尺寸条显隐判据（返回 null 即不显示）。
 *
 * ★ 改为只做「有无」判断、不再返回宽度 ★
 *   Beta.322 起宽度由 imgWidthValue / imgSizeDraft 承载，这里若也返回 width，
 *   同一份数据就有两个出口，改了一处忘另一处就会出现「输入框显示旧宽」。
 *   同时显式走 isOn('image')：光标从一张图挪到另一张时，宽度必须跟着刷新。
 */
const selectedImage = computed(() => (isOn('image') ? curImage.value : null));

/** 当前显示宽度（未设置为空串，表示自适应） */
const imgWidthValue = computed(() => normalizeSize(selectedImage.value && selectedImage.value.width));

/**
 * 当前显示高度（未设置为空串，表示自适应）。
 *
 * ★ 锁比例且未显式存高度时，显示「按当前宽度推算」的高度 ★
 *   否则输入框是空的，图却按某个比例渲染着 —— 用户看到的和眼见的不一致。
 *   未存高度只发生在两种时候：刚锁定还没提交过；解锁后清过高度。
 *   （推导值只进输入框，不进文档；文档里存不存高度由各 commit 函数决定。）
 */
const imgHeightValue = computed(() => {
  const stored = normalizeSize(selectedImage.value && selectedImage.value.height);
  if (stored) return stored;
  if (imgLockRatio.value && imgWidthValue.value) return ratioHeight(imgWidthValue.value) || '';
  return '';
});

/** 单位下拉选项（像素 / 百分比） */
const IMG_UNIT_OPTIONS = computed(() => [
  { value: 'px', label: t('post.imgUnitPx') },
  { value: '%', label: t('post.imgUnitPct') }
]);

/** 当前单位：由已设值反推；未设置时默认像素 */
const imgUnit = ref('px');
watch(
  () => imgWidthValue.value,
  v => {
    const p = parseSize(v);
    if (p) imgUnit.value = p.unit;
  }
);

/** 输入框里的数字部分（不含单位）；未设置时留空，占位符显示「自适应」 */
const imgSizeDraft = ref('');
/** 高度输入框的数字部分（恒为像素，故没有单位草稿） */
const imgHeightDraft = ref('');
/** 锁定比例（默认开）：改宽按原图比例算高、改高按原图比例反推宽 */
const imgLockRatio = ref(true);

/** 把算出的高度同步进输入框草稿（null / '' = 清空） */
function syncHeightDraftFrom(height) {
  const hp = height ? parseSize(height) : null;
  imgHeightDraft.value = hp ? String(hp.n) : '';
}

/** 光标换到另一张图时，把草稿重置成那张图的真实宽高，避免把上一张的输入带过去 */
watch(
  () => (curImage.value ? curImage.value.src : null),
  () => {
    const p = parseSize(imgWidthValue.value);
    imgSizeDraft.value = p ? String(p.n) : '';
    syncHeightDraftFrom(imgHeightValue.value);
  }
);

/** 把宽高写进当前图片；任一侧为空表示该项交回浏览器（解除对应约束） */
function applyImageSize(width, height) {
  chainRun(c => c.updateAttributes('image', { width: width || null, height: height || null }));
}

/**
 * 提交宽度输入框的数值：按当前单位规范化后写入。
 * 越界不静默拒绝 —— 夹到合法边界并给一句提示，用户能立刻明白为什么没生效。
 * 锁比例时连带算出高度并同步进高度输入框（两个框始终反映同一份文档状态）。
 */
function commitImageSize() {
  const raw = String(imgSizeDraft.value || '').trim();
  if (!raw) {
    // 清空 = 恢复自适应（宽高都交回浏览器）
    applyImageSize(null, null);
    syncHeightDraftFrom('');
    return;
  }
  const num = Number(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) {
    toast(t('post.imgSizeInvalid'));
    return;
  }
  let n = Math.round(num);
  if (imgUnit.value === 'px') {
    if (n < IMAGE_PX_MIN || n > IMAGE_PX_MAX) {
      n = Math.min(IMAGE_PX_MAX, Math.max(IMAGE_PX_MIN, n));
      toast(t('post.imgSizeClamped', { min: IMAGE_PX_MIN, max: IMAGE_PX_MAX }));
    }
  } else {
    if (n < 1 || n > 100) {
      n = Math.min(100, Math.max(1, n));
      toast(t('post.imgSizeClampedPct'));
    }
  }
  const width = `${n}${imgUnit.value}`;
  imgSizeDraft.value = String(n);
  const height = imgLockRatio.value ? ratioHeight(width) : null;
  applyImageSize(width, height);
  // 锁定时刷新高度草稿；解锁时高度未被改动，保持原显示
  if (height) syncHeightDraftFrom(height);
}

/**
 * 提交高度输入框的数值（Beta.324 新增的高度格）。
 *
 * ★ 高度恒为像素 ★ 百分比高度以容器高度为基准，在流式正文里不可控
 *   （完整论证见 utils/imageSize.js 的 heightForWidth 注释），所以这一格
 *   没有单位下拉，右侧的「px」是写死的。
 * ★ 锁比例时改高会反推宽 ★ 按原图比例算出对应宽度，单位跟随当前宽度单位；
 *   量不到正文宽度（% 换算的基准）时退回像素。解锁时只写高度、宽度原样不动。
 */
function commitImageHeight() {
  const raw = String(imgHeightDraft.value || '').trim();
  if (!raw) {
    if (imgLockRatio.value) {
      // 锁定时高度是推导值，清空没有意义：显示回推算值即止，不写文档
      syncHeightDraftFrom(imgHeightValue.value);
      return;
    }
    // 解锁时清空 = 解除高度约束（宽度不动）
    applyImageSize(imgWidthValue.value, null);
    return;
  }
  const num = Number(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) {
    toast(t('post.imgSizeInvalid'));
    return;
  }
  let n = Math.round(num);
  if (n < IMAGE_PX_MIN || n > IMAGE_PX_MAX) {
    n = Math.min(IMAGE_PX_MAX, Math.max(IMAGE_PX_MIN, n));
    toast(t('post.imgSizeClamped', { min: IMAGE_PX_MIN, max: IMAGE_PX_MAX }));
  }
  const height = `${n}px`;
  imgHeightDraft.value = String(n);
  const width = imgLockRatio.value ? widthForHeight(n) || imgWidthValue.value : imgWidthValue.value;
  applyImageSize(width, height);
  // 宽度可能被反推改写（锁比例），草稿必须跟着刷新，否则显示旧数
  const wp = parseSize(width);
  imgSizeDraft.value = wp ? String(wp.n) : '';
}

/**
 * 按原图比例算出该宽度对应的高度。
 *
 * ★ 原图尺寸不存进文档，直接问 DOM 要 ★
 *   img.naturalWidth/naturalHeight 是浏览器解码后的真实像素，零成本、永远准确。
 *   若把宽高存成节点属性，旧文档（没有该属性）就无法锁比例，还得额外做一次
 *   迁移与尺寸探测；从 DOM 读则对历史内容和粘贴进来的图片一视同仁。
 *   百分比宽度需要正文容器的实际像素宽作基准，故一并量一次编辑区。
 */
function ratioHeight(width) {
  const el = selectedImgEl();
  if (!el || !el.naturalWidth || !el.naturalHeight) return null;
  return heightForWidth(width, el.naturalWidth, el.naturalHeight, measureEditorWidth()) || null;
}

/**
 * 按原图比例把「高度」反推成「宽度」（锁比例时改高度用，ratioHeight 的逆运算）。
 * 单位跟随当前宽度单位：% 时需要正文实际像素宽做基准，量不到就退回 px
 * （百分比宽度配像素高度本就是本模块的既有形态，见 heightForWidth 注释）。
 */
function widthForHeight(hPx) {
  const el = selectedImgEl();
  if (!el || !el.naturalWidth || !el.naturalHeight) return '';
  const wPx = Math.round((hPx * el.naturalWidth) / el.naturalHeight);
  if (imgUnit.value === '%') {
    const boxW = measureEditorWidth();
    if (boxW > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((wPx / boxW) * 100)));
      return `${pct}%`;
    }
  }
  return `${wPx}px`;
}

/** 取当前选区所在的那张 <img>（ProseMirror 选中图片时会给它挂 ProseMirror-selectednode） */
function selectedImgEl() {
  const root = editor.value && editor.value.view && editor.value.view.dom;
  if (!root) return null;
  return root.querySelector('img.ProseMirror-selectednode') || root.querySelector('img');
}

/** 量编辑区正文的实际内容宽度（百分比换算高度时的基准） */
function measureEditorWidth() {
  const el = editor.value && editor.value.view && editor.value.view.dom;
  if (!el) return 0;
  // clientWidth 含 padding，减掉左右 padding 才是内容宽
  const cs = window.getComputedStyle(el);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  return Math.max(0, el.clientWidth - padL - padR);
}

/** 切单位：把当前数值换算后保留（px ↔ % 按正文宽度换算），让用户看到的是同一个实际大小 */
function setImgUnit(u) {
  if (u === imgUnit.value) return;
  const cur = parseSize(imgWidthValue.value);
  const boxW = measureEditorWidth();
  if (cur && boxW) {
    if (u === '%' && cur.unit === 'px') {
      imgSizeDraft.value = String(Math.min(100, Math.max(1, Math.round((cur.n / boxW) * 100))));
    } else if (u === 'px' && cur.unit === '%') {
      imgSizeDraft.value = String(Math.round((boxW * cur.n) / 100));
    }
  }
  // 量不到正文宽度时保留原数字：用户接着输的那个数是同一个「数」，不凭空归零
  imgUnit.value = u;
}

/** 锁定比例开关：打开时立刻按当前宽度补一个高度，关掉时清掉高度交回浏览器 */
function toggleImgLock() {
  imgLockRatio.value = !imgLockRatio.value;
  const w = imgWidthValue.value;
  if (!w) return;
  const height = imgLockRatio.value ? ratioHeight(w) : null;
  applyImageSize(w, height);
  // 锁定成功时刷新高度草稿；解锁时高度值原样保留，显示不变
  if (height) syncHeightDraftFrom(height);
}

/** 百分比快捷按钮：直接按当前比例写入 */
function setImagePct(pct) {
  imgUnit.value = '%';
  imgSizeDraft.value = String(pct);
  const width = `${pct}%`;
  const height = imgLockRatio.value ? ratioHeight(width) : null;
  applyImageSize(width, height);
  if (height) syncHeightDraftFrom(height);
}

/**
 * 编辑区点击：点图开浮窗看原尺寸。
 * ★ 必须排除"正在拖选文字"的情况：用户选一段跨图的文字时也会在图上松手，
 *   那不是"要看图"，弹浮窗会打断编辑。用 selection 非空做判据。
 * ★ 用 closest('img') 而不是 e.target === img：图片被 ProseMirror 包在 span/img 里，
 *   点击命中的可能是内部节点。
 */
function onEditorAreaClick(e) {
  const img = e.target && e.target.closest ? e.target.closest('.editor-area img') : null;
  if (!img) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return;
  openLightbox(img.getAttribute('src'), img.getAttribute('alt') || '');
}

/** 尺寸条上的「放大查看」：等价于点那张图 */
function openLightboxForSelection() {
  const e = editor.value;
  if (!e) return;
  const src = e.getAttributes('image').src;
  if (src) openLightbox(src, e.getAttributes('image').alt || '');
}

/* ---- 原尺寸浮窗（编辑态与查看态共用同一个组件，不各写一套）---- */
const lightbox = ref(null);
function openLightbox(src, alt) {
  if (!src) return;
  lightbox.value = { src, alt: alt || '' };
}

/**
 * 查看态点击图片开浮窗：正文是 v-html 渲染的，事件只能委托在容器上。
 * 与编辑态同一判据（排除正在选文字），只是容器换成 .post-content。
 * ★ 只接管本机内联图（data:）与已标 data-img-zoom 的图：
 *   外链图（导入旧包残留的 http 图）在 markSelectableMedia 里就没打标记，不接管。
 */
function onContentClick(e) {
  const img = e.target && e.target.closest ? e.target.closest('.post-content img[data-img-zoom]') : null;
  if (!img) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return;
  openLightbox(img.getAttribute('src'), img.getAttribute('alt') || '');
}

/* ---- 标签清洗（Beta.327 · 用户需求「保存时清除空标签」）----
 * 空标签（空串 / 纯空白）的防线分四层，本函数是前端入口与出口的共用口径：
 *   ① 入口：载入（存量文档 / 模板）与标签云回写时清洗，界面不渲染空 chip；
 *   ② 出口：buildDraft 提交前清洗，载荷绝不带空标签（与后端 resolveTagIds 同口径）；
 *   ③ 读侧：后端 getPost / listPosts 等已按 TRIM(t.name)<>'' 过滤存量脏行；
 *   ④ 存量：设置页「数据清洗 · 空标签」把库里的空名标签连根删掉。
 * 为什么出口也必须洗：后端 sameSnapshot 用 normTags 归一化，[''] 与 [] 等价，
 *   用户手动删掉空 chip 再保存会被判「无实质改动」而跳过写库 ——
 *   那条空关联永远删不掉（用户报「空标签删不掉」的原始现场）。
 * 不截断条数：上限只由添加入口（addTag / openTagCloud / applyTagCloud）管，
 *   存量文档若历史性地超过 10 个标签，载入时截断会静默丢数据，比空标签更糟。 */
function cleanTags(list) {
  return (Array.isArray(list) ? list : []).map(t => (t == null ? '' : String(t)).trim()).filter(Boolean);
}
function addTag() {
  const tag = tagInput.value.trim();
  if (!tag) return;
  if (form.tags.length >= MAX_TAGS) {
    toast(t('post.tagsLimit', { n: MAX_TAGS }), 'err');
    return;
  }
  if (!form.tags.includes(tag)) form.tags.push(tag);
  tagInput.value = '';
  markDirty();
}
function removeTag(i) {
  if (store.writable) {
    form.tags.splice(i, 1);
    markDirty();
  }
}

/* ---- 标签云弹窗（Beta.279）----
 * 弹窗内的选中是草稿态，只有点「确定」才回写 form.tags。
 * 回写时按「最终列表」整体替换而不是逐条 push/splice ——
 * 用户在弹窗里可能既删又加，逐条同步要处理顺序与重复，整体替换一次就对。
 * 上限 10 与 addTag 的口径一致（弹窗内也会拦住超选，这里再兜一次）。 */
function openTagCloud() {
  if (!store.writable || form.tags.length >= MAX_TAGS) return;
  tagCloudOpen.value = true;
}
function applyTagCloud(list) {
  // 统一走 MAX_TAGS：弹窗里已拦过超选，这里再兜一次（弹窗可能来自旧版本残留状态）
  // Beta.327：回写同样过 cleanTags —— 存量空名标签万一残留在 allTags 里，勾选也不带回表单
  form.tags = cleanTags(Array.from(list || [])).slice(0, MAX_TAGS);
  tagCloudOpen.value = false;
  markDirty();
}
/** 弹窗内就地新建标签：先落库，成功后刷新 allTags，让新标签出现在后续的云里 */
async function createTagFromCloud(name) {
  try {
    allTags.value = await A.tagSave({ id: null, name });
  } catch (e) {
    toastErr(e);
  }
}

function buildDraft() {
  // 仅提交已勾选字段；编辑态未勾选字段保留数据库原值（避免误清空）
  // ★★ Beta.253 关键修复：绝不能把 Vue 的 reactive 对象直接塞进 IPC 载荷 ★★
  // 【现象】用户报「无论改没改内容保存都报错」，界面弹红条 `An object could not be cloned.`
  // 【根因】post.value 是 reactive() 的返回物 —— 一个 Proxy；它的嵌套属性
  //    （post.value.fields 是 Proxy 对象、其值又可能是 Proxy 数组/对象）
  //    同样是 Proxy。而 ipcRenderer.invoke 用 HTML 结构化克隆算法序列化参数，
  //    该算法**不支持 Proxy**，于是必然抛 `An object could not be cloned.`。
  // 【为什么旧代码"看起来"没错】`{ ...base }` 只是**浅拷贝**：它复制的是同一批
  //    值的引用，值本身若还是对象/数组，就仍然是 Proxy —— 浅拷贝从不拆包 Proxy。
  // 【实测佐证】把同样的数据换成普通对象提交 → 后端正常返回；换成 Proxy → 必现该错。
  // ⇒ 修法：过一遍 JSON 深克隆，把所有 Proxy 还原成纯对象/纯数组。
  //    fields 的值都是字段文本（字符串）或空值，天然是 JSON 安全的，无信息损失。
  const fields = {};
  if (form.id) {
    const base = post.value.fields || {};
    for (const k of Object.keys(base)) fields[k] = base[k] == null ? base[k] : String(base[k]);
  }
  for (const code of Object.keys(fieldSel)) {
    if (fieldSel[code]) fields[code] = form.fields[code] || '';
  }
  const draft = {
    id: form.id,
    title: form.title,
    regionId: draftRegionId.value,
    categoryId: form.categoryId,
    // 同样必须深拷贝：form.tags 是 reactive 数组，`[...form.tags]` 只拆了最外层，
    // 一旦标签是对象（当前是字符串，但别给未来埋雷）就又会踩同一个坑。
    // JSON 深拷贝一次性消灭所有 Proxy，是这条链路上唯一稳妥的做法。
    // Beta.327：保存出口过 cleanTags（用户需求「保存时清除空标签」）。
    // 与后端 resolveTagIds 同口径：空名标签名在写入链就被拦，载荷里更不该出现。
    tags: cleanTags(JSON.parse(JSON.stringify(form.tags || []))),
    fields: JSON.parse(JSON.stringify(fields)),
    // Beta.326：代码视图移除后，正文恒取编辑器当前 HTML（原先 code 态要走
    // unfoldImages(codeText) 还原占位符，该路径连同代码视图一起删除）
    contentHtml: editor.value ? editor.value.getHTML() : '',
    status: form.status,
    no: form.no
  };
  // ★ 保险：整体再过一次 JSON 深克隆。虽然上面已经逐字段处理，但 form 本身
  //   是 reactive Proxy，读取属性时理论上返回的是原始值；某些边界情况（如 Vue
  //   内部对嵌套对象的缓存、ref 解包异常）仍可能让单个属性带上 Proxy。
  //   这个全量克隆是整个 IPC 链路最后一道护栏，代价极低（save 操作本就不频繁）。
  return JSON.parse(JSON.stringify(draft));
}

/**
 * @param {string} [statusOverride] 仅本次保存生效的状态覆盖（'draft' / 'published'）。
 *   「另存为 → 草稿」用它，避免先改表单状态再恢复：save() 成功后表单会被重置，
 *   靠「前后比对」判断是否恢复并不可靠，直接传参最干净。
 */
async function save(statusOverride) {
  if (!form.title || busy.value) return;

  const draft = buildDraft();
  if (statusOverride) draft.status = statusOverride;
  if (!draft.regionId) {
    toast(t('post.missingRegion'), 'err');
    return;
  }
  // 仅对已勾选显示（多选添加）的字段做必填校验；未勾选（默认隐藏）的必填字段不校验
  const missing = defs.value.find(
    d => fieldSel[d.code] && d.required && !skipRequired[d.code] && !String(form.fields[d.code] || '').trim()
  );
  if (missing) {
    toast(t('post.requiredMissing', { name: missing.name }), 'err');
    return;
  }
  busy.value = true;
  try {
    // 带上 originalFields / originalTitle：让后端只对**本次改动过**的字段查重。
    // 若不带，编辑一篇本就存在重复编号的旧文档时，无论改什么都会被拦下
    // （那个编号本次没动，重跑查重必然又命中），用户表现为"这篇文档永远保存不了"。
    // 同样对查重载荷做 JSON 深克隆：originalFields 虽是 ref，但 ref.value 理论上
    // 是已深克隆的纯对象；保险起见整体再过一遍，确保整条 invoke 链路上无 Proxy。
    const dup = await A.postCheckDup(
      JSON.parse(
        JSON.stringify({
          id: draft.id,
          fields: draft.fields,
          title: draft.title,
          regionId: draft.regionId,
          categoryId: draft.categoryId,
          originalFields: originalFields.value,
          originalTitle: originalTitle.value
        })
      )
    );
    if (dup && dup.length) {
      conflicts.value = dup;
      busy.value = false;
      return;
    }
    await doSave(draft);
  } catch (e) {
    toastErr(e);
  } finally {
    busy.value = false;
  }
}

async function doSave(draft) {
  const r = await A.postSave(draft);
  // ★ 后端在内容与库里完全等价时会跳过落库并回 unchanged:true。
  //   此时不能报「已保存」——用户会以为刚才那一下确实写进去了。
  //   如实说「没有改动」，用户才知道这次点击是空操作（而非保存失败）。
  if (r && r.unchanged) {
    toast(t('post.noChange'));
  } else {
    toastOk(okMsg.saved);
  }
  conflicts.value = null;
  editing.value = false;
  clearDirty();
  await load(r.id);
  // 新建/编辑文档（含改所属大区）会改变大区 post_count，需通知常驻侧栏 RegionNav。
  // 此处不导航，故必须放在 load() 之后：先让本页重取完自身详情，再广播，
  // 避免 reloadCurrent() 与 load(r.id) 并发请求同一文档。
  // 未改动时也广播：虽然没写库，但代价极小，且能保证侧栏计数与页面一致。
  bus.emit('refresh');
}

async function onMerge(targetId) {
  await run(() => A.postMerge({ targetId, draft: buildDraft() }), {
    busy,
    ok: t('post.mergedOk'),
    then: async () => {
      conflicts.value = null;
      editing.value = false;
      clearDirty();
      loaded.value = false;
      await load(targetId);
      // 合并会删除源文档，改变大区 post_count，通知常驻侧栏
      bus.emit('refresh');
    }
  });
}

/**
 * 「仍保存为新文档」：跳过查重，按【新建】落库。
 *
 * ★ 这里绝不能调 save()。save() 第一件事就是 postCheckDup，而用户点这个按钮的
 *   前提恰恰是「刚被查出冲突」—— 重跑必查回同一批冲突，再次置 conflicts，
 *   弹回同一个弹窗。用户看到的就是「点了按钮没反应」（弹窗关了又开，内容一模一样）。
 *
 * 语义上这条路径就是明确的「我已知晓重复，仍要新建一条」：
 * 因此把 id 显式置 null 走 INSERT 分支，而不是沿用编辑态的 id 去 UPDATE。
 * 注意 id 必须在这里置 null —— 编辑态 form.id 有值，不置 null 会变成「覆盖原文档」，
 * 与按钮文案「保存为新文档」完全相反。
 */
async function onForceNew() {
  if (busy.value) return;
  conflicts.value = null;
  busy.value = true;
  try {
    await doSave({ ...buildDraft(), id: null });
  } catch (e) {
    toastErr(e);
  } finally {
    busy.value = false;
  }
}

// 历史版本预览：非 null 时弹只读预览层（内容来自后端快照，不落库、不改动当前文档）
const previewVer = ref(null);
const previewHtml = computed(() => markSelectableMedia(safeHtml(previewVer.value && previewVer.value.content_html)));

// ★ Beta.329（用户需求「另存为前加预览按钮」）：编辑内容预览。
//   与上方 previewVer 是两份数据：那个看「落库的历史快照」，这个看「正在编辑、尚未保存」
//   的内容。渲染链路与查看态 renderedHtml 完全同源（safeHtml + markSelectableMedia），
//   预览里看到的就是保存后查看态看到的（XSS 口径不因弹层而降级）。
//   contentHtml 由 onUpdate 实时跟随 editor.getHTML()，无需在这里再取一次编辑器。
const editPreviewOpen = ref(false);
const editPreviewHtml = computed(() => markSelectableMedia(safeHtml(contentHtml.value)));
function closeEditPreview() {
  editPreviewOpen.value = false;
}
// 预览弹层元信息行：口径是「即将保存的值」而非「页头徽章的值」——
// 大区/分类直接按表单当前选中项查（Beta.279 起新建态也可切大区，用户切了之后
// 预览必须跟着变，否则「存完才发现归错区」）。分类名与分类下拉 categoryOptions
// 同源（cats）；大区查不到时回落空串，由模板显示「未分大区」。
const editPreviewRegionName = computed(() => {
  const r = store.regions.find(x => x.id === form.regionId);
  return r ? r.name : '';
});
const editPreviewCatName = computed(() => {
  const c = cats.value.find(x => x.id === form.categoryId);
  return c ? c.name : '';
});
const editPreviewRegionColor = computed(() => {
  const r = store.regions.find(x => x.id === form.regionId);
  return r ? r.color : 'var(--border)';
});

// 快照里的大区色点：快照只存 region_id，颜色取自当前 store.regions（与详情页 region-dot 同源）。
// 查不到时回落灰色，而不是渲染一个没有颜色的小点。
function regionColorOf(rid) {
  const r = (store.regions || []).find(x => x.id === rid);
  return r ? r.color : 'var(--border)';
}

async function previewVersion(v) {
  if (!v || busy.value) return;
  // ★ postId 必须取 post.value.id（当前正在看的这条文档），不能取 form.id：
  //   后端 getVersionSnapshot 按 `WHERE v.id=? AND v.post_id=?` 做【联合归属】校验，
  //   postId 与 versionId 必须指向同一条文档，否则抛「历史版本不存在」。
  //   form.id 只在 enterEdit() 里被赋值，且会被 newPostMode() 清成 null，
  //   它与 post.value 之间没有强制同步关系 —— 一旦二者脱节（例如 init 误进新建态
  //   后又换看了别条文档），就会拿 A 文档的 id 去查 B 文档的版本，报出这条假故障。
  //   版本属于「这条文档」，取 post.value.id 是唯一不会脱节的来源。
  await run(() => A.postVersionSnapshot({ postId: post.value.id, versionId: v.id }), {
    busy,
    // 静默成功：预览弹窗本身就是反馈，再弹一个「已加载」气泡是噪音。
    // run 的 ok 传空串即可（falsy → 不弹 toast）。
    ok: '',
    then: snap => {
      previewVer.value = snap;
    }
  });
}

function closePreview() {
  previewVer.value = null;
}

// 版本对比：左 = 历史快照，右 = 当前正文。
// ★ 只读，故不绑 writable —— 与 previewVersion 同一口径（只读文档也能看清自己改过什么）。
const diffState = ref(null);

async function openDiff(v) {
  if (!v || busy.value) return;
  await run(
    // postId 口径同 previewVersion：只有 post.value.id 保证与 versionId 同属一条文档
    () => A.postVersionSnapshot({ postId: post.value.id, versionId: v.id }),
    {
      busy,
      ok: '', // 静默成功：对比弹窗本身就是反馈
      then: snap => {
        const diff = buildPostDiff(snap.content_html || '', (post.value && post.value.content_html) || '', {
          // 旧侧 = 历史快照。后端 getVersionSnapshot 已把 region_id/category_id
          // 翻译成 rname/cname（快照本身只存 id），diffMeta 优先用名称比对。
          oldSnap: snap,
          // 当前态的元信息从已加载的 post 上取（不额外查库）。
          // ★ Beta.258：补 rname/cname/no —— 少了它们，「只改了大区」这类改动
          //   在对比弹窗里会显示成「完全一致」，而它确实已写出新版本。
          newSnap: {
            title: post.value && post.value.title,
            status: post.value && post.value.status,
            fields: (post.value && post.value.fields) || {},
            tags: (post.value && post.value.tags) || [],
            region_id: post.value && post.value.region_id,
            rname: post.value && post.value.rname,
            category_id: post.value && post.value.category_id,
            cname: post.value && post.value.cname,
            no: (post.value && post.value.no) || ''
          },
          // ★ Beta.253：字段差异要逐个字段列出，这里把 code→可读字段名 的映射交给算法。
          //   defs 里查不到的 code（字段定义后来被删过）由算法兜底显示 code 本身。
          fieldLabel: code => {
            const d = defs.value.find(x => x.code === code);
            return d ? d.name : code;
          },
          // 图片占位文本按当前语言注入（算法层不 import i18n，保持纯函数）
          imgPlaceholder: t('post.diffImg')
        });
        diffState.value = { version: snap, diff };
      }
    }
  );
}

const { submit } = useSubmit();

// 从预览层直接恢复：先关预览再走统一的 restore 流程（避免两层弹窗叠着）
async function restoreFromPreview() {
  const v = previewVer.value;
  if (!v) return;
  previewVer.value = null;
  await restore(v);
}

/**
 * 恢复历史版本。
 *
 * ★ Beta.169 两处行为变更（按需求）：
 *  1) 恢复前需验证【当前登录用户】的密码 —— 恢复会覆盖现有内容且不可撤销，
 *     与删除同级危险。这里校验当前登录用户的密码而非「文档原作者密码」：
 *     assertOwnership 规定只有作者本人（或无主文档）能改自己的文档，
 *     恢复入口本身已只对可改者开放，故被校验者恒等于作者本人。
 *  2) 恢复【不】再写新版本 —— 见 electron/db/posts.js 的 restoreVersion 注释。
 *     故成功文案里不再有「当前内容已自动存为新版本」。
 */
async function restore(v) {
  if (busy.value) return;
  await submit(
    // ★ 与 previewVersion / openDiff 同一口径：postId 只能取 post.value.id。
    //   这里是【写】操作（restoreVersion 会 `UPDATE posts SET ... WHERE id=?`），
    //   postId 若与 versionId 脱节，最坏情形是拿 A 的版本去覆盖 B 的正文 ——
    //   比预览报错严重得多。而 form.id 恰恰是那个会脱节的来源（见 init() 的说明）。
    () => A.postRestore({ postId: post.value.id, versionId: v.id }),
    {
      password: true,
      passwordTitle: t('post.restoreVerify'),
      passwordAction: t('common.restore'),
      passwordMessage: t('post.restorePwd', { title: post.value.title, v: v.version_no }),
      ok: () => t('post.restoredOk', { v: v.version_no }),
      then: async p => {
        post.value = p;
        versions.value = p.versions || [];
      }
    }
  );
}

async function del() {
  await submit(() => A.postDelete({ id: post.value.id }), {
    password: true,
    passwordMessage: t('post.deletePwd', { title: post.value.title }),
    ok: okMsg.deleted,
    // 顺序至关重要：必须**等 back() 真正导航完成、且本页已卸载**后再广播。
    //  1) back() 内部的 goto() 是 async（先 await guardLeave()），只调不 await 的话
    //     控制权立刻回到这里，此时 store.page 仍是 'post'、本页仍挂载；
    //  2) 即便 await 了 goto()，它只改写 store.page，组件卸载还在 Vue 渲染队列里，
    //     故再 await nextTick() 确保 PostView 已销毁。
    // 否则 bus.emit('refresh') 会打到本页自己的 reloadCurrent() → load(已删id) → null
    // → 误弹「文档不存在」并再次 back()，造成重复提示与重复跳转。
    then: async () => {
      // 先立起「删除后离场」标志：从这一刻到本组件卸载之间，
      // 任何由 watch(store.params) 触发的 init() / refresh 订阅的 reloadCurrent()
      // 都不许再取数，否则会把 goto 写入的大区 id 当成文档 id 去拉取。
      leavingAfterDelete = true;
      deletedId = post.value.id;
      await back();
      await nextTick();
      bus.emit('refresh');
    }
  });
}

async function init() {
  // 删除后离场窗口：本页即将卸载，不再取任何数据（详见 leavingAfterDelete 说明）
  if (leavingAfterDelete) return;
  try {
    defs.value = await A.fields();
    allTags.value = await A.tags();
    if (store.params.id) {
      const ok = await load(store.params.id);
      if (!ok) return;
      const rid = post.value.region_id;
      cats.value = await A.cats({ regionId: rid });
    } else {
      cats.value = await A.cats({ regionId: store.params.regionId });
      loaded.value = true;
    }
    // ★★ 「以新建态打开」这个意图必须【用完即清】，不能让 editing 留在导航参数里。
    //
    // 【缺陷现象（用户反馈）】修改已有文档，保存后变成新建了一条新文档。
    //
    // 【根因链路】
    //   · 新建入口（RegionView 的「新建文档」/ App.vue 的 post:new: 命令）写入
    //     goto('post', { regionId, editing: true })，editing 由此进入 _history 的 params。
    //   · nav.js:124 对「页面+参数完全相同」的重复导航直接 return，不重写 params；
    //     doSave() 保存后也只调 load(r.id)，不清 params。⇒ editing:true 会一直留着。
    //   · 而 watch(() => store.params, init) 之后每次 params 变化都会重跑 init：
    //     load(id) 成功 → 紧接着 newPostMode() → form.id = null。
    //   · 于是「正在看的这条文档」被悄悄切成了新建态，下次保存走 INSERT 分支。
    //
    // 【为什么选择清参数，而不是在组件里加一次性标志】
    //   editing 表达的是「这次导航要把本页打开成新建态」——是一次性的导航意图，
    //   不是页面的持续状态。留着一个已经兑现的意图，本身就是数据说谎：
    //   任何后来新增的 init 触发点都会再次读到它并重演这个 bug。
    //   清掉它，导航参数才如实反映「当前处于什么状态」，后续触发点天然安全。
    //
    // 注意顺序：先完成 load/newPostMode 的取数分支，再清参数。
    //   （清参数会改 store.params，但 init 已经不再依赖它，无重入风险。）
    if (store.params.editing) {
      await newPostMode();
      // 就地删键而非 goto()：goto 会入栈 + 触发离开守卫 + 再跑一遍本函数。
      // 这里只是把「已兑现的意图」抹掉，不是一次导航，故不产生历史条目。
      // 删掉（而不是置 false）—— 参数里干干净净地不存在，比留一个 false 更难被误读。
      const next = { ...store.params };
      delete next.editing;
      store.params = next;
    }
  } catch (e) {
    toastErr(e);
    loaded.value = true;
  }
}

// 全局刷新：重新载入当前文档（详情页此前未订阅，点刷新无反应）
//
// 【关键】这里绝不能调用 load()。
// load() 在文档不存在时会弹「文档不存在」并自行 back()；而「文档不存在」对
// 刷新而言是合法结果，必须与「取数失败」区分开。把两者混为一谈会踩到这条链路：
//   工具栏「刷新」→ onRefresh() 置 refreshing=true → bus.emit('refresh')
//   → 打回本页 reloadCurrent() → load(已删 id) → p 为 null
//   → toast('文档不存在') 且 back() → goto() → guardLeave() 并发
//   → store.dirty 仍为 true → 弹「有未保存修改」确认框（await 挂起，让出微任务）
//   → 控制权回到 onRefresh：results=[pending Promise]（非空）
//     → 跳过「已触发刷新」分支 → await Promise.allSettled(results) 一直等确认框
// 用户看到的就是：一个「文档不存在」错误气泡 +「有未保存修改」确认框同时挂着，
// 且点掉确认框后刷新 Promise 才落地、还是被判为失败（再弹「刷新失败」）。
// 即：删除后点刷新（及任何页内触发刷新）都会踩到这里。
// 故刷新走「静默重载」：不存在则安静返回 false 交给上层提示，不弹气泡、不导航。
async function reloadCurrent() {
  // 删除后离场窗口：本页即将卸载，不再取数
  if (leavingAfterDelete) return true;
  const id = post.value && post.value.id;
  if (!id) return true;
  // 已删除的 id：不重取（后端必返回 null），直接按「刷新成功」收口，避免误报
  if (deletedId != null && String(deletedId) === String(id)) return true;
  try {
    const p = await A.post({ id });
    // 文档已在别处被删除：静默标记不可用，由视图给出「文档不存在」占位。
    // 注意返回 true（而非 false）：刷新这个动作本身是成功的，只是数据已不存在；
    // 返回 false 会被 NavToolbar 判为「刷新失败」并再弹一个错误气泡，
    // 与页面上已经出现的占位提示重复且矛盾。不弹气泡、不改导航位置。
    if (!p) {
      unavailable.value = true;
      return true;
    }
    unavailable.value = false;
    post.value = p;
    versions.value = p.versions || [];
    loaded.value = true;
    return true;
  } catch (e) {
    return false;
  }
}
bus.on('refresh', reloadCurrent);

// 离开守卫：编辑中且有未保存修改时，所有导航跳转（侧边栏 / 前进后退 / 卡片点击 / 作者跳转等）都需二次确认
function leaveGuard() {
  if (editing.value && store.dirty) {
    return confirm(t('post.confirmLeave'), { danger: true });
  }
  return true;
}

// 关闭窗口 / 退出 App 守卫：应用内导航已由 leaveGuard 覆盖，但浏览器/Electron 的窗口关闭
// 不触发 goto，需单独监听 beforeunload，否则"仅改了标题就关窗"会无声丢失修改
function onBeforeUnload(e) {
  if (editing.value && store.dirty) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
}

watch(() => store.params, init);
// ★ Beta.315（#418）：查看态 ↔ 编辑态互相切换后，若查找条仍开着，按新范围的目标
//   重搜一次。不重搜的后果：findState.matches/active 停在旧范围的计数上——用户
//   在新范围按 Enter，editJump 虽会按新 DOM 重算映射，但计数显示是旧账，且
//   查看态的 <mark> 与编辑态的 PM 装饰互不兼容，旧高亮也不会出现在新范围里。
//   nextTick 等新 DOM（.post-main / .edit-layout）挂稳再搜，否则目标收集皆空。
//   覆盖全部切换入口：enterEdit / newPostMode / cancelEdit / doSave / onMerge。
watch(editing, async () => {
  await nextTick();
  if (findState.open && findState.text) findSet(findState.text);
});
/* ---- 自建右键面板的编辑器动作（Beta.329 / #434）----
 *
 * 菜单项由 src/composables/useContextMenu.js 构建并派发，具体动作在这里落地
 * （ProseMirror 命令只有编辑页拿得到）。页面挂载时注册、卸载时注销 ——
 * 注销是必须的：编辑页销毁后菜单若还持有旧实例，操作会打到已死的编辑器上。
 *
 * 三个动作与浏览器原生右键语义对齐：
 *   剪切   = 选中文本进剪贴板 + 删除选区
 *   粘贴   = 剪贴板内容插入光标处（图片 > 富文本 > 纯文本，取其一）
 *   全选   = 选中整篇正文
 */
/** 自建右键面板的编辑器动作注销函数（Beta.329 / #434）；页面卸载时必须调用。 */
let unregisterEditorCtx = null;

function ctxCut(selText) {
  if (!editor.value || !editor.value.isEditable) return;
  // 顺序：先写剪贴板再删选区。反过来的话选区一删就取不到文本了。
  const txt = String(selText || '');
  if (txt) A.copyText({ text: txt }).catch(() => {});
  chainRun(c => c.deleteSelection());
}

function ctxPaste({ text, html, image }) {
  if (!editor.value || !editor.value.isEditable) return;
  if (image) {
    chainRun(c => c.insertContent({ type: 'image', attrs: { src: image, alt: t('post.image') } }));
    return;
  }
  if (html) {
    // 走 HTML 而非纯文本：与系统粘贴路径一致（PM 按 parseHTML 规则解析），
    // 网页/Word 复制来的格式不丢。
    chainRun(c => c.insertContent(html));
    return;
  }
  if (text) chainRun(c => c.insertContent(text));
}

function ctxSelectAll() {
  if (!editor.value || !editor.value.isEditable) return;
  chainRun(c => c.selectAll());
}

onMounted(() => {
  setLeaveGuard(leaveGuard);
  window.addEventListener('beforeunload', onBeforeUnload);
  // 编辑态页内查找（#418）：向 editFind 注册正文刷新入口。派发空事务让 EditorFind 的
  // decorations 按 editorFindQuery 重算——空事务无 step，不触发 onUpdate、不标记脏数据。
  registerEditorFindProvider({
    refresh: () => {
      const view = editor.value && editor.value.view;
      if (view) view.dispatch(editor.value.state.tr);
    }
  });
  // 自建右键面板（Beta.329 / #434）：注册编辑器的剪切/粘贴/全选动作，
  // 面板本体在 App.vue 挂载唯一实例（菜单项由 useContextMenu.js 构建）。
  unregisterEditorCtx = registerEditorCtx({
    cut: ctxCut,
    paste: ctxPaste,
    selectAll: ctxSelectAll
  });
  init();
});
onBeforeUnmount(() => {
  clearLeaveGuard();
  window.removeEventListener('beforeunload', onBeforeUnload);
  clearDirty();
  bus.off('refresh', reloadCurrent);
  // 自建右键面板：注销编辑器动作，避免菜单操作已销毁的编辑器实例
  if (unregisterEditorCtx) {
    unregisterEditorCtx();
    unregisterEditorCtx = null;
  }
  // Beta.328：原链接浮层的 document mousedown/keydown 监听随浮层移除，
  // 这两个 removeEventListener 是当时的清理残留，一并删除。
  clearEditorFindProvider();
  if (editor.value) editor.value.destroy();
});
</script>

<style scoped>
/* 纯图标按钮上的版本数角标（Beta.242）。
 * 去掉按钮文字后，「历史版本」按钮就只剩一个时钟图标 ——
 * 但用户真正要的是「有几次改动」这个数字，所以补一个小角标把它带回来，
 * 否则信息量比改版前少了一整块。绝对定位挂在按钮右上角，不占布局宽度。 */
.btn-count {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 10px;
  line-height: 15px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
/* 角标要相对按钮定位，故给 .btn-icon 加 relative。
 * 这里只作用于本页，不动全局 .btn-icon（避免影响其它页面的同名类）。 */
.btn-icon {
  position: relative;
}

/* 无大区时的引导提示 */
.no-region-guide {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed var(--accent);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 13px;
  line-height: 1.5;
}

/* 文档不存在的占位块 */
.empty-block {
  padding: 40px 22px;
  text-align: center;
  color: var(--text-2);
}
.empty-block h3 {
  margin: 10px 0 6px;
  font-size: 15px;
  color: var(--text);
}
.empty-block p {
  font-size: 13px;
  margin: 0 0 16px;
}
.empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.post-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}
.post-layout.with-versions {
  grid-template-columns: minmax(0, 1fr) 300px;
}
.edit-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1280px) {
  .post-layout,
  .edit-layout {
    grid-template-columns: 1fr;
  }
}

/* 面包屑色块居中档；基础形制见 components.css */
.region-dot {
  --dot: 12px;
}
.meta {
  padding: 14px 18px;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.meta-row + .meta-row {
  margin-top: 8px;
}
.sep {
  color: var(--text-3);
}
.author-link {
  cursor: pointer;
  color: var(--accent);
}
.author-link:hover {
  text-decoration: underline;
}
/* 来源甄别标记：由文档包导入的文档在元信息行中高亮显示 */
.imp-mark {
  color: var(--accent);
  font-size: 11px;
  cursor: help;
  background: var(--surface-3);
  padding: 1px 8px;
  border-radius: 10px;
}
/* 来源甄别标记：由局域共享拷贝的文档。用 --ok 与「导入」的 --accent 区分 */
.copy-mark {
  color: var(--ok);
  font-size: 11px;
  cursor: help;
  background: var(--surface-3);
  padding: 1px 8px;
  border-radius: 10px;
}

.fields-card,
.body-card {
  padding: 4px 18px 14px;
}
.fcode {
  background: var(--surface-3);
  padding: 0 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--text-3);
}

/* .versions / .ver / .ver-info 样式已移至 VersionHistory.vue */

/* 历史版本预览弹层 */
.pv-head {
  flex: none;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.pv-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
/* 归属/编号行（Beta.258）：与上方时间行拉开一点距离，避免两行同权重看着像重复信息 */
.pv-meta-sub {
  margin-top: 6px;
  align-items: center;
}
.pv-meta-sub .sep,
.pv-meta-sub .region-dot {
  margin: 0 1px;
}
.pv-title {
  font-size: 16px;
  font-weight: 600;
  margin: 6px 0 0;
}
.pv-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
/* 历史版本的字段数据块（Beta.253）。
 * 与详情页 .fields-card 同形制，但这里不套卡片（弹层里已经有边框层级了，
 * 再嵌一层卡片会显得局促），只留标题 + 表格。
 * 字段与正文共用 pv-scroll 滚动，字段多时随正文一起滚，不再固定占住顶部。 */
.pv-fields {
  flex: none;
  margin-bottom: 12px;
  background: var(--surface);
  padding: 14px;
  border-radius: var(--radius-sm);
}
.pv-fields-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 6px;
}
.pv-fields .x-scroll {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
/* 正文区独立滚动，弹窗整体不滚：保证标题与底部按钮始终可见 */
.pv-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 12px 0 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}
.pv-body {
  background: var(--surface);
  padding: 14px 16px;
  border-radius: var(--radius-sm);
}
.pv-note {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-3);
}

.title-input {
  font-size: 17px;
  font-weight: 600;
  padding: 10px 12px;
}
.tags-editor {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  min-height: 36px;
  background: var(--surface);
}
.tag-input {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  min-width: 110px;
  font-size: 13px;
}
/* 标签云入口：贴在标签输入框右侧，做成编辑器内部的小按钮 */
.tag-cloud-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  font-size: 12px;
  cursor: pointer;
  background: var(--surface-3);
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}
.tag-cloud-btn:hover:not(:disabled) {
  background: var(--accent-weak);
  color: var(--accent);
  border-color: var(--accent);
}
.tag-cloud-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.tb-sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
}
.draft-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
}

/* 编辑器空文档提示：Tiptap Placeholder 扩展会给空段落挂 .is-empty 类（Beta.315 取代 :empty 方案
 * —— ProseMirror 文档永远是 <p></p>，:empty 永远不命中，必须由扩展类驱动）。
 * data-placeholder 属性由 Placeholder 扩展渲染时写入 <p>，文案走 i18n（函数式配置，切语言即换）。 */
.editor-area .is-empty::before {
  content: attr(data-placeholder);
  color: var(--text-3);
  float: left;
  height: 0;
  pointer-events: none;
}
/* 图片尺寸条（Beta.316）：选中图片时出现在编辑区上方，与工具栏同形制但独立成排 */
.img-size-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  flex-wrap: wrap;
}
.isb-label {
  font-size: 12px;
  color: var(--text-3);
  margin-right: 2px;
}
/* 「宽 / 高」小标签：与左侧元素留 4px（bar 的 gap 只有 4px，标签自身再补一点） */
.isb-cap {
  font-size: 12px;
  color: var(--text-3);
  margin-left: 4px;
  white-space: nowrap;
}
/* ★ Beta.324：输入控件组（数字框 + 单位）★
 *   原先 .isb-input 一条样式都没有：input 是 inline-block，Dropdown 的根是
 *   display:inline-block; width:100% —— 后者必然另起一行，于是用户截图里
 *   「25 压在 像素 上方」。现在显式 inline-flex 把两者焊成一行：外框画在组上，
 *   内部控件全部透明底、无边框，视觉上是「一个输入框右边挂个单位」。
 *   overflow:hidden 让圆角处内部边框不溢出（下拉菜单 Teleport 到 body，不受影响）。 */
.isb-input {
  display: inline-flex;
  align-items: center;
  height: 26px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--input-bg);
  overflow: hidden;
}
.isb-input:focus-within {
  border-color: var(--accent);
}
.isb-num {
  width: 52px;
  height: 100%;
  min-width: 0;
  padding: 0 2px 0 8px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
}
/* 去掉 number 输入框的步进器：尺寸条窄，步进器会挤占数字宽度 */
.isb-num::-webkit-outer-spin-button,
.isb-num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.isb-num::placeholder {
  color: var(--text-3);
}
/* 单位下拉：form 皮肤默认高 34px、铺满宽，在这里压成与数字框同高的贴附控件。
 *   Dropdown 内部元素的 class 在 scoped 下够不着，用 :deep()（同 DisplaySection 的 .lang-dd）。
 *   hover/focus 只改边框与字色，不做位移 —— 全站交互控件不加按压缩放的约定。 */
.isb-input :deep(.dropdown) {
  width: auto;
  height: 100%;
}
.isb-input :deep(.dd-trigger) {
  height: 100%;
  min-width: 46px;
  padding: 0 20px 0 8px;
  border: none;
  border-left: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
}
.isb-input :deep(.dd-trigger:hover:not(:disabled)) {
  background: var(--btn-ghost-hover);
  color: var(--text);
  border-left-color: var(--border);
}
.isb-input :deep(.dd-trigger:focus-visible) {
  border-color: var(--accent);
  border-left-color: var(--accent);
}
/* 高度单位是写死的 px（不是下拉）：与下拉同样贴附在数字框右侧。
 *   cursor:help + title 说明「为什么没有百分比选项」，不靠用户猜。 */
.isb-unit-fixed {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 8px;
  border-left: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-3);
  cursor: help;
  user-select: none;
}
/* 四档百分比都用等宽数字，避免 25/50/75 之间宽度跳动 */
.isb-btn {
  font-variant-numeric: tabular-nums;
  min-width: 44px;
}
/* 字号下拉的「自定义像素」行（Beta.328）：挂在 .dd-popup 尾部（Dropdown #extra 插槽）。
 * 注意 .dd-popup 是 Teleport 到 body 的，但本行元素由本模板编译、自带 scoped 属性，
 * 因此这里用**独立类选择器**即可命中（不能写 .dd-popup .tb-fs-custom ——
 * .dd-popup 不带本组件的 scope 属性，跨组件后代选择器会静默失效）。 */
.tb-fs-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.tb-fs-num {
  width: 52px;
  height: 26px;
  min-width: 0;
  padding: 0 2px 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--input-bg);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
}
.tb-fs-num::-webkit-outer-spin-button,
.tb-fs-num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.tb-fs-num:focus {
  border-color: var(--accent);
  outline: none;
}
.tb-fs-unit {
  flex: none;
  font-size: 12px;
  color: var(--text-3);
}
.tb-fs-custom .btn {
  flex: none;
  margin-left: auto;
}
/* 工具栏内的取色器（ColorPicker compact）：与 .tb-btn 同尺寸同 hover */
.editor-toolbar .cp-trigger {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  color: var(--text-2);
}
.editor-toolbar .cp-trigger:hover {
  background: var(--btn-ghost-hover);
  color: var(--text);
  border-color: var(--border);
}

/* 草稿箱（新建文档页头部按钮 + 弹层列表） */
/* 保存组：另存为 + 保存 贴在一起，视觉上是一个整体 */
.save-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.draft-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--warn);
  background: var(--c-orange-weak);
  border-radius: 20px;
  padding: 1px 8px;
  margin-left: 6px;
}
/* 纯图标按钮上的徽标（Beta.319）：按钮已无可见文字，数字改浮到图标右上角，
   不占按钮宽度（.btn-icon 是 32×32 正方形，行内数字会把图标挤偏）。
   超出按钮范围的数字用 transform 外推，配合按钮 position:relative 定位。 */
.btn-icon {
  position: relative;
}
.btn-icon .draft-badge {
  position: absolute;
  top: -5px;
  right: -6px;
  margin-left: 0;
  padding: 0 5px;
  line-height: 15px;
  min-width: 15px;
  text-align: center;
  border: 1px solid var(--surface);
  pointer-events: none;
}
.draft-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 52vh;
  overflow: auto;
  padding: 2px;
}
.draft-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 14px;
  cursor: pointer;
  background: var(--surface);
  transition:
    border-color 0.12s ease,
    background 0.12s ease;
}
.draft-item:hover {
  border-color: var(--accent);
  background: var(--surface-2);
}
.draft-item-title {
  font-size: 13.5px;
  color: var(--text);
}
.draft-item-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--text-3);
}
</style>
