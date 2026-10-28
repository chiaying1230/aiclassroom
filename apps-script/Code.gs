/* =====================================================
   課堂問答系統：後端（Code.gs）

   這個檔案負責：網頁入口、試算表讀寫、權限與資料流程。
   所有「怎麼問 AI、怎麼解析 AI 回答」的程式都在 ai.gs。
   兩個檔案在同一個 Apps Script 專案裡，函式可以互相呼叫。
===================================================== */

const SPREADSHEET_ID =
  '1I2J-EmbE4SgAzSQtP9dEwhkinlQ1Gy_f9Ao6IG3ftLE';

const QUESTION_SHEET = '題目';
const ANSWER_SHEET = '學生作答';
const CATEGORY_SHEET = '回答類別';
const CODING_SHEET = '回答分類';
const COURSE_SHEET = '課程';
const TEACHER_SHEET = '教師帳號';
const TIME_ZONE = 'Asia/Taipei';

const QUESTION_HEADERS = [
  '題目ID', '標題', '題目內容', '配分', '標準答案',
  '評分規準', 'AI審核', '狀態', '建立時間',
  '截止時間', '截止後', '最後修改', '課程ID',
  '即時回饋風格', '回饋補充指示', '自動分類',
  '學習目標', '評量方式'
];

/* 學生重新送出時，自己勾選有沒有參考 AI 學習建議 */
const AI_ADOPTED_OPTIONS = ['有參考', '部分參考', '沒有參考'];

/* 評量方式：評分（預設）或描述性回饋（不給分） */
const ASSESSMENT = { SCORE: '評分', DESCRIPTIVE: '描述性回饋' };

const COURSE_HEADERS = [
  '課程ID', '課程名稱', '授課教師帳號', '教師顯示名稱', '課程說明',
  '加入代碼', '狀態', '建立時間', '最後修改'
];

const TEACHER_HEADERS = [
  '帳號', '顯示名稱', '角色', '狀態', '密碼雜湊',
  '密碼鹽', '建立時間', '最後登入', '評語口吻', '評語範例'
];

const ANSWER_HEADERS = [
  '回答ID', '題目ID', '學號', '姓名', '學生回答',
  '送出時間', 'AI分數', 'AI評語', 'AI信心', '教師分數',
  '教師評語', '狀態', '最後更新', 'AI教師口吻評語',
  'AI即時回饋', '繳交次數',
  'AI草稿採用', '修改說明', 'AI建議採納'
];

/* 學生每次重新送出前，舊的版本存到這裡 */
const HISTORY_SHEET = '作答歷程';

const HISTORY_HEADERS = [
  '歷程ID', '回答ID', '題目ID', '學號', '姓名', '第幾次',
  '學生回答', '送出時間', 'AI即時回饋', 'AI分數', 'AI評語',
  '教師分數', '教師評語', '狀態', '被取代時間',
  '修改說明', 'AI建議採納', 'AI草稿採用'
];

const HCOL = {
  ID: 1, ANSWER_ID: 2, QUESTION_ID: 3, STUDENT_ID: 4, NAME: 5, VERSION: 6,
  ANSWER: 7, SUBMITTED: 8, INSTANT_FEEDBACK: 9, AI_SCORE: 10, AI_FEEDBACK: 11,
  TEACHER_SCORE: 12, TEACHER_FEEDBACK: 13, STATUS: 14, REPLACED: 15,
  REVISION_NOTE: 16, AI_ADOPTED: 17, DRAFT_ADOPTION: 18
};

const CATEGORY_HEADERS = [
  '類別ID', '題目ID', '類別名稱', '類別說明', 'AI摘要',
  '討論提問', '代表回答ID', '排序', '最後更新'
];

const CODING_HEADERS = [
  '回答ID', '題目ID', '類別ID', 'AI理由', 'AI信心',
  '教師確認', '最後更新',
  'AI原分類', 'AI原理由', '確認來源', '學生確認', '學生說明'
];

/* 欄位位置（從 1 開始算） */

const QCOL = {
  ID: 1, TITLE: 2, CONTENT: 3, POINTS: 4, REFERENCE: 5,
  RUBRIC: 6, AI: 7, STATUS: 8, CREATED: 9,
  DEADLINE: 10, LATE_POLICY: 11, UPDATED: 12, COURSE: 13,
  FEEDBACK_STYLE: 14, FEEDBACK_NOTE: 15, AUTO_CLASSIFY: 16,
  OBJECTIVE: 17, ASSESSMENT: 18
};

const COURSE_COL = {
  ID: 1, NAME: 2, OWNER: 3, TEACHER_NAME: 4, DESCRIPTION: 5,
  CODE: 6, STATUS: 7, CREATED: 8, UPDATED: 9
};

const TCOL = {
  ACCOUNT: 1, NAME: 2, ROLE: 3, STATUS: 4, HASH: 5,
  SALT: 6, CREATED: 7, LAST_LOGIN: 8, VOICE_STYLE: 9, VOICE_EXAMPLES: 10
};

const COURSE_STATUS = { OPEN: '開放', ARCHIVED: '封存' };
const ROLE = { ADMIN: '管理員', TEACHER: '教師' };
const ACCOUNT_STATUS = { ACTIVE: '啟用', DISABLED: '停用' };

/* 管理員帳號固定叫 admin，密碼是指令碼屬性的 TEACHER_PASSWORD */
const ADMIN_ACCOUNT = 'admin';
const ADMIN_DISPLAY_NAME = '管理員';

/* 第一次執行時，原本的題目都會歸到這門課 */
const DEFAULT_COURSE_NAME = '人工智慧（小教）';

/* 加入代碼不用 0、O、1、I、L，避免學生看錯 */
const JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 6;

/* 截止後的處理方式（存在「截止後」欄） */
const LATE_POLICY = {
  CLOSE: '停止收件',
  ACCEPT: '接受遲交'
};

const QUESTION_STATUSES = ['草稿', '發布', '關閉'];

const ACOL = {
  ID: 1, QUESTION_ID: 2, STUDENT_ID: 3, NAME: 4, ANSWER: 5,
  SUBMITTED: 6, AI_SCORE: 7, AI_FEEDBACK: 8, AI_CONFIDENCE: 9,
  TEACHER_SCORE: 10, TEACHER_FEEDBACK: 11, STATUS: 12,
  UPDATED: 13, AI_STUDENT_FEEDBACK: 14,
  INSTANT_FEEDBACK: 15, VERSION: 16,
  DRAFT_ADOPTION: 17, REVISION_NOTE: 18, AI_ADOPTED: 19
};

const CCOL = {
  ID: 1, QUESTION_ID: 2, NAME: 3, DESCRIPTION: 4, SUMMARY: 5,
  DISCUSSION: 6, REPRESENTATIVE: 7, ORDER: 8, UPDATED: 9
};

const KCOL = {
  ANSWER_ID: 1, QUESTION_ID: 2, CATEGORY_ID: 3, REASON: 4,
  CONFIDENCE: 5, CONFIRMED: 6, UPDATED: 7,
  AI_CATEGORY: 8, AI_REASON: 9, CONFIRMED_BY: 10, STUDENT_AGREE: 11, STUDENT_NOTE: 12
};

/* 分類是誰確認的 */
const CONFIRMED_BY = { AI: 'AI自動', TEACHER: '教師' };

const STATUS = {
  WAIT_AI: '待AI批改',
  WAIT_TEACHER: '待教師審核',
  PASSED: '已通過',
  RETURNED: '退回修改'
};

const MAX_ANSWER_LENGTH = 5000;
const MAX_CATEGORIES = 10;
const CLASSIFY_TIME_LIMIT_MS = 270 * 1000;


/* =====================================================
   網頁入口
   網頁都放在 GitHub Pages，這裡只當資料伺服器。
===================================================== */

const SITE_URL = 'https://chiaying1230.github.io/aiclassroom/';

function doGet() {

  return HtmlService
    .createHtmlOutput(
      '<p style="font-family:sans-serif;padding:24px;line-height:1.8">' +
      '這是 AI 課堂的資料伺服器。<br>' +
      '請從課程網站進入：<a href="' + SITE_URL + '" target="_top">' + SITE_URL + '</a>' +
      '</p>'
    )
    .setTitle('AI 課堂');
}


/* =====================================================
   教師登入
   - 管理員：帳號 admin，密碼是「專案設定 → 指令碼屬性」的 TEACHER_PASSWORD。
     看得到所有課程，可以新增教師帳號。
   - 其他教師：帳號存在「教師帳號」工作表，密碼只存雜湊值。
     只看得到自己開的課程。
===================================================== */

const TEACHER_SESSION_SECONDS = 6 * 60 * 60;   // 登入後 6 小時內有效
const LOGIN_MAX_FAILS = 10;                    // 同一帳號連續錯幾次後暫停
const LOGIN_LOCK_SECONDS = 5 * 60;             // 暫停幾秒
const PASSWORD_HASH_ROUNDS = 500;


/*
 * 這次呼叫是誰。
 * null 代表從 Apps Script 編輯器直接執行（測試用），視為管理員。
 * 從網頁呼叫時，doPost 會先填好。
 */
let REQUEST_ = null;


function teacherLogin(first, second) {

  // 新版網頁送 {account, password}；舊版網頁只送密碼字串，當作管理員登入
  let account;
  let password;

  if (first && typeof first === 'object') {
    account = first.account;
    password = first.password;
  } else {
    password = first;
    account = second;
  }

  account = normalizeAccount_(account) || ADMIN_ACCOUNT;
  password = cleanText_(password);

  if (!password) {
    throw new Error('請輸入密碼');
  }

  const cache = CacheService.getScriptCache();
  const failKey = 'teacher_login_fails_' + account;
  const fails = Number(cache.get(failKey)) || 0;

  if (fails >= LOGIN_MAX_FAILS) {
    throw new Error('密碼錯誤次數太多，請 5 分鐘後再試');
  }

  const teacher = verifyTeacherPassword_(account, password);

  if (!teacher) {

    cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);

    // 放慢猜密碼的速度
    Utilities.sleep(1000);

    throw new Error('帳號或密碼錯誤');
  }

  cache.remove(failKey);

  if (teacher.account !== ADMIN_ACCOUNT) {
    withLock_(function() {
      const row = findTeacherRow_(teacher.account);
      if (row) {
        getTeacherSheet_().getRange(row.rowNumber, TCOL.LAST_LOGIN).setValue(new Date());
      }
    });
  }

  const token = Utilities.getUuid();

  cache.put(
    'teacher_session_' + token,
    JSON.stringify({ account: teacher.account, salt: teacher.salt || '' }),
    TEACHER_SESSION_SECONDS
  );

  return {
    token: token,
    expiresInSeconds: TEACHER_SESSION_SECONDS,
    teacher: publicTeacher_(teacher)
  };
}


/*
 * 帳號密碼正確就回傳教師資料，否則回傳 null。
 */
function verifyTeacherPassword_(account, password) {

  if (account === ADMIN_ACCOUNT) {

    const expected = cleanText_(
      PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD')
    );

    if (!expected) {
      throw new Error('尚未設定教師密碼，請在 Apps Script 的指令碼屬性加入 TEACHER_PASSWORD');
    }

    return password === expected ? adminTeacher_() : null;
  }

  const row = findTeacherRow_(account);

  if (!row || row.status !== ACCOUNT_STATUS.ACTIVE) {
    return null;
  }

  return hashPassword_(password, row.salt) === row.hash ? row : null;
}


function teacherLogout(token) {

  token = cleanText_(token);

  if (token) {
    CacheService.getScriptCache().remove('teacher_session_' + token);
  }

  return { success: true };
}


/*
 * 依登入憑證找出教師。每次都重新讀取帳號狀態，
 * 所以帳號被停用或密碼被重設後，舊的登入會立刻失效。
 */
function getTeacherSession_(token) {

  token = cleanText_(token);

  if (!token) {
    return null;
  }

  const saved = CacheService.getScriptCache().get('teacher_session_' + token);

  if (!saved) {
    return null;
  }

  // 改版前的登入只存 '1'，當時只有管理員一種身分
  if (saved === '1') {
    return adminTeacher_();
  }

  let session;

  try {
    session = JSON.parse(saved);
  } catch (error) {
    return null;
  }

  if (session.account === ADMIN_ACCOUNT) {
    return adminTeacher_();
  }

  const row = findTeacherRow_(session.account);

  if (!row || row.status !== ACCOUNT_STATUS.ACTIVE || row.salt !== session.salt) {
    return null;
  }

  return row;
}


/*
 * 目前登入的教師。沒有登入就丟出錯誤。
 */
function currentTeacher_() {

  if (!REQUEST_) {
    return adminTeacher_();
  }

  if (!REQUEST_.teacher) {
    throw new Error('請先登入教師帳號');
  }

  return REQUEST_.teacher;
}


function isAdmin_(teacher) {
  return !!teacher && teacher.role === ROLE.ADMIN;
}


function requireAdmin_() {

  if (!isAdmin_(currentTeacher_())) {
    throw new Error('只有管理員可以使用這個功能');
  }
}


function adminTeacher_() {

  return {
    account: ADMIN_ACCOUNT,
    name: ADMIN_DISPLAY_NAME,
    role: ROLE.ADMIN,
    status: ACCOUNT_STATUS.ACTIVE
  };
}


function publicTeacher_(teacher) {

  return {
    account: teacher.account,
    name: teacher.name,
    role: teacher.role,
    isAdmin: isAdmin_(teacher)
  };
}


function getTeacherConfig() {

  const teacher = currentTeacher_();
  const warnings = [];

  // 管理員能看所有課程、新增帳號，密碼太簡單時提醒
  if (teacher.account === ADMIN_ACCOUNT) {

    const password = cleanText_(
      PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD')
    );

    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      warnings.push('adminPasswordWeak');
    }
  }

  return {
    // 試算表裡有所有課程的資料，只給管理員
    spreadsheetUrl: isAdmin_(teacher)
      ? 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit'
      : '',
    teacher: publicTeacher_(teacher),
    warnings: warnings
  };
}


/* =====================================================
   教師帳號管理（管理員）與修改密碼
===================================================== */

function getTeacherSheet_() {

  const ss = getSpreadsheet_();

  return (
    ss.getSheetByName(TEACHER_SHEET) ||
    ensureSheet_(ss, TEACHER_SHEET, TEACHER_HEADERS, '#e8e1f7', false)
  );
}


function normalizeAccount_(value) {
  return cleanText_(value).toLowerCase();
}


function teacherFromRow_(row, rowNumber) {

  return {
    rowNumber: rowNumber,
    account: normalizeAccount_(row[TCOL.ACCOUNT - 1]),
    name: cleanText_(row[TCOL.NAME - 1]),
    role: cleanText_(row[TCOL.ROLE - 1]) === ROLE.ADMIN ? ROLE.ADMIN : ROLE.TEACHER,
    status: cleanText_(row[TCOL.STATUS - 1]) === ACCOUNT_STATUS.DISABLED
      ? ACCOUNT_STATUS.DISABLED
      : ACCOUNT_STATUS.ACTIVE,
    hash: cleanText_(row[TCOL.HASH - 1]),
    salt: cleanText_(row[TCOL.SALT - 1]),
    createdAt: row[TCOL.CREATED - 1],
    lastLogin: row[TCOL.LAST_LOGIN - 1],
    voiceStyle: cleanText_(row[TCOL.VOICE_STYLE - 1]),
    voiceExamples: cleanText_(row[TCOL.VOICE_EXAMPLES - 1])
  };
}


function getTeacherRows_() {

  const values = getTeacherSheet_().getDataRange().getValues();
  const list = [];

  for (let i = 1; i < values.length; i++) {
    const teacher = teacherFromRow_(values[i], i + 1);
    if (teacher.account) {
      list.push(teacher);
    }
  }

  return list;
}


function findTeacherRow_(account) {

  account = normalizeAccount_(account);

  if (!account || account === ADMIN_ACCOUNT) {
    return null;
  }

  return getTeacherRows_().find(function(teacher) {
    return teacher.account === account;
  }) || null;
}


function hashPassword_(password, salt) {

  const key = Utilities.newBlob(String(salt)).getBytes();
  let bytes = Utilities.newBlob(String(password)).getBytes();

  for (let i = 0; i < PASSWORD_HASH_ROUNDS; i++) {
    bytes = Utilities.computeHmacSha256Signature(bytes, key);
  }

  return Utilities.base64Encode(bytes);
}


function checkNewPassword_(password) {

  password = String(password == null ? '' : password);

  if (password.length < 8) {
    throw new Error('密碼至少要 8 個字元');
  }

  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('密碼要同時包含英文字母和數字');
  }

  if (password.length > 100) {
    throw new Error('密碼太長了');
  }

  return password;
}


function listTeacherAccounts() {

  requireAdmin_();

  const courseCount = {};

  getCourses_().forEach(function(course) {
    courseCount[course.owner] = (courseCount[course.owner] || 0) + 1;
  });

  const list = getTeacherRows_().map(function(teacher) {
    return {
      account: teacher.account,
      name: teacher.name,
      role: teacher.role,
      status: teacher.status,
      createdAt: formatDate_(teacher.createdAt),
      lastLogin: teacher.lastLogin ? formatDate_(teacher.lastLogin) : '',
      courseCount: courseCount[teacher.account] || 0,
      builtIn: false
    };
  });

  list.unshift({
    account: ADMIN_ACCOUNT,
    name: ADMIN_DISPLAY_NAME,
    role: ROLE.ADMIN,
    status: ACCOUNT_STATUS.ACTIVE,
    createdAt: '',
    lastLogin: '',
    courseCount: courseCount[ADMIN_ACCOUNT] || 0,
    builtIn: true
  });

  return list;
}


function createTeacherAccount(data) {

  requireAdmin_();

  data = data || {};

  const account = normalizeAccount_(data.account);
  const name = cleanText_(data.name).substring(0, 30);
  const role = cleanText_(data.role) === ROLE.ADMIN ? ROLE.ADMIN : ROLE.TEACHER;
  const password = checkNewPassword_(data.password);

  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(account)) {
    throw new Error('帳號要 3 到 30 個字元，只能用英文小寫、數字、點、底線或減號');
  }

  if (account === ADMIN_ACCOUNT) {
    throw new Error('admin 是保留的管理員帳號，請換一個');
  }

  if (!name) {
    throw new Error('請輸入顯示名稱，例如「王老師」');
  }

  return withLock_(function() {

    if (findTeacherRow_(account)) {
      throw new Error('帳號「' + account + '」已經有人使用');
    }

    const salt = Utilities.getUuid();
    const now = new Date();

    appendRows_(getTeacherSheet_(), [[
      account, name, role, ACCOUNT_STATUS.ACTIVE,
      hashPassword_(password, salt), salt, now, ''
    ]], TEACHER_HEADERS.length);

    return { success: true, account: account };
  });
}


function updateTeacherAccount(data) {

  requireAdmin_();

  data = data || {};

  const account = normalizeAccount_(data.account);

  return withLock_(function() {

    const row = findTeacherRow_(account);

    if (!row) {
      throw new Error('找不到這個帳號');
    }

    const name = data.name === undefined ? row.name : cleanText_(data.name).substring(0, 30);
    const role = data.role === undefined
      ? row.role
      : (cleanText_(data.role) === ROLE.ADMIN ? ROLE.ADMIN : ROLE.TEACHER);
    const status = data.status === undefined
      ? row.status
      : (cleanText_(data.status) === ACCOUNT_STATUS.DISABLED ? ACCOUNT_STATUS.DISABLED : ACCOUNT_STATUS.ACTIVE);

    if (!name) {
      throw new Error('顯示名稱不能空白');
    }

    getTeacherSheet_()
      .getRange(row.rowNumber, TCOL.NAME, 1, 3)
      .setValues(cells_([[name, role, status]]));

    return { success: true };
  });
}


function resetTeacherPassword(account, newPassword) {

  requireAdmin_();

  return setTeacherPassword_(normalizeAccount_(account), checkNewPassword_(newPassword));
}


function changeMyPassword(oldPassword, newPassword) {

  const teacher = currentTeacher_();

  if (teacher.account === ADMIN_ACCOUNT) {
    throw new Error('管理員密碼請到 Apps Script「專案設定 → 指令碼屬性」修改 TEACHER_PASSWORD');
  }

  if (!verifyTeacherPassword_(teacher.account, cleanText_(oldPassword))) {
    throw new Error('目前的密碼不正確');
  }

  return setTeacherPassword_(teacher.account, checkNewPassword_(newPassword));
}


/*
 * 換新的鹽再存雜湊值。鹽變了，這個帳號所有舊的登入都會失效。
 */
function setTeacherPassword_(account, password) {

  return withLock_(function() {

    const row = findTeacherRow_(account);

    if (!row) {
      throw new Error('找不到這個帳號');
    }

    const salt = Utilities.getUuid();

    getTeacherSheet_()
      .getRange(row.rowNumber, TCOL.HASH, 1, 2)
      .setValues(cells_([[hashPassword_(password, salt), salt]]));

    return { success: true };
  });
}


/* =====================================================
   課程
   每一題都屬於一門課程（題目表的「課程ID」欄）。
   學生作答、討論類別、分類都透過題目ID連到題目，所以也跟著分到課程。
===================================================== */

let coursesCache_ = null;
let defaultCourseIdCache_ = '';


function getCourseSheet_() {

  const ss = getSpreadsheet_();

  return (
    ss.getSheetByName(COURSE_SHEET) ||
    ensureSheet_(ss, COURSE_SHEET, COURSE_HEADERS, '#dff1f4', false)
  );
}


function courseFromRow_(row, rowNumber) {

  return {
    rowNumber: rowNumber,
    id: cleanText_(row[COURSE_COL.ID - 1]),
    name: cleanText_(row[COURSE_COL.NAME - 1]),
    owner: normalizeAccount_(row[COURSE_COL.OWNER - 1]) || ADMIN_ACCOUNT,
    teacherName: cleanText_(row[COURSE_COL.TEACHER_NAME - 1]),
    description: cleanText_(row[COURSE_COL.DESCRIPTION - 1]),
    code: cleanText_(row[COURSE_COL.CODE - 1]).toUpperCase(),
    status: cleanText_(row[COURSE_COL.STATUS - 1]) === COURSE_STATUS.ARCHIVED
      ? COURSE_STATUS.ARCHIVED
      : COURSE_STATUS.OPEN,
    createdAt: row[COURSE_COL.CREATED - 1],
    updatedAt: row[COURSE_COL.UPDATED - 1]
  };
}


function getCourses_() {

  if (coursesCache_) {
    return coursesCache_;
  }

  const values = getCourseSheet_().getDataRange().getValues();
  const list = [];

  for (let i = 1; i < values.length; i++) {
    const course = courseFromRow_(values[i], i + 1);
    if (course.id) {
      list.push(course);
    }
  }

  coursesCache_ = list;

  return list;
}


function findCourse_(courseId) {

  courseId = cleanText_(courseId);

  return getCourses_().find(function(course) {
    return course.id === courseId;
  }) || null;
}


function normalizeCode_(code) {
  return cleanText_(code).toUpperCase().replace(/[\s-]/g, '');
}


function findCourseByCode_(code) {

  code = normalizeCode_(code);

  if (!code) {
    return null;
  }

  return getCourses_().find(function(course) {
    return course.code === code;
  }) || null;
}


/*
 * 預設課程：改版前的題目都屬於這門課。
 * 第一次用到時自動建立，課程ID存在指令碼屬性 DEFAULT_COURSE_ID。
 */
function getDefaultCourseId_() {

  if (defaultCourseIdCache_) {
    return defaultCourseIdCache_;
  }

  const props = PropertiesService.getScriptProperties();
  const saved = cleanText_(props.getProperty('DEFAULT_COURSE_ID'));

  if (saved && findCourse_(saved)) {
    defaultCourseIdCache_ = saved;
    return saved;
  }

  defaultCourseIdCache_ = withLock_(function() {

    coursesCache_ = null;

    // 鎖住後再確認一次，避免兩個人同時建立
    const again = cleanText_(props.getProperty('DEFAULT_COURSE_ID'));

    if (again && findCourse_(again)) {
      return again;
    }

    const id = generateId_('K');
    const now = new Date();

    appendRows_(getCourseSheet_(), [[
      id, DEFAULT_COURSE_NAME, ADMIN_ACCOUNT, '', '',
      generateJoinCode_(), COURSE_STATUS.OPEN, now, now
    ]], COURSE_HEADERS.length);

    props.setProperty('DEFAULT_COURSE_ID', id);
    coursesCache_ = null;

    return id;
  });

  return defaultCourseIdCache_;
}


/*
 * 題目屬於哪門課。課程ID 空白的舊題目算預設課程。
 */
function courseIdOf_(questionOrRow) {

  const id = Array.isArray(questionOrRow)
    ? cleanText_(questionOrRow[QCOL.COURSE - 1])
    : cleanText_(questionOrRow && questionOrRow.courseId);

  return id || getDefaultCourseId_();
}


function generateJoinCode_() {

  const used = {};

  getCourses_().forEach(function(course) {
    used[course.code] = true;
  });

  for (let attempt = 0; attempt < 50; attempt++) {

    let code = '';

    for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
      code += JOIN_CODE_CHARS.charAt(Math.floor(Math.random() * JOIN_CODE_CHARS.length));
    }

    if (!used[code]) {
      return code;
    }
  }

  throw new Error('產生加入代碼失敗，請再試一次');
}


function canAccessCourse_(teacher, course) {
  return !!course && (isAdmin_(teacher) || course.owner === teacher.account);
}


/*
 * 確認目前登入的教師可以管理這門課，可以就回傳課程。
 */
function requireCourse_(courseId) {

  const course = findCourse_(courseId);

  if (!course) {
    throw new Error('找不到這門課程，可能已經被刪除');
  }

  if (!canAccessCourse_(currentTeacher_(), course)) {
    throw new Error('你沒有這門課程的管理權限');
  }

  return course;
}


/*
 * 確認目前登入的教師可以管理這一題，可以就回傳題目。
 */
function requireQuestion_(questionId) {

  const question = findQuestion_(questionId);

  if (!question) {
    throw new Error('找不到題目，可能已經被刪除');
  }

  requireCourse_(question.courseId);

  return question;
}


/*
 * 確認目前登入的教師可以管理這份回答。
 */
function requireAnswer_(answerId) {

  answerId = cleanText_(answerId);

  const values = getAnswerSheet_().getDataRange().getValues();
  const index = findRowIndex_(values, answerId);

  if (index < 0) {
    throw new Error('找不到這份回答');
  }

  return requireQuestion_(values[index][ACOL.QUESTION_ID - 1]);
}


/*
 * 教師畫面要顯示哪一門課：
 * 有指定就檢查權限；沒指定（舊版網頁）就用預設課程，沒權限時用自己的第一門課。
 */
function resolveTeacherCourse_(courseId) {

  if (cleanText_(courseId)) {
    return requireCourse_(courseId);
  }

  const teacher = currentTeacher_();
  const fallback = findCourse_(getDefaultCourseId_());

  if (canAccessCourse_(teacher, fallback)) {
    return fallback;
  }

  return getCourses_().find(function(course) {
    return canAccessCourse_(teacher, course);
  }) || null;
}


function teacherNameMap_() {

  const map = {};
  map[ADMIN_ACCOUNT] = ADMIN_DISPLAY_NAME;

  getTeacherRows_().forEach(function(teacher) {
    map[teacher.account] = teacher.name;
  });

  return map;
}


/* ---------- 學生用 ---------- */

/*
 * 學生輸入加入代碼時呼叫。只回傳學生需要知道的資料。
 */
function getCourseByCode(code) {

  const course = findCourseByCode_(code);

  if (!course) {
    throw new Error('找不到這個課程代碼，請確認有沒有打錯');
  }

  return publicCourseForStudent_(course);
}


function publicCourseForStudent_(course) {

  return {
    code: course.code,
    name: course.name,
    // 沒填教師顯示名稱時用帳號的名稱；管理員帳號的名稱「管理員」不適合給學生看
    teacherName: course.teacherName ||
      (course.owner === ADMIN_ACCOUNT ? '' : teacherNameMap_()[course.owner] || ''),
    description: course.description,
    archived: course.status === COURSE_STATUS.ARCHIVED
  };
}


/*
 * 學生端指定課程：有代碼就用代碼，沒有（舊版網頁）就用預設課程。
 */
function resolveStudentCourse_(code) {

  const course = cleanText_(code)
    ? findCourseByCode_(code)
    : findCourse_(getDefaultCourseId_());

  if (!course) {
    throw new Error('找不到這個課程代碼，請向老師確認');
  }

  return course;
}


/* ---------- 教師用 ---------- */

function getMyCourses() {

  const teacher = currentTeacher_();
  const names = teacherNameMap_();
  const defaultId = getDefaultCourseId_();

  const questionCount = {};

  const questionRows = getQuestionSheet_().getDataRange().getValues().slice(1);

  questionRows.forEach(function(row) {
    if (cleanText_(row[0])) {
      const id = courseIdOf_(row);
      questionCount[id] = (questionCount[id] || 0) + 1;
    }
  });

  return getCourses_()
    .filter(function(course) {
      return canAccessCourse_(teacher, course);
    })
    .map(function(course) {
      return {
        id: course.id,
        name: course.name,
        owner: course.owner,
        ownerName: names[course.owner] || course.owner,
        teacherName: course.teacherName ||
          (course.owner === ADMIN_ACCOUNT ? '' : names[course.owner] || ''),
        description: course.description,
        code: course.code,
        status: course.status,
        archived: course.status === COURSE_STATUS.ARCHIVED,
        mine: course.owner === teacher.account,
        isDefault: course.id === defaultId,
        questionCount: questionCount[course.id] || 0,
        createdAt: formatDate_(course.createdAt)
      };
    });
}


function cleanCourseInput_(data) {

  data = data || {};

  const name = cleanText_(data.name).substring(0, 40);

  if (!name) {
    throw new Error('請輸入課程名稱');
  }

  return {
    name: name,
    teacherName: cleanText_(data.teacherName).substring(0, 30),
    description: cleanText_(data.description).substring(0, 300)
  };
}


/*
 * 管理員可以把課程指定給其他教師；一般教師只能開自己的課。
 */
function resolveCourseOwner_(owner) {

  const teacher = currentTeacher_();

  owner = normalizeAccount_(owner);

  if (!owner || owner === teacher.account) {
    return teacher.account;
  }

  if (!isAdmin_(teacher)) {
    throw new Error('只有管理員可以把課程指定給其他教師');
  }

  if (owner === ADMIN_ACCOUNT) {
    return owner;
  }

  const row = findTeacherRow_(owner);

  if (!row || row.status !== ACCOUNT_STATUS.ACTIVE) {
    throw new Error('找不到這個教師帳號，或帳號已停用');
  }

  return row.account;
}


function createCourse(data) {

  const input = cleanCourseInput_(data);
  const owner = resolveCourseOwner_(data && data.owner);

  // 先確保預設課程存在，免得它在這次新增之後才建立
  getDefaultCourseId_();

  return withLock_(function() {

    coursesCache_ = null;

    const id = generateId_('K');
    const code = generateJoinCode_();
    const now = new Date();

    appendRows_(getCourseSheet_(), [[
      id, input.name, owner, input.teacherName, input.description,
      code, COURSE_STATUS.OPEN, now, now
    ]], COURSE_HEADERS.length);

    coursesCache_ = null;

    return { success: true, id: id, code: code };
  });
}


function updateCourse(data) {

  data = data || {};

  const course = requireCourse_(data.id);
  const input = cleanCourseInput_(data);
  const owner = data.owner === undefined ? course.owner : resolveCourseOwner_(data.owner);

  return withLock_(function() {

    getCourseSheet_()
      .getRange(course.rowNumber, COURSE_COL.NAME, 1, 4)
      .setValues(cells_([[input.name, owner, input.teacherName, input.description]]));

    getCourseSheet_().getRange(course.rowNumber, COURSE_COL.UPDATED).setValue(new Date());

    coursesCache_ = null;

    return { success: true };
  });
}


function setCourseStatus(courseId, status) {

  const course = requireCourse_(courseId);

  if ([COURSE_STATUS.OPEN, COURSE_STATUS.ARCHIVED].indexOf(status) === -1) {
    throw new Error('不允許的課程狀態');
  }

  return withLock_(function() {

    getCourseSheet_()
      .getRange(course.rowNumber, COURSE_COL.STATUS)
      .setValue(status);

    getCourseSheet_().getRange(course.rowNumber, COURSE_COL.UPDATED).setValue(new Date());

    coursesCache_ = null;

    return { success: true };
  });
}


/*
 * 代碼外流時換一組新的。已經加入的學生要重新輸入新代碼。
 */
function resetCourseCode(courseId) {

  const course = requireCourse_(courseId);

  return withLock_(function() {

    coursesCache_ = null;

    const code = generateJoinCode_();

    getCourseSheet_()
      .getRange(course.rowNumber, COURSE_COL.CODE)
      .setValue(code);

    getCourseSheet_().getRange(course.rowNumber, COURSE_COL.UPDATED).setValue(new Date());

    coursesCache_ = null;

    return { success: true, code: code };
  });
}


/*
 * 只有管理員能做、但函式寫在別的檔案（ai.gs、RAG）裡的功能，包一層檢查。
 */
function adminOnly_(fn, name) {

  if (typeof fn !== 'function') {
    throw new Error('找不到函式：' + name);
  }

  const wrapped = function() {
    requireAdmin_();
    return fn.apply(null, arguments);
  };

  return wrapped;
}


/* =====================================================
   API 入口（給 GitHub Pages 上的網頁呼叫）
   前端送出 {"fn": "函式名稱", "args": [...], "token": "教師登入憑證"}
===================================================== */

/*
 * 不用登入就能呼叫的功能
 */
function getPublicApiHandlers_() {

  return {
    getCourseByCode: getCourseByCode,
    getPublishedQuestions: getPublishedQuestions,
    submitAnswer: submitAnswer,
    getStudentResults: getStudentResults,
    requestInstantFeedback: requestInstantFeedback,
    confirmMyClassification: confirmMyClassification,
    teacherLogin: teacherLogin,
    teacherLogout: teacherLogout
  };
}


/*
 * 必須先登入教師帳號才能呼叫的功能
 * 之後新增教師用的後端函式，記得加在這裡。
 *
 * 權限：每個函式自己會檢查「這門課／這一題是不是登入者的」，
 * 管理員才能用的功能，函式裡會呼叫 requireAdmin_()，
 * 或是在這裡用 adminOnly_() 包起來。
 *
 * 注意：這裡列出的每個函式都必須真的存在於專案中，
 * 少一個檔案，所有教師功能都會出錯。
 */
function getTeacherApiHandlers_() {

  return {

    // 教師後台
    getTeacherConfig: getTeacherConfig,
    createQuestion: createQuestion,
    updateQuestion: updateQuestion,
    getTeacherQuestions: getTeacherQuestions,
    updateQuestionStatus: updateQuestionStatus,
    getTeacherAnswers: getTeacherAnswers,
    deleteQuestion: deleteQuestion,
    copyQuestions: copyQuestions,
    previewInstantFeedback: previewInstantFeedback,
    analyzeQuestionLearning: analyzeQuestionLearning,
    getQuestionInsight: getQuestionInsight,
    saveTeacherReview: saveTeacherReview,
    runAIReview: runAIReview,
    // 評語口吻：每位老師自己的；管理員改的是全站預設
    getAISettings: getMyAISettings,
    saveAISettings: saveMyAISettings,
    saveInsightJudgement: saveInsightJudgement,
    exportResearchRecords: exportResearchRecords,

    // 課程
    getMyCourses: getMyCourses,
    createCourse: createCourse,
    updateCourse: updateCourse,
    setCourseStatus: setCourseStatus,
    resetCourseCode: resetCourseCode,

    // 帳號
    changeMyPassword: changeMyPassword,
    listTeacherAccounts: listTeacherAccounts,
    createTeacherAccount: createTeacherAccount,
    updateTeacherAccount: updateTeacherAccount,
    resetTeacherPassword: resetTeacherPassword,

    // 課堂討論
    getDiscussionBoard: getDiscussionBoard,
    saveCategories: saveCategories,
    suggestCategories: suggestCategories,
    classifyAnswers: classifyAnswers,
    clearUnconfirmedClassifications: clearUnconfirmedClassifications,
    setAnswerCategory: setAnswerCategory,
    confirmClassifications: confirmClassifications,
    summarizeCategories: summarizeCategories,
    setQuestionAutoClassify: setQuestionAutoClassify,
    runAutoClassifyNow: runAutoClassifyNow,

    // 教材庫與 AI 助理：網頁用的名稱不變，實際呼叫的是會檢查課程的版本
    // （函式在這個檔案的「教材庫分課程」，再交給 RAG_Admin.gs、RAG_Chat.gs）
    previewRAGForTeacher: previewRAGForCourse_,
    ragListDocuments: ragListDocumentsForCourse_,
    ragGetDocumentDetail: ragGetDocumentDetailChecked_,
    ragUploadPdf: ragUploadPdfForCourse_,
    ragRetryDocument: ragRetryDocumentChecked_,
    ragUpdateDocumentInfo: ragUpdateDocumentInfoChecked_,
    ragSetDocumentStatus: ragSetDocumentStatusChecked_,
    ragSetChunkStatus: ragSetChunkStatusChecked_,
    ragChat: ragChatForCourse_

  };

}


function doPost(e) {

  let output;

  // 每次呼叫都重新判斷身分；從網頁呼叫一律不是「編輯器執行」
  REQUEST_ = { teacher: null };

  try {

    const request = JSON.parse(
      e && e.postData && e.postData.contents
        ? e.postData.contents
        : '{}'
    );

    const fn = String(request.fn || '');
    const args = Array.isArray(request.args) ? request.args : [];

    const publicHandlers = getPublicApiHandlers_();
    let handler = Object.prototype.hasOwnProperty.call(publicHandlers, fn)
      ? publicHandlers[fn]
      : null;

    if (!handler) {

      const teacherHandlers = getTeacherApiHandlers_();

      handler = Object.prototype.hasOwnProperty.call(teacherHandlers, fn)
        ? teacherHandlers[fn]
        : null;

      if (handler) {

        REQUEST_.teacher = getTeacherSession_(request.token);

        if (!REQUEST_.teacher) {
          return jsonOutput_({
            ok: false,
            code: 'AUTH_REQUIRED',
            error: '請先登入教師帳號'
          });
        }
      }
    }

    if (!handler) {
      throw new Error('不允許呼叫的功能：' + fn);
    }

    output = { ok: true, result: handler.apply(null, args) };

  } catch (error) {

    output = {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }

  return jsonOutput_(output);
}


function jsonOutput_(data) {

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


/* =====================================================
   初始化系統（更新程式後請再執行一次）
===================================================== */

function setupSystem() {

  const ss = getSpreadsheet_();

  const answerSheet =
    ensureSheet_(ss, ANSWER_SHEET, ANSWER_HEADERS, '#dcf4e7', true);

  const questionSheet =
    ensureSheet_(ss, QUESTION_SHEET, QUESTION_HEADERS, '#d9e5ff', false);
  ensureSheet_(ss, CATEGORY_SHEET, CATEGORY_HEADERS, '#fff1d6', false);
  ensureSheet_(ss, CODING_SHEET, CODING_HEADERS, '#fde2e2', false);
  ensureSheet_(ss, COURSE_SHEET, COURSE_HEADERS, '#dff1f4', false);
  ensureSheet_(ss, TEACHER_SHEET, TEACHER_HEADERS, '#e8e1f7', false);
  ensureSheet_(ss, RAG_COURSE_SHEET, RAG_COURSE_HEADERS, '#e3f3eb', false);
  ensureSheet_(ss, HISTORY_SHEET, HISTORY_HEADERS, '#eef0f3', false);
  ensureSheet_(ss, INSIGHT_SHEET, INSIGHT_HEADERS, '#fff6d6', false);
  ensureSheet_(ss, EVENT_SHEET, EVENT_HEADERS, '#f3ecdf', false);

  // 即時回饋與自動分類的背景工作
  const trigger = installAutoTrigger_();
  markAutoWork_();

  /*
   * 課程：建立預設課程，把還沒有課程的舊題目都歸到預設課程。
   */
  const defaultCourseId = getDefaultCourseId_();
  const moved = withLock_(function() {

    const lastRow = questionSheet.getLastRow();

    if (lastRow < 2) {
      return 0;
    }

    const range = questionSheet.getRange(2, QCOL.COURSE, lastRow - 1, 1);
    const ids = questionSheet.getRange(2, QCOL.ID, lastRow - 1, 1).getValues();
    const values = range.getValues();
    let count = 0;

    values.forEach(function(row, i) {
      if (cleanText_(ids[i][0]) && !cleanText_(row[0])) {
        row[0] = defaultCourseId;
        count++;
      }
    });

    if (count) {
      range.setValues(cells_(values));
    }

    return count;
  });

  const course = findCourse_(defaultCourseId);

  /*
   * 學號欄設為純文字，避免 0123 被存成 123。
   * 只影響之後寫入的資料。
   */
  answerSheet
    .getRange(1, ACOL.STUDENT_ID, answerSheet.getMaxRows(), 1)
    .setNumberFormat('@');

  const repaired = repairFormulaCells();

  const message =
    '系統初始化完成。預設課程「' + course.name + '」的加入代碼是 ' + course.code +
    (moved ? '，已把 ' + moved + ' 題舊題目歸到這門課' : '') +
    (repaired ? '，已修復 ' + repaired + ' 格顯示成 #ERROR! 的文字' : '') +
    '。自動處理的觸發條件' + trigger + '。';

  Logger.log(message);

  return message;
}


/*
 * 修復被試算表當成公式的文字。
 * 改版前，開頭是 = + - 的回答、題目、評語會被當成公式，顯示成 #ERROR!。
 * 原本的文字其實還留在儲存格的「公式」裡，這裡把它改回純文字。
 * 只檢查系統自己寫入文字的欄位，老師自己在其他欄位加的公式不會被動到。
 * setupSystem 會自動執行；也可以在編輯器單獨執行。
 */
function repairFormulaCells() {

  const targets = [
    [QUESTION_SHEET, [QCOL.TITLE, QCOL.CONTENT, QCOL.REFERENCE, QCOL.RUBRIC]],
    [ANSWER_SHEET, [ACOL.NAME, ACOL.ANSWER, ACOL.AI_FEEDBACK, ACOL.TEACHER_FEEDBACK, ACOL.AI_STUDENT_FEEDBACK]],
    [CATEGORY_SHEET, [CCOL.NAME, CCOL.DESCRIPTION, CCOL.SUMMARY, CCOL.DISCUSSION]],
    [CODING_SHEET, [KCOL.REASON]]
  ];

  return withLock_(function() {

    let fixed = 0;

    targets.forEach(function(target) {

      const sheet = getSpreadsheet_().getSheetByName(target[0]);

      if (!sheet || sheet.getLastRow() < 2) {
        return;
      }

      target[1].forEach(function(col) {

        if (col > sheet.getMaxColumns()) {
          return;
        }

        const range = sheet.getRange(2, col, sheet.getLastRow() - 1, 1);
        const formulas = range.getFormulas();

        formulas.forEach(function(row, i) {
          if (row[0]) {
            sheet.getRange(i + 2, col).setValue(cell_(row[0]));
            fixed++;
          }
        });
      });
    });

    Logger.log(fixed ? '已修復 ' + fixed + ' 格被當成公式的文字' : '沒有需要修復的儲存格');

    return fixed;
  });
}


/*
 * 確保工作表存在且標題列正確。
 * - 舊標題是新標題的前段（例如少了最後一欄）：自動補上新欄位，資料保留。
 * - 格式完全不同：backupIfIncompatible 為 true 時備份舊表並建新表，否則報錯。
 */
function ensureSheet_(ss, name, headers, color, backupIfIncompatible) {

  let sheet = ss.getSheetByName(name);

  if (sheet && sheet.getLastRow() > 0) {

    // 工作表欄數不夠時先補欄，才能寫入新增的標題
    if (sheet.getMaxColumns() < headers.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
    }

    const width = Math.max(sheet.getLastColumn(), headers.length);

    const current = sheet
      .getRange(1, 1, 1, width)
      .getDisplayValues()[0]
      .map(function(value) {
        return String(value).trim();
      });

    let matched = 0;

    while (
      matched < headers.length &&
      current[matched] === headers[matched]
    ) {
      matched++;
    }

    const restEmpty = current
      .slice(matched, headers.length)
      .every(function(value) {
        return value === '';
      });

    if (matched > 0 && restEmpty) {

      if (matched < headers.length) {
        sheet
          .getRange(1, matched + 1, 1, headers.length - matched)
          .setValues(cells_([headers.slice(matched)]));
      }

    } else if (backupIfIncompatible) {

      let backupName =
        name + '_舊資料_' +
        Utilities.formatDate(new Date(), TIME_ZONE, 'yyyyMMdd_HHmmss');

      if (ss.getSheetByName(backupName)) {
        backupName += '_' + Math.floor(Math.random() * 1000);
      }

      sheet.setName(backupName);
      sheet = ss.insertSheet(name);

    } else {

      throw new Error(
        '「' + name + '」工作表的標題列格式不符，請檢查後再執行 setupSystem'
      );

    }
  }

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  sheet
    .getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground(color);

  sheet.setFrozenRows(1);

  return sheet;
}


/* =====================================================
   工具
===================================================== */

let spreadsheetCache_ = null;

function getSpreadsheet_() {

  if (!spreadsheetCache_) {
    spreadsheetCache_ = SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  return spreadsheetCache_;
}


function getQuestionSheet_() {

  const sheet = getSpreadsheet_().getSheetByName(QUESTION_SHEET);

  if (!sheet) {
    throw new Error('找不到「題目」工作表，請先執行 setupSystem');
  }

  return sheet;
}


function getAnswerSheet_() {

  const sheet = getSpreadsheet_().getSheetByName(ANSWER_SHEET);

  if (!sheet) {
    throw new Error('找不到「學生作答」工作表，請先執行 setupSystem');
  }

  return sheet;
}


function getCategorySheet_() {

  const ss = getSpreadsheet_();

  return (
    ss.getSheetByName(CATEGORY_SHEET) ||
    ensureSheet_(ss, CATEGORY_SHEET, CATEGORY_HEADERS, '#fff1d6', false)
  );
}


function getCodingSheet_() {

  const ss = getSpreadsheet_();

  return (
    ss.getSheetByName(CODING_SHEET) ||
    ensureSheet_(ss, CODING_SHEET, CODING_HEADERS, '#fde2e2', false)
  );
}


/*
 * 寫入資料時加鎖，避免多人同時操作造成重複列或列號錯位。
 */
let lockDepth_ = 0;

function withLock_(callback) {

  // 已經在鎖裡面（例如建立預設課程時）就直接執行，避免提早放掉外層的鎖
  if (lockDepth_ > 0) {
    return callback();
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error('目前使用人數較多，請稍後再試一次');
  }

  lockDepth_++;

  try {

    const result = callback();
    SpreadsheetApp.flush();
    return result;

  } finally {

    lockDepth_--;
    lock.releaseLock();

  }
}


/*
 * 寫進試算表前的處理。
 * Google 試算表會把開頭是 = + - @ 的文字當成公式，
 * 例如學生回答「- 需要陽光」會變成 #ERROR!，「=IMAGE(...)」甚至會執行。
 * 前面加一個 ' 就會存成純文字，畫面上和讀出來都不會有這個 '。
 */
function cell_(value) {

  if (typeof value === 'string' && /^[=+\-@']/.test(value)) {
    return "'" + value;
  }

  return value;
}


function cells_(rows) {
  return rows.map(function(row) {
    return row.map(cell_);
  });
}


function cleanText_(value) {
  return String(value == null ? '' : value).trim();
}


function truncate_(value, max) {

  const text = cleanText_(value);

  return text.length > max
    ? text.substring(0, max) + '…'
    : text;
}


function generateId_(prefix) {
  return (
    prefix + '_' + Date.now() + '_' +
    Math.floor(Math.random() * 100000)
  );
}


function formatDate_(value) {

  if (!value) {
    return '';
  }

  try {
    return Utilities.formatDate(
      new Date(value), TIME_ZONE, 'yyyy/MM/dd HH:mm:ss'
    );
  } catch (error) {
    return String(value);
  }
}


function toTime_(value) {

  if (value instanceof Date) {
    return value.getTime();
  }

  const time = new Date(value).getTime();

  return isNaN(time) ? 0 : time;
}



function findRowIndex_(values, id) {

  for (let i = 1; i < values.length; i++) {
    if (cleanText_(values[i][0]) === id) {
      return i;
    }
  }

  return -1;
}


/*
 * 由下往上刪除符合條件的列，連續的列一次刪除。
 */
function deleteRowsWhere_(sheet, predicate) {

  const values = sheet.getDataRange().getValues();

  let deleted = 0;
  let i = values.length - 1;

  while (i >= 1) {

    if (!predicate(values[i])) {
      i--;
      continue;
    }

    const endIndex = i;

    while (i >= 1 && predicate(values[i])) {
      i--;
    }

    const startIndex = i + 1;
    const count = endIndex - startIndex + 1;

    /*
     * 試算表不允許刪光所有未凍結的列，先補一列空白列。
     */
    if (sheet.getMaxRows() - count <= sheet.getFrozenRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), 1);
    }

    sheet.deleteRows(startIndex + 1, count);
    deleted += count;
  }

  return deleted;
}


/*
 * 在工作表最後面加上多列資料。
 *
 * 為什麼需要：刪除類別、重新分類、刪除題目時，程式會「刪除整列」，
 * 工作表的總列數會越來越少。用久了，最後一筆資料就剛好在工作表的最底端，
 * 再往下寫就會出現「範圍座標超出工作表」的錯誤，看起來像是存不進資料庫。
 * 這裡寫入前會先檢查，列數不夠就自動補空白列。
 */
function appendRows_(sheet, rows, width) {

  if (!rows.length) {
    return 0;
  }

  const startRow = sheet.getLastRow() + 1;
  const neededLastRow = startRow + rows.length - 1;
  const maxRows = sheet.getMaxRows();

  if (neededLastRow > maxRows) {
    // 多補 200 列，下次就不用再補
    sheet.insertRowsAfter(maxRows, neededLastRow - maxRows + 200);
  }

  // 欄位比工作表多（新增欄位後還沒執行 setupSystem）時先補欄
  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }

  // 比較短的列補空白，新增欄位時舊的寫入程式不用每個都改
  const padded = rows.map(function(row) {
    row = row.slice(0, width);
    while (row.length < width) row.push('');
    return row;
  });

  sheet
    .getRange(startRow, 1, rows.length, width)
    .setValues(cells_(padded));

  return startRow;
}


function questionFromRow_(row, rowNumber) {

  return {
    rowNumber: rowNumber,
    id: cleanText_(row[0]),
    title: cleanText_(row[1]),
    content: cleanText_(row[2]),
    points: Number(row[3]) || 0,
    referenceAnswer: cleanText_(row[4]),
    rubric: cleanText_(row[5]),
    enableAI: cleanText_(row[6]) === '是',
    status: cleanText_(row[7]),
    deadline: toTime_(row[QCOL.DEADLINE - 1]),
    allowLate: cleanText_(row[QCOL.LATE_POLICY - 1]) === LATE_POLICY.ACCEPT,
    courseId: courseIdOf_(row),
    // 學生送出後的即時 AI 回饋：空白代表不提供
    feedbackStyle: cleanText_(row[QCOL.FEEDBACK_STYLE - 1]),
    feedbackNote: cleanText_(row[QCOL.FEEDBACK_NOTE - 1]),
    // 學生送出後自動分類到課堂討論並標成已確認
    autoClassify: cleanText_(row[QCOL.AUTO_CLASSIFY - 1]) === '是',
    objective: cleanText_(row[QCOL.OBJECTIVE - 1]),
    // 空白（舊題目）視為評分
    assessment: cleanText_(row[QCOL.ASSESSMENT - 1]) === ASSESSMENT.DESCRIPTIVE
      ? ASSESSMENT.DESCRIPTIVE
      : ASSESSMENT.SCORE
  };
}


function isDescriptiveQuestion_(question) {
  return !!question && question.assessment === ASSESSMENT.DESCRIPTIVE;
}


/* =====================================================
   截止時間
   試算表「截止時間」欄存日期時間，空白代表沒有截止時間。
   「截止後」欄：停止收件（預設）或接受遲交。
===================================================== */

/*
 * 把前端送來的截止時間轉成 Date。
 * 前端送的是毫秒數（瀏覽器依老師電腦的時區換算好），空白代表不設截止時間。
 */
function parseDeadline_(value) {

  if (value === '' || value === null || value === undefined || value === 0) {
    return '';
  }

  const number = Number(value);
  const date = !isNaN(number) ? new Date(number) : new Date(value);
  const year = date.getFullYear();

  if (isNaN(date.getTime()) || year < 2000 || year > 2100) {
    throw new Error('截止時間的格式不正確');
  }

  return date;
}


function formatDeadline_(time) {

  return time
    ? Utilities.formatDate(new Date(time), TIME_ZONE, 'yyyy/MM/dd HH:mm')
    : '';
}


/*
 * 回答是否遲交：有截止時間，且送出時間晚於截止時間。
 */
function isLate_(submitted, deadline) {

  const time = toTime_(submitted);

  return !!deadline && !!time && time > deadline;
}


/*
 * 舊的題目表只有 9 欄，第一次寫入新欄位前自動補上標題。
 * 只會填空白的標題格，不會改到已經有的內容。
 */
function ensureQuestionColumns_(sheet) {
  ensureColumns_(sheet, QUESTION_HEADERS);
}


/*
 * 工作表欄數或標題不夠時補上。只會填空白的標題格。
 */
function ensureColumns_(sheet, headers) {

  const width = headers.length;

  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }

  const header = sheet.getRange(1, 1, 1, width);
  const current = header.getDisplayValues()[0];
  let changed = false;

  const fixed = current.map(function(value, index) {

    if (cleanText_(value) === '') {
      changed = true;
      return headers[index];
    }

    return value;
  });

  if (changed) {
    header.setValues(cells_([fixed])).setFontWeight('bold');
  }
}


/*
 * 新增與編輯題目共用的檢查。
 */
function cleanQuestionInput_(data) {

  data = data || {};

  const title = cleanText_(data.title);
  const content = cleanText_(data.content);
  const points = Number(data.points || 0);
  const status = cleanText_(data.status) || '草稿';

  if (!title || !content) {
    throw new Error('請輸入題目名稱與題目內容');
  }

  if (isNaN(points) || points < 0) {
    throw new Error('配分必須是 0 以上的數字');
  }

  if (QUESTION_STATUSES.indexOf(status) === -1) {
    throw new Error('不允許的題目狀態');
  }

  return {
    title: title,
    content: content,
    points: points,
    referenceAnswer: cleanText_(data.referenceAnswer),
    rubric: cleanText_(data.rubric),
    enableAI: data.enableAI === true || data.enableAI === 'true',
    status: status,
    deadline: parseDeadline_(data.deadline),
    latePolicy: data.allowLate === true || data.allowLate === 'true'
      ? LATE_POLICY.ACCEPT
      : LATE_POLICY.CLOSE,
    // 舊版網頁不會送這三項，編輯時就保留原本的設定
    hasAutomation: data.feedbackStyle !== undefined || data.autoClassify !== undefined,
    feedbackStyle: cleanFeedbackStyle_(data.feedbackStyle),
    feedbackNote: cleanText_(data.feedbackNote).substring(0, 500),
    autoClassify: data.autoClassify === true || data.autoClassify === 'true',
    // 舊版網頁不會送學習目標和評量方式，編輯時就保留原本的
    hasObjective: data.objective !== undefined || data.assessment !== undefined,
    objective: cleanText_(data.objective).substring(0, 500),
    assessment: cleanText_(data.assessment) === ASSESSMENT.DESCRIPTIVE
      ? ASSESSMENT.DESCRIPTIVE
      : ASSESSMENT.SCORE
  };
}


/*
 * 回饋風格只接受 ai_instant.gs 裡定義的代號，其他一律當作「不提供」。
 */
function cleanFeedbackStyle_(value) {

  const key = cleanText_(value);

  return key && Object.prototype.hasOwnProperty.call(INSTANT_FEEDBACK_STYLES, key) ? key : '';
}


function findQuestion_(questionId) {

  questionId = cleanText_(questionId);

  if (!questionId) {
    return null;
  }

  const rows = getQuestionSheet_().getDataRange().getValues();
  const index = findRowIndex_(rows, questionId);

  return index < 0
    ? null
    : questionFromRow_(rows[index], index + 1);
}


/* =====================================================
   學生：取得發布中的題目
===================================================== */

/*
 * courseCode：學生輸入的加入代碼。舊版網頁不會送，就用預設課程。
 */
function getPublishedQuestions(courseCode) {

  const course = resolveStudentCourse_(courseCode);

  // 封存的課程不再開放作答，學生仍可以看自己的作答紀錄
  if (course.status === COURSE_STATUS.ARCHIVED) {
    return [];
  }

  const sheet = getQuestionSheet_();

  if (sheet.getLastRow() <= 1) {
    return [];
  }

  const rows = sheet.getDataRange().getValues().slice(1);
  const now = Date.now();

  // 每一題已經有幾個人繳交（只給人數，不給名字）
  const submitted = {};

  getAnswerSheet_().getDataRange().getValues().slice(1).forEach(function(row) {

    const questionId = cleanText_(row[ACOL.QUESTION_ID - 1]);

    if (questionId && cleanText_(row[ACOL.ANSWER - 1])) {
      submitted[questionId] = (submitted[questionId] || 0) + 1;
    }
  });

  return rows
    .filter(function(row) {
      return (
        cleanText_(row[0]) !== '' &&
        cleanText_(row[7]) === '發布' &&
        courseIdOf_(row) === course.id
      );
    })
    .map(function(row) {

      const q = questionFromRow_(row, 0);
      const passed = !!q.deadline && now > q.deadline;

      return {
        id: q.id,
        title: row[1],
        content: row[2],
        points: row[3],
        createdAt: formatDate_(row[8]),
        deadline: q.deadline || '',
        deadlineText: formatDeadline_(q.deadline),
        allowLate: q.allowLate,
        passed: passed,
        closed: passed && !q.allowLate,
        submittedCount: submitted[q.id] || 0,
        instantFeedback: !!q.feedbackStyle,
        descriptive: isDescriptiveQuestion_(q)
      };
    });
}


/* =====================================================
   學生：送出答案
===================================================== */

function submitAnswer(data) {

  data = data || {};

  const studentId = cleanText_(data.studentId);
  const name = cleanText_(data.name);
  const questionId = cleanText_(data.questionId);
  const answer = cleanText_(data.answer);

  if (!studentId || !name || !questionId || !answer) {
    throw new Error('請完整填寫學號、姓名與回答');
  }

  if (studentId.length > 30 || name.length > 40) {
    throw new Error('學號或姓名太長，請確認有沒有打錯');
  }

  if (answer.length > MAX_ANSWER_LENGTH) {
    throw new Error('回答太長，請控制在 ' + MAX_ANSWER_LENGTH + ' 字以內');
  }

  // 重新送出時學生寫的修改說明，和有沒有參考 AI 學習建議（學生自己說的）
  const revisionNote = cleanText_(data.revisionNote);
  const aiAdopted = AI_ADOPTED_OPTIONS.indexOf(cleanText_(data.aiAdopted)) >= 0 ? cleanText_(data.aiAdopted) : '';

  if (revisionNote.length > 300) {
    throw new Error('修改說明請控制在 300 字以內');
  }

  const question = findQuestion_(questionId);

  if (!question) {
    throw new Error('找不到這一題');
  }

  if (question.status !== '發布') {
    throw new Error('這一題目前已停止作答');
  }

  const course = findCourse_(question.courseId);

  if (cleanText_(data.courseCode) && (!course || course.code !== normalizeCode_(data.courseCode))) {
    throw new Error('這一題不屬於目前的課程，請重新整理頁面');
  }

  if (!course || course.status === COURSE_STATUS.ARCHIVED) {
    throw new Error('這門課程已經結束，不能再繳交');
  }

  const late = !!question.deadline && Date.now() > question.deadline;

  if (late && !question.allowLate) {
    throw new Error('這一題已在 ' + formatDeadline_(question.deadline) + ' 截止，無法再繳交');
  }

  const initialStatus = question.enableAI
    ? STATUS.WAIT_AI
    : STATUS.WAIT_TEACHER;

  return withLock_(function() {

    const sheet = getAnswerSheet_();

    ensureColumns_(sheet, ANSWER_HEADERS);

    const rows = sheet.getDataRange().getValues();
    const now = new Date();
    const instantFeedback = !!question.feedbackStyle;

    // 有即時回饋或自動分類的題目，通知背景工作來處理
    if (instantFeedback || question.autoClassify) {
      markAutoWork_();
    }

    /*
     * 同一題＋同一學號：舊的版本先存到「作答歷程」，再更新成新回答。
     */
    for (let i = rows.length - 1; i >= 1; i--) {

      if (
        cleanText_(rows[i][ACOL.QUESTION_ID - 1]) !== questionId ||
        cleanText_(rows[i][ACOL.STUDENT_ID - 1]) !== studentId
      ) {
        continue;
      }

      if (cleanText_(rows[i][ACOL.STATUS - 1]) === STATUS.PASSED) {
        throw new Error('這一題老師已審核通過，無法再修改回答');
      }

      const rowNumber = i + 1;
      const answerId = cleanText_(rows[i][ACOL.ID - 1]);
      const oldVersion = Number(rows[i][ACOL.VERSION - 1]) || 1;

      archiveAnswerVersion_(rows[i], oldVersion, now);

      // D 姓名、E 學生回答、F 送出時間
      sheet
        .getRange(rowNumber, ACOL.NAME, 1, 3)
        .setValues(cells_([[name, answer, now]]));

      // G~K 清除舊的 AI 與教師批改
      sheet
        .getRange(rowNumber, ACOL.AI_SCORE, 1, 5)
        .clearContent();

      // L 狀態、M 最後更新、N AI教師口吻評語、O AI即時回饋、P 繳交次數、
      // Q AI草稿採用、R 修改說明、S AI建議採納
      sheet
        .getRange(rowNumber, ACOL.STATUS, 1, 8)
        .setValues(cells_([[initialStatus, now, '', '', oldVersion + 1, '', revisionNote, aiAdopted]]));

      // 回答內容變了，舊的分類也要清掉
      deleteCodingForAnswers_([answerId]);

      logEvent_({
        courseId: question.courseId,
        questionId: questionId,
        answerId: answerId,
        studentId: studentId,
        module: MODULE.LEARN,
        type: '學生修改作答',
        source: '學生',
        detail: {
          fromVersion: oldVersion,
          toVersion: oldVersion + 1,
          revisionNote: revisionNote,
          aiAdopted: aiAdopted,
          previousFeedback: cleanText_(rows[i][ACOL.INSTANT_FEEDBACK - 1])
        }
      });

      return {
        success: true,
        updated: true,
        answerId: answerId,
        late: late,
        version: oldVersion + 1,
        instantFeedback: instantFeedback
      };
    }

    /*
     * 新回答
     */
    const answerId = generateId_('A');

    const rowNumber = appendRows_(sheet, [[
      answerId, questionId, '', name, answer,
      now, '', '', '', '', '', initialStatus, now, '', '', 1, '', '', ''
    ]], ANSWER_HEADERS.length);

    // 學號設成純文字後再寫入，避免 0123 變成 123
    sheet
      .getRange(rowNumber, ACOL.STUDENT_ID)
      .setNumberFormat('@')
      .setValue(cell_(studentId));

    return {
      success: true,
      updated: false,
      answerId: answerId,
      late: late,
      version: 1,
      instantFeedback: instantFeedback
    };
  });
}


/* =====================================================
   評語口吻：每位老師自己設定
   - 管理員：改的是全站預設（ai.gs 的 saveAISettings，存在指令碼屬性）
   - 其他老師：存在「教師帳號」表自己那一列；沒有設定就用全站預設
   ai.gs 的 gradeAnswerWithAI_ 會讀 getAISettings()，批改時暫時換成這位老師的設定。
===================================================== */

function teacherVoice_() {

  const site = getAISettings();
  let teacher = null;

  try {
    teacher = currentTeacher_();
  } catch (error) {
    teacher = null;
  }

  if (teacher && !isAdmin_(teacher) && (teacher.voiceStyle || teacher.voiceExamples)) {
    return { feedbackStyle: teacher.voiceStyle, feedbackExamples: teacher.voiceExamples, own: true };
  }

  return { feedbackStyle: site.feedbackStyle || '', feedbackExamples: site.feedbackExamples || '', own: false };
}


function withTeacherVoice_(voice, fn) {

  if (!voice || !voice.own) {
    return fn();
  }

  const original = getAISettings;

  getAISettings = function() {
    const settings = original();
    settings.feedbackStyle = voice.feedbackStyle;
    settings.feedbackExamples = voice.feedbackExamples;
    return settings;
  };

  try {
    return fn();
  } finally {
    getAISettings = original;
  }
}


/*
 * 網頁的「AI 評語風格」分頁。
 */
function getMyAISettings() {

  const teacher = currentTeacher_();
  const site = getAISettings();

  if (isAdmin_(teacher)) {
    return Object.assign({}, site, { scope: 'site' });
  }

  return {
    scope: 'personal',
    feedbackStyle: teacher.voiceStyle || '',
    feedbackExamples: teacher.voiceExamples || '',
    siteFeedbackStyle: site.feedbackStyle || '',
    model: site.model,
    hasApiKey: site.hasApiKey
  };
}


function saveMyAISettings(data) {

  data = data || {};

  const teacher = currentTeacher_();

  if (isAdmin_(teacher)) {
    return saveAISettings(data);
  }

  const style = cleanText_(data.feedbackStyle);
  const examples = cleanText_(data.feedbackExamples);

  if (style.length > 1000) {
    throw new Error('評語風格要求請控制在 1000 字以內');
  }

  if (examples.length > 2500) {
    throw new Error('評語範例請控制在 2500 字以內');
  }

  return withLock_(function() {

    const sheet = getTeacherSheet_();
    ensureColumns_(sheet, TEACHER_HEADERS);

    const row = findTeacherRow_(teacher.account);

    if (!row) {
      throw new Error('找不到你的帳號');
    }

    sheet
      .getRange(row.rowNumber, TCOL.VOICE_STYLE, 1, 2)
      .setValues(cells_([[style, examples]]));

    return { success: true, scope: 'personal' };
  });
}


/* =====================================================
   學習歷程紀錄
   四個模組裡「AI 提出了什麼、老師或學生怎麼決定」都記一列，
   不會被之後的操作蓋掉。匯出研究紀錄時會用到。
===================================================== */

const EVENT_SHEET = '學習歷程紀錄';
const EVENT_HEADERS = ['紀錄ID', '時間', '課程ID', '題目ID', '回答ID', '學號', '模組', '類型', '來源', '內容'];

const MODULE = {
  DISCUSS: '一 課堂討論',
  ASSESS: '二 教師評量助手',
  LEARN: '三 學生學習助手',
  DIAGNOSE: '四 教師教學診斷'
};


function getEventSheet_() {

  const ss = getSpreadsheet_();

  return (
    ss.getSheetByName(EVENT_SHEET) ||
    ensureSheet_(ss, EVENT_SHEET, EVENT_HEADERS, '#f3ecdf', false)
  );
}


/*
 * 記一筆。紀錄失敗不影響原本的操作。
 * e：{ courseId, questionId, answerId, studentId, module, type, source, detail }
 */
function logEvent_(e) {

  try {
    withLock_(function() {

      const sheet = getEventSheet_();
      const studentId = cleanText_(e.studentId);

      const rowNumber = appendRows_(sheet, [[
        generateId_('E'),
        new Date(),
        e.courseId || '',
        e.questionId || '',
        e.answerId || '',
        '',
        e.module,
        e.type,
        e.source,
        JSON.stringify(e.detail || {})
      ]], EVENT_HEADERS.length);

      // 學號設成純文字後再寫入，避免 0123 變成 123
      if (studentId) {
        sheet.getRange(rowNumber, 6).setNumberFormat('@').setValue(cell_(studentId));
      }
    });
  } catch (error) {
    Logger.log('學習歷程紀錄寫入失敗：' + error.message);
  }
}


/*
 * 這次操作的人：老師、學生或背景自動處理。
 */
function teacherSource_() {

  if (!REQUEST_) {
    return '系統自動';
  }

  const t = currentTeacher_();

  return '教師：' + (t.name || t.account) + '（' + t.account + '）';
}


/*
 * 讀出紀錄。filter(row) 回傳 true 的才留下。
 */
function readEvents_(filter) {

  const sheet = getSpreadsheet_().getSheetByName(EVENT_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  return sheet.getDataRange().getValues().slice(1)
    .filter(function(row) { return cleanText_(row[0]) && (!filter || filter(row)); })
    .map(function(row) {
      let detail = {};
      try { detail = JSON.parse(row[9] || '{}'); } catch (error) { detail = {}; }
      return {
        id: cleanText_(row[0]),
        time: row[1],
        courseId: cleanText_(row[2]),
        questionId: cleanText_(row[3]),
        answerId: cleanText_(row[4]),
        studentId: cleanText_(row[5]),
        module: cleanText_(row[6]),
        type: cleanText_(row[7]),
        source: cleanText_(row[8]),
        detail: detail
      };
    });
}


/*
 * 老師的評語和 AI 草稿有多像：用兩個字一組的重疊比例（0～1）。
 */
function textSimilarity_(a, b) {

  const norm = function(t) { return cleanText_(t).replace(/[\s，。、！？；：,.!?;:「」『』（）()…\-]/g, ''); };
  const pairs = function(t) {
    const out = {};
    for (let i = 0; i < t.length - 1; i++) {
      const key = t.substr(i, 2);
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  };

  a = norm(a);
  b = norm(b);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const pa = pairs(a);
  const pb = pairs(b);
  let overlap = 0;
  let total = 0;

  Object.keys(pa).forEach(function(k) { total += pa[k]; if (pb[k]) overlap += Math.min(pa[k], pb[k]); });
  Object.keys(pb).forEach(function(k) { total += pb[k]; });

  return total ? (2 * overlap) / total : 0;
}


/*
 * 老師的正式評語是怎麼來的：直接採用 AI 草稿、修改後採用、自行撰寫，或沒有用 AI。
 */
function draftAdoption_(row, teacherScore, teacherFeedback) {

  const aiScore = row[ACOL.AI_SCORE - 1];
  const aiStudent = cleanText_(row[ACOL.AI_STUDENT_FEEDBACK - 1]);
  const aiTeacher = cleanText_(row[ACOL.AI_FEEDBACK - 1]);

  if (aiScore === '' && !aiStudent && !aiTeacher) {
    return '未使用AI';
  }

  if (!cleanText_(teacherFeedback)) {
    return teacherScore !== '' && Number(teacherScore) === Number(aiScore) ? '只採用AI分數' : '自行評分';
  }

  const similarity = Math.max(textSimilarity_(teacherFeedback, aiStudent), textSimilarity_(teacherFeedback, aiTeacher));
  const sameScore = teacherScore === '' || aiScore === '' || Number(teacherScore) === Number(aiScore);

  if (similarity >= 0.999 && sameScore) return '直接採用';
  if (similarity >= 0.45) return '修改後採用';

  return '自行撰寫';
}


/* =====================================================
   作答歷程：學生每次重新送出，舊的版本都留著
===================================================== */

function getHistorySheet_() {

  const ss = getSpreadsheet_();

  return (
    ss.getSheetByName(HISTORY_SHEET) ||
    ensureSheet_(ss, HISTORY_SHEET, HISTORY_HEADERS, '#eef0f3', false)
  );
}


/*
 * 把「學生作答」的一列存成歷程。要在 withLock_ 裡呼叫。
 */
function archiveAnswerVersion_(row, version, replacedAt) {

  const sheet = getHistorySheet_();

  const rowNumber = appendRows_(sheet, [[
    generateId_('H'),
    row[ACOL.ID - 1],
    row[ACOL.QUESTION_ID - 1],
    '',
    row[ACOL.NAME - 1],
    version,
    row[ACOL.ANSWER - 1],
    row[ACOL.SUBMITTED - 1],
    row[ACOL.INSTANT_FEEDBACK - 1] || '',
    row[ACOL.AI_SCORE - 1],
    row[ACOL.AI_FEEDBACK - 1],
    row[ACOL.TEACHER_SCORE - 1],
    row[ACOL.TEACHER_FEEDBACK - 1],
    row[ACOL.STATUS - 1],
    replacedAt,
    row[ACOL.REVISION_NOTE - 1] || '',
    row[ACOL.AI_ADOPTED - 1] || '',
    row[ACOL.DRAFT_ADOPTION - 1] || ''
  ]], HISTORY_HEADERS.length);

  // 學號存成純文字，避免 0123 變成 123
  sheet
    .getRange(rowNumber, HCOL.STUDENT_ID)
    .setNumberFormat('@')
    .setValue(cell_(cleanText_(row[ACOL.STUDENT_ID - 1])));
}


/*
 * 回傳 { 回答ID: [舊版本, …] }，舊的在前。
 */
function getHistoryMap_(answerIds) {

  const wanted = {};
  answerIds.forEach(function(id) { wanted[cleanText_(id)] = true; });

  const sheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET);
  const map = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return map;
  }

  sheet.getDataRange().getValues().slice(1).forEach(function(row) {

    const answerId = cleanText_(row[HCOL.ANSWER_ID - 1]);

    if (!wanted[answerId]) {
      return;
    }

    (map[answerId] = map[answerId] || []).push({
      version: Number(row[HCOL.VERSION - 1]) || 1,
      answer: cleanText_(row[HCOL.ANSWER - 1]),
      submittedAt: formatDate_(row[HCOL.SUBMITTED - 1]),
      instantFeedback: cleanText_(row[HCOL.INSTANT_FEEDBACK - 1]),
      aiScore: row[HCOL.AI_SCORE - 1],
      aiFeedback: cleanText_(row[HCOL.AI_FEEDBACK - 1]),
      teacherScore: row[HCOL.TEACHER_SCORE - 1],
      teacherFeedback: cleanText_(row[HCOL.TEACHER_FEEDBACK - 1]),
      status: cleanText_(row[HCOL.STATUS - 1]),
      revisionNote: cleanText_(row[HCOL.REVISION_NOTE - 1]),
      aiAdopted: cleanText_(row[HCOL.AI_ADOPTED - 1]),
      draftAdoption: cleanText_(row[HCOL.DRAFT_ADOPTION - 1])
    });
  });

  Object.keys(map).forEach(function(id) {
    map[id].sort(function(a, b) { return a.version - b.version; });
  });

  return map;
}


/* =====================================================
   學生：取得自己的作答紀錄
===================================================== */

function getStudentResults(data) {

  data = data || {};

  const studentId = cleanText_(data.studentId);
  const name = cleanText_(data.name);

  if (!studentId || !name) {
    return [];
  }

  // 只回傳這門課的作答；舊版網頁沒送代碼時用預設課程
  const course = resolveStudentCourse_(data.courseCode);

  const answers = getAnswerSheet_().getDataRange().getValues();
  const questions = getQuestionSheet_().getDataRange().getValues();

  const questionMap = {};

  questions.slice(1).forEach(function(row) {

    const id = cleanText_(row[0]);

    if (id) {
      questionMap[id] = {
        title: row[1],
        points: row[3],
        deadline: toTime_(row[QCOL.DEADLINE - 1]),
        courseId: courseIdOf_(row),
        descriptive: cleanText_(row[QCOL.ASSESSMENT - 1]) === ASSESSMENT.DESCRIPTIVE
      };
    }
  });

  const mine = answers
    .slice(1)
    .filter(function(row) {
      const q = questionMap[cleanText_(row[1])];

      return (
        cleanText_(row[2]) === studentId &&
        cleanText_(row[3]) === name &&
        !!q && q.courseId === course.id
      );
    });

  const history = getHistoryMap_(mine.map(function(row) { return row[0]; }));
  const classified = studentClassifications_(mine);

  return mine
    .map(function(row) {

      const questionId = cleanText_(row[1]);
      const q = questionMap[questionId] || {};

      return {
        instantFeedback: cleanText_(row[ACOL.INSTANT_FEEDBACK - 1]),
        version: Number(row[ACOL.VERSION - 1]) || 1,
        // 學生看得到自己之前每一次的回答、AI 回饋與老師評語（不含 AI 給老師的批改說明）
        history: (history[cleanText_(row[0])] || []).map(function(h) {
          return {
            version: h.version,
            answer: h.answer,
            submittedAt: h.submittedAt,
            instantFeedback: h.instantFeedback,
            teacherScore: h.status === STATUS.PASSED || h.status === STATUS.RETURNED ? h.teacherScore : '',
            teacherFeedback: h.status === STATUS.PASSED || h.status === STATUS.RETURNED ? h.teacherFeedback : '',
            status: h.status,
            revisionNote: h.revisionNote,
            aiAdopted: h.aiAdopted
          };
        }),
        revisionNote: cleanText_(row[ACOL.REVISION_NOTE - 1]),
        aiAdopted: cleanText_(row[ACOL.AI_ADOPTED - 1]),
        descriptive: !!q.descriptive,
        // 課堂討論的分類（已確認的才給學生看），學生可以回覆是否符合自己的想法
        classification: classified[cleanText_(row[0])] || null,
        answerId: row[0],
        questionId: questionId,
        title: q.title || '題目',
        points: q.points || 0,
        answer: row[4],
        submittedAt: formatDate_(row[5]),
        teacherScore: row[9],
        teacherFeedback: row[10],
        status: row[11] || STATUS.WAIT_TEACHER,
        deadlineText: formatDeadline_(q.deadline),
        late: isLate_(row[5], q.deadline)
      };
    })
    .reverse();
}


/*
 * 學生自己的回答被分到哪一類（只給已確認的）。
 */
function studentClassifications_(answerRows) {

  const out = {};

  if (!answerRows.length) {
    return out;
  }

  const ids = {};
  answerRows.forEach(function(row) { ids[cleanText_(row[0])] = true; });

  const sheet = getSpreadsheet_().getSheetByName(CODING_SHEET);

  if (!sheet || sheet.getLastRow() < 2) {
    return out;
  }

  const categories = {};

  getCategorySheet_().getDataRange().getValues().slice(1).forEach(function(row) {
    const id = cleanText_(row[0]);
    if (id) categories[id] = { name: cleanText_(row[2]), description: cleanText_(row[3]) };
  });

  sheet.getDataRange().getValues().slice(1).forEach(function(row) {

    const answerId = cleanText_(row[KCOL.ANSWER_ID - 1]);
    const c = categories[cleanText_(row[KCOL.CATEGORY_ID - 1])];

    if (!ids[answerId] || !c || cleanText_(row[KCOL.CONFIRMED - 1]) !== '是') {
      return;
    }

    out[answerId] = {
      categoryName: c.name,
      description: c.description,
      agree: cleanText_(row[KCOL.STUDENT_AGREE - 1]),
      note: cleanText_(row[KCOL.STUDENT_NOTE - 1])
    };
  });

  return out;
}


/*
 * 學生回覆「這個分類符不符合我的想法」。
 * data：{ studentId, name, answerId, agree: '符合'|'不太符合', note, courseCode }
 */
const STUDENT_AGREE_OPTIONS = ['符合', '不太符合'];

function confirmMyClassification(data) {

  data = data || {};

  const studentId = cleanText_(data.studentId);
  const name = cleanText_(data.name);
  const answerId = cleanText_(data.answerId);
  const agree = cleanText_(data.agree);
  const note = cleanText_(data.note);

  if (STUDENT_AGREE_OPTIONS.indexOf(agree) < 0) {
    throw new Error('請選擇「符合」或「不太符合」');
  }

  if (note.length > 300) {
    throw new Error('說明請控制在 300 字以內');
  }

  const answers = getAnswerSheet_().getDataRange().getValues();
  const index = findRowIndex_(answers, answerId);

  if (
    index < 0 ||
    cleanText_(answers[index][ACOL.STUDENT_ID - 1]) !== studentId ||
    cleanText_(answers[index][ACOL.NAME - 1]) !== name
  ) {
    throw new Error('找不到你的這份回答，請重新整理頁面');
  }

  const question = findQuestion_(answers[index][ACOL.QUESTION_ID - 1]);

  return withLock_(function() {

    const sheet = getCodingSheet_();
    ensureColumns_(sheet, CODING_HEADERS);

    const values = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < values.length; i++) {
      if (cleanText_(values[i][KCOL.ANSWER_ID - 1]) === answerId) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex < 0 || cleanText_(values[rowIndex][KCOL.CONFIRMED - 1]) !== '是') {
      throw new Error('這份回答的分類已經更新，請重新整理頁面');
    }

    sheet
      .getRange(rowIndex + 1, KCOL.STUDENT_AGREE, 1, 2)
      .setValues(cells_([[agree, note]]));

    logEvent_({
      courseId: question ? question.courseId : '',
      questionId: question ? question.id : '',
      answerId: answerId,
      studentId: studentId,
      module: MODULE.DISCUSS,
      type: '學生回覆分類',
      source: '學生',
      detail: { categoryId: cleanText_(values[rowIndex][KCOL.CATEGORY_ID - 1]), agree: agree, note: note }
    });

    return { success: true, agree: agree, note: note };
  });
}


/* =====================================================
   教師：新增題目
===================================================== */

function createQuestion(data) {

  const q = cleanQuestionInput_(data);
  const course = resolveTeacherCourse_(data && data.courseId);

  if (!course) {
    throw new Error('請先到「課程管理」建立一門課程，再新增題目');
  }

  if (course.status === COURSE_STATUS.ARCHIVED) {
    throw new Error('這門課程已封存，請先重新開放課程再新增題目');
  }

  const id = generateId_('Q');

  return withLock_(function() {

    const sheet = getQuestionSheet_();

    ensureQuestionColumns_(sheet);

    const rowNumber = appendRows_(sheet, [[
      id,
      q.title,
      q.content,
      q.points,
      q.referenceAnswer,
      q.rubric,
      q.enableAI ? '是' : '否',
      q.status,
      new Date(),
      q.deadline,
      q.latePolicy,
      '',
      course.id,
      q.feedbackStyle,
      q.feedbackNote,
      q.autoClassify ? '是' : '否',
      q.objective,
      q.assessment
    ]], QUESTION_HEADERS.length);

    sheet.getRange(rowNumber, QCOL.DEADLINE).setNumberFormat('yyyy/mm/dd hh:mm');

    return { success: true, id: id, courseId: course.id };
  });
}


/* =====================================================
   教師：編輯題目（發布後也可以改）
   不會動到學生已經送出的回答、AI 批改與教師審核。
===================================================== */

function updateQuestion(data) {

  data = data || {};

  const questionId = cleanText_(data.id);

  if (!questionId) {
    throw new Error('缺少題目ID');
  }

  const q = cleanQuestionInput_(data);

  requireQuestion_(questionId);

  return withLock_(function() {

    const sheet = getQuestionSheet_();
    const rows = sheet.getDataRange().getValues();
    const index = findRowIndex_(rows, questionId);

    if (index < 0) {
      throw new Error('找不到題目，可能已經被刪除');
    }

    ensureQuestionColumns_(sheet);

    const rowNumber = index + 1;

    // B 標題 ~ H 狀態
    sheet
      .getRange(rowNumber, QCOL.TITLE, 1, 7)
      .setValues(cells_([[
        q.title,
        q.content,
        q.points,
        q.referenceAnswer,
        q.rubric,
        q.enableAI ? '是' : '否',
        q.status
      ]]));

    // J 截止時間、K 截止後、L 最後修改
    sheet
      .getRange(rowNumber, QCOL.DEADLINE, 1, 3)
      .setValues(cells_([[q.deadline, q.latePolicy, new Date()]]));

    sheet.getRange(rowNumber, QCOL.DEADLINE).setNumberFormat('yyyy/mm/dd hh:mm');
    sheet.getRange(rowNumber, QCOL.UPDATED).setNumberFormat('yyyy/mm/dd hh:mm');

    // 即時回饋與自動分類（舊版網頁沒送就不動）
    if (q.hasAutomation) {

      sheet
        .getRange(rowNumber, QCOL.FEEDBACK_STYLE, 1, 3)
        .setValues(cells_([[q.feedbackStyle, q.feedbackNote, q.autoClassify ? '是' : '否']]));

      if (q.autoClassify) {
        markAutoWork_();
      }
    }

    if (q.hasObjective) {
      sheet
        .getRange(rowNumber, QCOL.OBJECTIVE, 1, 2)
        .setValues(cells_([[q.objective, q.assessment]]));
    }

    // 配分改小時，找出教師分數超過新配分的回答，提醒老師
    let answerCount = 0;
    let overScoreCount = 0;

    getAnswerSheet_().getDataRange().getValues().slice(1).forEach(function(row) {

      if (cleanText_(row[ACOL.QUESTION_ID - 1]) !== questionId) {
        return;
      }

      answerCount++;

      const score = row[ACOL.TEACHER_SCORE - 1];

      if (q.points > 0 && score !== '' && Number(score) > q.points) {
        overScoreCount++;
      }
    });

    return {
      success: true,
      id: questionId,
      answerCount: answerCount,
      overScoreCount: overScoreCount
    };
  });
}


/* =====================================================
   教師：複製題目到其他課程（也可以複製到同一門課）
   - 只複製題目本身：名稱、內容、配分、參考答案、評分規準、AI 批改設定、截止後的處理方式
   - 一律存成「草稿」、清空截止時間，老師確認後再發布
   - 學生作答、討論類別與分類都不會複製
===================================================== */

const MAX_COPY_QUESTIONS = 100;

function copyQuestions(questionIds, targetCourseId) {

  if (!Array.isArray(questionIds) || !questionIds.length) {
    throw new Error('請至少選一題');
  }

  if (questionIds.length > MAX_COPY_QUESTIONS) {
    throw new Error('一次最多複製 ' + MAX_COPY_QUESTIONS + ' 題');
  }

  const target = requireCourse_(targetCourseId);

  if (target.status === COURSE_STATUS.ARCHIVED) {
    throw new Error('「' + target.name + '」已封存，請先重新開放再複製題目過去');
  }

  // 先全部檢查權限，有一題不行就整批不複製
  const seen = {};
  const sources = questionIds
    .map(cleanText_)
    .filter(function(id) {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    })
    .map(requireQuestion_);

  return withLock_(function() {

    const sheet = getQuestionSheet_();

    ensureQuestionColumns_(sheet);

    const rows = sheet.getDataRange().getValues();
    const now = new Date();
    const newIds = [];

    // 依建立順序複製，題目管理裡的先後順序才會和原本一樣
    const ordered = sources.slice().sort(function(a, b) {
      return a.rowNumber - b.rowNumber;
    });

    const newRows = ordered.map(function(q) {

      const row = rows[q.rowNumber - 1];
      const id = generateId_('Q');
      const sameCourse = q.courseId === target.id;

      newIds.push(id);

      return [
        id,
        sameCourse ? truncate_(q.title + '（副本）', 200) : q.title,
        q.content,
        q.points,
        q.referenceAnswer,
        q.rubric,
        q.enableAI ? '是' : '否',
        '草稿',
        now,
        '',
        cleanText_(row[QCOL.LATE_POLICY - 1]) || LATE_POLICY.CLOSE,
        '',
        target.id,
        q.feedbackStyle,
        q.feedbackNote,
        q.autoClassify ? '是' : '否',
        q.objective,
        q.assessment
      ];
    });

    appendRows_(sheet, newRows, QUESTION_HEADERS.length);

    return {
      success: true,
      count: newIds.length,
      ids: newIds,
      courseId: target.id,
      courseName: target.name
    };
  });
}


/* =====================================================
   教師：取得題目清單
===================================================== */

/*
 * courseId：目前選的課程。舊版網頁不會送，就用預設課程。
 */
function getTeacherQuestions(courseId) {

  const course = resolveTeacherCourse_(courseId);

  if (!course) {
    return [];
  }

  const questions = getQuestionSheet_().getDataRange().getValues()
    .filter(function(row, index) {
      return index === 0 || (cleanText_(row[0]) && courseIdOf_(row) === course.id);
    });
  const answers = getAnswerSheet_().getDataRange().getValues();

  const counts = {};
  const deadlines = {};

  questions.slice(1).forEach(function(row) {
    deadlines[cleanText_(row[0])] = toTime_(row[QCOL.DEADLINE - 1]);
  });

  answers.slice(1).forEach(function(row) {

    const questionId = cleanText_(row[1]);

    if (!questionId) {
      return;
    }

    if (!counts[questionId]) {
      counts[questionId] = { total: 0, pending: 0, late: 0 };
    }

    counts[questionId].total++;

    const status = cleanText_(row[11]);

    if (status !== STATUS.PASSED && status !== STATUS.RETURNED) {
      counts[questionId].pending++;
    }

    if (isLate_(row[ACOL.SUBMITTED - 1], deadlines[questionId])) {
      counts[questionId].late++;
    }
  });

  return questions
    .slice(1)
    .filter(function(row) {
      return cleanText_(row[0]) !== '';
    })
    .map(function(row) {

      const id = cleanText_(row[0]);
      const count = counts[id] || { total: 0, pending: 0, late: 0 };
      const q = questionFromRow_(row, 0);

      return {
        id: id,
        title: row[1],
        content: row[2],
        points: row[3],
        referenceAnswer: row[4],
        rubric: row[5],
        enableAI: cleanText_(row[6]) === '是',
        status: row[7],
        createdAt: formatDate_(row[8]),
        answerCount: count.total,
        pendingCount: count.pending,
        lateCount: count.late,
        deadline: q.deadline || '',
        deadlineText: formatDeadline_(q.deadline),
        allowLate: q.allowLate,
        updatedAt: row[QCOL.UPDATED - 1] ? formatDate_(row[QCOL.UPDATED - 1]) : '',
        courseId: course.id,
        feedbackStyle: q.feedbackStyle,
        feedbackNote: q.feedbackNote,
        autoClassify: q.autoClassify,
        objective: q.objective,
        assessment: q.assessment
      };
    })
    .reverse();
}


/* =====================================================
   教師：更新題目狀態
===================================================== */

function updateQuestionStatus(questionId, newStatus) {

  if (QUESTION_STATUSES.indexOf(newStatus) === -1) {
    throw new Error('不允許的題目狀態');
  }

  questionId = cleanText_(questionId);

  requireQuestion_(questionId);

  return withLock_(function() {

    const sheet = getQuestionSheet_();
    const rows = sheet.getDataRange().getValues();
    const index = findRowIndex_(rows, questionId);

    if (index < 0) {
      throw new Error('找不到題目');
    }

    sheet.getRange(index + 1, 8).setValue(newStatus);

    return { success: true };
  });
}


/* =====================================================
   教師：取得學生回答
===================================================== */

/*
 * questionId 有值：只看這一題。
 * questionId 空白：看 courseId 這門課的全部回答（舊版網頁沒送 courseId 時用預設課程）。
 */
function getTeacherAnswers(questionId, courseId) {

  let course;

  if (cleanText_(questionId)) {
    course = findCourse_(requireQuestion_(questionId).courseId);
  } else {
    course = resolveTeacherCourse_(courseId);
  }

  if (!course) {
    return [];
  }

  const answers = getAnswerSheet_().getDataRange().getValues();
  const questions = getQuestionSheet_().getDataRange().getValues();

  const questionMap = {};

  questions.slice(1).forEach(function(row, index) {

    const q = questionFromRow_(row, index + 2);

    if (q.id) {
      questionMap[q.id] = q;
    }
  });

  const filterId = cleanText_(questionId);

  // 只讀這門課的回答有關的歷程
  const history = getHistoryMap_(answers.slice(1)
    .filter(function(row) {
      const q = questionMap[cleanText_(row[1])];
      return q && q.courseId === course.id;
    })
    .map(function(row) { return row[0]; }));

  // 每一次 AI 批改建議（學習歷程紀錄）
  const suggestions = {};

  readEvents_(function(row) {
    return cleanText_(row[2]) === course.id && cleanText_(row[7]) === 'AI批改建議' &&
      (!cleanText_(questionId) || cleanText_(row[3]) === cleanText_(questionId));
  }).forEach(function(e) {
    (suggestions[e.answerId] = suggestions[e.answerId] || []).push({
      time: formatDate_(e.time),
      version: e.detail.version || 1,
      score: e.detail.score === undefined ? '' : e.detail.score,
      feedback: e.detail.feedback || '',
      studentFeedback: e.detail.studentFeedback || '',
      confidence: e.detail.confidence || '',
      source: e.source
    });
  });

  return answers
    .slice(1)
    .filter(function(row) {

      if (!cleanText_(row[0])) {
        return false;
      }

      const q = questionMap[cleanText_(row[1])];

      if (!q || q.courseId !== course.id) {
        return false;
      }

      return !filterId || cleanText_(row[1]) === filterId;
    })
    .map(function(row) {

      const rowQuestionId = cleanText_(row[1]);
      const q = questionMap[rowQuestionId] || {};

      return {
        answerId: cleanText_(row[ACOL.ID - 1]),
        questionId: rowQuestionId,
        studentId: cleanText_(row[ACOL.STUDENT_ID - 1]),
        name: cleanText_(row[ACOL.NAME - 1]),
        answer: cleanText_(row[ACOL.ANSWER - 1]),
        submittedAt: row[ACOL.SUBMITTED - 1] ? formatDate_(row[ACOL.SUBMITTED - 1]) : '',
        aiScore: row[ACOL.AI_SCORE - 1] === '' ? '' : row[ACOL.AI_SCORE - 1],
        aiFeedback: cleanText_(row[ACOL.AI_FEEDBACK - 1]),
        aiConfidence: cleanText_(row[ACOL.AI_CONFIDENCE - 1]),
        aiStudentFeedback: cleanText_(row[ACOL.AI_STUDENT_FEEDBACK - 1]),
        teacherScore: row[ACOL.TEACHER_SCORE - 1] === '' ? '' : row[ACOL.TEACHER_SCORE - 1],
        teacherFeedback: cleanText_(row[ACOL.TEACHER_FEEDBACK - 1]),
        status: cleanText_(row[ACOL.STATUS - 1]) || STATUS.WAIT_TEACHER,
        questionTitle: q.title || '',
        questionContent: q.content || '',
        points: q.points || 0,
        referenceAnswer: q.referenceAnswer || '',
        rubric: q.rubric || '',
        enableAI: q.enableAI === true,
        deadlineText: formatDeadline_(q.deadline),
        late: isLate_(row[ACOL.SUBMITTED - 1], q.deadline),
        instantFeedback: cleanText_(row[ACOL.INSTANT_FEEDBACK - 1]),
        feedbackStyle: q.feedbackStyle || '',
        version: Number(row[ACOL.VERSION - 1]) || 1,
        history: history[cleanText_(row[ACOL.ID - 1])] || [],
        objective: q.objective || '',
        descriptive: isDescriptiveQuestion_(q),
        draftAdoption: cleanText_(row[ACOL.DRAFT_ADOPTION - 1]),
        revisionNote: cleanText_(row[ACOL.REVISION_NOTE - 1]),
        aiAdopted: cleanText_(row[ACOL.AI_ADOPTED - 1]),
        // 之前每一次按「AI 批改」的建議（最新的一次就是上面的 aiScore、aiFeedback）
        aiSuggestions: suggestions[cleanText_(row[ACOL.ID - 1])] || []
      };
    })
    .reverse();
}


/* =====================================================
   教師：刪除題目（連同作答、類別、分類）
===================================================== */

function deleteQuestion(questionId) {

  questionId = cleanText_(questionId);

  if (!questionId) {
    throw new Error('缺少題目ID');
  }

  requireQuestion_(questionId);

  return withLock_(function() {

    const questionSheet = getQuestionSheet_();
    const rows = questionSheet.getDataRange().getValues();

    // 先確認題目存在，才開始刪東西
    if (findRowIndex_(rows, questionId) < 0) {
      throw new Error('找不到題目');
    }

    const sameQuestion = function(row) {
      return cleanText_(row[1]) === questionId;
    };

    deleteRowsWhere_(getAnswerSheet_(), sameQuestion);
    deleteRowsWhere_(getCodingSheet_(), sameQuestion);
    deleteRowsWhere_(getCategorySheet_(), sameQuestion);

    const historySheet = getSpreadsheet_().getSheetByName(HISTORY_SHEET);

    if (historySheet) {
      deleteRowsWhere_(historySheet, function(row) {
        return cleanText_(row[HCOL.QUESTION_ID - 1]) === questionId;
      });
    }

    const insightSheet = getSpreadsheet_().getSheetByName(INSIGHT_SHEET);

    if (insightSheet) {
      deleteRowsWhere_(insightSheet, function(row) {
        return cleanText_(row[1]) === questionId;
      });
    }

    deleteRowsWhere_(questionSheet, function(row) {
      return cleanText_(row[0]) === questionId;
    });

    return { success: true };
  });
}


/* =====================================================
   教師：正式審核
===================================================== */

function saveTeacherReview(data) {

  data = data || {};

  const answerId = cleanText_(data.answerId);

  if (!answerId) {
    throw new Error('缺少回答ID');
  }

  const status = cleanText_(data.status);

  if (
    [STATUS.WAIT_TEACHER, STATUS.PASSED, STATUS.RETURNED]
      .indexOf(status) === -1
  ) {
    throw new Error('不允許的審核狀態');
  }

  let teacherScore = '';

  if (cleanText_(data.teacherScore) !== '') {

    teacherScore = Number(data.teacherScore);

    if (isNaN(teacherScore)) {
      throw new Error('教師分數必須是數字');
    }

    if (teacherScore < 0) {
      throw new Error('教師分數不能小於 0');
    }
  }

  const feedback = cleanText_(data.teacherFeedback);

  requireAnswer_(answerId);

  return withLock_(function() {

    const sheet = getAnswerSheet_();
    const rows = sheet.getDataRange().getValues();
    const index = findRowIndex_(rows, answerId);

    if (index < 0) {
      throw new Error('找不到學生回答');
    }

    // 描述性回饋（不給分）的題目不存分數
    if (isDescriptiveQuestion_(findQuestion_(rows[index][ACOL.QUESTION_ID - 1]))) {
      teacherScore = '';
    }

    if (teacherScore !== '') {

      const question = findQuestion_(rows[index][ACOL.QUESTION_ID - 1]);
      const maxScore = question ? question.points : 0;

      if (maxScore > 0 && teacherScore > maxScore) {
        throw new Error('教師分數不能超過配分 ' + maxScore + ' 分');
      }
    }

    const adoption = draftAdoption_(rows[index], teacherScore, feedback);

    // J 教師分數、K 教師評語、L 狀態、M 最後更新
    sheet
      .getRange(index + 1, ACOL.TEACHER_SCORE, 1, 4)
      .setValues(cells_([[teacherScore, feedback, status, new Date()]]));

    ensureColumns_(sheet, ANSWER_HEADERS);
    sheet.getRange(index + 1, ACOL.DRAFT_ADOPTION).setValue(adoption);

    const q = findQuestion_(rows[index][ACOL.QUESTION_ID - 1]);

    logEvent_({
      courseId: q ? q.courseId : '',
      questionId: rows[index][ACOL.QUESTION_ID - 1],
      answerId: answerId,
      studentId: rows[index][ACOL.STUDENT_ID - 1],
      module: MODULE.ASSESS,
      type: '教師審核',
      source: teacherSource_(),
      detail: {
        version: Number(rows[index][ACOL.VERSION - 1]) || 1,
        aiScore: rows[index][ACOL.AI_SCORE - 1],
        teacherScore: teacherScore,
        status: status,
        feedback: feedback,
        aiDraft: cleanText_(rows[index][ACOL.AI_STUDENT_FEEDBACK - 1]),
        adoption: adoption
      }
    });

    return { success: true, adoption: adoption };
  });
}


/* =====================================================
   AI：批改單一回答（AI 的部分在 ai.gs 的 gradeAnswerWithAI_）
===================================================== */

function runAIReview(answerId) {

  answerId = cleanText_(answerId);

  const answerSheet = getAnswerSheet_();
  const values = answerSheet.getDataRange().getValues();
  const index = findRowIndex_(values, answerId);

  if (index < 0) {
    throw new Error('找不到這份回答');
  }

  const answerText = cleanText_(values[index][ACOL.ANSWER - 1]);
  const question = findQuestion_(values[index][ACOL.QUESTION_ID - 1]);

  if (!question) {
    throw new Error('找不到原題目');
  }

  requireCourse_(question.courseId);

  if (!question.enableAI) {
    throw new Error('這一題沒有啟用 AI 批改');
  }

  if (!answerText) {
    throw new Error('這份回答是空白的');
  }

  const voice = teacherVoice_();
  let ai;

  if (isDescriptiveQuestion_(question)) {

    // 描述性回饋（不給分）：ai_instant.gs
    const d = describeAnswerWithAI_(question, answerText, voice);
    ai = { score: '', feedback: d.feedback, studentFeedback: d.studentFeedback, confidence: '' };

  } else {

    // 呼叫 ai.gs。學習目標併進評分規準一起給 AI 參考；評語用這位老師自己的口吻
    const forAI = Object.assign({}, question, {
      rubric: question.objective
        ? '學習目標：' + question.objective + '\n\n' + (question.rubric || '教師未提供')
        : question.rubric
    });

    ai = withTeacherVoice_(voice, function() {
      return gradeAnswerWithAI_(forAI, answerText);
    });
  }

  /*
   * 呼叫 AI 期間資料可能變動，寫入前重新找一次列。
   */
  return withLock_(function() {

    const rows = answerSheet.getDataRange().getValues();
    const i = findRowIndex_(rows, answerId);

    if (i < 0) {
      throw new Error('這份回答已經被刪除');
    }

    if (cleanText_(rows[i][ACOL.ANSWER - 1]) !== answerText) {
      throw new Error('學生在 AI 批改期間更新了回答，請重新按一次 AI 批改');
    }

    const rowNumber = i + 1;
    const currentStatus = cleanText_(rows[i][ACOL.STATUS - 1]);

    // 教師已審核完的回答，重跑 AI 不改狀態
    const newStatus =
      currentStatus === STATUS.PASSED || currentStatus === STATUS.RETURNED
        ? currentStatus
        : STATUS.WAIT_TEACHER;

    const headerCell = answerSheet.getRange(1, ACOL.AI_STUDENT_FEEDBACK);

    if (cleanText_(headerCell.getValue()) === '') {
      headerCell.setValue(ANSWER_HEADERS[ACOL.AI_STUDENT_FEEDBACK - 1]);
    }

    // G AI分數、H AI評語、I AI信心
    answerSheet
      .getRange(rowNumber, ACOL.AI_SCORE, 1, 3)
      .setValues(cells_([[ai.score, ai.feedback, ai.confidence]]));

    // L 狀態、M 最後更新、N AI教師口吻評語
    answerSheet
      .getRange(rowNumber, ACOL.STATUS, 1, 3)
      .setValues(cells_([[newStatus, new Date(), ai.studentFeedback]]));

    logEvent_({
      courseId: question.courseId,
      questionId: question.id,
      answerId: answerId,
      studentId: rows[i][ACOL.STUDENT_ID - 1],
      module: MODULE.ASSESS,
      type: 'AI批改建議',
      source: 'AI（' + teacherSource_() + ' 要求）',
      detail: {
        version: Number(rows[i][ACOL.VERSION - 1]) || 1,
        score: ai.score,
        feedback: ai.feedback,
        studentFeedback: ai.studentFeedback,
        confidence: ai.confidence,
        voice: voice.own ? '老師個人口吻' : '全站預設口吻'
      }
    });

    return {
      success: true,
      score: ai.score,
      maxScore: question.points,
      feedback: ai.feedback,
      studentFeedback: ai.studentFeedback,
      confidence: ai.confidence,
      status: newStatus
    };
  });
}


/* =====================================================
   課堂討論：讀取資料
===================================================== */

function getAnswersForQuestion_(questionId) {

  const values = getAnswerSheet_().getDataRange().getValues();
  const list = [];

  for (let i = 1; i < values.length; i++) {

    const row = values[i];
    const answerId = cleanText_(row[ACOL.ID - 1]);
    const answer = cleanText_(row[ACOL.ANSWER - 1]);

    if (
      !answerId ||
      !answer ||
      cleanText_(row[ACOL.QUESTION_ID - 1]) !== questionId
    ) {
      continue;
    }

    list.push({
      answerId: answerId,
      studentId: cleanText_(row[ACOL.STUDENT_ID - 1]),
      name: cleanText_(row[ACOL.NAME - 1]),
      answer: answer,
      submittedTime: toTime_(row[ACOL.SUBMITTED - 1]),
      submittedAt: formatDate_(row[ACOL.SUBMITTED - 1])
    });
  }

  list.sort(function(a, b) {
    return a.submittedTime - b.submittedTime;
  });

  return list;
}


function getCategoriesForQuestion_(questionId) {

  const values = getCategorySheet_().getDataRange().getValues();
  const list = [];

  for (let i = 1; i < values.length; i++) {

    const row = values[i];

    if (
      !cleanText_(row[CCOL.ID - 1]) ||
      cleanText_(row[CCOL.QUESTION_ID - 1]) !== questionId
    ) {
      continue;
    }

    list.push({
      rowNumber: i + 1,
      id: cleanText_(row[CCOL.ID - 1]),
      name: cleanText_(row[CCOL.NAME - 1]),
      description: cleanText_(row[CCOL.DESCRIPTION - 1]),
      summary: cleanText_(row[CCOL.SUMMARY - 1]),
      discussionQuestion: cleanText_(row[CCOL.DISCUSSION - 1]),
      representativeAnswerId: cleanText_(row[CCOL.REPRESENTATIVE - 1]),
      order: Number(row[CCOL.ORDER - 1]) || 0
    });
  }

  list.sort(function(a, b) {
    return a.order - b.order;
  });

  return list;
}


function publicCategory_(category) {

  return {
    id: category.id,
    name: category.name,
    description: category.description,
    summary: category.summary,
    discussionQuestion: category.discussionQuestion,
    representativeAnswerId: category.representativeAnswerId
  };
}


function getCodingMap_(questionId) {

  const values = getCodingSheet_().getDataRange().getValues();
  const map = {};

  for (let i = 1; i < values.length; i++) {

    const row = values[i];
    const answerId = cleanText_(row[KCOL.ANSWER_ID - 1]);

    if (
      !answerId ||
      cleanText_(row[KCOL.QUESTION_ID - 1]) !== questionId
    ) {
      continue;
    }

    const confirmed = cleanText_(row[KCOL.CONFIRMED - 1]) === '是';
    const reason = cleanText_(row[KCOL.REASON - 1]);

    map[answerId] = {
      rowNumber: i + 1,
      categoryId: cleanText_(row[KCOL.CATEGORY_ID - 1]),
      reason: reason,
      confidence: cleanText_(row[KCOL.CONFIDENCE - 1]),
      confirmed: confirmed,
      aiCategoryId: cleanText_(row[KCOL.AI_CATEGORY - 1]),
      aiReason: cleanText_(row[KCOL.AI_REASON - 1]),
      // 改版前的資料沒有這一欄，從理由判斷
      confirmedBy: cleanText_(row[KCOL.CONFIRMED_BY - 1]) ||
        (confirmed ? (/^AI 自動分類/.test(reason) ? CONFIRMED_BY.AI : CONFIRMED_BY.TEACHER) : ''),
      studentAgree: cleanText_(row[KCOL.STUDENT_AGREE - 1]),
      studentNote: cleanText_(row[KCOL.STUDENT_NOTE - 1])
    };
  }

  return map;
}


function deleteCodingForAnswers_(answerIds) {

  const set = {};

  answerIds.forEach(function(id) {
    set[cleanText_(id)] = true;
  });

  deleteRowsWhere_(getCodingSheet_(), function(row) {
    return set[cleanText_(row[KCOL.ANSWER_ID - 1])] === true;
  });
}


function getDiscussionBoard(questionId) {

  questionId = cleanText_(questionId);

  const question = findQuestion_(questionId);

  if (!question) {
    return { question: null, categories: [], answers: [] };
  }

  requireCourse_(question.courseId);

  const categories = getCategoriesForQuestion_(questionId);
  const coding = getCodingMap_(questionId);

  const validIds = {};

  categories.forEach(function(category) {
    validIds[category.id] = true;
  });

  const answers = getAnswersForQuestion_(questionId).map(function(a) {

    const k = coding[a.answerId];

    return {
      answerId: a.answerId,
      studentId: a.studentId,
      name: a.name,
      answer: a.answer,
      submittedAt: a.submittedAt,
      classified: !!k,
      categoryId: k && validIds[k.categoryId] ? k.categoryId : '',
      reason: k ? k.reason : '',
      confidence: k ? k.confidence : '',
      confirmed: k ? k.confirmed : false,
      confirmedBy: k ? k.confirmedBy : '',
      aiCategoryId: k && validIds[k.aiCategoryId] ? k.aiCategoryId : '',
      aiReason: k ? k.aiReason : '',
      studentAgree: k ? k.studentAgree : '',
      studentNote: k ? k.studentNote : ''
    };
  });

  return {
    question: {
      id: question.id,
      title: question.title,
      content: question.content,
      points: question.points,
      status: question.status,
      autoClassify: question.autoClassify,
      // 還沒有類別時，還差幾份回答才會自動建立
      autoWaiting: question.autoClassify && !categories.length
        ? Math.max(0, AUTO_CATEGORY_MIN - getAnswersForQuestion_(questionId).length)
        : 0
    },
    categories: categories.map(publicCategory_),
    answers: answers
  };
}


/* =====================================================
   課堂討論：類別管理
===================================================== */

function saveCategories(questionId, list) {

  questionId = cleanText_(questionId);

  requireQuestion_(questionId);

  if (!Array.isArray(list)) {
    throw new Error('類別資料格式錯誤');
  }

  if (list.length > MAX_CATEGORIES) {
    throw new Error('類別最多 ' + MAX_CATEGORIES + ' 個');
  }

  const cleaned = list.map(function(item) {
    item = item || {};
    return {
      id: cleanText_(item.id),
      name: cleanText_(item.name).substring(0, 20),
      description: cleanText_(item.description).substring(0, 300)
    };
  });

  const seen = {};

  cleaned.forEach(function(category) {

    if (!category.name) {
      throw new Error('每個類別都需要名稱');
    }

    if (seen[category.name]) {
      throw new Error('類別名稱重複：' + category.name);
    }

    seen[category.name] = true;
  });

  return withLock_(function() {

    const sheet = getCategorySheet_();
    const existing = getCategoriesForQuestion_(questionId);
    const existingById = {};

    existing.forEach(function(category) {
      existingById[category.id] = category;
    });

    const now = new Date();
    const keep = {};
    const newRows = [];

    cleaned.forEach(function(category, index) {

      const old = category.id ? existingById[category.id] : null;

      if (old) {

        keep[old.id] = true;

        sheet
          .getRange(old.rowNumber, CCOL.NAME, 1, 2)
          .setValues(cells_([[category.name, category.description]]));

        sheet
          .getRange(old.rowNumber, CCOL.ORDER, 1, 2)
          .setValues(cells_([[index + 1, now]]));

      } else {

        newRows.push([
          generateId_('C' + (index + 1)),
          questionId,
          category.name,
          category.description,
          '', '', '',
          index + 1,
          now
        ]);
      }
    });

    const removed = {};
    let hasRemoved = false;

    existing.forEach(function(category) {
      if (!keep[category.id]) {
        removed[category.id] = true;
        hasRemoved = true;
      }
    });

    if (hasRemoved) {

      deleteRowsWhere_(sheet, function(row) {
        return (
          cleanText_(row[CCOL.QUESTION_ID - 1]) === questionId &&
          removed[cleanText_(row[CCOL.ID - 1])] === true
        );
      });

      // 被刪除類別裡的回答變回「未分類」
      deleteRowsWhere_(getCodingSheet_(), function(row) {
        return (
          cleanText_(row[KCOL.QUESTION_ID - 1]) === questionId &&
          removed[cleanText_(row[KCOL.CATEGORY_ID - 1])] === true
        );
      });
    }

    appendRows_(sheet, newRows, CATEGORY_HEADERS.length);

    return getCategoriesForQuestion_(questionId).map(publicCategory_);
  });
}


function suggestCategories(questionId) {

  questionId = cleanText_(questionId);

  const question = requireQuestion_(questionId);

  const answers = getAnswersForQuestion_(questionId);

  if (!answers.length) {
    throw new Error('這一題還沒有學生回答，無法建議類別');
  }

  // 呼叫 ai.gs
  const result = suggestCategoriesWithAI_(
    question,
    answers,
    getCategoriesForQuestion_(questionId)
  );

  const categories = (result && Array.isArray(result.categories) ? result.categories : [])
    .map(function(item) {
      item = item || {};
      return {
        name: cleanText_(item.name).substring(0, 20),
        description: cleanText_(item.description).substring(0, 300)
      };
    })
    .filter(function(item) {
      return item.name;
    })
    .slice(0, MAX_CATEGORIES);

  if (!categories.length) {
    throw new Error('AI 沒有提出類別，請再試一次');
  }

  return {
    categories: categories,
    answerCount: answers.length,
    analyzedCount: result.analyzedCount || answers.length
  };
}


/* =====================================================
   課堂討論：AI 分類
===================================================== */

/*
 * 分批分類「尚未分類」的回答。
 * 為了避開 Apps Script 6 分鐘上限，約 4.5 分鐘後會先停下，
 * 回傳 remaining，前端會自動再呼叫一次。
 */
function classifyAnswers(questionId) {

  questionId = cleanText_(questionId);

  const startedAt = Date.now();
  const question = requireQuestion_(questionId);

  const categories = getCategoriesForQuestion_(questionId);

  if (!categories.length) {
    throw new Error('請先建立並儲存類別');
  }

  let processed = 0;

  while (Date.now() - startedAt < CLASSIFY_TIME_LIMIT_MS) {

    const pending = getUnclassifiedAnswers_(questionId);

    if (!pending.length) {
      break;
    }

    const batch = pending.slice(0, AI_CONFIG.CLASSIFY_BATCH_SIZE);

    // 呼叫 ai.gs
    const results = classifyAnswersWithAI_(question, categories, batch) || {};

    const written = withLock_(function() {
      return writeClassifications_(questionId, categories, batch, results);
    });

    processed += written;

    if (written === 0) {
      break;
    }
  }

  const remaining = getUnclassifiedAnswers_(questionId).length;

  return {
    processed: processed,
    remaining: remaining,
    done: remaining === 0
  };
}


function getUnclassifiedAnswers_(questionId) {

  const coding = getCodingMap_(questionId);

  return getAnswersForQuestion_(questionId).filter(function(a) {
    return !coding[a.answerId];
  });
}


/*
 * confirmed 為 true：自動分類，直接標成「已確認」。
 */
function writeClassifications_(questionId, categories, batch, results, confirmed) {

  const answerValues = getAnswerSheet_().getDataRange().getValues();
  const currentText = {};

  answerValues.slice(1).forEach(function(row) {
    currentText[cleanText_(row[ACOL.ID - 1])] = cleanText_(row[ACOL.ANSWER - 1]);
  });

  const coding = getCodingMap_(questionId);
  const now = new Date();
  const rows = [];
  const validIds = {};

  categories.forEach(function(category) {
    validIds[category.id] = true;
  });

  batch.forEach(function(answer) {

    // 教師在 AI 分類期間已經手動分類，保留教師的決定
    if (coding[answer.answerId]) {
      return;
    }

    // 學生在分類期間改了回答，這次結果作廢
    if (currentText[answer.answerId] !== answer.answer) {
      return;
    }

    const result = results[answer.answerId] || {
      categoryId: '',
      reason: 'AI 沒有回傳這份回答的分類',
      confidence: '低'
    };

    // 只接受這一題真的存在的類別
    if (!validIds[result.categoryId]) {
      result.categoryId = '';
    }

    const reason = result.reason || (result.categoryId ? '' : '沒有符合的類別');

    rows.push([
      answer.answerId,
      questionId,
      result.categoryId,
      confirmed ? 'AI 自動分類' + (reason ? '：' + reason : '') : reason,
      result.confidence,
      confirmed ? '是' : '否',
      now,
      // AI 原本的判斷另外存一份，老師之後調整也不會蓋掉
      result.categoryId,
      reason,
      confirmed ? CONFIRMED_BY.AI : '',
      '',
      ''
    ]);
  });

  appendRows_(getCodingSheet_(), rows, CODING_HEADERS.length);

  return rows.length;
}


function clearUnconfirmedClassifications(questionId) {

  questionId = cleanText_(questionId);

  requireQuestion_(questionId);

  return withLock_(function() {

    const deleted = deleteRowsWhere_(getCodingSheet_(), function(row) {
      return (
        cleanText_(row[KCOL.QUESTION_ID - 1]) === questionId &&
        cleanText_(row[KCOL.CONFIRMED - 1]) !== '是'
      );
    });

    return { deleted: deleted };
  });
}


/*
 * 教師移動或確認一份回答的類別。categoryId 空白代表「未分類」。
 */
function setAnswerCategory(answerId, categoryId) {

  answerId = cleanText_(answerId);
  categoryId = cleanText_(categoryId);

  return withLock_(function() {

    const answerValues = getAnswerSheet_().getDataRange().getValues();
    const index = findRowIndex_(answerValues, answerId);

    if (index < 0) {
      throw new Error('找不到這份回答');
    }

    const questionId = cleanText_(answerValues[index][ACOL.QUESTION_ID - 1]);

    requireQuestion_(questionId);

    if (categoryId) {

      const valid = getCategoriesForQuestion_(questionId).some(function(c) {
        return c.id === categoryId;
      });

      if (!valid) {
        throw new Error('找不到這個類別，請重新整理頁面');
      }
    }

    const sheet = getCodingSheet_();
    const values = sheet.getDataRange().getValues();
    const now = new Date();
    const codingIndex = findRowIndex_(values, answerId);

    let fromCategory = '';
    let aiCategory = '';

    if (codingIndex >= 0) {

      const row = values[codingIndex];
      const same = cleanText_(row[KCOL.CATEGORY_ID - 1]) === categoryId;

      fromCategory = cleanText_(row[KCOL.CATEGORY_ID - 1]);
      aiCategory = cleanText_(row[KCOL.AI_CATEGORY - 1]);

      // 改版前的 AI 分類沒有另外存 AI 原判，第一次調整前先補上
      if (!aiCategory && cleanText_(row[KCOL.REASON - 1]) !== '教師手動分類') {
        aiCategory = fromCategory;
        sheet
          .getRange(codingIndex + 1, KCOL.AI_CATEGORY, 1, 2)
          .setValues(cells_([[fromCategory, cleanText_(row[KCOL.REASON - 1])]]));
      }

      sheet
        .getRange(codingIndex + 1, KCOL.CATEGORY_ID, 1, 5)
        .setValues(cells_([[
          categoryId,
          same ? row[KCOL.REASON - 1] : '教師手動分類',
          same ? row[KCOL.CONFIDENCE - 1] : '',
          '是',
          now
        ]]));

      sheet.getRange(codingIndex + 1, KCOL.CONFIRMED_BY).setValue(CONFIRMED_BY.TEACHER);

    } else {

      appendRows_(
        sheet,
        [[answerId, questionId, categoryId, '教師手動分類', '', '是', now, '', '', CONFIRMED_BY.TEACHER, '', '']],
        CODING_HEADERS.length
      );
    }

    const question = findQuestion_(questionId);

    logEvent_({
      courseId: question ? question.courseId : '',
      questionId: questionId,
      answerId: answerId,
      studentId: answerValues[index][ACOL.STUDENT_ID - 1],
      module: MODULE.DISCUSS,
      type: fromCategory === categoryId ? '教師確認分類' : '教師調整分類',
      source: teacherSource_(),
      detail: { from: fromCategory, to: categoryId, aiCategory: aiCategory }
    });

    return { success: true };
  });
}


/*
 * 把 AI 分類標為已確認。categoryId 空白代表整題全部確認。
 */
function confirmClassifications(questionId, categoryId) {

  questionId = cleanText_(questionId);
  categoryId = cleanText_(categoryId);

  requireQuestion_(questionId);

  return withLock_(function() {

    const sheet = getCodingSheet_();
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return { count: 0 };
    }

    const values = sheet
      .getRange(2, 1, lastRow - 1, CODING_HEADERS.length)
      .getValues();

    const now = new Date();
    let count = 0;

    values.forEach(function(row, index) {

      if (cleanText_(row[KCOL.QUESTION_ID - 1]) !== questionId) return;
      if (categoryId && cleanText_(row[KCOL.CATEGORY_ID - 1]) !== categoryId) return;
      if (cleanText_(row[KCOL.CONFIRMED - 1]) === '是') return;

      sheet
        .getRange(index + 2, KCOL.CONFIRMED, 1, 2)
        .setValues(cells_([['是', now]]));

      sheet.getRange(index + 2, KCOL.CONFIRMED_BY).setValue(CONFIRMED_BY.TEACHER);

      count++;
    });

    if (count) {
      const question = findQuestion_(questionId);
      logEvent_({
        courseId: question ? question.courseId : '',
        questionId: questionId,
        module: MODULE.DISCUSS,
        type: '教師確認分類',
        source: teacherSource_(),
        detail: { count: count, categoryId: categoryId || '全部' }
      });
    }

    return { count: count };
  });
}


/* =====================================================
   課堂討論：類別摘要與討論提問
===================================================== */

function summarizeCategories(questionId) {

  questionId = cleanText_(questionId);

  const question = requireQuestion_(questionId);

  const categories = getCategoriesForQuestion_(questionId);

  if (!categories.length) {
    throw new Error('請先建立並儲存類別');
  }

  const coding = getCodingMap_(questionId);
  const answers = getAnswersForQuestion_(questionId);

  const groups = categories
    .map(function(category) {
      return {
        category: category,
        answers: answers.filter(function(a) {
          return coding[a.answerId] && coding[a.answerId].categoryId === category.id;
        })
      };
    })
    .filter(function(group) {
      return group.answers.length > 0;
    });

  if (!groups.length) {
    throw new Error('目前還沒有已分類的回答，請先進行分類');
  }

  // 呼叫 ai.gs
  const results = summarizeCategoriesWithAI_(question, groups) || {};

  return withLock_(function() {

    const sheet = getCategorySheet_();
    const now = new Date();
    let count = 0;

    groups.forEach(function(group) {

      const result = results[group.category.id];

      if (!result) {
        return;
      }

      // 代表回答必須真的屬於這一類
      const representativeOk = group.answers.some(function(a) {
        return a.answerId === result.representativeAnswerId;
      });

      const current = getCategoriesForQuestion_(questionId).find(function(c) {
        return c.id === group.category.id;
      });

      if (!current) {
        return;
      }

      sheet
        .getRange(current.rowNumber, CCOL.SUMMARY, 1, 3)
        .setValues(cells_([[
          truncate_(result.summary, 200),
          truncate_(result.discussionQuestion, 150),
          representativeOk ? result.representativeAnswerId : ''
        ]]));

      sheet.getRange(current.rowNumber, CCOL.UPDATED).setValue(now);
      count++;
    });

    return { updated: count };
  });
}


/* =====================================================
   即時 AI 回饋
   學生送出後，網頁接著呼叫 requestInstantFeedback 取得回饋。
   AI 一時忙碌或失敗時，背景工作（autoProcessTick）會稍後補上，
   學生之後在「我的作答紀錄」就看得到。
===================================================== */

const INSTANT_RATE_LIMIT = 8;              // 同一位學生同一題，每小時最多要幾次
const INSTANT_MAX_ATTEMPTS = 3;            // 同一份回答 AI 失敗幾次後就不再自動重試
const INSTANT_BACKFILL_DELAY_MS = 90 * 1000;  // 學生頁面可能還在等，背景工作先不要搶著做


/*
 * 學生用。data：{ answerId, studentId, name }
 * 回傳 { feedback } 或 { pending: true, message }
 */
function requestInstantFeedback(data) {

  data = data || {};

  const answerId = cleanText_(data.answerId);
  const studentId = cleanText_(data.studentId);
  const name = cleanText_(data.name);

  const values = getAnswerSheet_().getDataRange().getValues();
  const index = findRowIndex_(values, answerId);

  // 只有作答的本人（學號＋姓名相同）可以要回饋
  if (
    index < 0 ||
    cleanText_(values[index][ACOL.STUDENT_ID - 1]) !== studentId ||
    cleanText_(values[index][ACOL.NAME - 1]) !== name
  ) {
    throw new Error('找不到你的這份回答，請重新整理頁面');
  }

  const row = values[index];
  const existing = cleanText_(row[ACOL.INSTANT_FEEDBACK - 1]);

  if (existing) {
    return { feedback: existing };
  }

  const question = findQuestion_(row[ACOL.QUESTION_ID - 1]);

  if (!question || !question.feedbackStyle) {
    return { feedback: '', disabled: true };
  }

  // 避免同一位學生一直重送、一直叫 AI
  const cache = CacheService.getScriptCache();
  const rateKey = 'instant_rate_' + question.id + '_' + studentId;
  const used = Number(cache.get(rateKey)) || 0;

  if (used >= INSTANT_RATE_LIMIT) {
    markAutoWork_();
    return {
      pending: true,
      message: '這一題的 AI 回饋次數暫時用完了，回饋稍後會出現在「我的作答紀錄」。'
    };
  }

  cache.put(rateKey, String(used + 1), 3600);

  const result = generateInstantFeedback_(question, row);

  if (result.feedback) {
    return { feedback: result.feedback };
  }

  markAutoWork_();

  return {
    pending: true,
    message: 'AI 現在比較忙，回饋大約一兩分鐘後會出現在「我的作答紀錄」。'
  };
}


/*
 * 呼叫 AI 並存起來。成功回傳 { feedback }，失敗回傳 { error }。
 */
function generateInstantFeedback_(question, row) {

  const answerId = cleanText_(row[ACOL.ID - 1]);
  const answerText = cleanText_(row[ACOL.ANSWER - 1]);
  const cache = CacheService.getScriptCache();
  const attemptKey = 'instant_attempt_' + answerId + '_' + (Number(row[ACOL.VERSION - 1]) || 1);

  let feedback;

  try {

    feedback = instantFeedbackWithAI_(question, answerText, question.feedbackStyle, question.feedbackNote).feedback;

  } catch (error) {

    cache.put(attemptKey, String((Number(cache.get(attemptKey)) || 0) + 1), 6 * 3600);
    return { error: error.message };
  }

  // 等 AI 的時候學生可能又改了回答，那這份回饋就不用了
  const saved = withLock_(function() {

    const sheet = getAnswerSheet_();
    const values = sheet.getDataRange().getValues();
    const i = findRowIndex_(values, answerId);

    if (i < 0 || cleanText_(values[i][ACOL.ANSWER - 1]) !== answerText) {
      return false;
    }

    if (cleanText_(values[i][ACOL.INSTANT_FEEDBACK - 1])) {
      feedback = cleanText_(values[i][ACOL.INSTANT_FEEDBACK - 1]);
      return true;
    }

    ensureColumns_(sheet, ANSWER_HEADERS);
    sheet.getRange(i + 1, ACOL.INSTANT_FEEDBACK).setValue(cell_(feedback));

    return true;
  });

  if (saved) {
    logEvent_({
      courseId: question.courseId,
      questionId: question.id,
      answerId: answerId,
      studentId: row[ACOL.STUDENT_ID - 1],
      module: MODULE.LEARN,
      type: 'AI學習建議',
      source: 'AI',
      detail: {
        version: Number(row[ACOL.VERSION - 1]) || 1,
        style: question.feedbackStyle,
        feedback: feedback
      }
    });
  }

  return saved ? { feedback: feedback } : { error: '回答已經更新' };
}


/*
 * 老師出題時試試看：用老師輸入的範例回答，看看這種風格的回饋長什麼樣子。不會存起來。
 * data：{ content, referenceAnswer, rubric, feedbackStyle, feedbackNote, sampleAnswer }
 */
function previewInstantFeedback(data) {

  data = data || {};

  currentTeacher_();

  const style = cleanFeedbackStyle_(data.feedbackStyle);
  const sample = cleanText_(data.sampleAnswer);

  if (!style) {
    throw new Error('請先選一種回饋風格');
  }

  if (!cleanText_(data.content)) {
    throw new Error('請先填寫題目內容');
  }

  if (!sample) {
    throw new Error('請輸入一段範例回答');
  }

  return instantFeedbackWithAI_(
    {
      content: cleanText_(data.content),
      referenceAnswer: cleanText_(data.referenceAnswer),
      rubric: cleanText_(data.rubric),
      objective: cleanText_(data.objective).substring(0, 500),
      assessment: cleanText_(data.assessment)
    },
    truncate_(sample, MAX_ANSWER_LENGTH),
    style,
    cleanText_(data.feedbackNote).substring(0, 500)
  );
}


/* =====================================================
   自動處理（背景工作）
   setupSystem 會建立一個每分鐘執行的觸發條件，執行 autoProcessTick：
   1. 補上還沒產生的即時 AI 回饋
   2. 開啟「自動分類」的題目：滿 AUTO_CATEGORY_MIN 份回答就自動建立類別，
      把新回答分類並標成「已確認」
   沒有新回答時只讀一下快取就結束，幾乎不花 Apps Script 的執行時間。
===================================================== */

const AUTO_FLAG_KEY = 'auto_work_pending';
const AUTO_RUNNING_KEY = 'auto_work_running';
const AUTO_CATEGORY_MIN = 5;                 // 還沒有類別時，滿幾份回答才自動建立
const AUTO_TIME_LIMIT_MS = 240 * 1000;       // 每次最多處理 4 分鐘，避開 6 分鐘上限


/*
 * 有新的工作要做（學生送出、老師開啟自動分類…）。
 */
function markAutoWork_() {
  CacheService.getScriptCache().put(AUTO_FLAG_KEY, String(Date.now()), 6 * 3600);
}


function autoProcessTick() {

  const cache = CacheService.getScriptCache();

  if (!cache.get(AUTO_FLAG_KEY)) {
    return '沒有新的工作';
  }

  if (cache.get(AUTO_RUNNING_KEY)) {
    return '上一次的處理還沒結束';
  }

  cache.put(AUTO_RUNNING_KEY, '1', 300);

  // 先清掉旗標；處理期間有新回答，submitAnswer 會再設一次
  cache.remove(AUTO_FLAG_KEY);

  const startedAt = Date.now();
  const report = { feedback: 0, created: 0, classified: 0 };
  let remaining = false;

  try {

    const backfill = backfillInstantFeedback_(startedAt);
    report.feedback = backfill.done;
    remaining = remaining || backfill.remaining;

    const questions = getQuestionSheet_().getDataRange().getValues().slice(1)
      .map(function(row, i) { return questionFromRow_(row, i + 2); })
      .filter(function(q) { return q.id && q.autoClassify; });

    for (let i = 0; i < questions.length; i++) {

      if (Date.now() - startedAt > AUTO_TIME_LIMIT_MS) {
        remaining = true;
        break;
      }

      try {
        const result = processQuestionAuto_(questions[i], startedAt);
        report.created += result.created || 0;
        report.classified += result.processed || 0;
        remaining = remaining || !!result.remaining;
      } catch (error) {
        Logger.log('自動分類失敗（' + questions[i].title + '）：' + error.message);
        remaining = true;
      }
    }

  } finally {

    cache.remove(AUTO_RUNNING_KEY);

    if (remaining) {
      markAutoWork_();
    }
  }

  const message =
    '即時回饋 ' + report.feedback + ' 份，建立類別 ' + report.created + ' 個，分類 ' + report.classified + ' 份' +
    (remaining ? '，還有沒做完的，下一分鐘繼續' : '');

  Logger.log(message);

  return message;
}


/*
 * 補上還沒產生的即時回饋。
 */
function backfillInstantFeedback_(startedAt) {

  const cache = CacheService.getScriptCache();
  const values = getAnswerSheet_().getDataRange().getValues();
  const questionCache = {};
  let done = 0;
  let remaining = false;

  for (let i = 1; i < values.length; i++) {

    const row = values[i];

    if (!cleanText_(row[ACOL.ID - 1]) || !cleanText_(row[ACOL.ANSWER - 1]) || cleanText_(row[ACOL.INSTANT_FEEDBACK - 1])) {
      continue;
    }

    const questionId = cleanText_(row[ACOL.QUESTION_ID - 1]);

    if (!(questionId in questionCache)) {
      questionCache[questionId] = findQuestion_(questionId);
    }

    const question = questionCache[questionId];

    if (!question || !question.feedbackStyle) {
      continue;
    }

    // 剛送出的回答，學生頁面可能正在等回饋，先讓給它
    if (Date.now() - toTime_(row[ACOL.SUBMITTED - 1]) < INSTANT_BACKFILL_DELAY_MS) {
      remaining = true;
      continue;
    }

    const attemptKey = 'instant_attempt_' + cleanText_(row[ACOL.ID - 1]) + '_' + (Number(row[ACOL.VERSION - 1]) || 1);

    if ((Number(cache.get(attemptKey)) || 0) >= INSTANT_MAX_ATTEMPTS) {
      continue;
    }

    if (Date.now() - startedAt > AUTO_TIME_LIMIT_MS / 2) {
      remaining = true;
      break;
    }

    const result = generateInstantFeedback_(question, row);

    if (result.feedback) {
      done++;
    } else {
      remaining = true;
    }
  }

  return { done: done, remaining: remaining };
}


/*
 * 一題的自動分類：需要時先建立類別，再把未分類的回答分類並標成已確認。
 * 回傳 { created, processed, remaining, waiting }
 *   waiting：還差幾份回答才會自動建立類別
 */
function processQuestionAuto_(question, startedAt) {

  const cache = CacheService.getScriptCache();
  const busyKey = 'auto_question_' + question.id;

  // 同一題不要同時被兩個地方處理（背景工作和老師按的「立即處理」）
  if (cache.get(busyKey)) {
    return { busy: true, remaining: true };
  }

  cache.put(busyKey, '1', 300);

  try {

    const answers = getAnswersForQuestion_(question.id);
    let categories = getCategoriesForQuestion_(question.id);
    let created = 0;

    if (!categories.length) {

      if (answers.length < AUTO_CATEGORY_MIN) {
        return { created: 0, processed: 0, remaining: false, waiting: AUTO_CATEGORY_MIN - answers.length };
      }

      const suggestion = suggestCategoriesWithAI_(question, answers, []);

      const list = (suggestion && Array.isArray(suggestion.categories) ? suggestion.categories : [])
        .map(function(item) {
          item = item || {};
          return {
            name: cleanText_(item.name).substring(0, 20),
            description: cleanText_(item.description).substring(0, 300)
          };
        })
        .filter(function(item) { return item.name; })
        .slice(0, MAX_CATEGORIES);

      if (!list.length) {
        throw new Error('AI 沒有提出類別');
      }

      created = withLock_(function() {

        // 等 AI 的時候老師可能已經自己設好類別了，那就用老師的
        if (getCategoriesForQuestion_(question.id).length) {
          return 0;
        }

        const now = new Date();

        appendRows_(getCategorySheet_(), list.map(function(item, index) {
          return [
            generateId_('C' + (index + 1)), question.id, item.name, item.description,
            '', '', '', index + 1, now
          ];
        }), CATEGORY_HEADERS.length);

        return list.length;
      });

      categories = getCategoriesForQuestion_(question.id);
    }

    let processed = 0;

    while (Date.now() - startedAt < AUTO_TIME_LIMIT_MS) {

      const pending = getUnclassifiedAnswers_(question.id);

      if (!pending.length) {
        break;
      }

      const batch = pending.slice(0, AI_CONFIG.CLASSIFY_BATCH_SIZE);
      const results = classifyAnswersWithAI_(question, categories, batch) || {};

      const written = withLock_(function() {
        return writeClassifications_(question.id, categories, batch, results, true);
      });

      processed += written;

      if (!written) {
        break;
      }
    }

    const left = getUnclassifiedAnswers_(question.id).length;

    return { created: created, processed: processed, remaining: left > 0, left: left };

  } finally {

    cache.remove(busyKey);
  }
}


/*
 * 老師在課堂討論開關「自動分類」。開啟時把這一題已經有的回答也一起處理好。
 */
function setQuestionAutoClassify(questionId, on) {

  const question = requireQuestion_(questionId);
  on = on === true || on === 'true';

  withLock_(function() {

    const sheet = getQuestionSheet_();

    ensureQuestionColumns_(sheet);

    // 在鎖裡重新找列號，避免期間有題目被刪除造成錯位
    const index = findRowIndex_(sheet.getDataRange().getValues(), question.id);

    if (index < 0) {
      throw new Error('找不到題目，可能已經被刪除');
    }

    sheet.getRange(index + 1, QCOL.AUTO_CLASSIFY).setValue(on ? '是' : '否');

    if (on) {
      // 之前 AI 建議、還沒確認的分類，一起標成已確認
      const coding = getCodingSheet_();
      const lastRow = coding.getLastRow();

      if (lastRow >= 2) {

        const range = coding.getRange(2, 1, lastRow - 1, CODING_HEADERS.length);
        const values = range.getValues();
        let changed = false;

        values.forEach(function(row) {
          if (cleanText_(row[KCOL.QUESTION_ID - 1]) === question.id && cleanText_(row[KCOL.CONFIRMED - 1]) !== '是') {
            row[KCOL.CONFIRMED - 1] = '是';
            row[KCOL.CONFIRMED_BY - 1] = CONFIRMED_BY.AI;
            changed = true;
          }
        });

        if (changed) {
          range.setValues(cells_(values));
        }
      }
    }
  });

  logEvent_({
    courseId: question.courseId,
    questionId: question.id,
    module: MODULE.DISCUSS,
    type: on ? '開啟自動分類' : '關閉自動分類',
    source: teacherSource_(),
    detail: {}
  });

  if (!on) {
    return { autoClassify: false };
  }

  markAutoWork_();

  question.autoClassify = true;

  const result = processQuestionAuto_(question, Date.now());

  return Object.assign({ autoClassify: true }, result);
}


/*
 * 老師按「立即自動分類」：不用等背景工作。
 */
function runAutoClassifyNow(questionId) {

  const question = requireQuestion_(questionId);

  return processQuestionAuto_(question, Date.now());
}


/*
 * 建立每分鐘執行 autoProcessTick 的觸發條件（重複執行不會建立第二個）。
 */
function installAutoTrigger_() {

  const existing = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === 'autoProcessTick';
  });

  existing.slice(1).forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });

  if (!existing.length) {
    ScriptApp.newTrigger('autoProcessTick').timeBased().everyMinutes(1).create();
    return '已建立';
  }

  return '已存在';
}


/* =====================================================
   學習診斷
   AI 讀全班的回答，整理待釐清的概念、普遍缺少的部分和下一步教學建議。
   每次分析都存一列在「學習診斷」工作表，畫面顯示最新的一次。
===================================================== */

const INSIGHT_SHEET = '學習診斷';
const INSIGHT_HEADERS = [
  '診斷ID', '題目ID', '課程ID', '分析回答數', '結果', '建立時間', '建立者',
  '教師判斷', '教學行動', '行動效果', '最後更新'
];
const ICOL = {
  ID: 1, QUESTION_ID: 2, COURSE_ID: 3, COUNT: 4, RESULT: 5, CREATED: 6, CREATED_BY: 7,
  JUDGEMENT: 8, ACTION: 9, OUTCOME: 10, UPDATED: 11
};
const INSIGHT_MIN_ANSWERS = 3;


function getInsightSheet_() {

  const ss = getSpreadsheet_();

  return (
    ss.getSheetByName(INSIGHT_SHEET) ||
    ensureSheet_(ss, INSIGHT_SHEET, INSIGHT_HEADERS, '#fff6d6', false)
  );
}


/*
 * 老師按「AI 分析」。
 */
function analyzeQuestionLearning(questionId) {

  const question = requireQuestion_(questionId);
  const teacher = currentTeacher_();
  const answers = getAnswersForQuestion_(question.id);

  if (answers.length < INSIGHT_MIN_ANSWERS) {
    throw new Error('至少要有 ' + INSIGHT_MIN_ANSWERS + ' 份學生回答才能分析，目前只有 ' + answers.length + ' 份');
  }

  // 老師給的分數、課堂討論的分類，一起給 AI 參考
  const scores = {};

  getAnswerSheet_().getDataRange().getValues().slice(1).forEach(function(row) {
    scores[cleanText_(row[ACOL.ID - 1])] = row[ACOL.TEACHER_SCORE - 1];
  });

  const categories = getCategoriesForQuestion_(question.id);
  const coding = getCodingMap_(question.id);
  const categoryName = {};
  const categoryCount = {};

  categories.forEach(function(c) {
    categoryName[c.id] = c.name;
    categoryCount[c.id] = 0;
  });

  // 最新送出的排前面，回答太多時先分析最近的
  const list = answers.slice().reverse().map(function(a) {

    const k = coding[a.answerId];
    const catId = k && categoryName[k.categoryId] ? k.categoryId : '';

    if (catId) categoryCount[catId]++;

    return {
      answerId: a.answerId,
      answer: a.answer,
      teacherScore: scores[a.answerId] === undefined ? '' : scores[a.answerId],
      categoryName: catId ? categoryName[catId] : ''
    };
  });

  const result = analyzeLearningWithAI_(
    question,
    list,
    categories.map(function(c) { return { name: c.name, count: categoryCount[c.id] }; })
  );

  const now = new Date();
  const insightId = generateId_('D');

  withLock_(function() {
    const sheet = getInsightSheet_();
    ensureColumns_(sheet, INSIGHT_HEADERS);
    appendRows_(sheet, [[
      insightId, question.id, question.courseId, result.analyzedCount,
      JSON.stringify(result), now, teacher.name || teacher.account,
      '', '', '', ''
    ]], INSIGHT_HEADERS.length);
  });

  logEvent_({
    courseId: question.courseId,
    questionId: question.id,
    module: MODULE.DIAGNOSE,
    type: 'AI教學診斷',
    source: 'AI（' + teacherSource_() + ' 要求）',
    detail: { insightId: insightId, analyzedCount: result.analyzedCount }
  });

  return publicInsight_(question, result, now, teacher.name || teacher.account, answers, { id: insightId });
}


/*
 * 老師對診斷的判斷，以及實際的教學行動與效果。
 * data：{
 *   findings: { 'm0': '同意'|'部分同意'|'不同意', 'g1': … },   m＝待釐清的概念、g＝普遍缺少的部分
 *   adoptedSteps: [0, 2],     採用了哪幾個教學建議
 *   note: '老師自己的看法',
 *   action: '實際做了什麼',
 *   outcome: '做了之後的效果'
 * }
 */
const JUDGEMENT_OPTIONS = ['同意', '部分同意', '不同意'];

function saveInsightJudgement(insightId, data) {

  insightId = cleanText_(insightId);
  data = data || {};

  const sheet = getSpreadsheet_().getSheetByName(INSIGHT_SHEET);

  if (!sheet) {
    throw new Error('找不到這次的診斷');
  }

  const values = sheet.getDataRange().getValues();
  const index = findRowIndex_(values, insightId);

  if (index < 0) {
    throw new Error('找不到這次的診斷，請重新整理');
  }

  const question = requireQuestion_(values[index][ICOL.QUESTION_ID - 1]);

  const findings = {};

  Object.keys(data.findings || {}).slice(0, 20).forEach(function(key) {
    const v = cleanText_(data.findings[key]);
    if (/^[mg]\d{1,2}$/.test(key) && JUDGEMENT_OPTIONS.indexOf(v) >= 0) {
      findings[key] = v;
    }
  });

  const adoptedSteps = (Array.isArray(data.adoptedSteps) ? data.adoptedSteps : [])
    .map(Number)
    .filter(function(n, i, all) { return n >= 0 && n < 10 && Math.floor(n) === n && all.indexOf(n) === i; });

  const note = cleanText_(data.note);
  const action = cleanText_(data.action);
  const outcome = cleanText_(data.outcome);

  if (note.length > 1000 || action.length > 2000 || outcome.length > 2000) {
    throw new Error('文字太長了，請精簡一點（看法 1000 字、教學行動與效果各 2000 字以內）');
  }

  const judgement = { findings: findings, adoptedSteps: adoptedSteps, note: note };
  const now = new Date();

  withLock_(function() {
    ensureColumns_(sheet, INSIGHT_HEADERS);
    const rows = sheet.getDataRange().getValues();
    const i = findRowIndex_(rows, insightId);
    if (i < 0) throw new Error('找不到這次的診斷，請重新整理');
    sheet
      .getRange(i + 1, ICOL.JUDGEMENT, 1, 4)
      .setValues(cells_([[JSON.stringify(judgement), action, outcome, now]]));
  });

  logEvent_({
    courseId: question.courseId,
    questionId: question.id,
    module: MODULE.DIAGNOSE,
    type: '教師判斷與教學行動',
    source: teacherSource_(),
    detail: { insightId: insightId, judgement: judgement, action: action, outcome: outcome }
  });

  return { success: true, updatedAt: formatDate_(now) };
}


/*
 * 讀出這一題最新的一次分析。沒有分析過回傳 { insight: null, answerCount }。
 */
function getQuestionInsight(questionId) {

  const question = requireQuestion_(questionId);
  const answers = getAnswersForQuestion_(question.id);
  const sheet = getSpreadsheet_().getSheetByName(INSIGHT_SHEET);

  let latest = null;

  if (sheet && sheet.getLastRow() >= 2) {
    sheet.getDataRange().getValues().slice(1).forEach(function(row) {
      if (cleanText_(row[1]) === question.id) {
        latest = row;   // 越下面越新
      }
    });
  }

  if (!latest) {
    return { insight: null, answerCount: answers.length, minAnswers: INSIGHT_MIN_ANSWERS };
  }

  let result;

  try {
    result = JSON.parse(latest[4]);
  } catch (error) {
    return { insight: null, answerCount: answers.length, minAnswers: INSIGHT_MIN_ANSWERS };
  }

  let judgement = {};

  try {
    judgement = JSON.parse(latest[ICOL.JUDGEMENT - 1] || '{}') || {};
  } catch (error) {
    judgement = {};
  }

  return publicInsight_(question, result, latest[5], cleanText_(latest[6]), answers, {
    id: cleanText_(latest[ICOL.ID - 1]),
    judgement: judgement,
    action: cleanText_(latest[ICOL.ACTION - 1]),
    outcome: cleanText_(latest[ICOL.OUTCOME - 1]),
    updatedAt: latest[ICOL.UPDATED - 1] ? formatDate_(latest[ICOL.UPDATED - 1]) : ''
  });
}


/*
 * 加上學生姓名，讓老師知道是哪些學生需要協助。
 */
function publicInsight_(question, result, analyzedAt, analyzedBy, answers, record) {

  record = record || {};

  const students = {};

  answers.forEach(function(a) {
    students[a.answerId] = { name: a.name, studentId: a.studentId };
  });

  const withStudents = function(items) {
    return (items || []).map(function(item) {
      return Object.assign({}, item, {
        students: (item.answerIds || [])
          .filter(function(id) { return students[id]; })
          .map(function(id) { return students[id]; })
      });
    });
  };

  return {
    insight: {
      overview: result.overview || '',
      mastered: result.mastered || [],
      misconceptions: withStudents(result.misconceptions),
      gaps: withStudents(result.gaps),
      nextSteps: result.nextSteps || [],
      checkQuestion: result.checkQuestion || '',
      analyzedCount: result.analyzedCount || 0,
      analyzedAt: formatDate_(analyzedAt),
      analyzedBy: analyzedBy,
      objective: question.objective || '',
      objectiveProgress: result.objectiveProgress || '',
      cannotJudge: result.cannotJudge || [],
      descriptive: isDescriptiveQuestion_(question),
      id: record.id || '',
      judgement: {
        findings: (record.judgement && record.judgement.findings) || {},
        adoptedSteps: (record.judgement && record.judgement.adoptedSteps) || [],
        note: (record.judgement && record.judgement.note) || ''
      },
      action: record.action || '',
      outcome: record.outcome || '',
      judgedAt: record.updatedAt || ''
    },
    answerCount: answers.length,
    minAnswers: INSIGHT_MIN_ANSWERS,
    question: { id: question.id, title: question.title }
  };
}


/* =====================================================
   教材庫分課程
   RAG 的教材存在另一份試算表。這裡用主試算表的「教材課程」工作表
   記錄每份教材屬於哪門課；沒有紀錄的舊教材算預設課程。
   網頁呼叫的都是這裡的版本，會先檢查課程權限，再交給 RAG_Admin.gs、RAG_Chat.gs。
===================================================== */

const RAG_COURSE_SHEET = '教材課程';
const RAG_COURSE_HEADERS = ['教材ID', '課程ID', '最後修改'];


function getRagCourseSheet_() {

  const ss = getSpreadsheet_();

  return (
    ss.getSheetByName(RAG_COURSE_SHEET) ||
    ensureSheet_(ss, RAG_COURSE_SHEET, RAG_COURSE_HEADERS, '#e3f3eb', false)
  );
}


/*
 * 回傳 { 教材ID: 課程ID }
 */
function getRagCourseMap_() {

  const values = getRagCourseSheet_().getDataRange().getValues();
  const map = {};

  for (let i = 1; i < values.length; i++) {
    const docId = cleanText_(values[i][0]);
    if (docId) {
      map[docId] = cleanText_(values[i][1]);
    }
  }

  return map;
}


function ragCourseOfDoc_(docId, map) {
  return (map || getRagCourseMap_())[cleanText_(docId)] || getDefaultCourseId_();
}


function setRagDocCourse_(docId, courseId) {

  docId = cleanText_(docId);

  if (!docId) {
    return;
  }

  withLock_(function() {

    const sheet = getRagCourseSheet_();
    const values = sheet.getDataRange().getValues();
    const index = findRowIndex_(values, docId);

    if (index >= 0) {
      sheet.getRange(index + 1, 2, 1, 2).setValues(cells_([[courseId, new Date()]]));
    } else {
      appendRows_(sheet, [[docId, courseId, new Date()]], RAG_COURSE_HEADERS.length);
    }
  });
}


function requireRagDoc_(docId) {
  return requireCourse_(ragCourseOfDoc_(docId));
}


/*
 * 教材要放在哪門課：有指定就檢查權限，沒有就用預設課程（舊版網頁）。
 */
function requireRagCourse_(courseId) {

  const course = resolveTeacherCourse_(courseId);

  if (!course) {
    throw new Error('請先到「課程管理」建立一門課程');
  }

  return course;
}


function ragListDocumentsForCourse_(courseId) {

  const course = resolveTeacherCourse_(courseId);

  if (!course) {
    return [];
  }

  const map = getRagCourseMap_();

  return ragListDocuments().filter(function(doc) {
    return ragCourseOfDoc_(doc.docId, map) === course.id;
  });
}


function ragGetDocumentDetailChecked_(docId) {
  requireRagDoc_(docId);
  return ragGetDocumentDetail(docId);
}


function ragUploadPdfForCourse_(fileName, base64Data, courseId) {

  const course = requireRagCourse_(courseId);

  if (course.status === COURSE_STATUS.ARCHIVED) {
    throw new Error('這門課程已封存，不能再上傳教材');
  }

  const result = ragUploadPdf(fileName, base64Data);

  // 匯入失敗也要記，重試時才知道是哪門課的
  if (result && result.docId) {
    setRagDocCourse_(result.docId, course.id);
  }

  return result;
}


function ragRetryDocumentChecked_(docId) {
  requireRagDoc_(docId);
  return ragRetryDocument(docId);
}


function ragUpdateDocumentInfoChecked_(docId, info) {
  requireRagDoc_(docId);
  return ragUpdateDocumentInfo(docId, info);
}


function ragSetDocumentStatusChecked_(docId, status) {
  requireRagDoc_(docId);
  return ragSetDocumentStatus(docId, status);
}


function ragSetChunkStatusChecked_(chunkId, status) {

  // 段落 ID 是「教材ID_C數字」
  const docId = cleanText_(chunkId).replace(/_C\d+$/, '');

  requireRagDoc_(docId);

  return ragSetChunkStatus(chunkId, status);
}


/*
 * AI 助理：只讀這門課的教材。
 */
function ragChatForCourse_(message, history, courseId) {

  const course = requireRagCourse_(courseId);
  const map = getRagCourseMap_();

  return ragChat(message, history, {
    allowDoc: function(docId) {
      return ragCourseOfDoc_(docId, map) === course.id;
    }
  });
}


/*
 * 出題時的「AI 搜尋教材」：只顯示這門課的教材段落。
 * 搜尋程式在其他 RAG 檔案裡，這裡把結果中其他課程的教材拿掉。
 */
function previewRAGForCourse_(question, courseId) {

  const course = requireRagCourse_(courseId);
  const result = previewRAGForTeacher(question);

  if (!result || !Array.isArray(result.candidates)) {
    return result;
  }

  const map = getRagCourseMap_();
  const allowed = {};

  const candidates = result.candidates.filter(function(item) {

    const ok = ragCourseOfDoc_(item && item.docId, map) === course.id;

    if (ok && item.chunkId) {
      allowed[item.chunkId] = true;
    }

    return ok;
  });

  if (candidates.length === result.candidates.length) {
    return result;
  }

  if (!candidates.length) {
    return {
      status: 'NO_MATCH',
      message: '這門課程的教材庫中沒有找到相關教材。'
    };
  }

  const analysis = result.analysis || {};

  // 解讀可能用到了其他課程的教材，所以不顯示，只列出本課程的段落
  return {
    status: result.status,
    message: result.message,
    candidates: candidates,
    analysis: {
      explanation: '（搜尋結果中有其他課程的教材，已經隱藏。下面只列出這門課程的教材段落，請自行參考。）',
      concepts: [],
      selectedChunkIds: (analysis.selectedChunkIds || []).filter(function(id) {
        return allowed[id];
      })
    }
  };
}


/* =====================================================
   除錯用
===================================================== */

function debugAnswers() {

  const sheet = getAnswerSheet_();
  const values = sheet.getDataRange().getValues();

  Logger.log('工作表：' + sheet.getName());
  Logger.log('總列數：' + values.length);
  Logger.log(JSON.stringify(values, null, 2));
}


function testTeacherAnswers() {

  const result = getTeacherAnswers('');

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}


/*
 * 檢查四張工作表還剩多少空白列。
 * 在 Apps Script 選這個函式按「執行」，結果會顯示在執行記錄。
 */
function checkSheetRows() {

  [QUESTION_SHEET, ANSWER_SHEET, CATEGORY_SHEET, CODING_SHEET].forEach(function(name) {

    const sheet = getSpreadsheet_().getSheetByName(name);

    if (!sheet) {
      Logger.log(name + '：找不到工作表');
      return;
    }

    Logger.log(
      name + '：資料到第 ' + sheet.getLastRow() + ' 列，工作表共 ' +
      sheet.getMaxRows() + ' 列，剩 ' + (sheet.getMaxRows() - sheet.getLastRow()) + ' 列空白'
    );
  });
}


/*
 * 檢查教師 API 清單裡的函式是否都存在。
 * 貼上新檔案後先執行這個，全部通過再部署。
 */
function checkTeacherApiHandlers() {

  const handlers = getTeacherApiHandlers_();

  Object.keys(handlers).forEach(function(name) {
    if (typeof handlers[name] !== 'function') {
      throw new Error('找不到函式：' + name);
    }
  });

  // 這些函式在其他檔案，由這個檔案包一層權限檢查後再呼叫
  const external = {
    'ai.gs：gradeAnswerWithAI_': typeof gradeAnswerWithAI_,
    'ai.gs：getAISettings': typeof getAISettings,
    'ai.gs：suggestCategoriesWithAI_': typeof suggestCategoriesWithAI_,
    'ai.gs：classifyAnswersWithAI_': typeof classifyAnswersWithAI_,
    'ai_instant.gs：instantFeedbackWithAI_': typeof instantFeedbackWithAI_,
    'ai_instant.gs：analyzeLearningWithAI_': typeof analyzeLearningWithAI_,
    'ai_instant.gs：describeAnswerWithAI_': typeof describeAnswerWithAI_,
    'ai_instant.gs：INSTANT_FEEDBACK_STYLES': typeof INSTANT_FEEDBACK_STYLES === 'object' ? 'function' : 'undefined',
    'ai.gs：saveAISettings': typeof saveAISettings,
    'RAG_Admin.gs：ragListDocuments': typeof ragListDocuments,
    'RAG_Admin.gs：ragGetDocumentDetail': typeof ragGetDocumentDetail,
    'RAG_Admin.gs：ragUploadPdf': typeof ragUploadPdf,
    'RAG_Admin.gs：ragRetryDocument': typeof ragRetryDocument,
    'RAG_Admin.gs：ragUpdateDocumentInfo': typeof ragUpdateDocumentInfo,
    'RAG_Admin.gs：ragSetDocumentStatus': typeof ragSetDocumentStatus,
    'RAG_Admin.gs：ragSetChunkStatus': typeof ragSetChunkStatus,
    'RAG_Chat.gs：ragChat': typeof ragChat,
    'RAG 預覽：previewRAGForTeacher': typeof previewRAGForTeacher
  };

  Object.keys(external).forEach(function(name) {
    if (external[name] !== 'function') {
      throw new Error('找不到函式：' + name);
    }
  });

  Logger.log(
    '教師 API 共 ' + Object.keys(handlers).length + ' 個，' +
    '其他檔案的 ' + Object.keys(external).length + ' 個函式也都存在'
  );
}

/* =====================================================
   匯出研究紀錄（一門課）
   回傳四張表的資料，網頁再存成 CSV：
   1. 作答與回饋：每位學生每一題的每一個版本
   2. 討論分類：AI 原判、最後分類、誰確認的、學生是否同意
   3. 學習歷程紀錄：四個模組的每一筆紀錄
   4. 教學診斷：AI 的診斷、老師的判斷、教學行動與效果
   options.anonymize 為 true 時：學號換成 S001 這類代號、不輸出姓名、老師名稱換成「教師」。
   學生回答的內文不會改，如果回答裡寫了自己或同學的名字，請自行檢查。
===================================================== */

function exportResearchRecords(courseId, options) {

  const course = requireCourse_(courseId);
  const anonymize = !!(options && options.anonymize);

  const questions = {};

  getQuestionSheet_().getDataRange().getValues().slice(1).forEach(function(row, i) {
    const q = questionFromRow_(row, i + 2);
    if (q.id && q.courseId === course.id) questions[q.id] = q;
  });

  const answerRows = getAnswerSheet_().getDataRange().getValues().slice(1).filter(function(row) {
    return cleanText_(row[0]) && questions[cleanText_(row[ACOL.QUESTION_ID - 1])];
  });

  // 學號 → 代號，依學號排序後編號，同一次匯出裡同一位學生代號一樣
  const studentIds = {};
  answerRows.forEach(function(row) { studentIds[cleanText_(row[ACOL.STUDENT_ID - 1])] = true; });

  const codes = {};
  Object.keys(studentIds).sort().forEach(function(id, i) {
    codes[id] = 'S' + ('00' + (i + 1)).slice(-3);
  });

  const who = function(studentId) {
    studentId = cleanText_(studentId);
    return anonymize ? (codes[studentId] || (studentId ? '其他' : '')) : studentId;
  };

  const teacherName = function(source) {
    return anonymize ? cleanText_(source).replace(/教師：.*?（.*?）/g, '教師') : cleanText_(source);
  };

  const date = function(value) { return value ? formatDate_(value) : ''; };
  const qTitle = function(id) { return questions[id] ? questions[id].title : '（已刪除的題目）'; };

  /* 1. 作答與回饋 */
  const answerHeader = anonymize
    ? ['學生代號']
    : ['學號', '姓名'];

  const answers = [answerHeader.concat([
    '題目ID', '題目', '評量方式', '回答ID', '版本', '回答', '送出時間',
    'AI學習建議', '修改說明', 'AI建議採納（學生自評）',
    'AI分數', 'AI批改說明', 'AI教師口吻評語', '教師分數', '教師評語', 'AI草稿採用', '狀態', '是否為最新版本'
  ])];

  const history = getHistoryMap_(answerRows.map(function(row) { return row[0]; }));

  answerRows.forEach(function(row) {

    const answerId = cleanText_(row[ACOL.ID - 1]);
    const questionId = cleanText_(row[ACOL.QUESTION_ID - 1]);
    const q = questions[questionId];
    const person = anonymize
      ? [who(row[ACOL.STUDENT_ID - 1])]
      : [cleanText_(row[ACOL.STUDENT_ID - 1]), cleanText_(row[ACOL.NAME - 1])];

    (history[answerId] || []).forEach(function(h) {
      answers.push(person.concat([
        questionId, q.title, q.assessment, answerId, h.version, h.answer, h.submittedAt,
        h.instantFeedback, h.revisionNote, h.aiAdopted,
        h.aiScore, h.aiFeedback, '', h.teacherScore, h.teacherFeedback, h.draftAdoption, h.status, '否'
      ]));
    });

    answers.push(person.concat([
      questionId, q.title, q.assessment, answerId, Number(row[ACOL.VERSION - 1]) || 1,
      cleanText_(row[ACOL.ANSWER - 1]), date(row[ACOL.SUBMITTED - 1]),
      cleanText_(row[ACOL.INSTANT_FEEDBACK - 1]), cleanText_(row[ACOL.REVISION_NOTE - 1]), cleanText_(row[ACOL.AI_ADOPTED - 1]),
      row[ACOL.AI_SCORE - 1], cleanText_(row[ACOL.AI_FEEDBACK - 1]), cleanText_(row[ACOL.AI_STUDENT_FEEDBACK - 1]),
      row[ACOL.TEACHER_SCORE - 1], cleanText_(row[ACOL.TEACHER_FEEDBACK - 1]),
      cleanText_(row[ACOL.DRAFT_ADOPTION - 1]), cleanText_(row[ACOL.STATUS - 1]), '是'
    ]));
  });

  /* 2. 討論分類 */
  const categoryNames = {};

  getCategorySheet_().getDataRange().getValues().slice(1).forEach(function(row) {
    if (questions[cleanText_(row[1])]) categoryNames[cleanText_(row[0])] = cleanText_(row[2]);
  });

  const studentOf = {};
  answerRows.forEach(function(row) { studentOf[cleanText_(row[0])] = row[ACOL.STUDENT_ID - 1]; });

  const coding = [[anonymize ? '學生代號' : '學號', '題目ID', '題目', '回答ID',
    'AI原分類', 'AI原理由', 'AI信心', '最後分類', '分類理由', '已確認', '確認來源', '學生回覆', '學生說明', '最後更新']];

  const codingSheet = getSpreadsheet_().getSheetByName(CODING_SHEET);

  if (codingSheet && codingSheet.getLastRow() >= 2) {
    codingSheet.getDataRange().getValues().slice(1).forEach(function(row) {
      const questionId = cleanText_(row[KCOL.QUESTION_ID - 1]);
      if (!questions[questionId]) return;
      const answerId = cleanText_(row[KCOL.ANSWER_ID - 1]);
      const confirmed = cleanText_(row[KCOL.CONFIRMED - 1]) === '是';
      const reason = cleanText_(row[KCOL.REASON - 1]);
      coding.push([
        who(studentOf[answerId]), questionId, qTitle(questionId), answerId,
        categoryNames[cleanText_(row[KCOL.AI_CATEGORY - 1])] || cleanText_(row[KCOL.AI_CATEGORY - 1]),
        cleanText_(row[KCOL.AI_REASON - 1]),
        cleanText_(row[KCOL.CONFIDENCE - 1]),
        categoryNames[cleanText_(row[KCOL.CATEGORY_ID - 1])] || cleanText_(row[KCOL.CATEGORY_ID - 1]),
        reason,
        confirmed ? '是' : '否',
        cleanText_(row[KCOL.CONFIRMED_BY - 1]) ||
          (confirmed ? (/^AI 自動分類/.test(reason) ? CONFIRMED_BY.AI : CONFIRMED_BY.TEACHER) : ''),
        cleanText_(row[KCOL.STUDENT_AGREE - 1]),
        cleanText_(row[KCOL.STUDENT_NOTE - 1]),
        date(row[KCOL.UPDATED - 1])
      ]);
    });
  }

  /* 3. 學習歷程紀錄 */
  const events = [['紀錄ID', '時間', '模組', '類型', '來源', '題目ID', '題目', '回答ID', anonymize ? '學生代號' : '學號', '內容']];

  readEvents_(function(row) { return cleanText_(row[2]) === course.id; }).forEach(function(e) {
    events.push([
      e.id, date(e.time), e.module, e.type, teacherName(e.source),
      e.questionId, e.questionId ? qTitle(e.questionId) : '', e.answerId,
      who(e.studentId), JSON.stringify(e.detail)
    ]);
  });

  /* 4. 教學診斷 */
  const insights = [['診斷ID', '題目ID', '題目', '分析回答數', '建立時間', '建立者',
    '整體狀況', '學習目標達成', '待釐清的概念', '普遍缺少的部分', '尚無法判斷', '教學建議',
    '教師判斷', '採用的建議', '教師看法', '教學行動', '行動效果', '最後更新']];

  const insightSheet = getSpreadsheet_().getSheetByName(INSIGHT_SHEET);

  if (insightSheet && insightSheet.getLastRow() >= 2) {
    insightSheet.getDataRange().getValues().slice(1).forEach(function(row) {

      if (cleanText_(row[ICOL.COURSE_ID - 1]) !== course.id) return;

      let r = {};
      let j = {};
      try { r = JSON.parse(row[ICOL.RESULT - 1] || '{}') || {}; } catch (error) { r = {}; }
      try { j = JSON.parse(row[ICOL.JUDGEMENT - 1] || '{}') || {}; } catch (error) { j = {}; }

      const findings = j.findings || {};
      const describe = function(items, prefix, key) {
        return (items || []).map(function(x, i) {
          const quotes = (x.evidence || []).map(function(ev) { return '「' + ev.quote + '」'; }).join('');
          return (i + 1) + '. ' + x[key] + '：' + (x.description || '') +
            (quotes ? ' 證據' + quotes : '') +
            (findings[prefix + i] ? '［教師：' + findings[prefix + i] + '］' : '');
        }).join('\n');
      };
      const steps = r.nextSteps || [];
      const questionId = cleanText_(row[ICOL.QUESTION_ID - 1]);

      insights.push([
        cleanText_(row[ICOL.ID - 1]), questionId, qTitle(questionId), row[ICOL.COUNT - 1],
        date(row[ICOL.CREATED - 1]), anonymize ? '教師' : cleanText_(row[ICOL.CREATED_BY - 1]),
        r.overview || '', r.objectiveProgress || '',
        describe(r.misconceptions, 'm', 'concept'),
        describe(r.gaps, 'g', 'item'),
        (r.cannotJudge || []).map(function(x) { return x.item + '：' + x.reason; }).join('\n'),
        steps.map(function(x, i) { return (i + 1) + '. ' + x.title + '（' + x.target + '）'; }).join('\n'),
        Object.keys(findings).length ? JSON.stringify(findings) : '',
        (j.adoptedSteps || []).map(function(i) { return steps[i] ? (i + 1) + '. ' + steps[i].title : ''; }).filter(Boolean).join('\n'),
        j.note || '',
        cleanText_(row[ICOL.ACTION - 1]),
        cleanText_(row[ICOL.OUTCOME - 1]),
        date(row[ICOL.UPDATED - 1])
      ]);
    });
  }

  logEvent_({
    courseId: course.id,
    module: '研究紀錄',
    type: '匯出研究紀錄',
    source: teacherSource_(),
    detail: { anonymize: anonymize }
  });

  return {
    courseName: course.name,
    anonymize: anonymize,
    exportedAt: formatDate_(new Date()),
    tables: [
      { name: '作答與回饋', rows: answers },
      { name: '討論分類', rows: coding },
      { name: '學習歷程紀錄', rows: events },
      { name: '教學診斷', rows: insights }
    ]
  };
}
