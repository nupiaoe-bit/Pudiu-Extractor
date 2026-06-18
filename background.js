const MAX_BADGE_NUM = 999;
// 固定徽章背景色为蓝色（#4299e1），与插件主色调一致
const BADGE_COLOR = '#2196f3';

// 监听弹窗的徽章更新请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateBadge') {
    try {
      const count = request.count || 0;
      if (count <= 0) {
        chrome.action.setBadgeText({ text: '' });
      } else {
        const badgeText = count > MAX_BADGE_NUM ? '999+' : count.toString();
        chrome.action.setBadgeText({ text: badgeText });
        // 明确设置徽章背景为蓝色
        chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
      }
      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
});