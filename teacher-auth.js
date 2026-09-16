/*
 * 教師頁面共用的登入畫面（teacher.html、discuss.html）
 *
 * 用法：頁面把「需要登入後才執行」的程式放進 TeacherAuth.ready(function () { ... })
 *
 * 密碼不寫在這裡。這個檔案在 GitHub 上是公開的，
 * 真正的密碼檢查在 Apps Script（Code.gs 的 teacherLogin）。
 */
(function () {

  const STORAGE_KEY = 'aiclassroom_teacher_session';

  const callbacks = [];
  let isReady = false;
  let wasReadyOnce = false;


  function readSession() {
    try {
      const session = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (session && session.token && session.expiresAt > Date.now()) {
        return session;
      }
    } catch (error) {
      // 讀不到就當作沒登入
    }
    return null;
  }


  function saveSession(token, seconds) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        token: token,
        expiresAt: Date.now() + (seconds - 60) * 1000
      }));
    } catch (error) {
      // 無法儲存時，這一頁仍可使用，只是換頁要重新登入
    }
  }


  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // 忽略
    }
  }


  function getToken() {
    const session = readSession();
    return session ? session.token : '';
  }


  function markReady() {

    isReady = true;
    wasReadyOnce = true;
    hideOverlay();

    callbacks.splice(0).forEach(function (callback) {
      callback();
    });
  }


  /* ---------- 登入畫面 ---------- */

  function injectStyles() {

    if (document.getElementById('teacher-auth-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'teacher-auth-style';
    style.textContent = `
      .auth-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: #f4f6fb;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif;
      }

      .auth-card {
        width: 100%;
        max-width: 380px;
        background: white;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .08);
      }

      .auth-card header {
        background: #27366d;
        color: white;
        padding: 22px 24px;
      }

      .auth-card header h1 {
        margin: 0;
        font-size: 22px;
      }

      .auth-body { padding: 22px 24px 24px; }

      .auth-body label {
        display: block;
        font-weight: bold;
        margin-bottom: 6px;
        color: #263149;
      }

      .auth-body input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px;
        border: 2px solid #dfe4ee;
        border-radius: 8px;
        font-size: 18px;
        font-family: inherit;
        letter-spacing: .2em;
      }

      .auth-body button {
        width: 100%;
        margin-top: 14px;
        padding: 12px;
        border: 0;
        border-radius: 8px;
        background: #5268e8;
        color: white;
        font-size: 16px;
        font-family: inherit;
        cursor: pointer;
      }

      .auth-body button:disabled { opacity: .55; cursor: not-allowed; }

      .auth-body input:focus-visible,
      .auth-body button:focus-visible,
      .auth-body a:focus-visible {
        outline: 3px solid #f0b429;
        outline-offset: 2px;
      }

      .auth-message {
        min-height: 1.5em;
        margin-top: 10px;
        color: #d94b4b;
        font-weight: bold;
        font-size: 14px;
      }

      .auth-home {
        display: block;
        margin-top: 6px;
        text-align: center;
        color: #70798c;
        font-size: 14px;
      }
    `;

    document.head.appendChild(style);
  }


  function showOverlay(message) {

    injectStyles();

    let overlay = document.getElementById('teacherAuthOverlay');

    if (!overlay) {

      overlay = document.createElement('div');
      overlay.id = 'teacherAuthOverlay';
      overlay.className = 'auth-overlay';

      overlay.innerHTML = `
        <form class="auth-card" id="teacherAuthForm">
          <header><h1>👩‍🏫 教師登入</h1></header>
          <div class="auth-body">
            <label for="teacherAuthPassword">教師密碼</label>
            <input id="teacherAuthPassword" type="password" inputmode="numeric"
              autocomplete="current-password" required>
            <button type="submit" id="teacherAuthButton">登入</button>
            <div class="auth-message" id="teacherAuthMessage" role="alert"></div>
            <a class="auth-home" href="index.html">回到首頁</a>
          </div>
        </form>
      `;

      document.body.appendChild(overlay);

      document.getElementById('teacherAuthForm').addEventListener('submit', function (event) {
        event.preventDefault();
        login();
      });
    }

    overlay.style.display = 'flex';
    document.getElementById('teacherAuthMessage').textContent = message || '';

    const input = document.getElementById('teacherAuthPassword');
    input.value = '';
    input.focus();
  }


  function hideOverlay() {

    const overlay = document.getElementById('teacherAuthOverlay');

    if (overlay) {
      overlay.style.display = 'none';
    }
  }


  function login() {

    const input = document.getElementById('teacherAuthPassword');
    const button = document.getElementById('teacherAuthButton');
    const message = document.getElementById('teacherAuthMessage');

    const password = input.value.trim();

    if (!password) {
      return;
    }

    button.disabled = true;
    button.textContent = '登入中……';
    message.textContent = '';

    google.script.run
      .withSuccessHandler(function (result) {

        saveSession(result.token, result.expiresInSeconds);

        if (wasReadyOnce) {
          // 使用途中過期：重新載入，確保畫面資料是最新的
          window.location.reload();
          return;
        }

        markReady();
      })
      .withFailureHandler(function (error) {

        button.disabled = false;
        button.textContent = '登入';
        message.textContent = error.message;

        input.select();
      })
      .teacherLogin(password);
  }


  function logout() {

    const token = getToken();

    clearSession();

    if (token && window.google && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function () { window.location.reload(); })
        .withFailureHandler(function () { window.location.reload(); })
        .teacherLogout(token);
    } else {
      window.location.reload();
    }
  }


  window.addEventListener('aiclassroom:auth-required', function () {

    clearSession();

    if (isReady) {
      isReady = false;
      showOverlay('登入已過期，請重新輸入密碼');
    }
  });


  document.addEventListener('DOMContentLoaded', function () {

    if (readSession()) {
      markReady();
    } else {
      showOverlay('');
    }
  });


  window.TeacherAuth = {

    getToken: getToken,

    logout: logout,

    ready: function (callback) {
      if (isReady) {
        callback();
      } else {
        callbacks.push(callback);
      }
    }
  };

})();
