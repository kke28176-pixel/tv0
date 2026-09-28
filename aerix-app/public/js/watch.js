/* ============================================================
   AERIX — 觀看頁邏輯
   ============================================================ */

async function renderWatch() {
  const videoId = getParam('v');
  let video;
  try {
    video = (await api.get(`/api/videos/${videoId}`)).video;
  } catch (e) {
    document.getElementById('watch-loading').style.display = 'block';
    document.getElementById('watch-loading-text').textContent = e.message || '找不到這支影片。';
    return;
  }

  document.getElementById('watch-main').style.display = 'block';
  createPlayer(document.getElementById('player-holder'), { src: video.videoUrl, poster: video.thumbUrl });
  document.getElementById('watch-title').textContent = video.title;

  const ch = video.channel;
  const channel = ch ? (await api.get(`/api/channels/${ch.id}`)).channel : null;

  document.getElementById('channel-avatar-slot').innerHTML = channel ? avatarHtml(channel.name, channel.avatarUrl, 'avatar-md') : '';
  document.getElementById('channel-name').textContent = channel ? channel.name : '未知頻道';
  document.getElementById('channel-subs').textContent = channel ? formatSubs(channel.subscriberCount) : '';
  document.getElementById('channel-link').href = channel ? `channel.html?id=${channel.id}` : '#';
  document.getElementById('desc-box').textContent = video.description || '（沒有簡介）';
  document.getElementById('comment-avatar-slot').innerHTML = CURRENT_USER ? avatarHtml(CURRENT_USER.name, null, 'avatar-md') : avatarHtml('?', null, 'avatar-md');

  if (channel) renderSubscribeButton(channel);
  renderLikeDislike(video);
  renderComments(videoId);
  if (channel) renderRecommended(video.id);
  bindCommentForm(videoId);

  document.getElementById('share-btn').onclick = () => {
    navigator.clipboard?.writeText(location.href).catch(() => {});
    alert('連結已複製：\n' + location.href);
  };
}

function renderSubscribeButton(channel) {
  const btn = document.getElementById('subscribe-btn');
  if (channel.isOwner) { btn.style.display = 'none'; return; }
  btn.style.display = 'inline-block';
  btn.textContent = channel.isSubscribed ? '已訂閱' : '訂閱';
  btn.className = 'subscribe-btn' + (channel.isSubscribed ? ' subscribed' : '');
  btn.onclick = async () => {
    if (!requireLogin()) return;
    const r = await api.post(`/api/channels/${channel.id}/subscribe`);
    channel.isSubscribed = r.isSubscribed;
    channel.subscriberCount = r.subscriberCount;
    renderSubscribeButton(channel);
    document.getElementById('channel-subs').textContent = formatSubs(channel.subscriberCount);
  };
}

function renderLikeDislike(video) {
  const likeBtn = document.getElementById('like-btn');
  const dislikeBtn = document.getElementById('dislike-btn');
  function paint() {
    document.getElementById('like-count').textContent = video.likes;
    likeBtn.style.color = video.myReaction === 1 ? 'var(--accent)' : '';
    dislikeBtn.style.color = video.myReaction === -1 ? 'var(--accent)' : '';
  }
  paint();
  likeBtn.onclick = async () => {
    if (!requireLogin()) return;
    const next = video.myReaction === 1 ? 0 : 1;
    const r = await api.post(`/api/videos/${video.id}/react`, { value: next });
    video.likes = r.likes; video.dislikes = r.dislikes; video.myReaction = r.myReaction;
    paint();
  };
  dislikeBtn.onclick = async () => {
    if (!requireLogin()) return;
    const next = video.myReaction === -1 ? 0 : -1;
    const r = await api.post(`/api/videos/${video.id}/react`, { value: next });
    video.likes = r.likes; video.dislikes = r.dislikes; video.myReaction = r.myReaction;
    paint();
  };
}

async function renderComments(videoId) {
  const { comments } = await api.get(`/api/videos/${videoId}/comments`);
  document.getElementById('comments-head').textContent = `${comments.length} 則留言`;
  const list = document.getElementById('comment-list');
  if (comments.length === 0) {
    list.innerHTML = `<p class="muted small">還沒有留言，成為第一個留言的人吧！</p>`;
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment">
      ${avatarHtml(c.userName, null, 'avatar-md')}
      <div class="comment-body">
        <div class="comment-head"><span>${escapeHtml(c.userName)}</span><span class="muted small">${timeAgo(c.createdAt)}</span></div>
        <p class="comment-text">${escapeHtml(c.text)}</p>
        <button class="comment-like-btn ${c.likedByMe ? 'liked' : ''}" data-cid="${c.id}">
          <svg viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
          <span>${c.likes || ''}</span>
        </button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.comment-like-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!requireLogin()) return;
      await api.post(`/api/comments/${btn.dataset.cid}/like`);
      renderComments(videoId);
    };
  });
}

function bindCommentForm(videoId) {
  const input = document.getElementById('comment-input');
  input.onkeydown = async (e) => {
    if (e.key !== 'Enter') return;
    if (!requireLogin()) return;
    const text = input.value.trim();
    if (!text) return;
    await api.post(`/api/videos/${videoId}/comments`, { text });
    input.value = '';
    renderComments(videoId);
  };
}

async function renderRecommended(currentVideoId) {
  const { videos } = await api.get('/api/videos');
  const list = videos.filter(v => v.id !== currentVideoId);
  const side = document.getElementById('watch-side');
  side.innerHTML = list.map(v => `
    <div class="side-list-video" data-id="${v.id}">
      <div class="thumb-wrap">
        ${v.thumbUrl ? `<img src="${v.thumbUrl}" alt="">` : `<div style="position:absolute;inset:0;background:${pickColor(v.title)}"></div>`}
        <span class="duration-badge">${formatDuration(v.durationSeconds)}</span>
      </div>
      <div>
        <p class="video-title">${escapeHtml(v.title)}</p>
        <div class="video-sub">${v.channel ? escapeHtml(v.channel.name) : ''}</div>
        <div class="video-sub">${formatViews(v.views)} · ${timeAgo(v.createdAt)}</div>
      </div>
    </div>`).join('');
  side.querySelectorAll('.side-list-video').forEach(el => {
    el.onclick = () => location.href = `watch.html?v=${el.dataset.id}`;
  });
}

(async function () {
  await initLayout('home', '');
  await renderWatch();
})();
