/* ============================================================
   AERIX — 自製影片播放器（不用瀏覽器原生控制列）
   - 隱藏原生控制列、關閉右鍵選單、關閉子母畫面，降低被直接另存的機會
   - 注意：這是嚇阻一般使用者的做法，無法做到真正防下載（那需要 DRM／加密串流）
   ============================================================ */

const PLAYER_ICONS = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
  volOn: '<path d="M3 10v4h4l5 5V5L7 10H3z"/>',
  volOff: '<path d="M3 10v4h4l5 5V5L7 10H3zm13.6 2l2.47 2.47-1.42 1.42L14.18 13.4l-2.47 2.47-1.42-1.42L12.76 12l-2.47-2.47 1.42-1.42L14.18 10.6l2.47-2.47 1.42 1.42L15.6 12z"/>',
  fs: '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>',
};

function createPlayer(container, opts = {}) {
  container.classList.add('player-wrap', 'paused');
  container.innerHTML = `
    <video playsinline ${opts.muted ? 'muted' : ''}></video>
    <div class="player-spinner" style="display:none;"></div>
    <button class="player-center-btn" data-role="center-play"><svg viewBox="0 0 24 24" width="64" height="64">${PLAYER_ICONS.play}</svg></button>
    <div class="player-controls">
      <input type="range" class="player-seek" min="0" max="100" value="0" step="0.1">
      <div class="player-row">
        <button class="player-btn" data-role="play"><svg viewBox="0 0 24 24">${PLAYER_ICONS.play}</svg></button>
        <button class="player-btn" data-role="mute"><svg viewBox="0 0 24 24">${PLAYER_ICONS.volOn}</svg></button>
        <input type="range" class="player-volume" min="0" max="1" step="0.01" value="1">
        <span class="player-time" data-role="time">0:00 / 0:00</span>
        <span class="player-spacer"></span>
        ${opts.isLive ? '<span class="player-live-badge">● LIVE</span>' : '<button class="player-btn player-speed" data-role="speed" style="width:auto;padding:0 6px;font-size:13px;font-weight:600;">1x</button>'}
        <button class="player-btn" data-role="fullscreen"><svg viewBox="0 0 24 24">${PLAYER_ICONS.fs}</svg></button>
      </div>
    </div>
  `;

  const video = container.querySelector('video');
  video.controlsList = 'nodownload noremoteplayback';
  video.disablePictureInPicture = true;
  video.oncontextmenu = (e) => e.preventDefault();

  const playBtn = container.querySelector('[data-role=play]');
  const centerBtn = container.querySelector('[data-role=center-play]');
  const muteBtn = container.querySelector('[data-role=mute]');
  const volSlider = container.querySelector('.player-volume');
  const seek = container.querySelector('.player-seek');
  const timeEl = container.querySelector('[data-role=time]');
  const fsBtn = container.querySelector('[data-role=fullscreen]');

  function setIcon(el, name) { el.innerHTML = `<svg viewBox="0 0 24 24">${PLAYER_ICONS[name]}</svg>`; }
  function togglePlay() { if (video.paused) video.play().catch(() => {}); else video.pause(); }

  playBtn.onclick = togglePlay;
  centerBtn.onclick = togglePlay;
  video.addEventListener('click', togglePlay);
  video.addEventListener('play', () => { setIcon(playBtn, 'pause'); container.classList.remove('paused'); });
  video.addEventListener('pause', () => { setIcon(playBtn, 'play'); container.classList.add('paused'); });

  muteBtn.onclick = () => { video.muted = !video.muted; setIcon(muteBtn, video.muted ? 'volOff' : 'volOn'); };
  volSlider.oninput = () => { video.volume = parseFloat(volSlider.value); video.muted = video.volume === 0; setIcon(muteBtn, video.muted ? 'volOff' : 'volOn'); };

  if (opts.isLive) {
    seek.style.display = 'none';
    timeEl.textContent = '直播中';
  } else {
    video.addEventListener('loadedmetadata', () => {
      timeEl.textContent = `${formatDuration(video.currentTime)} / ${formatDuration(video.duration || 0)}`;
    });
    video.addEventListener('timeupdate', () => {
      if (video.duration) seek.value = (video.currentTime / video.duration) * 100;
      timeEl.textContent = `${formatDuration(video.currentTime)} / ${formatDuration(video.duration || 0)}`;
    });
    seek.addEventListener('input', () => {
      if (video.duration) video.currentTime = (seek.value / 100) * video.duration;
    });
  }

  fsBtn.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (container.requestFullscreen) container.requestFullscreen();
  };

  // 讀取中的轉圈圈
  const spinner = container.querySelector('.player-spinner');
  video.addEventListener('waiting', () => { spinner.style.display = 'block'; });
  ['playing', 'canplay', 'pause'].forEach(ev => video.addEventListener(ev, () => { spinner.style.display = 'none'; }));

  // 雙擊全螢幕、鍵盤快捷鍵（空白鍵播放/暫停、←→ 快轉、M 靜音、F 全螢幕）
  video.addEventListener('dblclick', () => fsBtn.click());
  container.tabIndex = 0;
  container.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' && !opts.isLive) video.currentTime += 5;
    else if (e.key === 'ArrowLeft' && !opts.isLive) video.currentTime -= 5;
    else if (e.key.toLowerCase() === 'm') muteBtn.click();
    else if (e.key.toLowerCase() === 'f') fsBtn.click();
  });

  // 播放速度
  const speedBtn = container.querySelector('[data-role=speed]');
  if (speedBtn) {
    const speeds = [1, 1.25, 1.5, 2, 0.5, 0.75];
    let si = 0;
    speedBtn.onclick = () => { si = (si + 1) % speeds.length; video.playbackRate = speeds[si]; speedBtn.textContent = speeds[si] + 'x'; };
  }

  if (opts.src) video.src = opts.src;
  if (opts.poster) video.poster = opts.poster;

  return video;
}
