/* ============================================================
   AERIX — 共用工具函式
   ============================================================ */

const AVATAR_COLORS = ['#3E7BFA','#F76E11','#1A936F','#6A4C93','#EF476F','#3D5A80','#F7B32B','#0EA5A5'];

function pickColor(seed) {
  seed = seed || '?';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 個月前`;
  return `${Math.floor(months / 12)} 年前`;
}

function formatViews(n) {
  if (n >= 1_0000_0000) return (n / 1_0000_0000).toFixed(1) + '億次觀看';
  if (n >= 10000) return (n / 10000).toFixed(1) + '萬次觀看';
  return n + '次觀看';
}

function formatSubs(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '萬位訂閱者';
  return n + ' 位訂閱者';
}

function formatDuration(seconds) {
  seconds = Math.floor(seconds || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 頻道頭像：有上傳圖片就顯示圖片，否則用色塊 + 字首 */
function avatarHtml(channelOrName, avatarUrl, sizeClass) {
  const name = typeof channelOrName === 'string' ? channelOrName : (channelOrName && channelOrName.name) || '?';
  const url = avatarUrl !== undefined ? avatarUrl : (channelOrName && channelOrName.avatarUrl);
  if (url) return `<img class="avatar-circle ${sizeClass}" src="${url}" alt="${escapeHtml(name)}">`;
  return `<span class="avatar-circle ${sizeClass}" style="background:${pickColor(name)}">${initials(name)}</span>`;
}

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}
