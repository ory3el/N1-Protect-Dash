(function () {
    'use strict';

    const N1 = window.N1;
    const $ = (s) => document.querySelector(s);

    const form = $('#form-acesso');
    const inpSenha = $('#acesso-senha');
    const btn = $('#btn-acessar');
    const btnVer = $('#btn-ver-senha');
    const elAviso = $('#aviso');

    let bloqueadoAte = 0;
    let timerContagem = null;

    function aviso(texto, tipo) {
        elAviso.textContent = texto;
        elAviso.className = 'aviso visivel ' + (tipo || 'erro');
    }
    function limparAviso() { elAviso.className = 'aviso'; elAviso.textContent = ''; }

    function travar(ativo, rotulo) {
        inpSenha.disabled = ativo;
        btnVer.disabled = ativo;
        btn.disabled = ativo;
        btn.innerHTML = ativo
            ? '<span class="girando" aria-hidden="true"></span><span>' + (rotulo || 'Verificando…') + '</span>'
            : 'Acessar';
    }

    function formatarEspera(seg) {
        const m = Math.floor(seg / 60);
        const s = seg % 60;
        return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
    }

    // Contagem regressiva quando o servidor bloqueia por excesso de tentativas
    function iniciarBloqueio(segundos) {
        bloqueadoAte = Date.now() + segundos * 1000;
        clearInterval(timerContagem);
        const tick = () => {
            const falta = Math.ceil((bloqueadoAte - Date.now()) / 1000);
            if (falta <= 0) {
                clearInterval(timerContagem);
                limparAviso();
                travar(false);
                inpSenha.focus();
                return;
            }
            travar(true, 'Aguarde ' + formatarEspera(falta));
            aviso('Muitas tentativas incorretas. Tente novamente em ' + formatarEspera(falta) + '.');
        };
        tick();
        timerContagem = setInterval(tick, 1000);
    }

    // Mensagem inicial conforme o motivo do redirecionamento feito pelo middleware
    (function mensagemInicial() {
        const motivo = new URLSearchParams(location.search).get('motivo');
        if (motivo === 'expirada') aviso('Seu acesso expirou. Digite a senha novamente.', 'info');
    })();

    function urlDaFuncao() {
        return N1.config.SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/site-access';
    }

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (Date.now() < bloqueadoAte) return;
        limparAviso();

        const senha = inpSenha.value;
        if (!senha) { aviso('Digite a senha de acesso.'); inpSenha.focus(); return; }

        if (!N1 || !N1.configurado) {
            aviso('Sistema não configurado: preencha SUPABASE_URL em config.js.');
            return;
        }

        travar(true);
        try {
            // 1) Senha → Edge Function
            const r1 = await fetch(urlDaFuncao(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senha }),
                cache: 'no-store',
            });
            const corpo = await r1.json().catch(() => ({}));

            if (r1.status === 429) { inpSenha.value = ''; iniciarBloqueio(Number(corpo.retry_apos) || 60); return; }
            if (r1.status === 401) {
                inpSenha.value = '';
                const resta = Number(corpo.tentativas_restantes);
                aviso('Senha incorreta.' + (Number.isFinite(resta) && resta > 0 && resta <= 3
                    ? ` Restam ${resta} tentativa${resta > 1 ? 's' : ''}.` : ''));
                travar(false); inpSenha.focus();
                return;
            }
            if (!r1.ok || !corpo.token) throw new Error('Resposta inesperada do servidor (' + r1.status + ')');

            // 2) Token → cookie HttpOnly (mesma origem)
            const r2 = await fetch('/api/sessao', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: corpo.token }),
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (r2.status !== 204) throw new Error('Não foi possível iniciar o acesso (' + r2.status + ')');

            inpSenha.value = '';
            const next = N1.destinoSeguro(new URLSearchParams(location.search).get('next'), '/login/');
            location.replace(next);
        } catch (e) {
            console.error('[acesso]', e);
            aviso(!navigator.onLine
                ? 'Sem conexão com a internet. Verifique e tente novamente.'
                : 'Erro temporário no servidor. Aguarde alguns instantes e tente de novo.');
            travar(false);
        }
    });

    btnVer.addEventListener('click', () => {
        const mostrar = inpSenha.type === 'password';
        inpSenha.type = mostrar ? 'text' : 'password';
        btnVer.setAttribute('aria-pressed', String(mostrar));
        btnVer.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
        inpSenha.focus();
    });
})();
