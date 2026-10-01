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
const TIME_ZONE = 'Asia/Taipei';

const QUESTION_HEADERS = [
  '題目ID', '標題', '題目內容', '配分', '標準答案',
  '評分規準', 'AI審核', '狀態', '建立時間',
  '截止時間', '截止後', '最後修改'
];

const ANSWER_HEADERS = [
  '回答ID', '題目ID', '學號', '姓名', '學生回答',
  '送出時間', 'AI分數', 'AI評語', 'AI信心', '教師分數',
  '教師評語', '狀態', '最後更新', 'AI教師口吻評語'
];

const CATEGORY_HEADERS = [
  '類別ID', '題目ID', '類別名稱', '類別說明', 'AI摘要',
  '討論提問', '代表回答ID', '排序', '最後更新'
];

const CODING_HEADERS = [
  '回答ID', '題目ID', '類別ID', 'AI理由', 'AI信心',
  '教師確認', '最後更新'
];

/* 欄位位置（從 1 開始算） */

const QCOL = {
  ID: 1, TITLE: 2, CONTENT: 3, POINTS: 4, REFERENCE: 5,
  RUBRIC: 6, AI: 7, STATUS: 8, CREATED: 9,
  DEADLINE: 10, LATE_POLICY: 11, UPDATED: 12
};

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
  UPDATED: 13, AI_STUDENT_FEEDBACK: 14
};

const CCOL = {
  ID: 1, QUESTION_ID: 2, NAME: 3, DESCRIPTION: 4, SUMMARY: 5,
  DISCUSSION: 6, REPRESENTATIVE: 7, ORDER: 8, UPDATED: 9
};

const KCOL = {
  ANSWER_ID: 1, QUESTION_ID: 2, CATEGORY_ID: 3, REASON: 4,
  CONFIDENCE: 5, CONFIRMED: 6, UPDATED: 7
};

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
   教師密碼
   密碼存在「專案設定 → 指令碼屬性」的 TEACHER_PASSWORD，不寫在程式裡。
===================================================== */

const TEACHER_SESSION_SECONDS = 6 * 60 * 60;   // 登入後 6 小時內有效
const LOGIN_MAX_FAILS = 10;                    // 連續錯幾次後暫停
const LOGIN_LOCK_SECONDS = 5 * 60;             // 暫停幾秒


function teacherLogin(password) {

  const expected = cleanText_(
    PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD')
  );

  if (!expected) {
    throw new Error('尚未設定教師密碼，請在 Apps Script 的指令碼屬性加入 TEACHER_PASSWORD');
  }

  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('teacher_login_fails')) || 0;

  if (fails >= LOGIN_MAX_FAILS) {
    throw new Error('密碼錯誤次數太多，請 5 分鐘後再試');
  }

  if (cleanText_(password) !== expected) {

    cache.put('teacher_login_fails', String(fails + 1), LOGIN_LOCK_SECONDS);

    // 放慢猜密碼的速度
    Utilities.sleep(1000);

    throw new Error('密碼錯誤');
  }

  cache.remove('teacher_login_fails');

  const token = Utilities.getUuid();

  cache.put('teacher_session_' + token, '1', TEACHER_SESSION_SECONDS);

  return {
    token: token,
    expiresInSeconds: TEACHER_SESSION_SECONDS
  };
}


function teacherLogout(token) {

  token = cleanText_(token);

  if (token) {
    CacheService.getScriptCache().remove('teacher_session_' + token);
  }

  return { success: true };
}


function isTeacherTokenValid_(token) {

  token = cleanText_(token);

  return (
    !!token &&
    CacheService.getScriptCache().get('teacher_session_' + token) === '1'
  );
}


function getTeacherConfig() {

  return {
    spreadsheetUrl:
      'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/edit'
  };
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
    getPublishedQuestions: getPublishedQuestions,
    submitAnswer: submitAnswer,
    getStudentResults: getStudentResults,
    teacherLogin: teacherLogin,
    teacherLogout: teacherLogout
  };
}


/*
 * 必須先輸入教師密碼才能呼叫的功能
 * 之後新增教師用的後端函式，記得加在這裡。
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
    saveTeacherReview: saveTeacherReview,
    runAIReview: runAIReview,
    getAISettings: getAISettings,
    saveAISettings: saveAISettings,

    // 課堂討論
    getDiscussionBoard: getDiscussionBoard,
    saveCategories: saveCategories,
    suggestCategories: suggestCategories,
    classifyAnswers: classifyAnswers,
    clearUnconfirmedClassifications: clearUnconfirmedClassifications,
    setAnswerCategory: setAnswerCategory,
    confirmClassifications: confirmClassifications,
    summarizeCategories: summarizeCategories,

    // RAG 預覽（RAG 網站測試版）
    previewRAGForTeacher: previewRAGForTeacher,

    // 教材庫（RAG_Admin.gs）
    ragListDocuments: ragListDocuments,
    ragGetDocumentDetail: ragGetDocumentDetail,
    ragUploadPdf: ragUploadPdf,
    ragRetryDocument: ragRetryDocument,
    ragUpdateDocumentInfo: ragUpdateDocumentInfo,
    ragSetDocumentStatus: ragSetDocumentStatus,
    ragSetChunkStatus: ragSetChunkStatus,

    // AI 助理（RAG_Chat.gs）
    ragChat: ragChat

  };

}


function doPost(e) {

  let output;

  try {

    const request = JSON.parse(
      e && e.postData && e.postData.contents
        ? e.postData.contents
        : '{}'
    );

    const args = Array.isArray(request.args) ? request.args : [];

    let handler = getPublicApiHandlers_()[request.fn];

    if (!handler) {

      handler = getTeacherApiHandlers_()[request.fn];

      if (handler && !isTeacherTokenValid_(request.token)) {
        return jsonOutput_({
          ok: false,
          code: 'AUTH_REQUIRED',
          error: '請先輸入教師密碼'
        });
      }
    }

    if (!handler) {
      throw new Error('不允許呼叫的功能：' + request.fn);
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

  ensureSheet_(ss, QUESTION_SHEET, QUESTION_HEADERS, '#d9e5ff', false);
  ensureSheet_(ss, CATEGORY_SHEET, CATEGORY_HEADERS, '#fff1d6', false);
  ensureSheet_(ss, CODING_SHEET, CODING_HEADERS, '#fde2e2', false);

  /*
   * 學號欄設為純文字，避免 0123 被存成 123。
   * 只影響之後寫入的資料。
   */
  answerSheet
    .getRange(1, ACOL.STUDENT_ID, answerSheet.getMaxRows(), 1)
    .setNumberFormat('@');

  return '系統初始化完成';
}


/*
 * 確保工作表存在且標題列正確。
 * - 舊標題是新標題的前段（例如少了最後一欄）：自動補上新欄位，資料保留。
 * - 格式完全不同：backupIfIncompatible 為 true 時備份舊表並建新表，否則報錯。
 */
function ensureSheet_(ss, name, headers, color, backupIfIncompatible) {

  let sheet = ss.getSheetByName(name);

  if (sheet && sheet.getLastRow() > 0) {

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
          .setValues([headers.slice(matched)]);
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
function withLock_(callback) {

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error('目前使用人數較多，請稍後再試一次');
  }

  try {

    const result = callback();
    SpreadsheetApp.flush();
    return result;

  } finally {

    lock.releaseLock();

  }
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

  sheet
    .getRange(startRow, 1, rows.length, width)
    .setValues(rows);

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
    allowLate: cleanText_(row[QCOL.LATE_POLICY - 1]) === LATE_POLICY.ACCEPT
  };
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

  const width = QUESTION_HEADERS.length;

  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }

  const header = sheet.getRange(1, 1, 1, width);
  const current = header.getDisplayValues()[0];
  let changed = false;

  const fixed = current.map(function(value, index) {

    if (cleanText_(value) === '') {
      changed = true;
      return QUESTION_HEADERS[index];
    }

    return value;
  });

  if (changed) {
    header.setValues([fixed]).setFontWeight('bold');
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
      : LATE_POLICY.CLOSE
  };
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

function getPublishedQuestions() {

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
      return cleanText_(row[0]) !== '' && cleanText_(row[7]) === '發布';
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
        submittedCount: submitted[q.id] || 0
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

  if (answer.length > MAX_ANSWER_LENGTH) {
    throw new Error('回答太長，請控制在 ' + MAX_ANSWER_LENGTH + ' 字以內');
  }

  const question = findQuestion_(questionId);

  if (!question) {
    throw new Error('找不到這一題');
  }

  if (question.status !== '發布') {
    throw new Error('這一題目前已停止作答');
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
    const rows = sheet.getDataRange().getValues();
    const now = new Date();

    /*
     * 同一題＋同一學號：更新原回答。
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

      // D 姓名、E 學生回答、F 送出時間
      sheet
        .getRange(rowNumber, ACOL.NAME, 1, 3)
        .setValues([[name, answer, now]]);

      // G~K 清除舊的 AI 與教師批改
      sheet
        .getRange(rowNumber, ACOL.AI_SCORE, 1, 5)
        .clearContent();

      // L 狀態、M 最後更新、N AI教師口吻評語
      sheet
        .getRange(rowNumber, ACOL.STATUS, 1, 3)
        .setValues([[initialStatus, now, '']]);

      // 回答內容變了，舊的分類也要清掉
      deleteCodingForAnswers_([answerId]);

      return { success: true, updated: true, answerId: answerId, late: late };
    }

    /*
     * 新回答
     */
    const answerId = generateId_('A');

    const rowNumber = appendRows_(sheet, [[
      answerId, questionId, '', name, answer,
      now, '', '', '', '', '', initialStatus, now, ''
    ]], ANSWER_HEADERS.length);

    // 學號設成純文字後再寫入，避免 0123 變成 123
    sheet
      .getRange(rowNumber, ACOL.STUDENT_ID)
      .setNumberFormat('@')
      .setValue(studentId);

    return { success: true, updated: false, answerId: answerId, late: late };
  });
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

  const answers = getAnswerSheet_().getDataRange().getValues();
  const questions = getQuestionSheet_().getDataRange().getValues();

  const questionMap = {};

  questions.slice(1).forEach(function(row) {

    const id = cleanText_(row[0]);

    if (id) {
      questionMap[id] = {
        title: row[1],
        points: row[3],
        deadline: toTime_(row[QCOL.DEADLINE - 1])
      };
    }
  });

  return answers
    .slice(1)
    .filter(function(row) {
      return (
        cleanText_(row[2]) === studentId &&
        cleanText_(row[3]) === name
      );
    })
    .map(function(row) {

      const questionId = cleanText_(row[1]);
      const q = questionMap[questionId] || {};

      return {
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


/* =====================================================
   教師：新增題目
===================================================== */

function createQuestion(data) {

  const q = cleanQuestionInput_(data);
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
      ''
    ]], QUESTION_HEADERS.length);

    sheet.getRange(rowNumber, QCOL.DEADLINE).setNumberFormat('yyyy/mm/dd hh:mm');

    return { success: true, id: id };
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
      .setValues([[
        q.title,
        q.content,
        q.points,
        q.referenceAnswer,
        q.rubric,
        q.enableAI ? '是' : '否',
        q.status
      ]]);

    // J 截止時間、K 截止後、L 最後修改
    sheet
      .getRange(rowNumber, QCOL.DEADLINE, 1, 3)
      .setValues([[q.deadline, q.latePolicy, new Date()]]);

    sheet.getRange(rowNumber, QCOL.DEADLINE).setNumberFormat('yyyy/mm/dd hh:mm');
    sheet.getRange(rowNumber, QCOL.UPDATED).setNumberFormat('yyyy/mm/dd hh:mm');

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
   教師：取得題目清單
===================================================== */

function getTeacherQuestions() {

  const questions = getQuestionSheet_().getDataRange().getValues();
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
        updatedAt: row[QCOL.UPDATED - 1] ? formatDate_(row[QCOL.UPDATED - 1]) : ''
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

function getTeacherAnswers(questionId) {

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

  return answers
    .slice(1)
    .filter(function(row) {

      if (!cleanText_(row[0])) {
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
        late: isLate_(row[ACOL.SUBMITTED - 1], q.deadline)
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

  return withLock_(function() {

    const sheet = getAnswerSheet_();
    const rows = sheet.getDataRange().getValues();
    const index = findRowIndex_(rows, answerId);

    if (index < 0) {
      throw new Error('找不到學生回答');
    }

    if (teacherScore !== '') {

      const question = findQuestion_(rows[index][ACOL.QUESTION_ID - 1]);
      const maxScore = question ? question.points : 0;

      if (maxScore > 0 && teacherScore > maxScore) {
        throw new Error('教師分數不能超過配分 ' + maxScore + ' 分');
      }
    }

    // J 教師分數、K 教師評語、L 狀態、M 最後更新
    sheet
      .getRange(index + 1, ACOL.TEACHER_SCORE, 1, 4)
      .setValues([[teacherScore, feedback, status, new Date()]]);

    return { success: true };
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

  if (!question.enableAI) {
    throw new Error('這一題沒有啟用 AI 批改');
  }

  if (!answerText) {
    throw new Error('這份回答是空白的');
  }

  // 呼叫 ai.gs
  const ai = gradeAnswerWithAI_(question, answerText);

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
      .setValues([[ai.score, ai.feedback, ai.confidence]]);

    // L 狀態、M 最後更新、N AI教師口吻評語
    answerSheet
      .getRange(rowNumber, ACOL.STATUS, 1, 3)
      .setValues([[newStatus, new Date(), ai.studentFeedback]]);

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

    map[answerId] = {
      rowNumber: i + 1,
      categoryId: cleanText_(row[KCOL.CATEGORY_ID - 1]),
      reason: cleanText_(row[KCOL.REASON - 1]),
      confidence: cleanText_(row[KCOL.CONFIDENCE - 1]),
      confirmed: cleanText_(row[KCOL.CONFIRMED - 1]) === '是'
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
      confirmed: k ? k.confirmed : false
    };
  });

  return {
    question: {
      id: question.id,
      title: question.title,
      content: question.content,
      points: question.points,
      status: question.status
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

  if (!findQuestion_(questionId)) {
    throw new Error('找不到題目');
  }

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
          .setValues([[category.name, category.description]]);

        sheet
          .getRange(old.rowNumber, CCOL.ORDER, 1, 2)
          .setValues([[index + 1, now]]);

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

  const question = findQuestion_(questionId);

  if (!question) {
    throw new Error('找不到題目');
  }

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
  const question = findQuestion_(questionId);

  if (!question) {
    throw new Error('找不到題目');
  }

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


function writeClassifications_(questionId, categories, batch, results) {

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

    rows.push([
      answer.answerId,
      questionId,
      result.categoryId,
      result.reason || (result.categoryId ? '' : '沒有符合的類別'),
      result.confidence,
      '否',
      now
    ]);
  });

  appendRows_(getCodingSheet_(), rows, CODING_HEADERS.length);

  return rows.length;
}


function clearUnconfirmedClassifications(questionId) {

  questionId = cleanText_(questionId);

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

    if (codingIndex >= 0) {

      const row = values[codingIndex];
      const same = cleanText_(row[KCOL.CATEGORY_ID - 1]) === categoryId;

      sheet
        .getRange(codingIndex + 1, KCOL.CATEGORY_ID, 1, 5)
        .setValues([[
          categoryId,
          same ? row[KCOL.REASON - 1] : '教師手動分類',
          same ? row[KCOL.CONFIDENCE - 1] : '',
          '是',
          now
        ]]);

    } else {

      appendRows_(
        sheet,
        [[answerId, questionId, categoryId, '教師手動分類', '', '是', now]],
        CODING_HEADERS.length
      );
    }

    return { success: true };
  });
}


/*
 * 把 AI 分類標為已確認。categoryId 空白代表整題全部確認。
 */
function confirmClassifications(questionId, categoryId) {

  questionId = cleanText_(questionId);
  categoryId = cleanText_(categoryId);

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
        .setValues([['是', now]]);

      count++;
    });

    return { count: count };
  });
}


/* =====================================================
   課堂討論：類別摘要與討論提問
===================================================== */

function summarizeCategories(questionId) {

  questionId = cleanText_(questionId);

  const question = findQuestion_(questionId);

  if (!question) {
    throw new Error('找不到題目');
  }

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
        .setValues([[
          truncate_(result.summary, 200),
          truncate_(result.discussionQuestion, 150),
          representativeOk ? result.representativeAnswerId : ''
        ]]);

      sheet.getRange(current.rowNumber, CCOL.UPDATED).setValue(now);
      count++;
    });

    return { updated: count };
  });
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

  Logger.log('教師 API 共 ' + Object.keys(handlers).length + ' 個，全部存在');
}