/*
 * 教師頁面共用的登入畫面（教師系統、課堂討論、教材庫、課程管理、帳號管理）
 *
 * 用法：頁面把「需要登入後才執行」的程式放進 TeacherAuth.ready(function () { ... })
 * 需要知道目前課程的頁面，改用 teacher-course.js 的 TeacherCourse.ready。
 *
 * 帳號密碼不寫在這裡。這個檔案在 GitHub 上是公開的，
 * 真正的檢查在 Apps Script（Code.gs 的 teacherLogin）。
 */
(function () {

  const STORAGE_KEY = 'aiclassroom_teacher_session';
  const ACCOUNT_KEY = 'aiclassroom_teacher_account';

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


  function saveSession(token, seconds, teacher) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        token: token,
        teacher: teacher || null,
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
        background: #16233a;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
      }

      .auth-card {
        width: 100%;
        max-width: 380px;
        background: #ffffff;
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 20px 50px rgba(0, 0, 0, .35);
      }

      .auth-card header {
        background: #ffffff;
        color: #1a2433;
        padding: 28px 28px 0;
      }

      .auth-card header h1 {
        margin: 0;
        font-family: "Noto Serif TC", "PMingLiU", serif;
        font-weight: 900;
        font-size: 26px;
        letter-spacing: .02em;
      }

      .auth-body { padding: 18px 28px 26px; }

      .auth-body label {
        display: block;
        font-weight: 700;
        font-size: 15px;
        margin-bottom: 6px;
        color: #1a2433;
      }

      .auth-body input + label { margin-top: 14px; }

      .auth-sub {
        margin: 6px 0 0;
        color: #4f5b6d;
        font-size: 14px;
      }

      .auth-body input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 14px;
        border: 1px solid #c3ccd9;
        border-radius: 8px;
        font-size: 17px;
        font-family: inherit;
      }

      .auth-body input:focus {
        outline: none;
        border-color: #2f5bd3;
        box-shadow: 0 0 0 3px #e8eefc;
      }

      .auth-body button {
        width: 100%;
        margin-top: 14px;
        padding: 12px;
        border: 0;
        border-radius: 8px;
        background: #2f5bd3;
        color: white;
        font-size: 16px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
      }

      .auth-body button:hover { background: #2549ad; }
      .auth-body button:disabled { opacity: .55; cursor: not-allowed; }

      .auth-body button:focus-visible,
      .auth-body a:focus-visible {
        outline: 3px solid #f2c230;
        outline-offset: 2px;
      }

      .auth-message {
        min-height: 1.5em;
        margin-top: 10px;
        color: #c0392b;
        font-weight: 700;
        font-size: 14px;
      }

      .auth-home {
        display: block;
        margin-top: 6px;
        text-align: center;
        color: #4f5b6d;
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
          <header>
            <h1>教師登入</h1>
            <p class="auth-sub">還沒有帳號，請向管理員申請。</p>
          </header>
          <div class="auth-body">
            <label for="teacherAuthAccount">帳號</label>
            <input id="teacherAuthAccount" autocomplete="username" autocapitalize="none"
              spellcheck="false" required>
            <label for="teacherAuthPassword">密碼</label>
            <input id="teacherAuthPassword" type="password"
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

    const accountInput = document.getElementById('teacherAuthAccount');
    const input = document.getElementById('teacherAuthPassword');

    if (!accountInput.value) {
      try { accountInput.value = localStorage.getItem(ACCOUNT_KEY) || ''; } catch (error) { /* 忽略 */ }
    }

    input.value = '';
    (accountInput.value ? input : accountInput).focus();
  }


  function hideOverlay() {

    const overlay = document.getElementById('teacherAuthOverlay');

    if (overlay) {
      overlay.style.display = 'none';
    }
  }


  function login() {

    const accountInput = document.getElementById('teacherAuthAccount');
    const input = document.getElementById('teacherAuthPassword');
    const button = document.getElementById('teacherAuthButton');
    const message = document.getElementById('teacherAuthMessage');

    const account = accountInput.value.trim().toLowerCase();
    const password = input.value.trim();

    if (!account || !password) {
      return;
    }

    button.disabled = true;
    button.textContent = '登入中……';
    message.textContent = '';

    google.script.run
      .withSuccessHandler(function (result) {

        saveSession(result.token, result.expiresInSeconds, result.teacher);

        try { localStorage.setItem(ACCOUNT_KEY, account); } catch (error) { /* 忽略 */ }

        const previous = window.TeacherAuth.lastAccount;

        // 換了別的帳號登入：重新載入，免得畫面還留著上一位老師的資料
        if (previous && previous !== account) {
          window.location.reload();
          return;
        }

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
      .teacherLogin({ account: account, password: password });
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

    const old = readSession();
    window.TeacherAuth.lastAccount = old && old.teacher ? old.teacher.account : '';

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

    // 登入時後端回傳的教師資料 { account, name, role, isAdmin }
    getTeacher: function () {
      const session = readSession();
      return session && session.teacher ? session.teacher : null;
    },

    lastAccount: '',

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
