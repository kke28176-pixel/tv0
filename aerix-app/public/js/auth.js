/* ============================================================
   AERIX — 前端登入 / 註冊 / 使用者狀態
   ============================================================ */

let CURRENT_USER = null;

async function loadCurrentUser() {
  try {
    const { user } = await api.get('/api/auth/me');
    CURRENT_USER = user;
  } catch (e) {
    CURRENT_USER = null;
  }
  return CURRENT_USER;
}

function applyTheme() {
  const theme = localStorage.getItem('aerix_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}
applyTheme();

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('aerix_theme', next);
  applyTheme();
}

function renderHeaderUser() {
  const slot = document.getElementById('header-user-slot');
  if (!slot) return;
  if (CURRENT_USER) {
    slot.innerHTML = `
      <button class="icon-btn" id="upload-entry-btn" title="上傳影片">
        <svg viewBox="0 0 24 24"><path d="M14 13.5h-3V17h-2v-3.5H6l4-4 4 4z"/><path d="M20 6H4c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 11H4V8h16v9z"/></svg>
      </button>
      <button class="avatar-circle avatar-header" id="user-menu-btn" style="background:${pickColor(CURRENT_USER.name)};border:none;">${initials(CURRENT_USER.name)}</button>
    `;
    document.getElementById('upload-entry-btn').onclick = () => location.href = 'upload.html';
    document.getElementById('user-menu-btn').onclick = () => openUserMenu();
  } else {
    slot.innerHTML = `<button class="btn-outline" id="login-entry-btn">
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2a5 5 0 100 10 5 5 0 000-10zm0 12c-4.4 0-8 2.7-8 6v1h16v-1c0-3.3-3.6-6-8-6z"/></svg>
        登入
      </button>`;
    document.getElementById('login-entry-btn').onclick = () => openAuthModal('login');
  }
}

function openUserMenu() {
  closeAnyOverlay();
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.innerHTML = `
    <div class="dropdown-header">
      <span class="avatar-circle avatar-md" style="background:${pickColor(CURRENT_USER.name)}">${initials(CURRENT_USER.name)}</span>
      <div><strong>${escapeHtml(CURRENT_USER.name)}</strong><div class="muted small">${escapeHtml(CURRENT_USER.email)}</div></div>
    </div>
    <a href="channel.html?id=${CURRENT_USER.channelId}" class="dropdown-item">我的頻道</a>
    <a href="channel-manage.html" class="dropdown-item">管理頻道</a>
    <a href="upload.html" class="dropdown-item">上傳影片</a>
    <button class="dropdown-item" id="logout-btn">登出</button>
  `;
  document.body.appendChild(menu);
  const anchor = document.getElementById('user-menu-btn');
  const r = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = (r.bottom + 8) + 'px';
  menu.style.right = (window.innerWidth - r.right) + 'px';
  document.getElementById('logout-btn').onclick = async () => {
    await api.post('/api/auth/logout');
    location.href = 'index.html';
  };
  requestAnimationFrame(() => document.addEventListener('click', outsideCloser));
}

function outsideCloser(e) {
  const menu = document.querySelector('.dropdown-menu');
  if (menu && !menu.contains(e.target)) closeAnyOverlay();
}
function closeAnyOverlay() {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
  document.removeEventListener('click', outsideCloser);
}

/* ---------- 登入 / 註冊 Modal ---------- */
function openAuthModal(mode = 'login') {
  closeAnyOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'auth-overlay';
  overlay.innerHTML = authModalHTML(mode);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  bindAuthModalEvents(mode);
}

function authModalHTML(mode) {
  if (mode === 'login') {
    return `
    <div class="modal-card">
      <button class="modal-close" data-close>&times;</button>
      <h2>登入 AERIX</h2>
      <form id="login-form">
        <label>電子郵件<input type="email" name="email" required placeholder="you@example.com"></label>
        <label>密碼<input type="password" name="password" required placeholder="至少 4 個字元" minlength="4"></label>
        <div class="form-error" id="auth-error"></div>
        <button type="submit" class="btn-primary btn-block">登入</button>
      </form>
      <p class="switch-line">還沒有帳號？<a href="#" id="switch-to-register">建立帳號</a></p>
    </div>`;
  }
  return `
    <div class="modal-card">
      <button class="modal-close" data-close>&times;</button>
      <h2>建立你的帳號</h2>
      <form id="register-form">
        <label>暱稱 / 頻道名稱<input type="text" name="name" required placeholder="例如：小明的頻道"></label>
        <label>電子郵件<input type="email" name="email" required placeholder="you@example.com"></label>
        <label>密碼<input type="password" name="password" required placeholder="至少 4 個字元" minlength="4"></label>
        <div class="form-error" id="auth-error"></div>
        <button type="submit" class="btn-primary btn-block">註冊並登入</button>
      </form>
      <p class="switch-line">已經有帳號？<a href="#" id="switch-to-login">登入</a></p>
    </div>`;
}

function bindAuthModalEvents(mode) {
  document.querySelectorAll('#auth-overlay [data-close]').forEach(b => b.onclick = () => document.getElementById('auth-overlay').remove());
  const switchLink = document.getElementById(mode === 'login' ? 'switch-to-register' : 'switch-to-login');
  if (switchLink) switchLink.onclick = (e) => { e.preventDefault(); openAuthModal(mode === 'login' ? 'register' : 'login'); };

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const errBox = document.getElementById('auth-error');
    try {
      const { user } = await api.post('/api/auth/login', { email: fd.get('email'), password: fd.get('password') });
      CURRENT_USER = user;
      document.getElementById('auth-overlay').remove();
      location.reload();
    } catch (err) { errBox.textContent = err.message; }
  };

  const regForm = document.getElementById('register-form');
  if (regForm) regForm.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(regForm);
    const errBox = document.getElementById('auth-error');
    try {
      const { user } = await api.post('/api/auth/register', { name: fd.get('name'), email: fd.get('email'), password: fd.get('password') });
      CURRENT_USER = user;
      document.getElementById('auth-overlay').remove();
      location.reload();
    } catch (err) { errBox.textContent = err.message; }
  };
}

function requireLogin() {
  if (CURRENT_USER) return CURRENT_USER;
  openAuthModal('login');
  return null;
}
