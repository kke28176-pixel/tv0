/* ============================================================
   AERIX — 主伺服器
   Express（網頁 + API） + better-sqlite3（資料庫） + node-media-server（RTMP 直播 / HLS）
   ============================================================ */
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const db = require('./db');
const { setAuthCookie, clearAuthCookie, attachUser, requireAuth } = require('./auth');

const ROOT = path.join(__dirname, '..');
// 部署到雲端主機時，可以用環境變數把資料與上傳檔案放到「永久磁碟」
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
for (const d of ['videos', 'thumbs', 'avatars', 'banners']) fs.mkdirSync(path.join(UPLOAD_DIR, d), { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
const PORT = process.env.PORT || 3000;
const RTMP_PORT = 1935;
const MEDIA_HTTP_PORT = 8000;

const app = express();
app.set('trust proxy', 1); // 在 Render / Railway 等代理後面才能正確判斷 https
app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, {
  setHeaders(res) {
    // 阻止瀏覽器把影片檔當成附件自動下載；仍無法阻止使用者用開發者工具另存
    res.setHeader('Content-Disposition', 'inline');
  },
}));

const uid = (p = 'id') => `${p}_${crypto.randomBytes(8).toString('hex')}`;

/* ---------------- 檔案上傳設定 ---------------- */
const DEST_MAP = { video: 'videos', thumbnail: 'thumbs', avatar: 'avatars', banner: 'banners' };
const storage = multer.diskStorage({
  destination(req, file, cb) { cb(null, path.join(UPLOAD_DIR, DEST_MAP[file.fieldname] || 'videos')); },
  filename(req, file, cb) { cb(null, crypto.randomUUID() + (path.extname(file.originalname) || '')); },
});
const upload = multer({ storage, limits: { fileSize: 3 * 1024 * 1024 * 1024 } }); // 單檔最大 3GB

function fileUrl(field, filename) {
  return filename ? `/uploads/${DEST_MAP[field]}/${filename}` : null;
}

/* ---------------- 小工具 ---------------- */
function getChannelRow(id) { return db.prepare('SELECT * FROM channels WHERE id=?').get(id); }
function getUserRow(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id); }
function subscriberCount(channelId) {
  return db.prepare('SELECT COUNT(*) c FROM subscriptions WHERE channel_id=?').get(channelId).c;
}
function isSubscribed(userId, channelId) {
  if (!userId) return false;
  return !!db.prepare('SELECT 1 FROM subscriptions WHERE user_id=? AND channel_id=?').get(userId, channelId);
}
function serializeChannel(ch, viewerUserId) {
  return {
    id: ch.id,
    name: ch.name,
    handle: ch.handle,
    description: ch.description,
    avatarUrl: fileUrl('avatar', ch.avatar_path),
    bannerUrl: fileUrl('banner', ch.banner_path),
    isLive: !!ch.is_live,
    liveTitle: ch.live_title,
    liveStartedAt: ch.live_started_at,
    subscriberCount: subscriberCount(ch.id),
    isSubscribed: isSubscribed(viewerUserId, ch.id),
    isOwner: viewerUserId === ch.owner_user_id,
  };
}
function reactionCounts(videoId) {
  const likes = db.prepare("SELECT COUNT(*) c FROM video_reactions WHERE video_id=? AND value=1").get(videoId).c;
  const dislikes = db.prepare("SELECT COUNT(*) c FROM video_reactions WHERE video_id=? AND value=-1").get(videoId).c;
  return { likes, dislikes };
}
function myReaction(videoId, userId) {
  if (!userId) return 0;
  const row = db.prepare('SELECT value FROM video_reactions WHERE video_id=? AND user_id=?').get(videoId, userId);
  return row ? row.value : 0;
}
function serializeVideo(v, viewerUserId) {
  const ch = getChannelRow(v.channel_id);
  const { likes, dislikes } = reactionCounts(v.id);
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    visibility: v.visibility,
    thumbUrl: fileUrl('thumbnail', v.thumb_path),
    videoUrl: fileUrl('video', v.video_path),
    durationSeconds: v.duration_seconds,
    views: v.views,
    createdAt: v.created_at,
    likes, dislikes,
    myReaction: myReaction(v.id, viewerUserId),
    channel: ch ? { id: ch.id, name: ch.name, handle: ch.handle, avatarUrl: fileUrl('avatar', ch.avatar_path) } : null,
  };
}
function canSeeVideo(v, viewerUserId) {
  if (v.visibility === 'public') return true;
  const ch = getChannelRow(v.channel_id);
  return ch && ch.owner_user_id === viewerUserId;
}

/* ================= Auth ================= */
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 4) {
    return res.status(400).json({ error: '請填寫名稱、電子郵件，密碼至少 4 個字元。' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(emailNorm)) {
    return res.status(400).json({ error: '這個電子郵件已經被註冊過了。' });
  }
  const now = Date.now();
  const userId = uid('u');
  const channelId = uid('ch');
  let handle = '@' + emailNorm.split('@')[0].replace(/[^a-z0-9_.-]/gi, '');
  let handleTry = handle, n = 1;
  while (db.prepare('SELECT 1 FROM channels WHERE handle=?').get(handleTry)) { handleTry = handle + (n++); }

  const passwordHash = bcrypt.hashSync(password, 10);
  const streamKey = crypto.randomBytes(16).toString('hex');

  db.prepare('INSERT INTO users (id,name,email,password_hash,channel_id,created_at) VALUES (?,?,?,?,?,?)')
    .run(userId, name.trim(), emailNorm, passwordHash, channelId, now);
  db.prepare(`INSERT INTO channels (id,owner_user_id,name,handle,description,stream_key,created_at)
              VALUES (?,?,?,?,?,?,?)`)
    .run(channelId, userId, name.trim(), handleTry, '', streamKey, now);

  setAuthCookie(res, userId);
  res.json({ user: { id: userId, name: name.trim(), email: emailNorm, channelId } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = String(email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(emailNorm);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(400).json({ error: '帳號或密碼不正確。' });
  }
  setAuthCookie(res, user.id);
  res.json({ user: { id: user.id, name: user.name, email: user.email, channelId: user.channel_id } });
});

app.post('/api/auth/logout', (req, res) => { clearAuthCookie(res); res.json({ ok: true }); });

app.get('/api/auth/me', (req, res) => {
  if (!req.userId) return res.json({ user: null });
  const user = getUserRow(req.userId);
  if (!user) return res.json({ user: null });
  res.json({ user: { id: user.id, name: user.name, email: user.email, channelId: user.channel_id } });
});

/* ================= Videos ================= */
app.get('/api/videos', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  let rows = db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
  rows = rows.filter(v => canSeeVideo(v, req.userId));
  if (q) {
    rows = rows.filter(v => {
      const ch = getChannelRow(v.channel_id);
      return v.title.toLowerCase().includes(q) || (ch && ch.name.toLowerCase().includes(q));
    });
  }
  res.json({ videos: rows.map(v => serializeVideo(v, req.userId)) });
});

app.get('/api/videos/mine', requireAuth, (req, res) => {
  const user = getUserRow(req.userId);
  const rows = db.prepare('SELECT * FROM videos WHERE channel_id=? ORDER BY created_at DESC').all(user.channel_id);
  res.json({ videos: rows.map(v => serializeVideo(v, req.userId)) });
});

app.get('/api/videos/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
  if (!v || !canSeeVideo(v, req.userId)) return res.status(404).json({ error: '找不到這支影片。' });
  db.prepare('UPDATE videos SET views = views + 1 WHERE id=?').run(v.id);
  const fresh = db.prepare('SELECT * FROM videos WHERE id=?').get(v.id);
  res.json({ video: serializeVideo(fresh, req.userId) });
});

app.post('/api/videos', requireAuth, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), (req, res) => {
  const user = getUserRow(req.userId);
  const videoFile = req.files && req.files.video && req.files.video[0];
  const thumbFile = req.files && req.files.thumbnail && req.files.thumbnail[0];
  if (!videoFile) return res.status(400).json({ error: '請選擇要上傳的影片檔案。' });
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: '請輸入標題。' });

  const id = uid('v');
  const now = Date.now();
  db.prepare(`INSERT INTO videos (id,channel_id,title,description,visibility,thumb_path,video_path,duration_seconds,views,created_at)
              VALUES (?,?,?,?,?,?,?,?,0,?)`)
    .run(id, user.channel_id, title, (req.body.description || '').trim(), req.body.visibility || 'public',
      thumbFile ? thumbFile.filename : null, videoFile.filename, parseInt(req.body.durationSeconds || '0', 10), now);

  res.json({ video: serializeVideo(db.prepare('SELECT * FROM videos WHERE id=?').get(id), req.userId) });
});

function ownsVideo(req, video) {
  const ch = getChannelRow(video.channel_id);
  return ch && ch.owner_user_id === req.userId;
}

app.patch('/api/videos/:id', requireAuth, (req, res) => {
  const v = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
  if (!v || !ownsVideo(req, v)) return res.status(403).json({ error: '沒有權限。' });
  const title = req.body.title !== undefined ? String(req.body.title).trim() : v.title;
  const description = req.body.description !== undefined ? String(req.body.description).trim() : v.description;
  const visibility = ['public', 'unlisted', 'private'].includes(req.body.visibility) ? req.body.visibility : v.visibility;
  db.prepare('UPDATE videos SET title=?, description=?, visibility=? WHERE id=?').run(title, description, visibility, v.id);
  res.json({ video: serializeVideo(db.prepare('SELECT * FROM videos WHERE id=?').get(v.id), req.userId) });
});

app.post('/api/videos/:id/thumbnail', requireAuth, upload.single('thumbnail'), (req, res) => {
  const v = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
  if (!v || !ownsVideo(req, v)) return res.status(403).json({ error: '沒有權限。' });
  if (!req.file) return res.status(400).json({ error: '沒有收到圖片檔案。' });
  const old = v.thumb_path;
  db.prepare('UPDATE videos SET thumb_path=? WHERE id=?').run(req.file.filename, v.id);
  if (old) fs.unlink(path.join(UPLOAD_DIR, 'thumbs', old), () => {});
  res.json({ video: serializeVideo(db.prepare('SELECT * FROM videos WHERE id=?').get(v.id), req.userId) });
});

app.delete('/api/videos/:id', requireAuth, (req, res) => {
  const v = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
  if (!v || !ownsVideo(req, v)) return res.status(403).json({ error: '沒有權限。' });
  db.prepare('DELETE FROM comments WHERE video_id=?').run(v.id);
  db.prepare('DELETE FROM video_reactions WHERE video_id=?').run(v.id);
  db.prepare('DELETE FROM videos WHERE id=?').run(v.id);
  if (v.video_path) fs.unlink(path.join(UPLOAD_DIR, 'videos', v.video_path), () => {});
  if (v.thumb_path) fs.unlink(path.join(UPLOAD_DIR, 'thumbs', v.thumb_path), () => {});
  res.json({ ok: true });
});

app.post('/api/videos/:id/react', requireAuth, (req, res) => {
  const v = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
  if (!v) return res.status(404).json({ error: '找不到影片。' });
  const value = parseInt(req.body.value, 10);
  if (![1, -1, 0].includes(value)) return res.status(400).json({ error: '參數錯誤。' });
  if (value === 0) db.prepare('DELETE FROM video_reactions WHERE video_id=? AND user_id=?').run(v.id, req.userId);
  else db.prepare(`INSERT INTO video_reactions (video_id,user_id,value) VALUES (?,?,?)
                   ON CONFLICT(video_id,user_id) DO UPDATE SET value=excluded.value`).run(v.id, req.userId, value);
  const { likes, dislikes } = reactionCounts(v.id);
  res.json({ likes, dislikes, myReaction: value });
});

/* ---- Comments ---- */
app.get('/api/videos/:id/comments', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.text, c.created_at, c.user_id, u.name as user_name,
      (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) as likes
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.video_id = ? ORDER BY c.created_at DESC`).all(req.params.id);
  const liked = new Set();
  if (req.userId) {
    db.prepare('SELECT comment_id FROM comment_likes WHERE user_id=?').all(req.userId).forEach(r => liked.add(r.comment_id));
  }
  res.json({ comments: rows.map(r => ({ id: r.id, text: r.text, createdAt: r.created_at, userName: r.user_name, likes: r.likes, likedByMe: liked.has(r.id) })) });
});

app.post('/api/videos/:id/comments', requireAuth, (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: '留言不能是空的。' });
  const v = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
  if (!v) return res.status(404).json({ error: '找不到影片。' });
  const id = uid('c');
  db.prepare('INSERT INTO comments (id,video_id,user_id,text,created_at) VALUES (?,?,?,?,?)')
    .run(id, v.id, req.userId, text, Date.now());
  const user = getUserRow(req.userId);
  res.json({ comment: { id, text, createdAt: Date.now(), userName: user.name, likes: 0, likedByMe: false } });
});

app.post('/api/comments/:id/like', requireAuth, (req, res) => {
  const exists = db.prepare('SELECT 1 FROM comment_likes WHERE comment_id=? AND user_id=?').get(req.params.id, req.userId);
  if (exists) db.prepare('DELETE FROM comment_likes WHERE comment_id=? AND user_id=?').run(req.params.id, req.userId);
  else db.prepare('INSERT INTO comment_likes (comment_id,user_id) VALUES (?,?)').run(req.params.id, req.userId);
  const likes = db.prepare('SELECT COUNT(*) c FROM comment_likes WHERE comment_id=?').get(req.params.id).c;
  res.json({ likes, likedByMe: !exists });
});

/* ================= Channels ================= */
app.get('/api/channels/:id', (req, res) => {
  const ch = getChannelRow(req.params.id);
  if (!ch) return res.status(404).json({ error: '找不到頻道。' });
  res.json({ channel: serializeChannel(ch, req.userId) });
});

app.get('/api/channels/:id/videos', (req, res) => {
  const ch = getChannelRow(req.params.id);
  if (!ch) return res.status(404).json({ error: '找不到頻道。' });
  let rows = db.prepare('SELECT * FROM videos WHERE channel_id=? ORDER BY created_at DESC').all(ch.id);
  rows = rows.filter(v => canSeeVideo(v, req.userId));
  res.json({ videos: rows.map(v => serializeVideo(v, req.userId)) });
});

function ownsChannel(req, ch) { return ch && ch.owner_user_id === req.userId; }

app.patch('/api/channels/:id', requireAuth, (req, res) => {
  const ch = getChannelRow(req.params.id);
  if (!ownsChannel(req, ch)) return res.status(403).json({ error: '沒有權限。' });
  const name = req.body.name !== undefined ? String(req.body.name).trim() : ch.name;
  const description = req.body.description !== undefined ? String(req.body.description).trim() : ch.description;
  let handle = ch.handle;
  if (req.body.handle !== undefined) {
    const wanted = String(req.body.handle).trim().replace(/\s+/g, '');
    if (wanted && wanted !== ch.handle) {
      const clash = db.prepare('SELECT 1 FROM channels WHERE handle=? AND id<>?').get(wanted, ch.id);
      if (clash) return res.status(400).json({ error: '這個頻道代稱已經有人使用了。' });
      handle = wanted;
    }
  }
  db.prepare('UPDATE channels SET name=?, description=?, handle=? WHERE id=?').run(name, description, handle, ch.id);
  res.json({ channel: serializeChannel(getChannelRow(ch.id), req.userId) });
});

app.post('/api/channels/:id/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  const ch = getChannelRow(req.params.id);
  if (!ownsChannel(req, ch)) return res.status(403).json({ error: '沒有權限。' });
  if (!req.file) return res.status(400).json({ error: '沒有收到圖片。' });
  const old = ch.avatar_path;
  db.prepare('UPDATE channels SET avatar_path=? WHERE id=?').run(req.file.filename, ch.id);
  if (old) fs.unlink(path.join(UPLOAD_DIR, 'avatars', old), () => {});
  res.json({ channel: serializeChannel(getChannelRow(ch.id), req.userId) });
});

app.post('/api/channels/:id/banner', requireAuth, upload.single('banner'), (req, res) => {
  const ch = getChannelRow(req.params.id);
  if (!ownsChannel(req, ch)) return res.status(403).json({ error: '沒有權限。' });
  if (!req.file) return res.status(400).json({ error: '沒有收到圖片。' });
  const old = ch.banner_path;
  db.prepare('UPDATE channels SET banner_path=? WHERE id=?').run(req.file.filename, ch.id);
  if (old) fs.unlink(path.join(UPLOAD_DIR, 'banners', old), () => {});
  res.json({ channel: serializeChannel(getChannelRow(ch.id), req.userId) });
});

app.post('/api/channels/:id/subscribe', requireAuth, (req, res) => {
  const ch = getChannelRow(req.params.id);
  if (!ch) return res.status(404).json({ error: '找不到頻道。' });
  const already = isSubscribed(req.userId, ch.id);
  if (already) db.prepare('DELETE FROM subscriptions WHERE user_id=? AND channel_id=?').run(req.userId, ch.id);
  else db.prepare('INSERT INTO subscriptions (user_id,channel_id,created_at) VALUES (?,?,?)').run(req.userId, ch.id, Date.now());
  res.json({ isSubscribed: !already, subscriberCount: subscriberCount(ch.id) });
});

app.get('/api/channels/mine/subscriptions', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT c.* FROM channels c JOIN subscriptions s ON s.channel_id=c.id WHERE s.user_id=?`).all(req.userId);
  res.json({ channels: rows.map(c => serializeChannel(c, req.userId)) });
});

/* ---- 直播 ---- */
function lanAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

app.get('/api/channels/:id/stream-info', requireAuth, (req, res) => {
  const ch = getChannelRow(req.params.id);
  if (!ownsChannel(req, ch)) return res.status(403).json({ error: '沒有權限。' });
  res.json({
    rtmpUrlLocalhost: `rtmp://localhost:${RTMP_PORT}/live`,
    rtmpUrlLan: lanAddress() ? `rtmp://${lanAddress()}:${RTMP_PORT}/live` : null,
    streamKey: `${ch.id}?key=${ch.stream_key}`,
    pendingLiveTitle: ch.pending_live_title,
  });
});

app.post('/api/channels/:id/live-title', requireAuth, (req, res) => {
  const ch = getChannelRow(req.params.id);
  if (!ownsChannel(req, ch)) return res.status(403).json({ error: '沒有權限。' });
  const title = (req.body.title || '').trim();
  db.prepare('UPDATE channels SET pending_live_title=? WHERE id=?').run(title, ch.id);
  res.json({ ok: true });
});

app.get('/api/live/list', (req, res) => {
  const rows = db.prepare('SELECT * FROM channels WHERE is_live=1').all();
  res.json({ channels: rows.map(c => serializeChannel(c, req.userId)) });
});

app.get('/api/live/status', (req, res) => {
  const ch = getChannelRow(req.query.channelId);
  if (!ch) return res.status(404).json({ error: '找不到頻道。' });
  res.json({
    isLive: !!ch.is_live,
    liveTitle: ch.live_title,
    liveStartedAt: ch.live_started_at,
    hlsPath: `/live/${ch.id}/index.m3u8`,
    mediaPort: MEDIA_HTTP_PORT,
  });
});

/* ---- 直播聊天室（純記憶體，重啟伺服器或直播結束就會清空，不寫進資料庫） ---- */
const liveChats = new Map(); // channelId -> [{id,name,text,ts}]
let chatMsgCounter = 1;

app.get('/api/live/chat', (req, res) => {
  const channelId = req.query.channelId;
  const sinceId = parseInt(req.query.sinceId || '0', 10);
  const list = liveChats.get(channelId) || [];
  res.json({ messages: list.filter(m => m.id > sinceId) });
});

app.post('/api/live/chat', (req, res) => {
  const channelId = req.body.channelId;
  const text = String(req.body.text || '').trim().slice(0, 200);
  if (!channelId || !text) return res.status(400).json({ error: '訊息不能是空的。' });
  const name = req.userId ? getUserRow(req.userId).name : (String(req.body.name || '訪客').slice(0, 20));
  const msg = { id: chatMsgCounter++, name, text, ts: Date.now() };
  const list = liveChats.get(channelId) || [];
  list.push(msg);
  if (list.length > 300) list.shift();
  liveChats.set(channelId, list);
  res.json({ message: msg });
});

/* ---- 找不到的 API 路由 ---- */
app.use('/api', (req, res) => res.status(404).json({ error: 'API 不存在。' }));

/* ---- 其餘路徑都交給前端頁面（找不到就回首頁，方便直接貼網址） ---- */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/uploads')) return next();
  const filePath = path.join(ROOT, 'public', req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return res.sendFile(filePath);
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

/* ================= 啟動 Express ================= */
app.listen(PORT, () => {
  console.log(`\nAERIX 網站已啟動 → http://localhost:${PORT}\n`);
});

/* ================= 啟動 RTMP 直播伺服器 ================= */
const NodeMediaServer = require('node-media-server');
const ffmpegPath = require('ffmpeg-static');

const nms = new NodeMediaServer({
  logType: 1,
  rtmp: { port: RTMP_PORT, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 },
  http: { port: MEDIA_HTTP_PORT, mediaroot: path.join(ROOT, 'media'), allow_origin: '*' },
  trans: {
    ffmpeg: ffmpegPath,
    tasks: [{ app: 'live', hls: true, hlsFlags: '[hls_time=2:hls_list_size=6:hls_flags=delete_segments]' }],
  },
});

const publishingSessions = new Map(); // node-media-server session id -> channelId

nms.on('prePublish', (id, StreamPath, args) => {
  // StreamPath 形如 /live/<channelId>；串流金鑰是 OBS 端網址列附加的 ?key=xxx，
  // node-media-server 會把它解析成 args.key。
  const session = nms.getSession(id);
  const parts = StreamPath.split('/').filter(Boolean); // ['live', channelId]
  const channelId = parts[1];
  const ch = getChannelRow(channelId);
  const suppliedKey = args && args.key;
  if (!ch || !suppliedKey || suppliedKey !== ch.stream_key) {
    console.log('[live] 拒絕未授權的推流：', StreamPath);
    session.reject();
    return;
  }
  publishingSessions.set(id, channelId);
});

nms.on('postPublish', (id) => {
  const channelId = publishingSessions.get(id);
  if (!channelId) return;
  const ch = getChannelRow(channelId);
  if (!ch) return;
  const title = ch.pending_live_title && ch.pending_live_title.trim() ? ch.pending_live_title.trim() : `${ch.name} 的直播`;
  db.prepare('UPDATE channels SET is_live=1, live_title=?, live_started_at=? WHERE id=?').run(title, Date.now(), channelId);
  console.log(`[live] 頻道 ${ch.name} 開始直播`);
});

nms.on('donePublish', (id) => {
  const channelId = publishingSessions.get(id);
  if (channelId) {
    db.prepare("UPDATE channels SET is_live=0, live_title='', live_started_at=NULL WHERE id=?").run(channelId);
    publishingSessions.delete(id);
    liveChats.delete(channelId);
    console.log('[live] 直播已結束：', channelId);
  }
});

nms.run();
console.log(`AERIX 直播伺服器：RTMP rtmp://localhost:${RTMP_PORT}/live ，HLS 播放埠 ${MEDIA_HTTP_PORT}`);
