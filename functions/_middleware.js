import {
  NOME_COOKIE, TTL_SEG, RENOVAR_SE_RESTAR_MENOS_DE, VIDA_MAXIMA_SEG,
  verificarToken, assinarToken, lerCookie, montarCookie, CABECALHOS_SEGURANCA,
} from './_lib/acesso.js';

const PUBLICOS_EXATOS = new Set(['/config.js', '/login/login.css', '/favicon.ico']);
const PUBLICOS_PREFIXOS = ['/acesso/', '/images/'];

function ehPublico(caminho, metodo) {
  if (caminho === '/acesso') return true;
  if (caminho === '/api/sessao' && metodo === 'POST') return true;
  if (PUBLICOS_EXATOS.has(caminho)) return true;
  return PUBLICOS_PREFIXOS.some((p) => caminho.startsWith(p));
}

function comCabecalhos(resposta, extras = {}) {
  const r = new Response(resposta.body, resposta);
  for (const [k, v] of Object.entries(CABECALHOS_SEGURANCA)) r.headers.set(k, v);
  for (const [k, v] of Object.entries(extras)) r.headers.append(k, v);
  return r;
}

function negar(request, url, motivo) {
  if (url.pathname.startsWith('/api/')) {
    return comCabecalhos(new Response(JSON.stringify({ erro: motivo }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    }));
  }
  const destino = new URL('/acesso/', url.origin);
  destino.searchParams.set('motivo', motivo);
  if (request.method === 'GET') destino.searchParams.set('next', url.pathname + url.search);
  return comCabecalhos(new Response(null, {
    status: 302,
    headers: { Location: destino.pathname + destino.search, 'cache-control': 'no-store' },
  }));
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const segredo = env.SITE_ACCESS_SIGNING_SECRET;
  if (!segredo || segredo.length < 32) {
    return comCabecalhos(new Response('Site indisponível: configuração de segurança incompleta.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    }));
  }

  if (ehPublico(url.pathname, request.method)) {
    return comCabecalhos(await next());
  }

  const token = lerCookie(request, NOME_COOKIE);
  const dados = token ? await verificarToken(segredo, token) : null;
  if (!dados) return negar(request, url, token ? 'expirada' : 'necessaria');

  const resposta = await next();
  const agora = Math.floor(Date.now() / 1000);
  const extras = {};
  if (dados.exp - agora < RENOVAR_SE_RESTAR_MENOS_DE && agora - dados.iat < VIDA_MAXIMA_SEG) {
    const exp = Math.min(agora + TTL_SEG, dados.iat + VIDA_MAXIMA_SEG);
    extras['Set-Cookie'] = montarCookie(await assinarToken(segredo, { iat: dados.iat, exp }), exp - agora);
  }

  const final = comCabecalhos(resposta, extras);
  if (!final.headers.has('Cache-Control') || /public/.test(final.headers.get('Cache-Control'))) {
    final.headers.set('Cache-Control', 'private, no-cache');
  }
  return final;
}
