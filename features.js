/*
 * 首頁按鈕與左側選單的清單
 * 之後要加新功能，在下面多加一筆，首頁和每一頁的左側選單都會多一項。
 *
 *   title   按鈕文字
 *   desc    首頁卡片上的一句說明（可以不寫）
 *   group   首頁分區：'student' 學生、'teacher' 教師、'link' 外部連結（可以不寫）
 *   href    要開啟的頁面檔名，或完整網址
 *   icon    一個 emoji
 *   color   顏色：'primary' 藍、'navy' 深藍、'purple' 紫、'green' 綠、'orange' 橘
 *   newTab  true 代表在新分頁開啟（外部網站建議設 true）
 *   status  'live' 可以點、'soon' 灰色不能點
 *
 * 注意：每一筆之間要用逗號隔開，最後一筆後面不用逗號。
 */

window.PLATFORM_FEATURES = [
  { title: '我是學生，我要作答', desc: '回答老師發布的問題，查看批改結果與評語', group: 'student', href: 'student.html', icon: '✏️', color: 'primary', status: 'live' },
  { title: '教師系統', desc: '出題、AI 初步批改與教師審核', group: 'teacher', href: 'teacher.html', icon: '👩‍🏫', color: 'navy', status: 'live' },
  { title: '討論平台', desc: '把全班回答分類，投影帶討論', group: 'teacher', href: 'discuss.html', icon: '🗣', color: 'purple', status: 'live' },
  { title: '教材庫與 AI 助理', desc: '上傳教材，讓 AI 依教材回答', group: 'teacher', href: 'rag.html', icon: '📚', color: 'green', status: 'live' },
  { title: '教師 AI 工具研習', desc: '五個備課與回饋 AI 工具的操作筆記', group: 'teacher', href: 'ai-tools.html', icon: '🧰', color: 'navy', status: 'live' },
  { title: '師大 Moodle', desc: '師大數位學習平台', group: 'link', href: 'https://moodle3.ntnu.edu.tw/', icon: '🎓', color: 'orange', newTab: true, status: 'live' }
];
