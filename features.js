/*
 * AI 課堂平台：功能清單
 *
 * 首頁會依照這份清單自動產生每一個功能項目。
 * 之後要加新功能，只要在 PLATFORM_FEATURES 裡多加一筆，不用改 index.html。
 *
 * 每一筆的欄位：
 *   id           英文代號，不可重複
 *   title        功能名稱
 *   description  一兩句話說明這個功能能做什麼
 *   audience     'student' 學生用、'teacher' 老師用、'all' 大家都能用
 *   href         要開啟的頁面檔名，例如 'student.html'
 *   icon         一個 emoji
 *   status       'live' 已上線（可以點）、'soon' 籌備中（顯示但不能點）
 *   stat         （選填）首頁要即時顯示的資訊，目前支援：
 *                'publishedQuestions'  目前開放作答的題目數
 *
 * 範例：新增一個籌備中的功能
 *   {
 *     id: 'agent-chat',
 *     title: '和 AI 助教對話',
 *     description: '寫作業卡住時，可以先問 AI 助教提示方向。',
 *     audience: 'student',
 *     href: 'agent.html',
 *     icon: '💬',
 *     status: 'soon'
 *   }
 */

window.PLATFORM_INFO = {
  name: 'AI 課堂',
  course: '人工智慧（小教）',
  tagline: 'AI 代理人互動平台',
  repoUrl: 'https://github.com/chiaying1230/aiclassroom'
};

window.PLATFORM_FEATURES = [
  {
    id: 'qa',
    title: '課堂問答',
    description: '閱讀老師發布的問題，寫下自己的想法並送出。老師審核後，可以回來查看分數與回饋。',
    audience: 'student',
    href: 'student.html',
    icon: '✏️',
    status: 'live',
    stat: 'publishedQuestions'
  },
  {
    id: 'teacher',
    title: '教師管理後台',
    description: '出題、發布題目，讓 AI 先初步批改並寫好評語草稿，再由老師確認分數與回饋。',
    audience: 'teacher',
    href: 'teacher.html',
    icon: '📋',
    status: 'live'
  },
  {
    id: 'discuss',
    title: '課堂討論',
    description: 'AI 把全班的回答依想法分類，整理出摘要與討論提問，投影出來帶大家比較不同的想法。',
    audience: 'teacher',
    href: 'discuss.html',
    icon: '🗣️',
    status: 'live'
  }
];
