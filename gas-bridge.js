/*
 * 讓放在 GitHub Pages 的網頁可以繼續使用 google.script.run 的寫法。
 * 實際上會改用 fetch 把 {fn, args} 送到 Apps Script 的 doPost。
 *
 * 如果網頁是由 Apps Script 直接提供，google.script 本來就存在，這個檔案什麼都不做。
 */
(function () {

  if (window.google && window.google.script && window.google.script.run) {
    return;
  }

  function getApiUrl() {
    const url = String(window.GAS_API_URL || '').trim();
    return /^https:\/\/script\.google\.com\/.+\/exec$/.test(url) ? url : '';
  }

  function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
  }

  function callServer(fn, args) {

    const url = getApiUrl();

    if (!url) {
      return Promise.reject(
        new Error('尚未在 config.js 設定正確的 Apps Script 網址（結尾要是 /exec）')
      );
    }

    return fetch(url, {
      method: 'POST',
      // 不自訂標頭，瀏覽器會用 text/plain 送出，才不會被 CORS 預檢擋下
      body: JSON.stringify({
        fn: fn,
        args: args,
        // 教師頁面登入後才會有；學生頁面是空字串
        token: window.TeacherAuth ? window.TeacherAuth.getToken() : ''
      }),
      redirect: 'follow'
    })
      .catch(function () {
        throw new Error(
          '無法連線到 Apps Script。請確認網址正確，而且部署時「誰可以存取」選的是「所有人」。'
        );
      })
      .then(function (response) {

        if (!response.ok) {
          throw new Error('伺服器回應錯誤（' + response.status + '）');
        }

        return response.text();
      })
      .then(function (text) {

        let data;

        try {
          data = JSON.parse(text);
        } catch (error) {
          throw new Error(
            '伺服器回傳的不是資料。請確認已建立新版本部署，而且「誰可以存取」選的是「所有人」。'
          );
        }

        if (!data.ok) {

          const err = new Error(data.error || '發生未知錯誤');
          err.code = data.code || '';

          // 教師密碼過期或未登入，通知頁面顯示登入畫面
          if (data.code === 'AUTH_REQUIRED') {
            window.dispatchEvent(new Event('aiclassroom:auth-required'));
          }

          throw err;
        }

        return data.result;
      });
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
