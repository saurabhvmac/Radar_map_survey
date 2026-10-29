import crypto from 'node:crypto';

const secret = () => process.env.APP_SECRET || 'dev-only-secret-do-not-use-in-production';
const b64 = s => Buffer.from(s).toString('base64url');

export function sign(payload, ttlSeconds) {
  const data = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${data}.${crypto.createHmac('sha256', secret()).update(data).digest('base64url')}`;
}

export function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  const a = Buffer.from(sig || ''), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString());
    return body.exp > Date.now() / 1000 ? body : null;
  } catch { return null; }
}

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Stable student ID derived from the email, so the Exit Survey finds the Entry Survey without sign-in.
export const studentIdFor = email =>
  'YBY-' + crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 12).toUpperCase();
