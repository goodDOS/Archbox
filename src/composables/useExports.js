// 文档导出组合式：文档包 / Markdown / PDF 三种导出在各文档页与设置页逐字重复，
// 统一收敛到此组合式。传入 getParams() 返回导出所需的查询参数对象
// （PostsPage/SearchPage 用本地 params()，SettingsPage 传 () => ({})）。
import { run } from '../feedback';
import { toastOk, okMsg } from '../feedback';
import { A } from '../api';

export function useExports(getParams) {
  async function exportPack(pass) {
    const params = { ...(getParams() || {}) };
    if (pass) params.pass = pass;
    await run(() => A.packExport(params), {
      then: p => {
        if (p) toastOk(okMsg.exported(p));
      }
    });
  }
  async function exportMd() {
    await run(() => A.mdExport(getParams()), {
      then: p => {
        if (p) toastOk(okMsg.exported(p));
      }
    });
  }
  async function exportPdf() {
    await run(() => A.pdfExport(getParams()), {
      then: p => {
        if (p) toastOk(okMsg.exported(p));
      }
    });
  }
  return { exportPack, exportMd, exportPdf };
}

/**
 * 单篇文档的分享导出（详情页用）。
 *
 * 为什么不塞进上面的 useExports(getParams)：
 * 那个组合式的约定是「传一组筛选条件，导出一批」；
 * 单篇导出传的是 id，语义不同，混在一起会让调用方误以为
 * 「导出一条」和「导出一批」是同一种操作的两个参数形态。
 * 后端也是两条独立通道（post:exportMd / post:exportPdf）。
 */
export function usePostExports(postId) {
  async function exportOneMd() {
    await run(() => A.postMdExport({ id: postId.value }), {
      then: p => {
        if (p) toastOk(okMsg.exported(p));
      }
    });
  }
  async function exportOnePdf() {
    await run(() => A.postPdfExport({ id: postId.value }), {
      then: p => {
        if (p) toastOk(okMsg.exported(p));
      }
    });
  }
  return { exportOneMd, exportOnePdf };
}
