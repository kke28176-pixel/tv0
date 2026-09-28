/* ============================================================
   AERIX — 首頁邏輯
   ============================================================ */

function videoCardHTML(video) {
  const ch = video.channel;
  return `
    <div class="video-card" data-id="${video.id}">
      <div class="thumb-wrap">
        ${video.thumbUrl ? `<img src="${video.thumbUrl}" alt="">` : `<div style="position:absolute;inset:0;background:${pickColor(video.title)}"></div>`}
        <div class="play-badge"><svg viewBox="0 0 24 24" width="48" height="48"><path d="M8 5v14l11-7z"/></svg></div>
        <span class="duration-badge">${formatDuration(video.durationSeconds)}</span>
      </div>
      <div class="video-meta">
        ${avatarHtml(ch ? ch.name : '?', ch && ch.avatarUrl, 'avatar-sm')}
        <div>
          <p class="video-title">${escapeHtml(video.title)}</p>
          <div class="video-sub">${ch ? escapeHtml(ch.name) : '未知頻道'}</div>
          <div class="video-sub">${formatViews(video.views)} · ${timeAgo(video.createdAt)}</div>
        </div>
      </div>
    </div>`;
}

async function renderLiveStrip() {
  const holder = document.getElementById('live-strip');
  let channels = [];
  try { channels = (await api.get('/api/live/list')).channels; } catch (e) {}
  if (!channels.length) { holder.innerHTML = ''; return; }
  holder.innerHTML = `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:16px;margin:0 0 12px;">正在直播</h2>
      <div class="video-grid">
        ${channels.map(c => `
          <a href="live.html?ch=${c.id}" class="video-card">
            <div class="thumb-wrap">
              ${c.bannerUrl ? `<img src="${c.bannerUrl}" alt="">` : `<div style="position:absolute;inset:0;background:${pickColor(c.name)}"></div>`}
              <span class="duration-badge" style="background:var(--live);">● LIVE</span>
            </div>
            <div class="video-meta">
              ${avatarHtml(c.name, c.avatarUrl, 'avatar-sm')}
              <div>
                <p class="video-title">${escapeHtml(c.liveTitle || '正在直播')}</p>
                <div class="video-sub">${escapeHtml(c.name)}</div>
              </div>
            </div>
          </a>`).join('')}
      </div>
    </div>`;
}

async function renderHome() {
  const q = getParam('q') || '';
  const filter = getParam('filter');
  const grid = document.getElementById('video-grid');
  const empty = document.getElementById('empty-state');

  let videos = [];
  try {
    if (filter === 'subs') {
      if (!CURRENT_USER) { videos = []; }
      else {
        const subs = (await api.get('/api/channels/mine/subscriptions')).channels;
        const lists = await Promise.all(subs.map(c => api.get(`/api/channels/${c.id}/videos`)));
        videos = lists.flatMap(l => l.videos).sort((a, b) => b.createdAt - a.createdAt);
      }
    } else {
      videos = (await api.get('/api/videos' + (q ? `?q=${encodeURIComponent(q)}` : ''))).videos;
    }
  } catch (e) {
    grid.innerHTML = '';
    const hint = location.protocol === 'file:'
      ? '這個網站需要先啟動伺服器：在資料夾執行 npm install 與 npm start，再用瀏覽器開啟 http://localhost:3000'
      : '載入影片時發生錯誤：' + e.message;
    empty.innerHTML = `<div class="empty-state"><p>${escapeHtml(hint)}</p></div>`;
    return;
  }

  if (videos.length === 0) {
    grid.innerHTML = '';
    let msg = '沒有任何使用者在這裡上傳任何的影片。';
    if (filter === 'subs') msg = CURRENT_USER ? '你訂閱的頻道還沒有發佈任何影片。' : '登入後即可看到你訂閱的頻道影片。';
    else if (q) msg = '找不到符合的影片。';
    empty.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 5L20.49 19zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z"/></svg>
        <p>${msg}</p>
      </div>`;
    return;
  }
  empty.innerHTML = '';
  grid.innerHTML = videos.map(videoCardHTML).join('');
  grid.querySelectorAll('.video-card').forEach(card => {
    card.onclick = () => location.href = `watch.html?v=${card.dataset.id}`;
  });
}

(async function () {
  await initLayout(getParam('filter') === 'subs' ? 'subs' : 'home', getParam('q') || '');
  await renderLiveStrip();
  await renderHome();
})();
