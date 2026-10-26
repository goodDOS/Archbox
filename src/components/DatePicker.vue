<template>
  <div class="dp" ref="rootRef">
    <button
      type="button"
      class="dp-trigger"
      :class="{ empty: !modelValue, on: open }"
      @click="toggle"
      @keydown="onTriggerKey"
    >
      <span class="dp-text">{{ modelValue || placeholder }}</span>
      <span class="dp-actions">
        <button v-if="modelValue" type="button" class="dp-clear" :title="t('common.clear')" @click.stop="clearValue">
          <Icon name="x" :size="12" />
        </button>
        <Icon name="calendar" :size="14" class="dp-ic" />
      </span>
    </button>

    <!-- 透明遮罩：仅用于捕获「点击外部关闭」，不遮挡视觉、不居中 -->
    <Teleport to="body">
      <Transition name="pop-mask">
        <div v-if="open" class="pop-mask" @mousedown.self="open = false"></div>
      </Transition>
      <Transition name="pop">
        <div
          v-if="open"
          class="dp-popup"
          ref="popupRef"
          :style="{ top: popupPos.top + 'px', left: popupPos.left + 'px' }"
          @mousedown.stop
        >
          <div class="dp-head">
            <button type="button" class="dp-nav" @click="shiftMonth(-1)" :title="t('common.prevPage')">
              <Icon name="chevron-left" :size="16" />
            </button>
            <button type="button" class="dp-ym" @click="toggleMonths">
              {{ ymLabel }}
            </button>
            <button type="button" class="dp-nav" @click="shiftMonth(1)" :title="t('common.nextPage')">
              <Icon name="chevron-right" :size="16" />
            </button>
          </div>

          <!-- 月 / 年 快速选择面板 -->
          <div v-if="showMonths" class="dp-grid">
            <div class="dp-grid-head">{{ year }}</div>
            <div class="dp-months">
              <button
                v-for="(m, i) in monthNames"
                :key="i"
                type="button"
                class="dp-month"
                :class="{ on: i === month }"
                @click="
                  month = i;
                  showMonths = false;
                "
              >
                {{ m }}
              </button>
            </div>
            <div class="dp-years">
              <button
                v-for="y in yearList"
                :key="y"
                type="button"
                class="dp-year"
                :class="{ on: y === year }"
                @click="year = y"
              >
                {{ y }}
              </button>
            </div>
          </div>

          <!-- 月历网格 -->
          <div v-else class="dp-cal">
            <div class="dp-weekdays">
              <span v-for="w in weekdays" :key="w" class="dp-wd">{{ w }}</span>
            </div>
            <div class="dp-days">
              <button
                v-for="d in days"
                :key="d.key"
                type="button"
                class="dp-day"
                :class="{
                  blank: !d.date,
                  today: d.isToday,
                  on: d.isSelected
                }"
                :disabled="!d.date"
                @click="d.date && pick(d.date)"
              >
                {{ d.label }}
              </button>
            </div>
          </div>

          <div class="dp-foot">
            <button type="button" class="dp-now" @click="pickToday">{{ t('common.today') }}</button>
            <button v-if="modelValue" type="button" class="dp-clr" @click="clearValue">{{ t('common.clear') }}</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Icon from './Icon.vue';
import { t, lang } from '../i18n';
import { localDate } from '../utils/timefmt';
import { computeFixedPosition } from '../utils/positionPopup';

const props = defineProps({
  modelValue: { type: String, default: '' }, // 'YYYY-MM-DD' 或 ''
  placeholder: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

const rootRef = ref(null);
const popupRef = ref(null);
const open = ref(false);
const showMonths = ref(false);
const year = ref(new Date().getFullYear());
const month = ref(new Date().getMonth()); // 0-11
const todayStr = todayISO();
const popupPos = ref({ top: 0, left: 0 });

function todayISO() {
  return localDate(new Date());
}

/* 星期表头 / 月份名：用 Intl 按当前语言生成，不硬编码中文/英文（项目零汉字纪律） */
const locale = computed(() => (lang.value === 'en' ? 'en-US' : lang.value));

const weekdays = computed(() => {
  // 以「周一」为周首：先生成周一~周日，再轮转到周一开头
  const arr = [];
  const base = new Date(2024, 0, 1); // 2024-01-01 是周一
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    arr.push(d.toLocaleDateString(locale.value, { weekday: 'narrow' }));
  }
  return arr;
});
const monthNames = computed(() => {
  const arr = [];
  for (let m = 0; m < 12; m++) {
    arr.push(new Date(2024, m, 1).toLocaleDateString(locale.value, { month: 'short' }));
  }
  return arr;
});
const ymLabel = computed(() => {
  const d = new Date(year.value, month.value, 1);
  return d.toLocaleDateString(locale.value, { year: 'numeric', month: 'short' });
});

/* 年份列表：当前年为中心前后各 50 年 */
const yearList = computed(() => {
  const base = new Date().getFullYear();
  const ys = [];
  for (let y = base - 50; y <= base + 50; y++) ys.push(y);
  return ys;
});

/* 月历 42 格（6 行 × 7 列，周首为周一） */
const days = computed(() => {
  const first = new Date(year.value, month.value, 1);
  // 周首周一：JS getDay() 周日=0，换算成「距周一偏移」：(day+6)%7
  const offset = (first.getDay() + 6) % 7;
  const total = new Date(year.value, month.value + 1, 0).getDate();
  const out = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - offset + 1;
    let date = null;
    let isToday = false;
    if (dayNum >= 1 && dayNum <= total) {
      const d = new Date(year.value, month.value, dayNum);
      const iso = localDate(d);
      date = iso;
      isToday = iso === todayStr;
    }
    out.push({
      key: `${year.value}-${month.value}-${i}`,
      date,
      label: dayNum >= 1 && dayNum <= total ? String(dayNum) : '',
      isToday,
      isSelected: date != null && date === props.modelValue
    });
  }
  return out;
});

function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  // 打开时把导航定位到当前选中值（或今天）
  const cur = props.modelValue || todayStr;
  const [y, m] = cur.split('-').map(Number);
  if (y && m) {
    year.value = y;
    month.value = m - 1;
  }
  showMonths.value = false;
  open.value = true;
  nextTick(positionPopup);
}

/* 展开/收起年月面板；展开后把年份列表滚到当前年份（列表很长，从 1976 找起太累） */
function toggleMonths() {
  showMonths.value = !showMonths.value;
  if (!showMonths.value) return;
  nextTick(() => {
    const box = popupRef.value && popupRef.value.querySelector('.dp-years');
    const on = popupRef.value && popupRef.value.querySelector('.dp-year.on');
    if (!box || !on) return;
    // 直接设 scrollTop：目标元素距容器顶 = 其 offsetTop - 容器自身 padding-top
    const padTop = parseFloat(getComputedStyle(box).paddingTop) || 0;
    box.scrollTop = on.offsetTop - padTop - (box.clientHeight - on.offsetHeight) / 2;
  });
}

function positionPopup() {
  if (!rootRef.value || !popupRef.value) return;
  const r = rootRef.value.getBoundingClientRect();
  const pos = computeFixedPosition(r, { width: 264, height: popupRef.value.offsetHeight || 300, margin: 6 });
  popupPos.value = pos;
}

function shiftMonth(d) {
  month.value += d;
  if (month.value < 0) {
    month.value = 11;
    year.value--;
  } else if (month.value > 11) {
    month.value = 0;
    year.value++;
  }
}

function pick(iso) {
  emit('update:modelValue', iso);
  open.value = false;
}
function pickToday() {
  emit('update:modelValue', todayISO());
  open.value = false;
}
function clearValue() {
  emit('update:modelValue', '');
  open.value = false;
}

function onTriggerKey(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggle();
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}

/* 滚动/缩放时重新定位；但弹层内部的滚动（如年份列表）不算——
 * capture 监听会先于元素自身的滚动收到事件，须排除，否则一滚年份列表弹层就被关掉 */
function onScrollOrResize(e) {
  if (!open.value) return;
  if (popupRef.value && e && e.target && popupRef.value.contains(e.target)) return;
  positionPopup();
}
onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onScrollOrResize);
});
</script>

<style scoped>
.dp {
  position: relative;
  display: inline-flex;
}
.dp-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: 30px;
  padding: 0 6px 0 10px;
  min-width: 120px;
  background: var(--input-bg);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  transition:
    border-color 0.12s ease,
    background 0.12s ease;
}
.dp-trigger:hover {
  border-color: var(--accent);
}
.dp-trigger.on {
  border-color: var(--accent);
}
.dp-trigger.empty .dp-text {
  color: var(--text-3);
}
.dp-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dp-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.dp-clear {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 0;
  border-radius: 4px;
  transition:
    color 0.12s ease,
    background 0.12s ease;
}
.dp-clear:hover {
  color: var(--text);
  background: var(--accent-weak);
}
.dp-ic {
  color: var(--text-2);
}

/* 透明遮罩与弹出/收回动画已上收 components.css（.pop-mask / .pop-* + keyframes pop-in/pop-out）。
 * 此处不再重复定义（scoped 里同名会因特异性更高而静默获胜，反而破坏单一数据源）。 */

/* 弹层：主题变量驱动。Teleport 到 body，fixed 定位到 trigger 下方（JS 计算坐标） */
.dp-popup {
  position: fixed;
  z-index: var(--z-dropdown);
  width: 264px;
  padding: 10px;
  box-sizing: border-box;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  user-select: none;
  transform-origin: top left;
}
.dp-head {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
.dp-nav {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  background: none;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  border-radius: 6px;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}
.dp-nav:hover {
  background: var(--accent-weak);
  color: var(--text);
}
.dp-ym {
  flex: 1;
  text-align: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.12s ease;
}
.dp-ym:hover {
  background: var(--accent-weak);
}

.dp-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 2px;
}
.dp-wd {
  text-align: center;
  font-size: 11px;
  color: var(--text-3);
  padding: 3px 0;
}
.dp-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}
.dp-day {
  height: 30px;
  display: grid;
  place-items: center;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}
.dp-day:hover:not(.blank) {
  background: var(--accent-weak);
}
.dp-day.blank {
  cursor: default;
}
.dp-day.today {
  color: var(--accent);
  font-weight: 700;
}
.dp-day.on {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
.dp-day.on.today {
  background: var(--accent);
  color: var(--accent-text);
}

/* 月/年快速选择 */
.dp-grid-head {
  text-align: center;
  font-size: 12px;
  color: var(--text-2);
  margin-bottom: 4px;
}
.dp-months {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  margin-bottom: 6px;
}
.dp-month,
.dp-year {
  padding: 5px 0;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}
.dp-month:hover,
.dp-year:hover {
  background: var(--accent-weak);
}
.dp-month.on,
.dp-year.on {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}
/* ★ position: relative 是滚动定位的前提：子项 .dp-year 的 offsetTop 以本容器为基准，
 *   没有它 offsetTop 会相对 .dp-popup 计算（把月份网格高度也计入），定位必然滚过头 */
.dp-years {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  max-height: 120px;
  overflow-y: auto;
}

.dp-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.dp-now,
.dp-clr {
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  color: var(--accent);
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.12s ease;
}
.dp-now:hover,
.dp-clr:hover {
  background: var(--accent-weak);
}
.dp-clr {
  color: var(--text-2);
}
.dp-clr:hover {
  color: var(--text);
}
</style>
