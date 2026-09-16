/*
 * 首頁按鈕清單
 * 之後要加新功能，在下面多加一筆就會多一顆按鈕。
 *
 *   title   按鈕文字
 *   href    要開啟的頁面檔名，或完整網址
 *   icon    一個 emoji
 *   color   按鈕顏色：'primary' 藍、'navy' 深藍、'purple' 紫、'green' 綠、'orange' 橘
 *   newTab  true 代表在新分頁開啟（外部網站建議設 true）
 *   status  'live' 可以點、'soon' 灰色不能點
 */

window.PLATFORM_FEATURES = [
  { title: '我是學生，我要作答', href: 'student.html', icon: '✏️', color: 'primary', status: 'live' },
  { title: '教師系統', href: 'teacher.html', icon: '👩‍🏫', color: 'navy', status: 'live' },
  { title: '討論平台', href: 'discuss.html', icon: '🗣', color: 'purple', status: 'live' },
  { title: '師大 Moodle', href: 'https://moodle3.ntnu.edu.tw/', icon: '🎓', color: 'orange', newTab: true, status: 'live' }
];
