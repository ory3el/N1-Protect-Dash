/* =====================================================================
   N1 PROTECT — Configuração PÚBLICA do navegador
   (a URL do projeto e a chave anon/publishable são feitas para ficar no frontend;
    quem protege os dados é a RLS do banco, não o sigilo destes valores)

   ⚠ NUNCA coloque aqui: service_role, senha do site, SITE_ACCESS_SIGNING_SECRET,
     Client Secret do Google ou qualquer outro segredo.

   Onde achar: Supabase > Project Settings > API (ou "Connect").
   Este arquivo deve ser carregado DEPOIS do script do supabase-js.
   ===================================================================== */
(function () {
  'use strict';

  const CONFIG = Object.freeze({
    SUPABASE_URL: 'https://nxdyyqjwwvjptdfmaxpi.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_SivRhG2nRO2MOI5mBTskhw_Dao4mfjE',
  });

  const configurado =
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(CONFIG.SUPABASE_URL) &&
    !/nxdyyqjwwvjptdfmaxpi/i.test(CONFIG.SUPABASE_URL) &&
    !/nxdyyqjwwvjptdfmaxpi/i.test(CONFIG.SUPABASE_ANON_KEY);

  const N1 = { config: CONFIG, configurado, sb: null };

  if (configurado && window.supabase && typeof window.supabase.createClient === 'function') {
    N1.sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',            // fluxo recomendado para OAuth em navegadores
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,    // conclui o retorno do Google automaticamente
      },
    });
  }

  /** Garante que exista a linha em public.profiles (o trigger do banco já cria; isto cobre contas antigas). */
  N1.garantirPerfil = async function (user) {
    if (!N1.sb || !user) return null;
    const meta = user.user_metadata || {};
    const { error } = await N1.sb.from('profiles').upsert(
      {
        id: user.id,
        email: user.email || null,
        full_name: meta.full_name || meta.name || null,
        avatar_url: meta.avatar_url || meta.picture || null,
      },
      { onConflict: 'id', ignoreDuplicates: true }   // ON CONFLICT DO NOTHING: nunca sobrescreve o que o usuário editou
    );
    if (error) console.warn('[N1] Não foi possível garantir o profile:', error.message);
    const { data } = await N1.sb.from('profiles').select('id,email,full_name,avatar_url').eq('id', user.id).maybeSingle();
    return data || null;
  };

  /** Aceita apenas caminhos internos como destino de redirecionamento (evita open redirect). */
  N1.destinoSeguro = function (valor, padrao) {
    if (typeof valor !== 'string') return padrao;
    if (!valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) return padrao;
    if (/^\/(login|acesso)(\/|$|\?)/.test(valor)) return padrao;
    return valor;
  };

  window.N1 = N1;
})();

