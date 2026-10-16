/**
 * RAG 教材庫管理（給教師網頁 rag.html 使用）
 *
 * 功能：
 * 1. 列出教材與段落數
 * 2. 從網頁上傳 PDF，自動轉換、切段，狀態為 REVIEW（待檢查）
 * 3. 老師檢查段落後，啟用、停用或封存教材
 * 4. 匯入失敗時留下紀錄，可以在網頁上重試
 *
 * 依賴：
 * RAG_Setup.gs  的 RAG_SCHEMAS、ragGetSpreadsheet_()
 * RAG_Import.gs 的 ragImportPdf_()、ragGetPdfFolder_()
 *
 * 重要：
 * 這個檔案裡「沒有底線結尾」的函式，都要加進 Code.gs 的
 * getTeacherApiHandlers_()，只有登入的老師能呼叫。
 *
 * 不修改：學生作答、題目、成績。
 * 不會永久刪除任何檔案，封存只是把狀態改成 ARCHIVED。
 */


const RAG_ADMIN_CONFIG = {

  // 網頁上傳的單一 PDF 上限（10 MB）
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,

  DOC_STATUSES: ['REVIEW', 'ACTIVE', 'ARCHIVED'],

  CHUNK_STATUSES: ['REVIEW', 'ACTIVE', 'DISABLED'],

  MAX_FIELD_LENGTH: 100

};


/* =====================================================
   共用小工具
===================================================== */

/**
 * 依欄位名稱取得欄位位置（從 0 開始）
 * 這樣欄位順序改變時，只要改 RAG_SCHEMAS。
 */
function ragCol_(sheetName, header) {

  const index = RAG_SCHEMAS[sheetName].indexOf(header);

  if (index < 0) {
    throw new Error('找不到欄位：' + sheetName + '.' + header);
  }

  return index;

}


function ragSheets_() {

  const ss = ragGetSpreadsheet_();

  const docSheet = ss.getSheetByName('Knowledge_Documents');
  const chunkSheet = ss.getSheetByName('Knowledge_Chunks');

  if (!docSheet || !chunkSheet) {
    throw new Error('RAG 工作表不存在，請先執行 setupRAGDatabase');
  }

  return {
    ss: ss,
    docSheet: docSheet,
    chunkSheet: chunkSheet
  };

}


function ragFormatTime_(value) {

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy/MM/dd HH:mm'
    );
  }

  return String(value || '');

}


function ragCleanField_(value) {

  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .substring(0, RAG_ADMIN_CONFIG.MAX_FIELD_LENGTH);

}


/**
 * 找出某個 ID 在第幾列（試算表列號，從 1 開始）
 * 找不到回傳 0。
 */
function ragFindRow_(sheet, colIndex, id) {

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return 0;

  const values = sheet
    .getRange(2, colIndex + 1, lastRow - 1, 1)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === id) {
      return i + 2;
    }
  }

  return 0;

}


function ragWithLock_(fn) {

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error('教材庫正在處理其他工作，請稍後再試');
  }

  try {
    return fn();
  } finally {
    lock.releaseLock();
  }

}


/**
 * 把檔案移到垃圾桶（可在 Drive 還原），失敗不影響主流程。
 * RAG_Import.gs 的修正也會用到這個函式。
 */
function ragTrashQuietly_(fileId) {

  try {
    if (fileId) {
      DriveApp.getFileById(fileId).setTrashed(true);
    }
  } catch (error) {
    Logger.log('無法移除暫存文件：' + error.message);
  }

}


function ragRequireDocId_(docId) {

  docId = String(docId || '').trim();

  if (!/^DOC_[\w-]+$/.test(docId)) {
    throw new Error('教材 ID 格式不正確');
  }

  return docId;

}


/* =====================================================
   讀取
===================================================== */

/**
 * 教材清單（最新的在最前面）
 */
function ragListDocuments() {

  const s = ragSheets_();

  const docRows = s.docSheet.getLastRow() > 1
    ? s.docSheet.getRange(
        2, 1,
        s.docSheet.getLastRow() - 1,
        RAG_SCHEMAS.Knowledge_Documents.length
      ).getValues()
    : [];

  // 只讀 docId 與 status 兩欄，避免把全部教材內文讀進來
  const counts = {};
  const chunkLast = s.chunkSheet.getLastRow();

  if (chunkLast > 1) {

    const n = chunkLast - 1;

    const docIds = s.chunkSheet
      .getRange(2, ragCol_('Knowledge_Chunks', 'docId') + 1, n, 1)
      .getValues();

    const statuses = s.chunkSheet
      .getRange(2, ragCol_('Knowledge_Chunks', 'status') + 1, n, 1)
      .getValues();

    for (let i = 0; i < n; i++) {

      const docId = String(docIds[i][0] || '').trim();
      if (!docId) continue;

      const status = String(statuses[i][0] || '').trim();

      if (!counts[docId]) {
        counts[docId] = { total: 0, ACTIVE: 0, REVIEW: 0, DISABLED: 0 };
      }

      counts[docId].total++;

      if (counts[docId][status] !== undefined) {
        counts[docId][status]++;
      }

    }

  }

  const C = function(h) { return ragCol_('Knowledge_Documents', h); };

  return docRows
    .filter(function(row) {
      return String(row[C('docId')] || '').trim();
    })
    .map(function(row) {

      const docId = String(row[C('docId')]).trim();

      return {
        docId: docId,
        title: String(row[C('title')] || ''),
        course: String(row[C('course')] || ''),
        unit: String(row[C('unit')] || ''),
        status: String(row[C('status')] || '').trim(),
        updatedAt: ragFormatTime_(row[C('updatedAt')]),
        indexedAt: ragFormatTime_(row[C('indexedAt')]),
        errorMessage: String(row[C('errorMessage')] || ''),
        chunks: counts[docId] || { total: 0, ACTIVE: 0, REVIEW: 0, DISABLED: 0 }
      };

    })
    .reverse();

}


/**
 * 單一教材的完整內容（含所有段落）
 */
function ragGetDocumentDetail(docId) {

  docId = ragRequireDocId_(docId);

  const s = ragSheets_();

  const docRowNumber = ragFindRow_(
    s.docSheet,
    ragCol_('Knowledge_Documents', 'docId'),
    docId
  );

  if (!docRowNumber) {
    throw new Error('找不到這份教材，可能已被移除');
  }

  const row = s.docSheet
    .getRange(docRowNumber, 1, 1, RAG_SCHEMAS.Knowledge_Documents.length)
    .getValues()[0];

  const D = function(h) { return ragCol_('Knowledge_Documents', h); };
  const K = function(h) { return ragCol_('Knowledge_Chunks', h); };

  const chunks = s.chunkSheet.getLastRow() > 1
    ? s.chunkSheet
        .getRange(
          2, 1,
          s.chunkSheet.getLastRow() - 1,
          RAG_SCHEMAS.Knowledge_Chunks.length
        )
        .getValues()
        .filter(function(c) {
          return String(c[K('docId')]).trim() === docId;
        })
        .map(function(c) {
          return {
            chunkId: String(c[K('chunkId')]).trim(),
            chunkIndex: Number(c[K('chunkIndex')]) || 0,
            status: String(c[K('status')] || '').trim(),
            content: String(c[K('content')] || '')
          };
        })
        .sort(function(a, b) { return a.chunkIndex - b.chunkIndex; })
    : [];

  const driveFileId = String(row[D('driveFileId')] || '');

  return {
    docId: docId,
    title: String(row[D('title')] || ''),
    course: String(row[D('course')] || ''),
    unit: String(row[D('unit')] || ''),
    status: String(row[D('status')] || '').trim(),
    updatedAt: ragFormatTime_(row[D('updatedAt')]),
    errorMessage: String(row[D('errorMessage')] || ''),
    pdfUrl: driveFileId
      ? 'https://drive.google.com/file/d/' + driveFileId + '/view'
      : '',
    chunks: chunks
  };

}


/* =====================================================
   上傳與匯入
===================================================== */

/**
 * 從網頁上傳一份 PDF
 *
 * fileName：原始檔名
 * base64Data：PDF 內容（base64，可含 data: 開頭）
 */
function ragUploadPdf(fileName, base64Data) {

  fileName = String(fileName || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
    .trim()
    .substring(0, 150);

  if (!fileName) {
    throw new Error('缺少檔名');
  }

  if (!/\.pdf$/i.test(fileName)) {
    fileName += '.pdf';
  }

  const data = String(base64Data || '')
    .replace(/^data:[^,]*,/, '')
    .replace(/\s/g, '');

  if (!data) {
    throw new Error('檔案內容是空的');
  }

  // base64 長度約為原始大小的 4/3，先粗略擋掉太大的檔案
  if (data.length * 0.75 > RAG_ADMIN_CONFIG.MAX_UPLOAD_BYTES + 1024) {
    throw new Error('檔案超過 10 MB，請先分冊或壓縮後再上傳');
  }

  const bytes = Utilities.base64Decode(data);

  if (bytes.length > RAG_ADMIN_CONFIG.MAX_UPLOAD_BYTES) {
    throw new Error('檔案超過 10 MB，請先分冊或壓縮後再上傳');
  }

  // PDF 檔案一定以「%PDF」開頭
  if (
    bytes.length < 5 ||
    bytes[0] !== 0x25 || bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 || bytes[3] !== 0x46
  ) {
    throw new Error('檔案內容不是 PDF');
  }

  const hash = ragBytesToHex_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes)
  );

  // 同一份 PDF 不重複匯入
  const duplicate = ragFindDocumentByHash_(hash);

  if (duplicate) {
    throw new Error(
      '這份 PDF 已經上傳過（' + duplicate.title +
      '，狀態：' + duplicate.status + '）'
    );
  }

  const blob = Utilities.newBlob(bytes, MimeType.PDF, fileName);

  const file = ragGetPdfFolder_().createFile(blob);

  return ragImportFileSafely_(file, hash);

}


/**
 * 重試匯入失敗的教材
 */
function ragRetryDocument(docId) {

  docId = ragRequireDocId_(docId);

  const s = ragSheets_();
  const D = function(h) { return ragCol_('Knowledge_Documents', h); };

  const info = ragWithLock_(function() {

    const rowNumber = ragFindRow_(s.docSheet, D('docId'), docId);

    if (!rowNumber) {
      throw new Error('找不到這份教材');
    }

    const row = s.docSheet
      .getRange(rowNumber, 1, 1, RAG_SCHEMAS.Knowledge_Documents.length)
      .getValues()[0];

    if (String(row[D('status')]).trim() !== 'FAILED') {
      throw new Error('只有「匯入失敗」的教材可以重試');
    }

    // 移除失敗紀錄，讓 ragImportPdf_ 可以重新建立
    s.docSheet.deleteRow(rowNumber);

    return {
      driveFileId: String(row[D('driveFileId')] || ''),
      hash: String(row[D('sourceHash')] || '')
    };

  });

  let file;

  try {
    file = DriveApp.getFileById(info.driveFileId);
  } catch (error) {
    throw new Error('找不到原始 PDF，可能已從 Drive 刪除，請重新上傳');
  }

  return ragImportFileSafely_(file, info.hash);

}


/**
 * 執行匯入；失敗時寫入 FAILED 紀錄，讓老師在網頁上看得到原因。
 */
function ragImportFileSafely_(file, hash) {

  const docId = 'DOC_' + file.getId();

  let result;

  try {

    result = ragImportPdf_(file);

  } catch (error) {

    ragRecordFailure_(file, hash, error.message);

    return {
      status: 'FAILED',
      docId: docId,
      title: file.getName(),
      message: error.message
    };

  }

  // 補上檔案指紋，之後用來擋重複上傳
  if (hash) {

    const s = ragSheets_();

    ragWithLock_(function() {

      const rowNumber = ragFindRow_(
        s.docSheet,
        ragCol_('Knowledge_Documents', 'docId'),
        docId
      );

      if (rowNumber) {
        s.docSheet
          .getRange(rowNumber, ragCol_('Knowledge_Documents', 'sourceHash') + 1)
          .setValue(hash);
      }

    });

  }

  return {
    status: result.status,
    docId: docId,
    title: file.getName(),
    chunks: result.chunks || 0
  };

}


function ragRecordFailure_(file, hash, message) {

  const s = ragSheets_();
  const docId = 'DOC_' + file.getId();
  const now = new Date();

  ragWithLock_(function() {

    // 已有紀錄就不重複寫
    if (ragFindRow_(s.docSheet, ragCol_('Knowledge_Documents', 'docId'), docId)) {
      return;
    }

    const row = RAG_SCHEMAS.Knowledge_Documents.map(function(header) {

      switch (header) {
        case 'docId': return docId;
        case 'title': return file.getName();
        case 'driveFileId': return file.getId();
        case 'mimeType': return file.getMimeType();
        case 'version': return 1;
        case 'status': return 'FAILED';
        case 'updatedAt': return now;
        case 'sourceHash': return hash || '';
        case 'errorMessage': return String(message || '').substring(0, 500);
        default: return '';
      }

    });

    s.docSheet
      .getRange(s.docSheet.getLastRow() + 1, 1, 1, row.length)
      .setValues([row]);

  });

}


function ragFindDocumentByHash_(hash) {

  const s = ragSheets_();

  if (s.docSheet.getLastRow() < 2) return null;

  const D = function(h) { return ragCol_('Knowledge_Documents', h); };

  const rows = s.docSheet
    .getRange(2, 1, s.docSheet.getLastRow() - 1, RAG_SCHEMAS.Knowledge_Documents.length)
    .getValues();

  const found = rows.find(function(row) {
    return String(row[D('sourceHash')] || '').trim() === hash;
  });

  return found
    ? { title: String(found[D('title')]), status: String(found[D('status')]) }
    : null;

}


function ragBytesToHex_(bytes) {

  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');

}


/* =====================================================
   修改
===================================================== */

/**
 * 修改教材名稱、課程、單元
 */
function ragUpdateDocumentInfo(docId, info) {

  docId = ragRequireDocId_(docId);
  info = info || {};

  const title = ragCleanField_(info.title);

  if (!title) {
    throw new Error('教材名稱不可空白');
  }

  const s = ragSheets_();
  const D = function(h) { return ragCol_('Knowledge_Documents', h); };

  return ragWithLock_(function() {

    const rowNumber = ragFindRow_(s.docSheet, D('docId'), docId);

    if (!rowNumber) {
      throw new Error('找不到這份教材');
    }

    s.docSheet.getRange(rowNumber, D('title') + 1).setValue(title);
    s.docSheet.getRange(rowNumber, D('course') + 1).setValue(ragCleanField_(info.course));
    s.docSheet.getRange(rowNumber, D('unit') + 1).setValue(ragCleanField_(info.unit));
    s.docSheet.getRange(rowNumber, D('updatedAt') + 1).setValue(new Date());

    return { success: true };

  });

}


/**
 * 改變教材狀態
 *
 * ACTIVE：開始使用。這份教材中「待檢查」的段落會一起啟用，
 *         老師設成「不使用」的段落維持不使用。
 * REVIEW：暫停使用，回到待檢查。
 * ARCHIVED：封存，AI 助理不會再讀到。
 */
function ragSetDocumentStatus(docId, status) {

  docId = ragRequireDocId_(docId);
  status = String(status || '').trim();

  if (RAG_ADMIN_CONFIG.DOC_STATUSES.indexOf(status) < 0) {
    throw new Error('不支援的教材狀態');
  }

  const s = ragSheets_();
  const D = function(h) { return ragCol_('Knowledge_Documents', h); };
  const K = function(h) { return ragCol_('Knowledge_Chunks', h); };

  return ragWithLock_(function() {

    const rowNumber = ragFindRow_(s.docSheet, D('docId'), docId);

    if (!rowNumber) {
      throw new Error('找不到這份教材');
    }

    const current = String(
      s.docSheet.getRange(rowNumber, D('status') + 1).getValue()
    ).trim();

    if (current === 'FAILED' && status !== 'ARCHIVED') {
      throw new Error('匯入失敗的教材請先重試匯入');
    }

    let activated = 0;

    if (status === 'ACTIVE') {

      const last = s.chunkSheet.getLastRow();

      if (last < 2) {
        throw new Error('這份教材沒有任何段落');
      }

      const n = last - 1;

      const docIds = s.chunkSheet.getRange(2, K('docId') + 1, n, 1).getValues();
      const statusRange = s.chunkSheet.getRange(2, K('status') + 1, n, 1);
      const statuses = statusRange.getValues();

      let usable = 0;
      let changed = false;

      for (let i = 0; i < n; i++) {

        if (String(docIds[i][0]).trim() !== docId) continue;

        const st = String(statuses[i][0]).trim();

        if (st === 'REVIEW') {
          statuses[i][0] = 'ACTIVE';
          changed = true;
          activated++;
        }

        if (statuses[i][0] === 'ACTIVE') {
          usable++;
        }

      }

      if (!usable) {
        throw new Error('這份教材的段落都設成「不使用」，至少要保留一段');
      }

      if (changed) {
        statusRange.setValues(statuses);
      }

    }

    s.docSheet.getRange(rowNumber, D('status') + 1).setValue(status);
    s.docSheet.getRange(rowNumber, D('updatedAt') + 1).setValue(new Date());

    return {
      success: true,
      status: status,
      activatedChunks: activated
    };

  });

}


/**
 * 改變單一段落狀態
 * 例如目錄、版權頁、轉換後亂碼的段落，可以設成 DISABLED。
 */
function ragSetChunkStatus(chunkId, status) {

  chunkId = String(chunkId || '').trim();
  status = String(status || '').trim();

  if (!/^DOC_[\w-]+_C\d+$/.test(chunkId)) {
    throw new Error('段落 ID 格式不正確');
  }

  if (RAG_ADMIN_CONFIG.CHUNK_STATUSES.indexOf(status) < 0) {
    throw new Error('不支援的段落狀態');
  }

  const s = ragSheets_();
  const K = function(h) { return ragCol_('Knowledge_Chunks', h); };

  return ragWithLock_(function() {

    const rowNumber = ragFindRow_(s.chunkSheet, K('chunkId'), chunkId);

    if (!rowNumber) {
      throw new Error('找不到這個段落');
    }

    s.chunkSheet.getRange(rowNumber, K('status') + 1).setValue(status);
    s.chunkSheet.getRange(rowNumber, K('updatedAt') + 1).setValue(new Date());

    return { success: true, chunkId: chunkId, status: status };

  });

}


/* =====================================================
   測試（在 Apps Script 編輯器直接執行）
===================================================== */

function testRAGAdminList() {

  const docs = ragListDocuments();

  Logger.log('教材數：' + docs.length);

  docs.forEach(function(d) {
    Logger.log(
      d.title + '｜' + d.status +
      '｜段落 ' + d.chunks.total +
      '（使用中 ' + d.chunks.ACTIVE + '）'
    );
  });

}