/**
 * editorFind —— 编辑态页内查找的正文侧（ProseMirror / Tiptap）实现。
 *
 * ============================ 为什么不能复用 postFind 的 DOM <mark> 方案 ============================
 * 查看态的 postFind 引擎直接改 DOM：把文本节点拆进 <mark class="pf-hit">。那套在编辑态
 * **不能**用在正文上 —— 正文的 DOM 归 ProseMirror 所有，外部拆节点会被 PM 的文档模型
 * 视为"非法 DOM 结构"，下一次事务（用户敲一个字）就被重新规范化为原样，高亮全部消失，
 * 还可能把 PM 的选区/撤销栈搞乱。PM 官方的高亮机制是 **decoration**：不改文档模型，
 * 只在渲染层叠加 span，文档内容与历史栈完全不受影响。
 *
 * ============================ 工作机制 ============================
 * · EditorFind 扩展向 PM 注册一个插件，其 props.decorations 读取模块级查询对象
 *   editorFindQuery（{ text, matchCase, active, bodyOffset }），按文本节点逐处生成
 *   Decoration.inline，类名复用查看态的 pf-hit / pf-hit-active（base.css 已有样式，
 *   两侧高亮长相一致，不另起一套）。
 * · 查询变化时由 PostView 注册的 provider.refresh() 派发一个**空事务**触发重算：
 *   prosemirror-view 的 updateStateInner 对每个事务都会调用 viewDecorations(this)
 *   （dist/index.cjs:5222），装饰集变了就更新 DOM —— 空事务（无 step）同样走这条路，
 *   实测路径，非推测。
 * · active 是**全局** 1-based 序号（findState.active，跨标题/字段/正文统一编号），
 *   正文段的局部序号 = active - 1 - bodyOffset；小于 0 或越界时正文无激活项
 *   （激活的命中在标题/字段里）。
 *
 * ============================ 依赖方向 ============================
 * 本模块不 import store（store/modules/find → utils/postFind → utils/editFind →
 * utils/editorFind，若再回头 import store 即成环）。查询由 editFind 写入普通对象，
 * provider 由 PostView.vue 注册/清除（编辑器实例只有它持有）。
 */
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** 查找查询快照：editFind 在搜索/跳转前写入，EditorFind 的 decorations 读取 */
export const editorFindQuery = { text: '', matchCase: false, active: 0, bodyOffset: 0 };

/**
 * 正文查找提供者（由 PostView.vue 注册，编辑态卸载时清除）。
 * @type {{ refresh: () => void } | null}
 * refresh：派发空事务让 decorations 按最新 editorFindQuery 重算。
 */
let editorFindProvider = null;

export function registerEditorFindProvider(p) {
  editorFindProvider = p;
}

export function clearEditorFindProvider() {
  editorFindProvider = null;
}

export function getEditorFindProvider() {
  return editorFindProvider;
}

/** 清空查询（findClose / 切页收尾时调用；无查询时不做无用派发） */
export function resetEditorFindQuery() {
  const had = !!editorFindQuery.text;
  editorFindQuery.text = '';
  editorFindQuery.active = 0;
  editorFindQuery.bodyOffset = 0;
  return had;
}

/**
 * PM 装饰插件：按 editorFindQuery 在正文文本节点上生成 pf-hit 高亮。
 * 每次事务都会重算（空事务即可驱动），文档模型零改动。
 */
export const EditorFind = Extension.create({
  name: 'editorFind',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const q = editorFindQuery.text;
            if (!q) return null;
            const needle = editorFindQuery.matchCase ? q : q.toLowerCase();
            const bodyActive = editorFindQuery.active - 1 - editorFindQuery.bodyOffset;
            const decos = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              const hay = editorFindQuery.matchCase ? node.text : node.text.toLowerCase();
              let i = hay.indexOf(needle);
              while (i !== -1) {
                const cls = decos.length === bodyActive ? 'pf-hit pf-hit-active' : 'pf-hit';
                decos.push(Decoration.inline(pos + i, pos + i + needle.length, { class: cls }));
                i = hay.indexOf(needle, i + needle.length);
              }
            });
            if (!decos.length) return null;
            return DecorationSet.create(state.doc, decos);
          }
        }
      })
    ];
  }
});
