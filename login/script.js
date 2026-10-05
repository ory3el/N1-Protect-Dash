(function () {
    'use strict';

    const N1 = window.N1;
    const $ = (s) => document.querySelector(s);

    const elVerificando = $('#verificando');
    const elConteudo = $('#conteudo');
    const elAviso = $('#aviso');
    const form = $('#form-login');
    const inpEmail = $('#login-email');
    const inpSenha = $('#login-senha');
    const btnEntrar = $('#btn-entrar');
    const btnGoogle = $('#btn-google');
    const btnVer = $('#btn-ver-senha');

    let redirecionando = false;

    // ---------- mensagens ----------
    function aviso(texto, tipo) {
        elAviso.textContent = texto;               // textContent: nunca interpreta HTML
        elAviso.className = 'aviso visivel ' + (tipo || 'erro');
    }
    function limparAviso() { elAviso.className = 'aviso'; elAviso.textContent = ''; }

    function traduzirErro(e) {
        const msg = String((e && e.message) || '');
        const codigo = (e && (e.code || e.error_code)) || '';
        if (!navigator.onLine || /failed to fetch|network|load failed/i.test(msg)) {
            return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
        }
        if (/invalid login credentials/i.test(msg) || codigo === 'invalid_credentials') return 'E-mail ou senha incorretos.';
        if (/email not confirmed/i.test(msg) || codigo === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
        if (e && (e.status === 429 || codigo === 'over_request_rate_limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
        if (/user.*banned|banned/i.test(msg)) return 'Esta conta está desativada. Fale com o administrador.';
        return 'Não foi possível entrar agora. Tente novamente em instantes.';
    }

    function carregando(botao, ativo, textoOcioso) {
        botao.disabled = ativo;
        if (botao === btnEntrar) {
            botao.innerHTML = ativo ? '<span class="girando" aria-hidden="true"></span><span>Entrando…</span>' : textoOcioso;
        }
        if (botao === btnGoogle) {
            btnGoogle.querySelector('span').textContent = ativo ? 'Abrindo o Google…' : 'Entrar com Google';
        }
    }

    function travarFormulario(ativo) {
        inpEmail.disabled = ativo;
        inpSenha.disabled = ativo;
        btnVer.disabled = ativo;
        btnGoogle.disabled = ativo;
        btnEntrar.disabled = ativo;
    }

    // ---------- fluxo pós-login ----------
    async function concluirLogin(user) {
        if (redirecionando) return;
        redirecionando = true;
        elConteudo.classList.add('oculto');
        elVerificando.classList.remove('oculto');
        elVerificando.textContent = 'Entrando…';

        try { await N1.garantirPerfil(user); } catch (e) { console.warn('[login] profile:', e); }

        const params = new URLSearchParams(location.search);
        location.replace(N1.destinoSeguro(params.get('next'), '/'));
    }

    function mostrarFormulario() {
        elVerificando.classList.add('oculto');
        elConteudo.classList.remove('oculto');
    }

    // Erros devolvidos pelo Google/Supabase na URL (ex.: usuário cancelou a tela de consentimento)
    function lerErroDoRetorno() {
        const q = new URLSearchParams(location.search);
        const h = new URLSearchParams(location.hash.replace(/^#/, ''));
        const descricao = q.get('error_description') || h.get('error_description');
        const codigo = q.get('error') || h.get('error');
        if (!codigo && !descricao) return null;
        if (/access_denied/i.test(codigo || '')) return 'O login com Google foi cancelado.';
        return 'Não foi possível concluir o login com Google. Tente novamente.';
    }

    // ---------- eventos ----------
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        limparAviso();
        inpEmail.removeAttribute('aria-invalid');
        inpSenha.removeAttribute('aria-invalid');

        const email = inpEmail.value.trim();
        const senha = inpSenha.value;

        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            inpEmail.setAttribute('aria-invalid', 'true');
            aviso('Informe um e-mail válido.');
            inpEmail.focus();
            return;
        }
        if (!senha) {
            inpSenha.setAttribute('aria-invalid', 'true');
            aviso('Informe sua senha.');
            inpSenha.focus();
            return;
        }

        travarFormulario(true);
        carregando(btnEntrar, true);
        try {
            const { data, error } = await N1.sb.auth.signInWithPassword({ email, password: senha });
            if (error) throw error;
            await concluirLogin(data.user);
        } catch (e) {
            console.error('[login] signInWithPassword:', e);
            aviso(traduzirErro(e));
            inpSenha.value = '';
            travarFormulario(false);
            carregando(btnEntrar, false, 'Entrar');
            inpSenha.focus();
        }
    });

    btnGoogle.addEventListener('click', async () => {
        limparAviso();
        travarFormulario(true);
        carregando(btnGoogle, true);
        try {
            const params = new URLSearchParams(location.search);
            const next = N1.destinoSeguro(params.get('next'), '');
            const { error } = await N1.sb.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    // Esta URL precisa estar na lista "Redirect URLs" do Supabase
                    redirectTo: location.origin + '/login/' + (next ? '?next=' + encodeURIComponent(next) : ''),
                },
            });
            if (error) throw error;
            // Sucesso: o navegador é redirecionado ao Google; não há mais nada a fazer aqui.
        } catch (e) {
            console.error('[login] signInWithOAuth:', e);
            aviso(traduzirErro(e));
            travarFormulario(false);
            carregando(btnGoogle, false);
        }
    });

    btnVer.addEventListener('click', () => {
        const mostrar = inpSenha.type === 'password';
        inpSenha.type = mostrar ? 'text' : 'password';
        btnVer.setAttribute('aria-pressed', String(mostrar));
        btnVer.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
        $('#icone-olho').innerHTML = mostrar
            ? '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>'
            : '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>';
        inpSenha.focus();
    });

    // ---------- inicialização ----------
    async function iniciar() {
        if (!N1 || !N1.configurado || !N1.sb) {
            mostrarFormulario();
            travarFormulario(true);
            aviso('Sistema não configurado: preencha SUPABASE_URL e SUPABASE_ANON_KEY em config.js.');
            return;
        }

        const erroRetorno = lerErroDoRetorno();

        try {
            // Com PKCE, getSession() aguarda a troca do ?code= do Google antes de responder
            const { data, error } = await N1.sb.auth.getSession();
            if (error) throw error;
            if (data.session) {
                // Confirma no servidor que a sessão ainda vale (token não revogado)
                const { data: u, error: eu } = await N1.sb.auth.getUser();
                if (!eu && u && u.user) return concluirLogin(u.user);
                await N1.sb.auth.signOut({ scope: 'local' });
            }
        } catch (e) {
            console.error('[login] getSession:', e);
            mostrarFormulario();
            aviso(traduzirErro(e));
            return;
        }

        mostrarFormulario();
        if (erroRetorno) {
            aviso(erroRetorno);
            history.replaceState(null, '', location.pathname);
        }
    }

    iniciar();
})();
