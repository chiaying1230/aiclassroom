/*
 * 讓放在 GitHub Pages 的網頁可以繼續使用 google.script.run 的寫法。
 * 實際上會改用 fetch 把 {fn, args} 送到 Apps Script 的 doPost。
 *
 * 如果網頁是由 Apps Script 直接提供，google.script 本來就存在，這個檔案什麼都不做。
 *
 * 連線的處理：
 * - 逾時：一般功能 90 秒，AI 或大量處理的功能 6 分鐘（Apps Script 本身最多跑 6 分鐘）。
 * - 自動重試（最多 2 次，間隔約 1.5 秒、4 秒）只在「確定不會重複寫入」時：
 *   1. 伺服器明確表示沒有執行（同時使用的人太多、資料正在被別人寫入）
 *   2. 只讀資料的功能（get…、list… 等）遇到網路中斷或伺服器暫時錯誤
 *   送出回答這類會寫入的功能，網路中斷時不自動重送，避免重複寫入。
 * - 離線、逾時、Apps Script 的錯誤頁面，都換成看得懂的訊息。
 */
(function () {

  if (window.google && window.google.script && window.google.script.run) {
    return;
  }

  const NORMAL_TIMEOUT_MS = 90 * 1000;
  const LONG_TIMEOUT_MS = 6 * 60 * 1000;
  const RETRY_DELAYS_MS = [1500, 4000];

  // 會呼叫 AI 或一次處理很多資料，需要比較久的功能
  const LONG_RUNNING = {
    runAIReview: true, suggestCategories: true, classifyAnswers: true, summarizeCategories: true,
    setQuestionAutoClassify: true, runAutoClassifyNow: true, requestInstantFeedback: true,
    previewInstantFeedback: true, previewRAGForTeacher: true, ragChat: true, ragUploadPdf: true,
    ragRetryDocument: true, copyQuestions: true, analyzeQuestionLearning: true
  };

  // 只讀資料、重送也不會改到任何東西的功能
  const SAFE_TO_REPEAT = {
    getCourseByCode: true, getPublishedQuestions: true, getStudentResults: true,
    requestInstantFeedback: true, // 已經產生過就直接回傳存好的
    teacherLogout: true, ragListDocuments: true, ragGetDocumentDetail: true
  };

  function isSafeToRepeat(fn) {
    return SAFE_TO_REPEAT[fn] === true || /^(get|list)[A-Z]/.test(fn);
  }

  function getApiUrl() {
    const url = String(window.GAS_API_URL || '').trim();
    return /^https:\/\/script\.google\.com\/.+\/exec$/.test(url) ? url : '';
  }

  function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
  }

  function makeError(message, kind, code) {
    const err = new Error(message);
    err.kind = kind || '';   // network、timeout、busy、server、app
    err.code = code || '';
    return err;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms + Math.floor(Math.random() * 400)); });
  }


  /*
   * Apps Script 有時回傳的不是資料，而是 Google 的錯誤頁面。依內容判斷原因。
   */
  function explainNonJson(text, status) {

    const t = String(text || '');

    if (/too many simultaneous invocations|Service invoked too many times|同時.{0,6}次數過多|叫用次數過多/i.test(t)) {
      return makeError('現在同時使用的人比較多，請稍等幾秒再試一次。', 'busy');
    }

    if (/Exceeded maximum execution time|超過.{0,4}執行時間/i.test(t)) {
      return makeError('伺服器處理太久被中斷了。請重新整理頁面確認結果，必要時再試一次。', 'server');
    }

    if (status >= 500 || /error|錯誤/i.test(t)) {
      return makeError('伺服器暫時發生錯誤，請稍後再試一次。', 'server');
    }

    return makeError(
      '伺服器回傳的不是資料。請確認 Apps Script 已建立新版本部署，而且「誰可以存取」選的是「所有人」。',
      'app'
    );
  }


  /*
   * 送出一次請求，不重試。
   */
  function requestOnce(url, fn, args) {

    if (navigator.onLine === false) {
      return Promise.reject(makeError('目前沒有網路連線，請確認網路後再試一次。', 'network'));
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    // window.GAS_TIMEOUT_MS 只給測試用，平常不用設定
    const timeoutMs = Number(window.GAS_TIMEOUT_MS) || (LONG_RUNNING[fn] ? LONG_TIMEOUT_MS : NORMAL_TIMEOUT_MS);
    let timedOut = false;

    const timer = setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
    }, timeoutMs);

    return fetch(url, {
      method: 'POST',
      // 不自訂標頭，瀏覽器會用 text/plain 送出，才不會被 CORS 預檢擋下
      body: JSON.stringify({
        fn: fn,
        args: args,
        // 教師頁面登入後才會有；學生頁面是空字串
        token: window.TeacherAuth ? window.TeacherAuth.getToken() : ''
      }),
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    })
      .then(
        function (response) {
          return response.text().then(function (text) {
            return { status: response.status, ok: response.ok, text: text };
          });
        },
        function () {
          if (timedOut) {
            throw makeError(
              '伺服器太久沒有回應。' + (isSafeToRepeat(fn) ? '請再試一次。' : '請重新整理頁面確認有沒有成功，再決定要不要重送。'),
              'timeout'
            );
          }
          throw makeError(
            navigator.onLine === false
              ? '網路連線中斷了，請確認網路後再試一次。'
              : '無法連線到伺服器，請確認網路正常後再試一次。如果一直出現，請確認 Apps Script 部署的「誰可以存取」是「所有人」。',
            'network'
          );
        }
      )
      .then(function (res) {

        clearTimeout(timer);

        let data;

        try {
          data = JSON.parse(res.text);
        } catch (error) {
          throw explainNonJson(res.text, res.status);
        }

        if (!data || typeof data !== 'object') {
          throw explainNonJson(res.text, res.status);
        }

        if (!data.ok) {

          // 後端拿不到鎖：代表還沒寫入任何資料，可以安全重試
          const busy = /目前使用人數較多|正在處理其他工作/.test(data.error || '');
          const err = makeError(data.error || '發生未知錯誤', busy ? 'busy' : 'app', data.code || '');

          // 教師登入過期或未登入，通知頁面顯示登入畫面
          if (data.code === 'AUTH_REQUIRED') {
            window.dispatchEvent(new Event('aiclassroom:auth-required'));
          }

          throw err;
        }

        return data.result;
      })
      .catch(function (error) {
        clearTimeout(timer);
        throw error;
      });
  }


  function shouldRetry(fn, error) {

    if (error.kind === 'busy') {
      return true;                         // 伺服器沒有執行，重送安全
    }

    if (error.kind === 'network' && navigator.onLine === false) {
      return false;                        // 離線時重試也沒用
    }

    return (error.kind === 'network' || error.kind === 'server') && isSafeToRepeat(fn);
  }


  function callServer(fn, args) {

    const url = getApiUrl();

    if (!url) {
      return Promise.reject(
        new Error('尚未在 config.js 設定正確的 Apps Script 網址（結尾要是 /exec）')
      );
    }

    let attempt = 0;

    function tryOnce() {
      return requestOnce(url, fn, args).catch(function (error) {
        if (attempt < RETRY_DELAYS_MS.length && shouldRetry(fn, error)) {
          const delay = RETRY_DELAYS_MS[attempt];
          attempt++;
          return sleep(delay).then(tryOnce);
        }
        throw error;
      });
    }

    return tryOnce();
  }

  function makeRunner(onSuccess, onFailure) {

    return new Proxy({}, {

      get: function (target, prop) {

        if (prop === 'withSuccessHandler') {
          return function (handler) {
            return makeRunner(handler, onFailure);
          };
        }

        if (prop === 'withFailureHandler') {
          return function (handler) {
            return makeRunner(onSuccess, handler);
          };
        }

        if (prop === 'withUserObject') {
          return function () {
            return makeRunner(onSuccess, onFailure);
          };
        }

        if (typeof prop !== 'string') {
          return undefined;
        }

        return function () {

          const args = Array.prototype.slice.call(arguments);

          callServer(prop, args).then(
            function (result) {
              if (onSuccess) onSuccess(result);
            },
            function (error) {
              const err = toError(error);
              if (onFailure) onFailure(err);
              else console.error(err);
            }
          );
        };
      }
    });
  }

  window.google = window.google || {};

  window.google.script = {

    run: makeRunner(null, null),

    url: {
      getLocation: function (callback) {

        const parameter = {};

        new URLSearchParams(window.location.search).forEach(function (value, key) {
          parameter[key] = value;
        });

        callback({
          parameter: parameter,
          hash: window.location.hash.replace(/^#/, '')
        });
      }
    }
  };

})();
