/* ============================================================
   AERIX — 頻道管理頁邏輯
   ============================================================ */

let currentChannel = null;
let liveStatusTimer = null;

function checkGate() {
  document.getElementById('login-gate').style.display = CURRENT_USER ? 'none' : 'block';
  document.getElementById('manage-wrap').style.display = CURRENT_USER ? 'block' : 'none';
  if (!CURRENT_USER) document.getElementById('gate-login-btn').onclick = () => openAuthModal('login');
  return CURRENT_USER;
}

function initTabs() {
  document.querySelectorAll('.manage-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.manage-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.manage-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    };
  });
}

/* ---------------- 頻道設定 ---------------- */
function paintProfilePreview() {
  document.getElementById('preview-banner').innerHTML = currentChannel.bannerUrl ? `<img src="${currentChannel.bannerUrl}">` : '';
  document.getElementById('preview-banner').style.background = currentChannel.bannerUrl ? '' : pickColor(currentChannel.name);
  document.getElementById('preview-avatar-slot').innerHTML = avatarHtml(currentChannel.name, currentChannel.avatarUrl, 'avatar-lg');
}

function initProfilePanel() {
  paintProfilePreview();
  document.querySelector('#profile-form [name=name]').value = currentChannel.name;
  document.querySelector('#profile-form [name=handle]').value = currentChannel.handle;
  document.querySelector('#profile-form [name=description]').value = currentChannel.description || '';

  document.getElementById('banner-upload-btn').onclick = () => document.getElementById('banner-upload').click();
  document.getElementById('banner-upload').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('banner', file);
    const { channel } = await api.upload(`/api/channels/${currentChannel.id}/banner`, fd);
    currentChannel = channel;
    paintProfilePreview();
  };

  document.getElementById('avatar-upload-btn').onclick = () => document.getElementById('avatar-upload').click();
  document.getElementById('avatar-upload').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('avatar', file);
    const { channel } = await api.upload(`/api/channels/${currentChannel.id}/avatar`, fd);
    currentChannel = channel;
    paintProfilePreview();
  };

  document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('profile-save-msg');
    try {
      const { channel } = await api.patch(`/api/channels/${currentChannel.id}`, {
        name: fd.get('name').trim(), handle: fd.get('handle').trim(), description: fd.get('description').trim(),
      });
      currentChannel = channel;
      renderHeaderUser();
      msg.style.color = '#1a936f';
      msg.textContent = '已儲存變更 ✓';
    } catch (err) {
      msg.style.color = 'var(--live)';
      msg.textContent = err.message;
    }
    setTimeout(() => { msg.textContent = ''; }, 3000);
  };
}

/* ---------------- 影片管理 ---------------- */
async function renderVideoManageList() {
  const { videos } = await api.get('/api/videos/mine');
  const holder = document.getElementById('manage-video-list');
  if (videos.length === 0) {
    holder.innerHTML = `<div class="empty-state"><p>你還沒有上傳任何影片。</p><a href="upload.html" class="btn-primary">上傳第一支影片</a></div>`;
    return;
  }
  holder.innerHTML = videos.map(v => `
    <div class="manage-video-row" data-id="${v.id}">
      <div class="thumb-wrap">
        ${v.thumbUrl ? `<img src="${v.thumbUrl}" alt="">` : `<div style="position:absolute;inset:0;background:${pickColor(v.title)}"></div>`}
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">
        <input type="text" data-role="title" value="${escapeHtml(v.title)}" maxlength="100">
        <textarea data-role="description" maxlength="1000">${escapeHtml(v.description || '')}</textarea>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select data-role="visibility">
            <option value="public" ${v.visibility === 'public' ? 'selected' : ''}>公開</option>
            <option value="unlisted" ${v.visibility === 'unlisted' ? 'selected' : ''}>不公開</option>
            <option value="private" ${v.visibility === 'private' ? 'selected' : ''}>私人</option>
          </select>
          <button class="btn-secondary" data-role="rethumb" style="padding:6px 12px;font-size:12px;">換縮圖</button>
          <button class="btn-primary" data-role="save" style="padding:6px 14px;font-size:12px;">儲存</button>
          <button class="btn-secondary" data-role="delete" style="padding:6px 12px;font-size:12px;color:var(--live);">刪除</button>
          <span class="muted small">${formatViews(v.views)} · ${timeAgo(v.createdAt)}</span>
          <span class="save-msg" data-role="msg"></span>
        </div>
      </div>
      <input type="file" accept="image/*" data-role="thumb-input" style="display:none;">
    </div>`).join('');

  holder.querySelectorAll('.manage-video-row').forEach(row => {
    const vid = row.dataset.id;

    row.querySelector('[data-role=save]').onclick = async () => {
      const msg = row.querySelector('[data-role=msg]');
      try {
        await api.patch(`/api/videos/${vid}`, {
          title: row.querySelector('[data-role=title]').value,
          description: row.querySelector('[data-role=description]').value,
          visibility: row.querySelector('[data-role=visibility]').value,
        });
        msg.style.color = '#1a936f';
        msg.textContent = '已儲存 ✓';
      } catch (err) {
        msg.style.color = 'var(--live)';
        msg.textContent = err.message;
      }
      setTimeout(() => { msg.textContent = ''; }, 2500);
    };

    const thumbInput = row.querySelector('[data-role=thumb-input]');
    row.querySelector('[data-role=rethumb]').onclick = () => thumbInput.click();
    thumbInput.onchange = async () => {
      const file = thumbInput.files[0];
      if (!file) return;
      const fd = new FormData(); fd.append('thumbnail', file);
      const { video } = await api.upload(`/api/videos/${vid}/thumbnail`, fd);
      row.querySelector('.thumb-wrap').innerHTML = `<img src="${video.thumbUrl}" alt="">`;
    };

    row.querySelector('[data-role=delete]').onclick = async () => {
      if (!confirm('確定要刪除這支影片嗎？此動作無法復原。')) return;
      await api.del(`/api/videos/${vid}`);
      row.remove();
    };
  });
}

/* ---------------- 直播 ---------------- */
async function initLivePanel() {
  const info = await api.get(`/api/channels/${currentChannel.id}/stream-info`);
  document.getElementById('rtmp-url').textContent = info.rtmpUrlLocalhost;
  if (info.rtmpUrlLan) {
    document.getElementById('rtmp-lan-row').style.display = 'flex';
    document.getElementById('rtmp-url-lan').textContent = info.rtmpUrlLan;
  }
  document.getElementById('stream-key').textContent = info.streamKey;
  document.getElementById('live-title-input').value = info.pendingLiveTitle || '';

  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.onclick = () => {
      const text = document.getElementById(btn.dataset.copy).textContent;
      navigator.clipboard?.writeText(text).catch(() => {});
      const old = btn.textContent; btn.textContent = '已複製'; setTimeout(() => { btn.textContent = old; }, 1200);
    };
  });

  document.getElementById('save-live-title-btn').onclick = async () => {
    await api.post(`/api/channels/${currentChannel.id}/live-title`, { title: document.getElementById('live-title-input').value });
    const msg = document.getElementById('live-title-save-msg');
    msg.style.color = '#1a936f';
    msg.textContent = '已儲存 ✓';
    setTimeout(() => { msg.textContent = ''; }, 2500);
  };

  await refreshLiveStatus();
  liveStatusTimer = setInterval(refreshLiveStatus, 4000);
}

async function refreshLiveStatus() {
  const { channel } = await api.get(`/api/channels/${currentChannel.id}`);
  const box = document.getElementById('live-status-box');
  if (channel.isLive) {
    box.innerHTML = `<p style="margin:0;font-weight:700;"><span class="live-dot"></span>直播中 — ${escapeHtml(channel.liveTitle)}</p>
      <p class="muted small" style="margin:6px 0 0;">觀眾可以打開這個連結收看：<a href="live.html?ch=${channel.id}" target="_blank">live.html?ch=${channel.id}</a></p>`;
  } else {
    box.innerHTML = `<p style="margin:0;">目前沒有在直播。在下方填好 OBS 設定並按下「開始串流」後，這裡會自動顯示直播狀態。</p>`;
  }
}

window.addEventListener('beforeunload', () => { if (liveStatusTimer) clearInterval(liveStatusTimer); });

/* ---------------- 初始化 ---------------- */
async function initManagePage() {
  if (!checkGate()) return;
  const { channel } = await api.get(`/api/channels/${CURRENT_USER.channelId}`);
  currentChannel = channel;
  initTabs();
  initProfilePanel();
  await renderVideoManageList();
  await initLivePanel();
}

(async function () {
  await initLayout('none', '');
  await initManagePage();
})();
