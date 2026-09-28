/* ============================================================
   AERIX — 頻道頁邏輯
   ============================================================ */

async function renderChannel() {
  const channelId = getParam('id');
  let channel;
  try {
    channel = (await api.get(`/api/channels/${channelId}`)).channel;
  } catch (e) {
    document.getElementById('channel-not-found').style.display = 'block';
    return;
  }
  document.getElementById('channel-content').style.display = 'block';
  document.getElementById('channel-banner').innerHTML = channel.bannerUrl ? `<img src="${channel.bannerUrl}" alt="">` : '';
  document.getElementById('channel-banner').style.background = channel.bannerUrl ? '' : pickColor(channel.name);
  document.getElementById('ch-avatar-slot').innerHTML = avatarHtml(channel.name, channel.avatarUrl, 'avatar-xl');
  document.getElementById('ch-name').textContent = channel.name;
  document.getElementById('ch-meta').textContent = `${channel.handle} · ${formatSubs(channel.subscriberCount)}`;
  document.getElementById('ch-desc').textContent = channel.description || '';
  document.getElementById('ch-manage-link').style.display = channel.isOwner ? 'inline-block' : 'none';

  const liveBanner = document.getElementById('ch-live-banner');
  liveBanner.innerHTML = channel.isLive ? `
      <a href="live.html?ch=${channel.id}" class="live-strip-link">
        <span style="background:var(--live);color:#fff;font-weight:700;font-size:12px;padding:3px 8px;border-radius:4px;">● LIVE</span>
        <div>
          <div style="font-weight:600;">${escapeHtml(channel.liveTitle || '正在直播')}</div>
          <div class="muted small">點擊觀看直播</div>
        </div>
      </a>` : '';

  const btn = document.getElementById('ch-subscribe-btn');
  if (channel.isOwner) {
    btn.style.display = 'none';
  } else {
    btn.style.display = 'inline-block';
    btn.textContent = channel.isSubscribed ? '已訂閱' : '訂閱';
    btn.className = 'subscribe-btn' + (channel.isSubscribed ? ' subscribed' : '');
    btn.onclick = async () => {
      if (!requireLogin()) return;
      const r = await api.post(`/api/channels/${channel.id}/subscribe`);
      channel.isSubscribed = r.isSubscribed;
      channel.subscriberCount = r.subscriberCount;
      renderChannel();
    };
  }

  const { videos } = await api.get(`/api/channels/${channelId}/videos`);
  const grid = document.getElementById('ch-video-grid');
  if (videos.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>這個頻道還沒有發佈任何影片。</p></div>`;
    return;
  }
  grid.innerHTML = videos.map(v => `
    <div class="video-card" data-id="${v.id}">
      <div class="thumb-wrap">
        ${v.thumbUrl ? `<img src="${v.thumbUrl}" alt="">` : `<div style="position:absolute;inset:0;background:${pickColor(v.title)}"></div>`}
        <div class="play-badge"><svg viewBox="0 0 24 24" width="48" height="48"><path d="M8 5v14l11-7z"/></svg></div>
        <span class="duration-badge">${formatDuration(v.durationSeconds)}</span>
      </div>
      <div class="video-meta">
        <div>
          <p class="video-title">${escapeHtml(v.title)}</p>
          <div class="video-sub">${formatViews(v.views)} · ${timeAgo(v.createdAt)}${v.visibility !== 'public' ? ' · ' + (v.visibility === 'private' ? '私人' : '不公開') : ''}</div>
        </div>
      </div>
    </div>`).join('');
  grid.querySelectorAll('.video-card').forEach(card => {
    card.onclick = () => location.href = `watch.html?v=${card.dataset.id}`;
  });
}

(async function () {
  await initLayout('none', '');
  await renderChannel();
})();
