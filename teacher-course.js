/*
 * 教師頁面共用：目前選的課程
 *
 * 載入順序：config.js → gas-bridge.js → teacher-auth.js → teacher-course.js
 *
 * 用法：
 *   TeacherCourse.ready(function (ctx) {
 *     // ctx.course   目前的課程（還沒有任何課程時是 null）
 *     // ctx.courses  看得到的所有課程
 *     // ctx.teacher  { account, name, role, isAdmin }
 *     // ctx.config   getTeacherConfig 的結果
 *     loadQuestions();
 *   });
 *   TeacherCourse.id()        目前課程的 ID，呼叫後端時帶上
 *   TeacherCourse.refresh()   課程有新增或修改時，重新讀取並更新左側選單
 *
 * 左側選單會多一個「目前課程」下拉選單，切換後重新載入頁面。
 * 選擇存在這台電腦，所以教師系統、課堂討論、教材庫會是同一門課。
 *
 * 只要頁面的 <body> 沒有 data-course-optional，
 * 老師還沒有課程時會在頁面最上方提醒他先建立課程。
 */
(function () {

  const STORAGE_KEY = 'aiclassroom_teacher_course';

  const state = {
    loaded: false,
    course: null,
    courses: [],
    teacher: null,
    config: null
  };

  const callbacks = [];
  let renderTries = 0;


  function api(fn) {
    const args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      const runner = google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(function (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      runner[fn].apply(runner, args);
    });
  }


  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }


  function savedId() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (error) { return ''; }
  }


  function saveId(id) {
    try { localStorage.setItem(STORAGE_KEY, id || ''); } catch (error) { /* 忽略 */ }
  }


  /*
   * 選哪一門課：上次選的 → 自己開放中的課 → 任何開放中的課 → 第一門
   */
  function pickCourse(courses) {

    const remembered = courses.find(function (c) { return c.id === savedId(); });

    return remembered ||
      courses.find(function (c) { return c.mine && !c.archived; }) ||
      courses.find(function (c) { return !c.archived; }) ||
      courses[0] ||
      null;
  }


  function load() {

    return Promise.all([api('getTeacherConfig'), api('getMyCourses')])
      .then(function (results) {

        state.config = results[0] || {};
        state.teacher = state.config.teacher || null;
        state.courses = results[1] || [];
        state.course = pickCourse(state.courses);

        if (state.course) saveId(state.course.id);

        render();

        if (!state.loaded) {
          state.loaded = true;
          callbacks.splice(0).forEach(function (callback) { callback(context()); });
        }
      })
      .catch(function (error) {
        showBanner(
          '<strong>讀取課程失敗</strong><span>' + escapeHtml(error.message) + '</span>' +
          '<button type="button" onclick="location.reload()">重新載入</button>',
          'error'
        );
      });
  }


  function context() {
    return {
      course: state.course,
      courses: state.courses,
      teacher: state.teacher,
      config: state.config
    };
  }


  /* ---------- 左側選單：目前課程、登入者 ---------- */

  function render() {

    const side = document.querySelector('.shell-side');

    if (!side) {
      // 左側選單還沒產生（shell.js 是 defer 載入），稍等再試
      renderTries = (renderTries || 0) + 1;
      if (renderTries < 50) setTimeout(render, 100);
      else renderEmptyNotice();
      return;
    }

    renderSwitcher(side);
    renderUser(side);
    renderEmptyNotice();
  }


  function courseLabel(c) {
    return c.name + (c.archived ? '（已封存）' : '');
  }


  function renderSwitcher(side) {

    let box = side.querySelector('.shell-course');

    if (!box) {
      box = document.createElement('div');
      box.className = 'shell-course';
      side.querySelector('.shell-brand').insertAdjacentElement('afterend', box);
    }

    if (!state.courses.length) {
      box.innerHTML =
        '<span class="shell-course-label">目前課程</span>' +
        '<p class="shell-course-none">還沒有課程</p>' +
        '<a class="shell-course-link" href="courses.html">＋ 建立第一門課程</a>';
      return;
    }

    const mine = state.courses.filter(function (c) { return c.mine; });
    const others = state.courses.filter(function (c) { return !c.mine; });

    const option = function (c) {
      return '<option value="' + escapeHtml(c.id) + '"' +
        (state.course && state.course.id === c.id ? ' selected' : '') + '>' +
        escapeHtml(courseLabel(c)) + (c.mine ? '' : '（' + escapeHtml(c.ownerName) + '）') +
        '</option>';
    };

    const options = others.length && mine.length
      ? '<optgroup label="我的課程">' + mine.map(option).join('') + '</optgroup>' +
        '<optgroup label="其他教師的課程">' + others.map(option).join('') + '</optgroup>'
      : state.courses.map(option).join('');

    box.innerHTML =
      '<label class="shell-course-label" for="shellCourseSelect">目前課程</label>' +
      '<select id="shellCourseSelect" class="shell-course-select">' + options + '</select>' +
      (state.course ? '<span class="shell-course-code">加入代碼 <b>' + escapeHtml(state.course.code) + '</b></span>' : '');

    box.querySelector('select').addEventListener('change', function (event) {

      const id = event.target.value;

      if (typeof window.TeacherCourseBeforeChange === 'function' &&
          window.TeacherCourseBeforeChange() === false) {
        event.target.value = state.course ? state.course.id : '';
        return;
      }

      saveId(id);
      window.location.reload();
    });
  }


  function renderUser(side) {

    if (!state.teacher) return;

    const foot = side.querySelector('.shell-foot');

    if (!foot) return;

    let box = foot.querySelector('.shell-user');

    if (!box) {
      box = document.createElement('div');
      box.className = 'shell-user';
      foot.insertBefore(box, foot.firstChild);
    }

    box.innerHTML =
      '<span class="shell-icon" aria-hidden="true">' + escapeHtml(state.teacher.name.charAt(0) || '師') + '</span>' +
      '<span class="shell-text"><b>' + escapeHtml(state.teacher.name) + '</b>' +
      '<small>' + escapeHtml(state.teacher.account + (state.teacher.isAdmin && state.teacher.account !== 'admin' ? '・管理員' : '')) + '</small></span>' +
      '<button type="button" class="shell-logout" title="登出">登出</button>';

    box.querySelector('.shell-logout').addEventListener('click', function () {
      window.TeacherAuth.logout();
    });
  }


  /* ---------- 頁面最上方的提醒 ---------- */

  function showBanner(html, kind) {

    let banner = document.getElementById('courseBanner');

    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'courseBanner';
      banner.setAttribute('role', 'status');
      const main = document.querySelector('main');
      if (!main) return;
      main.insertBefore(banner, main.firstChild);
    }

    banner.className = 'course-banner' + (kind ? ' ' + kind : '');
    banner.innerHTML = html;
    banner.hidden = false;
  }


  const WARNING_DISMISS_KEY = 'aiclassroom_password_warning_dismissed';

  function passwordWarningNeeded() {
    const warnings = (state.config && state.config.warnings) || [];
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(WARNING_DISMISS_KEY) === '1'; } catch (error) { /* 忽略 */ }
    return warnings.indexOf('adminPasswordWeak') !== -1 && !dismissed;
  }

  function renderEmptyNotice() {

    const banner = document.getElementById('courseBanner');
    const optional = document.body.hasAttribute('data-course-optional');

    if (optional || state.courses.length && !(state.course && state.course.archived)) {

      // 沒有課程方面的提醒時，才提醒管理員密碼太簡單
      if (passwordWarningNeeded()) {
        showBanner(
          '<strong>管理員密碼太簡單</strong>' +
          '<span>管理員看得到所有課程的學生資料，也能新增帳號。建議到 Apps Script「專案設定 → 指令碼屬性」，' +
          '把 TEACHER_PASSWORD 改成 10 個字元以上、包含英文和數字的密碼，改完不用重新部署。</span>' +
          '<button type="button" id="dismissPasswordWarning">這次先不要</button>',
          'warn'
        );
        document.getElementById('dismissPasswordWarning').addEventListener('click', function () {
          try { sessionStorage.setItem(WARNING_DISMISS_KEY, '1'); } catch (error) { /* 忽略 */ }
          document.getElementById('courseBanner').hidden = true;
        });
        return;
      }

      if (banner) banner.hidden = true;
      return;
    }

    if (!state.courses.length) {
      showBanner(
        '<strong>你還沒有任何課程</strong>' +
        '<span>題目、學生作答和教材都會放在課程裡。先建立一門課程，再回來使用這一頁。</span>' +
        '<a href="courses.html">建立課程</a>'
      );
    } else if (state.course && state.course.archived) {
      showBanner(
        '<strong>「' + escapeHtml(state.course.name) + '」已封存</strong>' +
        '<span>學生看不到題目，也不能再作答。要繼續使用，請到課程管理重新開放。</span>' +
        '<a href="courses.html">課程管理</a>',
        'muted'
      );
    }
  }


  /* ---------- 對外 ---------- */

  window.TeacherCourse = {

    ready: function (callback) {
      if (state.loaded) callback(context());
      else callbacks.push(callback);
    },

    id: function () {
      return state.course ? state.course.id : '';
    },

    current: function () {
      return state.course;
    },

    teacher: function () {
      return state.teacher;
    },

    isAdmin: function () {
      return !!(state.teacher && state.teacher.isAdmin);
    },

    select: function (id) {
      saveId(id);
    },

    refresh: function () {
      return load().then(context);
    }
  };


  window.TeacherAuth.ready(load);

})();
