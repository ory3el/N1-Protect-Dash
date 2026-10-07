export const NOME_COOKIE = '__Host-n1_acesso';
export const TTL_SEG = 12 * 60 * 60;
export const RENOVAR_SE_RESTAR_MENOS_DE = 4 * 60 * 60;
export const VIDA_MAXIMA_SEG = 7 * 24 * 60 * 60;

const enc = new TextEncoder();

function b64urlParaBytes(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texto.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesParaB64url(bytes) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function importarChave(segredo, usos) {
  return crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, usos);
}

export async function assinarToken(segredo, { iat, exp }) {
  const payload = bytesParaB64url(enc.encode(JSON.stringify({ v: 1, iat, exp })));
  const chave = await importarChave(segredo, ['sign']);
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, enc.encode('token:' + payload)));
  return `v1.${payload}.${bytesParaB64url(assinatura)}`;
}

export async function verificarToken(segredo, token) {
  try {
    if (typeof token !== 'string' || token.length > 600) return null;
    const [versao, payload, assinatura] = token.split('.');
    if (versao !== 'v1' || !payload || !assinatura) return null;

    const chave = await importarChave(segredo, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', chave, b64urlParaBytes(assinatura), enc.encode('token:' + payload));
    if (!ok) return null;

    const dados = JSON.parse(new TextDecoder().decode(b64urlParaBytes(payload)));
    const agora = Math.floor(Date.now() / 1000);
    if (dados.v !== 1 || !Number.isFinite(dados.iat) || !Number.isFinite(dados.exp)) return null;
    if (dados.exp <= agora || dados.iat > agora + 300) return null;
    return { iat: dados.iat, exp: dados.exp };
  } catch {
    return null;
  }
}

export function lerCookie(request, nome) {
  const bruto = request.headers.get('Cookie') || '';
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i > -1 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

export function montarCookie(token, maxAgeSeg) {
  return `${NOME_COOKIE}=${token}; Max-Age=${maxAgeSeg}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export const CABECALHOS_SEGURANCA = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
};
