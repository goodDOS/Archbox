/** 时长格式化（utils/timefmt.js 的 formatDuration 用）。
 *  中文输出与旧版字面量逐字一致（'不到1分' / '{n}分' / '{h}时{m}分' / '{d}天{h}时{m}分'），
 *  只是把文案搬进字典，切换语言时使用时长统计卡不再定格在中文。 */
export default {
  durUnderMin: '不到1分',
  durMin: '{n}分',
  durHourMin: '{h}时{m}分',
  durDayHourMin: '{d}天{h}时{m}分'
};
