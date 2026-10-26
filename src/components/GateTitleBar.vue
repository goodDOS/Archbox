<template>
  <div class="gate-titlebar titlebar-skin">
    <BrandMark />
    <div class="tb-spacer"></div>
    <div class="gate-winctrl">
      <WindowControls />
    </div>
  </div>
</template>

<script setup>
/* 门禁页（登录 / 解锁）顶栏。结构由 Beta.163 那两个逐字节相同的模板抽取而来。
 * 不用主界面的 .titlebar：它只剩 grid-area:tb 一条定位声明，是 .app-shell 栅格的专属槽位，
 * 在门禁页的 flex 列里会静默失效（见 base.css 的说明）。
 *
 * ★ 外观不再依赖「两份互相指路的注释」★
 * 顶栏长相（44px / --titlebar-bg / 1px --border 下边 / drag / padding-left:12px / 按钮 43px）
 * 统一来自 base.css 的 .titlebar-skin，与主界面 TitleBar 挂的是同一个类 —— 物理上只有一份定义，
 * 因而不可能漂移。本组件只需额外声明自己的定位（flex-shrink:0，见下方 scoped）。
 * 两页共用同一组件，故页与页之间的高度/间距/按钮顺序同样不可能漂移。 */
import BrandMark from './BrandMark.vue';
import WindowControls from './WindowControls.vue';
</script>

<style scoped>
/* .titlebar-skin 的外观在 styles/base.css 公共层定义，此处【不得】重复 ——
 * scoped 会给选择器加 [data-v-*]，特异性 (0,2,0) 压过全局 (0,1,0)，
 * 一旦重复，公共层此后对该类的修改会「改了不生效且无任何报错」。
 * 断言 S23 锁死这一点。 */
/* .gate-winctrl 只服务本组件，故留在此处而非公共层（公共层的收录标准是 ≥2 组件重复）。
 * 它的 no-drag 与 WindowControls 自带的那份构成双保险，防止未来顶栏结构变化时按钮失效。
 * 断言 S24 锁死「单点定义」—— 它若被搬进 components.css 或复制回各页，即为新重复。 */
.gate-winctrl {
  display: flex;
  -webkit-app-region: no-drag;
}
</style>
