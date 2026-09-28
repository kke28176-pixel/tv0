/* ============================================================
   AERIX — 共用 Header / Sidebar
   ============================================================ */

function renderHeader(searchQuery = '') {
  const header = document.getElementById('app-header');
  if (!header) return;
  header.innerHTML = `
    <header class="site-header">
      <div class="header-left">
        <button class="icon-btn" id="sidebar-toggle" title="選單">
          <svg viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>
        </button>
        <a href="index.html" class="brand">
          <img src="assets/logo.png" class="brand-mark-img" alt="AERIX">
          <span class="brand-text">AERIX</span>
        </a>
      </div>
      <div class="header-mid">
        <form class="search-wrap" id="search-form">
          <input type="text" id="search-input" placeholder="搜尋影片、頻道" value="${escapeHtml(searchQuery)}">
          <button type="submit" title="搜尋">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 5L20.49 19zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"/></svg>
          </button>
        </form>
      </div>
      <div class="header-right">
        <button class="icon-btn" id="theme-toggle" title="切換深色模式">
          <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
        </button>
        <div id="header-user-slot" style="display:flex;align-items:center;gap:8px;"></div>
      </div>
    </header>
  `;
  document.getElementById('sidebar-toggle').onclick = toggleSidebar;
  document.getElementById('theme-toggle').onclick = toggleTheme;
  document.getElementById('search-form').onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById('search-input').value.trim();
    location.href = 'index.html' + (q ? ('?q=' + encodeURIComponent(q)) : '');
  };
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar-el');
  const main = document.getElementById('main-content');
  if (window.innerWidth <= 900) {
    sidebar.classList.toggle('open');
  } else {
    sidebar.classList.toggle('mini');
    main.classList.toggle('mini-margin');
  }
}

async function renderSidebar(activeKey = 'home') {
  const wrap = document.getElementById('app-sidebar');
  if (!wrap) return;

  let subscribed = [];
  if (CURRENT_USER) {
    try { subscribed = (await api.get('/api/channels/mine/subscriptions')).channels; } catch (e) { subscribed = []; }
  }

  const link = (key, href, label, iconPath) => `
    <a href="${href}" class="side-link ${activeKey === key ? 'active' : ''}">
      <svg viewBox="0 0 24 24">${iconPath}</svg>
      <span class="side-title">${label}</span>
    </a>`;

  wrap.innerHTML = `
    <aside class="sidebar" id="sidebar-el">
      <div class="sidebar-section">
        ${link('home', 'index.html', '首頁', '<path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3z"/>')}
        ${link('subs', 'index.html?filter=subs', '訂閱內容', '<path d="M10 16.5l6-4.5-6-4.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>')}
        ${link('you', 'upload.html', '上傳影片', '<path d="M14 13.5h-3V17h-2v-3.5H6l4-4 4 4z"/><path d="M20 6H4c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 11H4V8h16v9z"/>')}
      </div>
      ${subscribed.length ? `
      <div class="sidebar-section">
        <div class="side-heading">訂閱頻道</div>
        ${subscribed.map(c => `
          <a href="channel.html?id=${c.id}" class="side-link">
            ${avatarHtml(c.name, c.avatarUrl, 'avatar-sm')}
            <span class="side-title">${escapeHtml(c.name)}</span>
          </a>`).join('')}
      </div>` : ''}
    </aside>
  `;
}

async function initLayout(activeKey, searchQuery = '') {
  await loadCurrentUser();
  renderHeader(searchQuery);
  await renderSidebar(activeKey);
  renderHeaderUser();
}
