/* ============================================================
   AERIX — 直播觀看頁邏輯（HLS 播放 + 伺服器轉發的聊天室）
   ============================================================ */

let statusTimer = null;
let chatTimer = null;
let lastChatId = 0;
let viewerCount = 0;
let hlsInstance = null;

async function initLiveWatch() {
  const chId = getParam('ch');
  let channel;
  try {
    channel = (await api.get(`/api/channels/${chId}`)).channel;
  } catch (e) {
    document.getElementById('not-live-state').style.display = 'block';
    document.getElementById('not-live-text').textContent = '找不到這個頻道。';
    return;
  }
  if (!channel.isLive) {
    document.getElementById('not-live-state').style.display = 'block';
    document.getElementById('not-live-text').textContent = `${channel.name} 目前沒有正在進行的直播。`;
    return;
  }

  document.getElementById('live-watch-content').style.display = 'block';
  document.getElementById('live-title-el').textContent = channel.liveTitle || '正在直播';
  document.getElementById('live-ch-avatar-slot').innerHTML = avatarHtml(channel.name, channel.avatarUrl, 'avatar-md');
  document.getElementById('live-ch-name').textContent = channel.name;
  document.getElementById('live-ch-subs').textContent = formatSubs(channel.subscriberCount);

  const subBtn = document.getElementById('live-subscribe-btn');
  if (channel.isOwner) {
    subBtn.style.display = 'none';
  } else {
    subBtn.textContent = channel.isSubscribed ? '已訂閱' : '訂閱';
    subBtn.className = 'subscribe-btn' + (channel.isSubscribed ? ' subscribed' : '');
    subBtn.onclick = async () => {
      if (!requireLogin()) return;
      const r = await api.post(`/api/channels/${channel.id}/subscribe`);
      channel.isSubscribed = r.isSubscribed;
      subBtn.textContent = r.isSubscribed ? '已訂閱' : '訂閱';
      subBtn.className = 'subscribe-btn' + (r.isSubscribed ? ' subscribed' : '');
    };
  }

  startPlayback(channel.id);
  startStatusPolling(channel.id);
  startChat(channel.id);

  viewerCount = Math.max(1, Math.floor(Math.random() * 30) + 3);
  updateViewerCount();
  setInterval(() => {
    viewerCount = Math.max(1, viewerCount + (Math.random() > 0.5 ? 1 : -1));
    updateViewerCount();
  }, 5000);
}

function updateViewerCount() {
  document.getElementById('live-viewers').textContent = `約 ${viewerCount} 人觀看中（模擬數字，僅供展示）`;
}

function startPlayback(channelId) {
  const holder = document.getElementById('player-holder');
  const video = createPlayer(holder, { isLive: true, muted: true });
  const src = `http://${location.hostname}:8000/live/${channelId}/index.m3u8`;

  if (window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls({ liveDurationInfinity: true });
    hlsInstance.loadSource(src);
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
  } else {
    holder.insertAdjacentHTML('beforeend', `<p style="color:#fff;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">這個瀏覽器不支援直播播放。</p>`);
  }
}

function startStatusPolling(channelId) {
  statusTimer = setInterval(async () => {
    const { channel } = await api.get(`/api/channels/${channelId}`);
    if (!channel.isLive) {
      clearInterval(statusTimer);
      if (hlsInstance) hlsInstance.destroy();
      document.getElementById('live-watch-content').style.display = 'none';
      document.getElementById('not-live-state').style.display = 'block';
      document.getElementById('not-live-text').textContent = '這場直播已經結束。';
      return;
    }
    if (channel.liveStartedAt) document.getElementById('live-elapsed').textContent = '已直播 ' + liveElapsed(channel.liveStartedAt);
  }, 3000);
}

function liveElapsed(startedAt) {
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function startChat(channelId) {
  const msgsEl = document.getElementById('chat-msgs');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const guestName = '訪客' + Math.floor(Math.random() * 900 + 100);

  appendChatMsg(msgsEl, '系統', '歡迎來到直播間！');

  async function poll() {
    try {
      const { messages } = await api.get(`/api/live/chat?channelId=${channelId}&sinceId=${lastChatId}`);
      messages.forEach(m => { appendChatMsg(msgsEl, m.name, m.text); lastChatId = m.id; });
    } catch (e) {}
  }
  chatTimer = setInterval(poll, 2000);

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    const name = CURRENT_USER ? CURRENT_USER.name : guestName;
    input.value = '';
    try { await api.post('/api/live/chat', { channelId, name, text }); } catch (e) {}
  }
  sendBtn.onclick = send;
  input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
}

function appendChatMsg(container, name, text) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<b>${escapeHtml(name)}</b>${escapeHtml(text)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

window.addEventListener('beforeunload', () => {
  if (statusTimer) clearInterval(statusTimer);
  if (chatTimer) clearInterval(chatTimer);
  if (hlsInstance) hlsInstance.destroy();
});

(async function () {
  await initLayout('none', '');
  await initLiveWatch();
})();
