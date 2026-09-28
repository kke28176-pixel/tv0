/* ============================================================
   AERIX — 身份驗證（JWT + httpOnly Cookie）
   ============================================================ */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// JWT 密鑰存在 data/jwt-secret.txt，第一次啟動時產生一次即可；
// 這樣重啟伺服器不會讓所有人被登出，登入狀態會一直保存到使用者自己登出為止。
const SECRET_PATH = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'jwt-secret.txt');
let JWT_SECRET;
try {
  JWT_SECRET = fs.readFileSync(SECRET_PATH, 'utf8').trim();
  if (!JWT_SECRET) throw new Error('empty');
} catch (e) {
  JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(SECRET_PATH), { recursive: true });
  fs.writeFileSync(SECRET_PATH, JWT_SECRET);
}
const COOKIE_NAME = 'aerix_token';

function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, userId) {
  const token = signToken(userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!(res.req && res.req.secure),
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

/** 有登入就把 req.userId 設起來；沒登入也放行（給公開路由用） */
function attachUser(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.userId = payload.uid;
    } catch (e) {
      req.userId = null;
    }
  }
  next();
}

/** 一定要登入才能通過，否則回 401 */
function requireAuth(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: '請先登入。' });
  next();
}

module.exports = { setAuthCookie, clearAuthCookie, attachUser, requireAuth, COOKIE_NAME };
