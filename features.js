/*
 * 網站的功能清單
 *
 * 首頁只顯示「學生、教師、開發者」三個入口，不會列出這裡的每個功能。
 * 進到某一頁後，左側選單只會顯示同一種身分的功能，
 * 例如學生在作答頁看不到教師系統。
 *
 * 之後要加新功能，在下面多加一筆：
 *
 *   title   選單上的文字
 *   role    誰會看到：'student' 學生、'teacher' 教師、'developer' 開發者
 *           兩種身分都要看到時寫成 ['student', 'teacher']
 *   href    要開啟的頁面檔名，或完整網址
 *   icon    一個 emoji
 *   newTab  true 代表在新分頁開啟（外部網站建議設 true）
 *   status  'live' 可以點、'soon' 先不顯示
 *
 * 注意：每一筆之間要用逗號隔開，最後一筆後面不用逗號。
 */

window.PLATFORM_ROLES = {
  student:   { name: '學生',   home: 'student.html' },
  teacher:   { name: '教師',   home: 'teacher.html' },
  developer: { name: '開發者', home: 'dev.html' }
};

window.PLATFORM_FEATURES = [
  { title: '課堂問答',         role: 'student',   href: 'student.html',  icon: '✏️', status: 'live' },

  { title: '教師系統',         role: 'teacher',   href: 'teacher.html',  icon: '👩‍🏫', status: 'live' },
  { title: '課堂討論',         role: 'teacher',   href: 'discuss.html',  icon: '🗣', status: 'live' },
  { title: '教材庫與 AI 助理', role: 'teacher',   href: 'rag.html',      icon: '📚', status: 'live' },
  { title: '教師 AI 工具研習', role: 'teacher',   href: 'ai-tools.html', icon: '🧰', status: 'live' },

  { title: '開發者首頁',       role: 'developer', href: 'dev.html',      icon: '🛠', status: 'live' },
  { title: 'GitHub 原始碼',    role: 'developer', href: 'https://github.com/chiaying1230/aiclassroom', icon: '📦', newTab: true, status: 'live' },

  { title: '師大 Moodle',      role: ['student', 'teacher'], href: 'https://moodle3.ntnu.edu.tw/', icon: '🎓', newTab: true, status: 'live' }
];
