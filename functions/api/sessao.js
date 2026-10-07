import { verificarToken, montarCookie } from '../_lib/acesso.js';

const SEM_CACHE = { 'cache-control': 'no-store' };

function respostaJson(status, corpo, extras = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SEM_CACHE, ...extras },
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  // Só aceita chamadas feitas pelo próprio site (defesa extra contra requisições de outras origens)
  const origem = request.headers.get('Origin');
  if (origem && origem !== url.origin) return respostaJson(403, { erro: 'origem_invalida' });

  const segredo = env.SITE_ACCESS_SIGNING_SECRET;
  if (!segredo || segredo.length < 32) return respostaJson(503, { erro: 'erro_servidor' });

  let token = '';
  try {
    const corpo = await request.json();
    token = typeof corpo?.token === 'string' ? corpo.token : '';
  } catch {
    return respostaJson(400, { erro: 'requisicao_invalida' });
  }

  const dados = await verificarToken(segredo, token);
  if (!dados) return respostaJson(401, { erro: 'token_invalido' });

  const restante = dados.exp - Math.floor(Date.now() / 1000);
  return new Response(null, {
    status: 204,
    headers: { ...SEM_CACHE, 'Set-Cookie': montarCookie(token, restante) },
  });
}

export async function onRequestGet() {
  return new Response(null, { status: 204, headers: SEM_CACHE });
}
