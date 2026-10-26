import { ref } from 'vue';
import { A } from '../api';

/**
 * 加载某用户的安全问答「问题列表」（用于找回密码 / 改绑设备的问答验证）。
 *
 * ★ 收敛 RecoverForm 与 RebindMacModal 里重复的「hasSecurity → getSecurity → 填问题」
 *   三段式加载：此前两处各写一遍，加载失败/未设置的兜底口径也各自分叉，
 *   改为单一实现，避免未来某处漏改导致两处行为漂移。
 *
 * 返回：
 *   - questions: 问题列表 [{ q }]（仅问题，无答案哈希）
 *   - state: 'loading' | 'list' | 'none'（none = 未设置或加载失败）
 *   - load(userId): 重新加载（切换用户时用）
 */
export function useSecurityQuestions() {
  const questions = ref([]);
  const state = ref('loading'); // loading | list | none

  async function load(userId) {
    if (!userId) {
      state.value = 'none';
      questions.value = [];
      return;
    }
    state.value = 'loading';
    try {
      const has = await A.hasSecurity({ userId });
      if (!has) {
        state.value = 'none';
        questions.value = [];
        return;
      }
      const qs = await A.getSecurity({ userId });
      questions.value = Array.isArray(qs) ? qs : [];
      state.value = questions.value.length ? 'list' : 'none';
    } catch (e) {
      state.value = 'none';
      questions.value = [];
    }
  }

  return { questions, state, load };
}
