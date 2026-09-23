/*
 * 左側選單
 *
 * 依照 features.js 的清單產生，新增功能時選單會自動多一項。
 * 頁面上如果有 <nav id="subnav">，會被放到目前頁面那一項的下方，
 * 例如教師系統的「新增題目、題目管理……」。
 *
 * 只負責畫面，不會呼叫任何資料功能。
 */
(function () {

  const COLLAPSE_KEY = 'aiclassroom_side_collapsed';
  const DESKTOP = window.matchMedia('(min-width: 1024px)');

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function currentFile() {
    return decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  }

  // 每一頁分開記住（討論平台預設收合，看板比較寬）
  function collapseKey() {
    return COLLAPSE_KEY + ':' + currentFile();
  }

  function readCollapsed() {
    try {
      const saved = localStorage.getItem(collapseKey());
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch (error) { /* 忽略 */ }
    return document.body.dataset.shellCollapsed === 'true';
  }

  function saveCollapsed(value) {
    try { localStorage.setItem(collapseKey(), value ? '1' : '0'); } catch (error) { /* 忽略 */ }
  }

  function build() {

    const body = document.body;
    const features = Array.isArray(window.PLATFORM_FEATURES) ? window.PLATFORM_FEATURES : [];
    const here = currentFile();

    const items = features
      .filter(function (f) { return f.status !== 'soon'; })
      .map(function (f) {
        const isCurrent = !f.newTab && f.href === here;
        const target = f.newTab ? ' target="_blank" rel="noopener"' : '';
        return '<li' + (isCurrent ? ' data-current="1"' : '') + '>' +
          '<a class="shell-link' + (isCurrent ? ' current' : '') + '" href="' + escapeHtml(f.href) + '"' + target +
          (isCurrent ? ' aria-current="page"' : '') + ' title="' + escapeHtml(f.title) + '">' +
          '<span class="shell-icon" aria-hidden="true">' + escapeHtml(f.icon || '•') + '</span>' +
          '<span class="shell-text">' + escapeHtml(f.title) +
          (f.newTab ? ' <span class="shell-ext">新分頁</span>' : '') + '</span></a></li>';
      })
      .join('');

    const side = document.createElement('aside');
    side.className = 'shell-side';
    side.id = 'shellSide';
    side.setAttribute('aria-label', '網站選單');
    side.innerHTML =
      '<a class="shell-brand" href="index.html" title="回到首頁"><b>AI<span class="shell-text"> 課堂</span></b><small>人工智慧（小教）</small></a>' +
      '<nav class="shell-nav" aria-label="功能"><ul>' +
        '<li><a class="shell-link" href="index.html" title="首頁"><span class="shell-icon" aria-hidden="true">🏠</span><span class="shell-text">首頁</span></a></li>' +
        items +
      '</ul></nav>' +
      '<div class="shell-foot"><button type="button" class="shell-toggle" id="shellToggle">' +
        '<span class="shell-icon" aria-hidden="true">⇤</span><span class="shell-text">收合選單</span></button></div>';

    const bar = document.createElement('div');
    bar.className = 'shell-bar';
    bar.innerHTML =
      '<button type="button" class="shell-menu" id="shellMenu" aria-controls="shellSide" aria-expanded="false" aria-label="開啟選單">☰</button>' +
      '<a href="index.html">AI 課堂</a>';

    body.insertBefore(side, body.firstChild);
    body.insertBefore(bar, side.nextSibling);
    body.classList.add('has-shell');

    // 頁面自己的子選單
    const sub = document.getElementById('subnav');
    const currentItem = side.querySelector('li[data-current]');
    if (sub) {
      sub.classList.add('shell-sub');
      if (currentItem) currentItem.appendChild(sub);
      else side.querySelector('.shell-nav').appendChild(sub);
    }

    // 收合（只在電腦版）
    const toggle = document.getElementById('shellToggle');

    function applyCollapsed() {
      const collapsed = DESKTOP.matches && readCollapsed();
      body.classList.toggle('shell-collapsed', collapsed);
      toggle.querySelector('.shell-text').textContent = collapsed ? '展開選單' : '收合選單';
      toggle.querySelector('.shell-icon').textContent = collapsed ? '⇥' : '⇤';
      toggle.title = collapsed ? '展開選單' : '收合選單';
    }

    toggle.addEventListener('click', function () {
      saveCollapsed(!body.classList.contains('shell-collapsed'));
      applyCollapsed();
    });

    // 手機：抽屜
    const menu = document.getElementById('shellMenu');
    let scrim = null;

    function closeDrawer() {
      side.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
      if (scrim) { scrim.remove(); scrim = null; }
    }

    menu.addEventListener('click', function () {
      if (side.classList.contains('open')) { closeDrawer(); return; }
      side.classList.add('open');
      menu.setAttribute('aria-expanded', 'true');
      scrim = document.createElement('div');
      scrim.className = 'shell-scrim';
      scrim.addEventListener('click', closeDrawer);
      body.appendChild(scrim);
    });

    // 在抽屜裡點了子選單就關起來
    side.addEventListener('click', function (event) {
      if (!DESKTOP.matches && event.target.closest('.shell-sub button')) closeDrawer();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && side.classList.contains('open')) closeDrawer();
    });

    const onChange = function () { closeDrawer(); applyCollapsed(); };
    if (DESKTOP.addEventListener) DESKTOP.addEventListener('change', onChange);
    else DESKTOP.addListener(onChange);

    applyCollapsed();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

})();
