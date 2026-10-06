/* =====================================================================
   N1 PROTECT — Aplicação principal
   - Fonte oficial dos dados: Supabase (PostgreSQL + RLS). Nada sensível fica no navegador.
   - Autorização: feita pelo banco (RLS). Esconder elementos aqui é só experiência de uso.
   - Todo texto vindo do usuário passa por esc() antes de entrar em innerHTML (anti-XSS).
   ===================================================================== */
(function () {
    'use strict';

    const N1 = window.N1;
    const sb = N1 && N1.sb;

    // =================================================================
    // 1. UTILITÁRIOS
    // =================================================================
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    /** Escapa texto para uso seguro em HTML e em atributos. */
    function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => MAPA_ESC[c]); }
    const escBr = (v) => esc(v).replace(/\r?\n/g, '<br>');

    const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const moeda = (n) => fmtMoeda.format(Number(n) || 0);
    const arred2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    const soma2 = (lista, fn) => arred2(lista.reduce((s, x) => s + (Number(fn(x)) || 0), 0));

    /** Lê um campo com máscara de moeda (só os dígitos importam: 12345 → 123,45). */
    function lerMoeda(input) {
        const d = String(input.value || '').replace(/\D/g, '').slice(0, 11);
        return d ? Number(d) / 100 : 0;
    }
    function definirMoeda(input, n) { input.value = n === null || n === undefined || n === '' ? '' : moeda(n); }
    function aplicarMascaraMoeda(input) {
        const d = input.value.replace(/\D/g, '').slice(0, 11).replace(/^0+(?=\d)/, '');
        input.value = d ? moeda(Number(d) / 100) : '';
    }

    function lerQuantidade(txt) {
        const n = parseFloat(String(txt ?? '').trim().replace(',', '.'));
        return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
    }
    function fmtQtd(n) {
        n = Number(n) || 0;
        return Number.isInteger(n) ? String(n).padStart(2, '0') : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    }

    const pad = (n) => String(n).padStart(4, '0');
    function hojeISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
    const horaCurta = (h) => (h ? String(h).slice(0, 5) : '');
    function diasAte(iso) {
        const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        return Math.round((new Date(a, m - 1, d) - hoje) / 86400000);
    }
    const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const slug = (s) => normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cliente';
    const valorOuNull = (v) => { const t = String(v || '').trim(); return t ? t : null; };

    function telefoneWhatsapp(tel) {
        let d = String(tel || '').replace(/\D/g, '').replace(/^0+/, '');
        if (d.length === 10 || d.length === 11) d = '55' + d;
        return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d : null;
    }

    function baixarBlob(blob, nome) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    // =================================================================
    // 2. ESTADO
    // =================================================================
    const estado = { usuario: null, perfil: null, clientes: [], orcamentos: [], agenda: [], declaracoes: [] };
    const ABAS = ['dashboard', 'clientes', 'orcamentos', 'agenda', 'declaracao'];
    const ROTULO_AGENDA = { agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado' };
    const ROTULO_DEC = { aberta: 'Em aberto', concluida: 'Concluída', cancelada: 'Cancelada' };

    const acharCliente = (id) => estado.clientes.find((c) => c.id === id);
    const acharOrcamento = (id) => estado.orcamentos.find((o) => o.id === id);
    const acharAgenda = (id) => estado.agenda.find((a) => a.id === id);
    const acharDeclaracao = (id) => estado.declaracoes.find((d) => d.id === id);
    const nomeDoCliente = (id) => (acharCliente(id) || {}).nome || 'Cliente removido';

    let ctrlOrcNovo = null;     // controlador do formulário de novo orçamento
    let ctrlEdicao = null;      // controlador do formulário de edição (modal)
    let docAtual = null;        // contexto do documento aberto (para imagem / WhatsApp)
    let legadoPendente = null;  // dados antigos do localStorage aguardando importação

    // =================================================================
    // 3. FEEDBACK: toasts, confirmação, modais, erros
    // =================================================================
    function toast(msg, tipo = 'info', ms = 4500) {
        const el = document.createElement('div');
        el.className = 'toast ' + tipo;
        el.textContent = msg;                               // textContent: sem interpretar HTML
        $('#toasts').appendChild(el);
        setTimeout(() => el.remove(), ms);
    }

    function atualizarRolagem() {
        const aberto = $('#modal').classList.contains('aberto') ||
            $('#modal-confirmar').classList.contains('aberto') ||
            $('#overlay-documento').classList.contains('aberto');
        document.body.classList.toggle('sem-rolagem', aberto);
    }

    function abrirModal(html, { largo = false } = {}) {
        const conteudo = $('#modal-conteudo');
        conteudo.className = 'modal-content' + (largo ? ' largo' : '');
        conteudo.innerHTML = html;
        $('#modal').classList.add('aberto');
        atualizarRolagem();
        const primeiro = $('input:not([readonly]):not([type="hidden"]):not([disabled]), select, textarea', conteudo);
        if (primeiro) setTimeout(() => primeiro.focus(), 40);
    }
    function fecharModal() {
        $('#modal').classList.remove('aberto');
        $('#modal-conteudo').innerHTML = '';
        ctrlEdicao = null;
        atualizarRolagem();
    }

    /** Substitui confirm(): devolve uma Promise<boolean>. */
    function confirmar({ titulo = 'Confirmar', mensagem = '', textoSim = 'Confirmar', perigo = false }) {
        return new Promise((resolve) => {
            const el = $('#modal-confirmar');
            const sim = $('#confirmar-sim');
            const nao = $('#confirmar-nao');
            $('#confirmar-titulo').textContent = titulo;
            $('#confirmar-texto').textContent = mensagem;
            sim.textContent = textoSim;
            sim.className = perigo ? 'btn-danger' : 'btn-primary';

            const fim = (resposta) => {
                el.classList.remove('aberto');
                sim.removeEventListener('click', aoSim);
                nao.removeEventListener('click', aoNao);
                document.removeEventListener('keydown', aoTecla, true);
                atualizarRolagem();
                resolve(resposta);
            };
            const aoSim = () => fim(true);
            const aoNao = () => fim(false);
            const aoTecla = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); fim(false); } };

            sim.addEventListener('click', aoSim);
            nao.addEventListener('click', aoNao);
            document.addEventListener('keydown', aoTecla, true);
            el.classList.add('aberto');
            atualizarRolagem();
            nao.focus();
        });
    }

    /** Executa uma operação assíncrona com botão em "carregando" e tratamento de erro. */
    async function executar(botao, texto, msgErro, fn) {
        const original = botao ? botao.innerHTML : '';
        if (botao) { botao.disabled = true; botao.classList.add('carregando'); botao.textContent = texto; }
        try { await fn(); return true; }
        catch (e) { tratarErro(e, msgErro); return false; }
        finally {
            if (botao && botao.isConnected) { botao.disabled = false; botao.classList.remove('carregando'); botao.innerHTML = original; }
        }
    }

    let saindo = false;
    function irParaLogin() { if (saindo) return; saindo = true; location.replace('/login/'); }
    function ehErroDeSessao(e) {
        return !!e && (e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt (expired|invalid)/i.test(e.message || ''));
    }
    function sessaoExpirada() {
        toast('Sua sessão expirou. Redirecionando para o login…', 'aviso', 5000);
        setTimeout(irParaLogin, 1500);
    }
    function mensagemDeErro(e, padrao) {
        const msg = String((e && e.message) || '');
        const codigo = (e && e.code) || '';
        if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(msg)) return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
        if ((e && e.status === 403) || codigo === '42501') return 'Você não tem permissão para esta operação.';
        if (codigo === '23503') return 'Este registro está vinculado a outros dados. Remova ou ajuste os vínculos antes.';
        if (codigo === '23505') return 'Já existe um registro igual a este.';
        if (codigo === '23514' || codigo === '22P02' || codigo === '22003' || codigo === '22007') return 'Algum valor informado é inválido. Revise os campos e tente de novo.';
        if (codigo === 'P0002' || codigo === 'NAO_ENCONTRADO') return 'Registro não encontrado. Atualize a página e tente de novo.';
        return padrao || 'Ocorreu um erro inesperado. Tente novamente.';
    }
    function tratarErro(e, padrao) {
        console.error('[N1]', padrao, e);                     // diagnóstico para o desenvolvedor
        if (ehErroDeSessao(e)) return sessaoExpirada();
        toast(mensagemDeErro(e, padrao), 'erro', 7000);       // mensagem amigável para o usuário
    }

    // =================================================================
    // 4. ACESSO AO BANCO (Supabase)
    // =================================================================
    /** Desembrulha { data, error, status } do supabase-js, lançando o erro com o status HTTP. */
    function ok(res) {
        if (res.error) { if (res.status && !res.error.status) res.error.status = res.status; throw res.error; }
        return res.data;
    }

    /** Lê todas as linhas da tabela, paginando (o Supabase limita 1000 linhas por requisição). */
    async function buscarTodos(tabela, ordem) {
        const tamanho = 1000;
        let todos = [];
        for (let de = 0; ; de += tamanho) {
            let q = sb.from(tabela).select('*');
            ordem.concat([['id', true]]).forEach(([col, asc]) => { q = q.order(col, { ascending: asc }); });
            const lote = ok(await q.range(de, de + tamanho - 1));
            todos = todos.concat(lote);
            if (lote.length < tamanho) break;
        }
        return todos;
    }

    async function carregarClientes() { estado.clientes = await buscarTodos('clientes', [['nome', true]]); }

    async function carregarOrcamentos() {
        const [orcs, itens] = await Promise.all([
            buscarTodos('orcamentos', [['data', false], ['numero', false]]),
            buscarTodos('orcamento_itens', [['orcamento_id', true], ['ordem', true]]),
        ]);
        const porOrcamento = new Map();
        itens.forEach((i) => {
            const q = Number(i.quantidade), p = Number(i.preco_unitario);
            const item = { id: i.id, quantidade: q, nome: i.nome, preco_unitario: p, subtotal: Number(i.subtotal ?? arred2(q * p)) };
            if (!porOrcamento.has(i.orcamento_id)) porOrcamento.set(i.orcamento_id, []);
            porOrcamento.get(i.orcamento_id).push(item);
        });
        estado.orcamentos = orcs.map((o) => ({ ...o, total: Number(o.total), itens: porOrcamento.get(o.id) || [] }));
    }

    async function carregarAgenda() { estado.agenda = await buscarTodos('agenda', [['data', true], ['horario', true]]); }

    async function carregarDeclaracoes() {
        const lista = await buscarTodos('declaracoes', [['data', false]]);
        estado.declaracoes = lista.map((d) => ({ ...d, entrada: Number(d.entrada), saida: Number(d.saida), resultado: Number(d.resultado) }));
    }

    async function carregarTudo() {
        await Promise.all([carregarClientes(), carregarOrcamentos(), carregarAgenda(), carregarDeclaracoes()]);
    }

    async function inserir(tabela, linha) { ok(await sb.from(tabela).insert(linha).select('id')); }

    async function atualizar(tabela, id, campos) {
        const d = ok(await sb.from(tabela).update(campos).eq('id', id).select('id'));
        if (!d || !d.length) throw Object.assign(new Error('Registro não encontrado'), { code: 'NAO_ENCONTRADO' });
    }

    async function excluirRegistro(tabela, id) {
        const d = ok(await sb.from(tabela).delete().eq('id', id).select('id'));
        if (!d || !d.length) throw Object.assign(new Error('Registro não encontrado'), { code: 'NAO_ENCONTRADO' });
    }

    /** Orçamento + itens numa única transação no banco (RPC salvar_orcamento). */
    async function salvarOrcamentoNoBanco(d) {
        ok(await sb.rpc('salvar_orcamento', {
            p_id: d.id, p_cliente_id: d.cliente_id, p_data: d.data,
            p_descricao: d.descricao, p_total: d.total, p_itens: d.itens,
        }));
    }

    // =================================================================
    // 5. NAVEGAÇÃO
    // =================================================================
    function trocarAba(id) {
        if (!ABAS.includes(id)) id = 'dashboard';
        $$('.tab-content').forEach((t) => t.classList.toggle('active', t.id === id));
        $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.aba === id));
        try { localStorage.setItem('n1_active_tab', id); } catch { /* preferência de interface: pode falhar sem problema */ }
        document.body.classList.remove('menu-aberto');
        $('.topbar-mobile [data-acao="menu-mobile"]').setAttribute('aria-expanded', 'false');
        window.scrollTo(0, 0);
        $('.main-content').scrollTop = 0;
    }
    function alternarMenu() {
        const aberto = document.body.classList.toggle('menu-aberto');
        $('.topbar-mobile [data-acao="menu-mobile"]').setAttribute('aria-expanded', String(aberto));
    }

    // =================================================================
    // 6. RENDERIZAÇÃO
    // =================================================================
    function renderizarTudo() {
        renderizarDashboard();
        renderizarClientes();
        renderizarOrcamentos();
        renderizarAgenda();
        renderizarDeclaracao();
        renderizarPerfilLateral();
    }

    const rotuloResultado = (r) => (r > 0 ? 'Lucro' : r < 0 ? 'Prejuízo' : 'Resultado');
    const classeResultado = (r) => (r > 0 ? 'positivo' : r < 0 ? 'negativo' : 'neutro');
    const textoResultado = (r) => (r > 0 ? '+' : r < 0 ? '−' : '') + moeda(Math.abs(r));

    // ---------- Visão Geral ----------
    function renderizarDashboard() {
        $('#count-clientes').textContent = estado.clientes.length;
        $('#count-orcamentos').textContent = estado.orcamentos.length;
        $('#soma-orcamentos').textContent = moeda(soma2(estado.orcamentos, (o) => o.total));

        const pendentes = estado.agenda.filter((a) => a.status === 'agendado');
        $('#count-agenda').textContent = pendentes.length;

        const validas = estado.declaracoes.filter((d) => d.status !== 'cancelada');
        const entradas = soma2(validas, (d) => d.entrada);
        const saidas = soma2(validas, (d) => d.saida);
        const resultado = arred2(entradas - saidas);
        $('#count-declaracoes').textContent = `${validas.length} declaraç${validas.length === 1 ? 'ão' : 'ões'}`;
        $('#dash-entradas').textContent = '+' + moeda(entradas);
        $('#dash-saidas').textContent = '−' + moeda(saidas);
        const elRes = $('#dash-resultado');
        elRes.textContent = textoResultado(resultado);
        elRes.className = classeResultado(resultado);

        const proximos = [...pendentes].sort(comparaAgenda).filter((a) => diasAte(a.data) >= 0).slice(0, 5);
        $('#lista-proximos').innerHTML = proximos.length
            ? proximos.map((a) => `
                <li><span>${esc(nomeDoCliente(a.cliente_id))}<br><small class="muted">${esc(a.servico || 'Serviço')}</small></span>
                <span class="quando">${esc(rotuloQuando(a))}</span></li>`).join('')
            : '<li class="vazio">Nenhum serviço agendado pela frente.</li>';
    }

    function rotuloQuando(a) {
        const d = diasAte(a.data);
        const hora = horaCurta(a.horario);
        const base = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : dataBR(a.data);
        return hora ? `${base} ${hora}` : base;
    }

    // ---------- Clientes ----------
    function opcoesClientes(selecionado, textoVazio) {
        const ordenados = [...estado.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        return `<option value="">${esc(textoVazio)}</option>` +
            ordenados.map((c) => `<option value="${esc(c.id)}"${c.id === selecionado ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
    }

    function atualizarSelectClientes() {
        [['#age-cliente', 'Selecione...'], ['#orc-cliente', 'Selecione um cliente...']].forEach(([sel, txt]) => {
            const el = $(sel);
            if (el) { const atual = el.value; el.innerHTML = opcoesClientes(atual, txt); }
        });
    }

    function renderizarClientes() {
        const termo = normalizar($('#busca-clientes').value);
        const ordem = $('#ordem-clientes').value;
        let lista = estado.clientes.filter((c) =>
            !termo || normalizar([c.nome, c.telefone, c.email, c.endereco].join(' ')).includes(termo));

        if (ordem === 'nome-desc') lista.sort((a, b) => b.nome.localeCompare(a.nome, 'pt-BR'));
        else if (ordem === 'recentes') lista.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        else lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        $('#lista-clientes').innerHTML = lista.length ? lista.map((c) => `
            <tr class="clicavel" tabindex="0" data-acao="cliente-ver" data-id="${esc(c.id)}">
                <td data-label="Nome"><strong>${esc(c.nome)}</strong></td>
                <td data-label="Telefone">${esc(c.telefone)}</td>
                <td data-label="E-mail">${esc(c.email || '-')}</td>
                <td data-label="Endereço">${esc(c.endereco || '-')}</td>
                <td class="acoes">
                    <button type="button" class="btn-link edit-btn" data-acao="cliente-editar" data-id="${esc(c.id)}">Editar</button>
                    <button type="button" class="btn-link perigo delete-btn" data-acao="cliente-excluir" data-id="${esc(c.id)}">Excluir</button>
                </td>
            </tr>`).join('')
            : `<tr><td colspan="5" class="td-vazio">${estado.clientes.length ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado ainda. Use o formulário acima.'}</td></tr>`;

        $('#titulo-clientes').textContent = `Carteira de Clientes (${estado.clientes.length})`;
        atualizarSelectClientes();
        atualizarSelectOrcamentos();
    }

    // ---------- Orçamentos ----------
    function renderizarOrcamentos() {
        $('#titulo-orcamentos').textContent = `Orçamentos Ativos (${estado.orcamentos.length})`;
        const grid = $('#lista-orcamentos');
        if (!estado.orcamentos.length) {
            grid.innerHTML = '<p class="vazio">Nenhum orçamento ainda. Crie o primeiro no formulário acima.</p>';
            return;
        }
        grid.innerHTML = estado.orcamentos.map((o) => {
            const resumo = o.itens.length
                ? o.itens.slice(0, 3).map((i) => `${esc(fmtQtd(i.quantidade))}× ${esc(i.nome)}`).join('<br>') +
                  (o.itens.length > 3 ? `<br>+ ${o.itens.length - 3} item(ns)` : '')
                : escBr(o.descricao || 'Sem descrição');
            return `
            <div class="note-card" tabindex="0" data-acao="orc-ver" data-id="${esc(o.id)}">
                <div class="note-header">
                    <div><span class="note-client">${esc(nomeDoCliente(o.cliente_id))}</span>
                    <div class="note-sub">Orçamento #${pad(o.numero)}</div></div>
                    <span class="note-date">${dataBR(o.data)}</span>
                </div>
                <div class="note-body">${resumo}</div>
                <div class="note-footer">
                    <span class="note-price">${moeda(o.total)}</span>
                    <div class="note-botoes">
                        <button type="button" class="btn-link edit-btn" data-acao="orc-editar" data-id="${esc(o.id)}">Editar</button>
                        <button type="button" class="btn-link perigo delete-btn" data-acao="orc-excluir" data-id="${esc(o.id)}">Apagar</button>
                    </div>
                </div>
            </div>`;
        }).join('');
        atualizarSelectOrcamentos();
    }

    // ---------- Agenda ----------
    const comparaAgenda = (a, b) =>
        String(a.data).localeCompare(String(b.data)) || String(a.horario || '99:99').localeCompare(String(b.horario || '99:99'));

    function selosAgenda(a) {
        if (a.status !== 'agendado') return '';
        const d = diasAte(a.data);
        if (d < 0) return '<span class="badge atrasado">Atrasado</span>';
        if (d === 0) return '<span class="badge hoje">Hoje</span>';
        if (d === 1) return '<span class="badge proximo">Amanhã</span>';
        if (d <= 3) return `<span class="badge proximo">Em ${d} dias</span>`;
        return '';
    }

    function renderizarAgenda() {
        const filtro = $('#filtro-agenda').value;
        const lista = [...estado.agenda].sort(comparaAgenda).filter((a) => filtro === 'todos' || a.status === filtro);
        $('#titulo-agenda').textContent = `Serviços Marcados (${estado.agenda.length})`;

        $('#lista-agenda').innerHTML = lista.length ? lista.map((a) => `
            <tr class="${a.status === 'concluido' ? 'linha-concluida' : ''}">
                <td data-label="Data"><strong style="color:var(--blue)">${dataBR(a.data)}</strong>${a.horario ? ` <span class="muted">${esc(horaCurta(a.horario))}</span>` : ''}
                    <div class="selos">${selosAgenda(a)}</div></td>
                <td data-label="Cliente">${esc(nomeDoCliente(a.cliente_id))}</td>
                <td data-label="Serviço">${esc(a.servico || '-')}${a.observacao ? `<br><small class="muted">${esc(a.observacao)}</small>` : ''}</td>
                <td data-label="Status"><span class="badge ${esc(a.status)}">${esc(ROTULO_AGENDA[a.status] || a.status)}</span></td>
                <td class="acoes">
                    <button type="button" class="btn-link ok" data-acao="agenda-alternar" data-id="${esc(a.id)}">${a.status === 'concluido' ? 'Reabrir' : 'Concluir'}</button>
                    <button type="button" class="btn-link edit-btn" data-acao="agenda-editar" data-id="${esc(a.id)}">Editar</button>
                    <button type="button" class="btn-link perigo delete-btn" data-acao="agenda-excluir" data-id="${esc(a.id)}">Excluir</button>
                </td>
            </tr>`).join('')
            : `<tr><td colspan="5" class="td-vazio">${estado.agenda.length ? 'Nenhum serviço neste filtro.' : 'Nenhum serviço agendado ainda.'}</td></tr>`;
    }

    // ---------- Declarações ----------
    function opcoesOrcamentos(selecionado) {
        return '<option value="">Selecione um orçamento...</option>' + estado.orcamentos.map((o) =>
            `<option value="${esc(o.id)}"${o.id === selecionado ? ' selected' : ''}>#${pad(o.numero)} — ${esc(nomeDoCliente(o.cliente_id))} — ${esc(moeda(o.total))} (${dataBR(o.data)})</option>`).join('');
    }
    function atualizarSelectOrcamentos() {
        const el = $('#dec-orcamento');
        if (el) { const atual = el.value; el.innerHTML = opcoesOrcamentos(atual); }
    }

    function renderizarDeclaracao() {
        $('#titulo-declaracoes').textContent = `Declarações Ativas (${estado.declaracoes.length})`;
        const grid = $('#lista-declaracao');
        if (!estado.declaracoes.length) {
            grid.innerHTML = '<p class="vazio">Nenhuma declaração ainda. Crie a primeira no formulário acima.</p>';
            return;
        }
        grid.innerHTML = estado.declaracoes.map((d) => {
            const orc = acharOrcamento(d.orcamento_id);
            return `
            <div class="note-card verde" tabindex="0" data-acao="dec-ver" data-id="${esc(d.id)}">
                <div class="note-header">
                    <div><span class="note-client">${esc(orc ? nomeDoCliente(orc.cliente_id) : 'Cliente removido')}</span>
                    <div class="note-sub">Orçamento ${orc ? '#' + pad(orc.numero) : '—'}</div></div>
                    <div style="text-align:right"><span class="note-date">${dataBR(d.data)}</span>
                    <div class="selos" style="justify-content:flex-end"><span class="badge ${esc(d.status)}">${esc(ROTULO_DEC[d.status] || d.status)}</span></div></div>
                </div>
                <div class="dec-valores">
                    <div><span>Entrada</span><strong class="positivo">+${esc(moeda(d.entrada))}</strong></div>
                    <div><span>Saída</span><strong class="negativo">−${esc(moeda(d.saida))}</strong></div>
                    <div><span>${rotuloResultado(d.resultado)}</span><strong class="${classeResultado(d.resultado)}">${esc(textoResultado(d.resultado))}</strong></div>
                </div>
                <div class="note-footer">
                    <button type="button" class="btn-link doc" data-acao="dec-documento" data-id="${esc(d.id)}">Documento</button>
                    <div class="note-botoes">
                        <button type="button" class="btn-link edit-btn" data-acao="dec-editar" data-id="${esc(d.id)}">Editar</button>
                        <button type="button" class="btn-link perigo delete-btn" data-acao="dec-excluir" data-id="${esc(d.id)}">Excluir</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    /** Linha "Lucro: +R$ x" usada na prévia dos formulários. */
    function atualizarPreviaResultado(inpEntrada, inpSaida, destino) {
        const r = arred2(lerMoeda(inpEntrada) - lerMoeda(inpSaida));
        destino.innerHTML = `${rotuloResultado(r)}: <strong class="${classeResultado(r)}">${esc(textoResultado(r))}</strong>`;
    }

    // ---------- Perfil (lateral) ----------
    function nomeDoUsuario() {
        const meta = (estado.usuario && estado.usuario.user_metadata) || {};
        return (estado.perfil && estado.perfil.full_name) || meta.full_name || meta.name || (estado.usuario && estado.usuario.email) || 'Minha conta';
    }
    function urlDoAvatar() {
        const meta = (estado.usuario && estado.usuario.user_metadata) || {};
        return (estado.perfil && estado.perfil.avatar_url) || meta.avatar_url || meta.picture || '';
    }
    function htmlAvatar() {
        const url = urlDoAvatar();
        if (/^https:\/\//i.test(url)) return `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">`;
        return esc(nomeDoUsuario().trim().charAt(0).toUpperCase() || '?');
    }
    function renderizarPerfilLateral() {
        $('#avatar-lateral').innerHTML = htmlAvatar();
        $('#perfil-nome-lateral').textContent = nomeDoUsuario();
        $('#perfil-email-lateral').textContent = (estado.usuario && estado.usuario.email) || '';
    }

    // =================================================================
    // 7. EDITOR DE ITENS DO ORÇAMENTO (estilo planilha)
    // =================================================================
    function criarEditorItens(raiz, itensIniciais, aoMudar) {
        let seq = 0;
        const chave = () => 'i' + (++seq);
        let itens = (itensIniciais || []).map((i) => ({
            k: chave(), quantidade: Number(i.quantidade), nome: i.nome, preco: Number(i.preco_unitario ?? i.preco ?? 0),
        }));
        const rascunho = { quantidade: '01', nome: '', preco: 0 };

        const subtotal = (i) => arred2(i.quantidade * i.preco);
        const total = () => arred2(itens.reduce((s, i) => s + subtotal(i), 0));
        const notificar = () => aoMudar && aoMudar(total(), itens.length);

        const linhaItem = (i) => `
            <div class="item-linha" data-k="${i.k}">
                <input class="item-qtd" type="text" inputmode="decimal" autocomplete="off" value="${esc(fmtQtd(i.quantidade))}" aria-label="Quantidade" data-campo="quantidade">
                <input class="item-nome" type="text" maxlength="300" autocomplete="off" value="${esc(i.nome)}" aria-label="Nome do item" data-campo="nome">
                <input class="item-preco" type="text" inputmode="numeric" autocomplete="off" data-moeda value="${esc(moeda(i.preco))}" aria-label="Preço unitário" data-campo="preco">
                <output class="item-sub">${esc(moeda(subtotal(i)))}</output>
                <button type="button" class="item-remover" data-remover="${i.k}" aria-label="Remover item">×</button>
            </div>`;

        function desenhar() {
            raiz.innerHTML = `
                <div class="itens-cab"><span>Qtd</span><span>Item</span><span>Valor unit.</span><span>Subtotal</span><span></span></div>
                ${itens.map(linhaItem).join('')}
                <div class="item-linha item-nova">
                    <input class="item-qtd" type="text" inputmode="decimal" autocomplete="off" value="${esc(rascunho.quantidade)}" aria-label="Quantidade do novo item" data-novo="quantidade">
                    <input class="item-nome" type="text" maxlength="300" autocomplete="off" placeholder="Adicionar item..." value="${esc(rascunho.nome)}" aria-label="Nome do novo item" data-novo="nome">
                    <input class="item-preco" type="text" inputmode="numeric" autocomplete="off" data-moeda placeholder="R$ 0,00" value="${rascunho.preco ? esc(moeda(rascunho.preco)) : ''}" aria-label="Preço do novo item" data-novo="preco">
                    <span class="item-sub"></span>
                    <button type="button" class="item-add" data-adicionar aria-label="Adicionar item">+</button>
                </div>`;
        }

        function adicionar() {
            const nome = rascunho.nome.trim();
            const qtd = lerQuantidade(rascunho.quantidade);
            const campoNome = $('[data-novo="nome"]', raiz);
            if (!nome) { toast('Informe o nome do item antes de adicionar.', 'aviso'); campoNome.setAttribute('aria-invalid', 'true'); campoNome.focus(); return false; }
            if (qtd <= 0) { toast('A quantidade deve ser maior que zero.', 'aviso'); $('[data-novo="quantidade"]', raiz).focus(); return false; }
            itens.push({ k: chave(), quantidade: qtd, nome, preco: rascunho.preco });
            rascunho.quantidade = '01'; rascunho.nome = ''; rascunho.preco = 0;
            desenhar();
            notificar();
            $('[data-novo="nome"]', raiz).focus();        // foco direto na próxima linha
            return true;
        }

        raiz.addEventListener('input', (e) => {
            const alvo = e.target;
            if (alvo.dataset.campo) {
                const linha = alvo.closest('[data-k]');
                const item = itens.find((i) => i.k === linha.dataset.k);
                if (!item) return;
                if (alvo.dataset.campo === 'nome') item.nome = alvo.value;
                else if (alvo.dataset.campo === 'quantidade') item.quantidade = lerQuantidade(alvo.value);
                else if (alvo.dataset.campo === 'preco') item.preco = lerMoeda(alvo);
                $('.item-sub', linha).textContent = moeda(subtotal(item));
                notificar();
            } else if (alvo.dataset.novo) {
                if (alvo.dataset.novo === 'preco') rascunho.preco = lerMoeda(alvo);
                else { rascunho[alvo.dataset.novo] = alvo.value; alvo.removeAttribute('aria-invalid'); }
            }
        });

        // Ao sair do campo de quantidade, mostra no formato "03"
        raiz.addEventListener('focusout', (e) => {
            const alvo = e.target;
            if (alvo.matches && alvo.matches('.item-qtd')) {
                const n = lerQuantidade(alvo.value);
                if (alvo.dataset.novo) { rascunho.quantidade = n > 0 ? fmtQtd(n) : '01'; alvo.value = rascunho.quantidade; }
                else if (n > 0) alvo.value = fmtQtd(n);
            }
        });

        raiz.addEventListener('click', (e) => {
            const rem = e.target.closest('[data-remover]');
            if (rem) { itens = itens.filter((i) => i.k !== rem.dataset.remover); desenhar(); notificar(); return; }
            if (e.target.closest('[data-adicionar]')) adicionar();
        });

        raiz.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || !e.target.matches('input')) return;
            e.preventDefault();                                   // Enter não envia o formulário por engano
            if (e.target.dataset.novo) adicionar();
        });

        desenhar();
        notificar();

        return {
            total, quantidade: () => itens.length,
            /** Se houver um item digitado na linha de entrada e ainda não adicionado, inclui antes de salvar. */
            confirmarRascunho() { if (rascunho.nome.trim()) return adicionar(); return true; },
            obterItens: () => itens.map((i) => ({ quantidade: i.quantidade, nome: i.nome.trim(), preco_unitario: i.preco })),
        };
    }

    /** Formulário de orçamento (usado na criação e no modal de edição). */
    function criarFormularioOrcamento(raiz, orc, prefixo) {
        const p = prefixo;
        raiz.innerHTML = `
            <div class="form-grid">
                <div class="form-group">
                    <label for="${p}-cliente">Selecionar Cliente</label>
                    <select id="${p}-cliente" required>${opcoesClientes(orc ? orc.cliente_id : '', 'Selecione um cliente...')}</select>
                </div>
                <div class="form-group">
                    <label for="${p}-data">Data</label>
                    <input type="date" id="${p}-data" required value="${esc(orc ? orc.data : hojeISO())}">
                </div>
                <div class="form-group full-width">
                    <label>Itens do orçamento</label>
                    <div class="itens-editor" id="${p}-itens"></div>
                </div>
                <div class="form-group">
                    <label for="${p}-valor">Valor Total (R$)</label>
                    <input type="text" id="${p}-valor" data-moeda inputmode="numeric" autocomplete="off" placeholder="R$ 0,00">
                    <small class="dica" id="${p}-valor-dica"></small>
                </div>
                <div class="form-group full-width">
                    <label for="${p}-desc">Descrição / Complemento</label>
                    <textarea id="${p}-desc" rows="4" maxlength="10000" placeholder="Ex: Instalação completa, passagem de cabos, configuração e demais observações.">${esc(orc ? orc.descricao : '')}</textarea>
                </div>
            </div>`;

        const campoValor = $(`#${p}-valor`, raiz);
        const dica = $(`#${p}-valor-dica`, raiz);

        function aoMudar(totalCalculado, qtdItens) {
            if (qtdItens > 0) {
                campoValor.readOnly = true;
                campoValor.classList.add('input-readonly');
                definirMoeda(campoValor, totalCalculado);
                dica.textContent = 'Calculado automaticamente: soma de quantidade × valor de cada item.';
            } else {
                campoValor.readOnly = false;
                campoValor.classList.remove('input-readonly');
                dica.textContent = 'Sem itens: informe o valor total manualmente.';
            }
        }

        if (orc && !orc.itens.length) definirMoeda(campoValor, orc.total);
        const editor = criarEditorItens($(`#${p}-itens`, raiz), orc ? orc.itens : [], aoMudar);

        return {
            editor,
            /** Devolve os dados prontos para salvar (inclui o item pendente da linha de entrada). */
            obter() {
                if (!editor.confirmarRascunho()) return null;
                const itens = editor.obterItens();
                return {
                    id: orc ? orc.id : null,
                    cliente_id: $(`#${p}-cliente`, raiz).value,
                    data: $(`#${p}-data`, raiz).value,
                    descricao: $(`#${p}-desc`, raiz).value.trim(),
                    itens,
                    total: itens.length ? editor.total() : lerMoeda(campoValor),
                };
            },
        };
    }

    function validarOrcamento(d) {
        if (!d) return 'Revise o item da linha de entrada.';
        if (!d.cliente_id) return 'Selecione um cliente.';
        if (!d.data) return 'Informe a data do orçamento.';
        if (!d.itens.length && !(d.total > 0)) return 'Adicione ao menos um item ou informe o valor total.';
        if (d.itens.some((i) => !i.nome || !(i.quantidade > 0))) return 'Todos os itens precisam de nome e quantidade maior que zero.';
        return null;
    }

    // =================================================================
    // 8. CLIENTES — criar, ver, editar, excluir
    // =================================================================
    async function criarCliente(form, botao) {
        const dados = {
            nome: $('#cli-nome').value.trim(),
            telefone: $('#cli-tel').value.trim(),
            email: valorOuNull($('#cli-email').value),
            endereco: valorOuNull($('#cli-end').value),
            observacoes: valorOuNull($('#cli-obs').value),
        };
        if (!dados.nome || !dados.telefone) { toast('Informe nome e telefone do cliente.', 'aviso'); return; }
        const sucesso = await executar(botao, 'Salvando…', 'Não foi possível salvar o cliente.', async () => {
            await inserir('clientes', dados);
            await carregarClientes();
        });
        if (sucesso) { form.reset(); renderizarTudo(); toast('Cliente salvo.', 'sucesso'); }
    }

    function abrirVisualizarCliente(id) {
        const cli = acharCliente(id);
        if (!cli) return;
        const orcs = estado.orcamentos.filter((o) => o.cliente_id === id);
        const agendados = estado.agenda.filter((a) => a.cliente_id === id && a.status === 'agendado').length;
        abrirModal(`
            <h2 id="modal-titulo">${esc(cli.nome)}</h2>
            <dl class="detalhes">
                <div><dt>Telefone / WhatsApp</dt><dd>${esc(cli.telefone)}</dd></div>
                <div><dt>E-mail</dt><dd>${esc(cli.email || '-')}</dd></div>
                <div class="full-width"><dt>Endereço</dt><dd>${esc(cli.endereco || '-')}</dd></div>
                <div class="full-width"><dt>Observações</dt><dd>${esc(cli.observacoes || '-')}</dd></div>
                <div><dt>Serviços agendados</dt><dd>${agendados}</dd></div>
                <div><dt>Cadastrado em</dt><dd>${esc(dataBR(String(cli.created_at).slice(0, 10)))}</dd></div>
            </dl>
            <h3 style="margin: 18px 0 8px; font-size:15px;">Orçamentos (${orcs.length})</h3>
            ${orcs.length ? `<ul class="lista-vinculos">${orcs.map((o) => `
                <li><button type="button" data-acao="orc-ver" data-id="${esc(o.id)}"><span>#${pad(o.numero)} · ${esc(dataBR(o.data))}</span><strong>${esc(moeda(o.total))}</strong></button></li>`).join('')}</ul>`
                : '<p class="vazio">Este cliente ainda não tem orçamentos.</p>'}
            <div class="modal-rodape">
                <button type="button" class="btn-primary" data-acao="cliente-editar" data-id="${esc(id)}">Editar</button>
                <button type="button" class="btn-danger" data-acao="cliente-excluir" data-id="${esc(id)}">Excluir</button>
                <button type="button" class="btn-secondary empurrar" data-acao="modal-fechar">Fechar</button>
            </div>`);
    }

    function abrirEditarCliente(id) {
        const cli = acharCliente(id);
        if (!cli) return;
        abrirModal(`
            <form id="form-modal" data-tipo="cliente" data-id="${esc(id)}">
                <h2 id="modal-titulo">Editar Cliente</h2>
                <div class="form-grid">
                    <div class="form-group full-width"><label for="edit-nome">Nome</label>
                        <input type="text" id="edit-nome" required maxlength="200" value="${esc(cli.nome)}"></div>
                    <div class="form-group full-width"><label for="edit-end">Endereço</label>
                        <input type="text" id="edit-end" maxlength="300" value="${esc(cli.endereco || '')}"></div>
                    <div class="form-group"><label for="edit-tel">Telefone</label>
                        <input type="text" id="edit-tel" required maxlength="40" inputmode="tel" value="${esc(cli.telefone)}"></div>
                    <div class="form-group"><label for="edit-email">E-mail</label>
                        <input type="email" id="edit-email" maxlength="254" value="${esc(cli.email || '')}"></div>
                    <div class="form-group full-width"><label for="edit-obs">Observações</label>
                        <textarea id="edit-obs" rows="3" maxlength="2000">${esc(cli.observacoes || '')}</textarea></div>
                </div>
                <div class="modal-rodape">
                    <button type="submit" class="btn-primary">Salvar Alterações</button>
                    <button type="button" class="btn-secondary" data-acao="modal-fechar">Cancelar</button>
                </div>
            </form>`);
    }

    async function deletarCliente(id) {
        const cli = acharCliente(id);
        if (!cli) return;
        if (estado.orcamentos.some((o) => o.cliente_id === id) || estado.agenda.some((a) => a.cliente_id === id)) {
            toast('Este cliente tem orçamentos ou serviços agendados. Exclua-os antes de remover o cliente.', 'aviso', 7000);
            return;
        }
        const sim = await confirmar({
            titulo: 'Excluir cliente',
            mensagem: `Tem certeza que deseja excluir “${cli.nome}”? Esta ação não pode ser desfeita.`,
            textoSim: 'Excluir', perigo: true,
        });
        if (!sim) return;
        const sucesso = await executar(null, '', 'Não foi possível excluir o cliente.', async () => {
            await excluirRegistro('clientes', id);
            await carregarClientes();
        });
        if (sucesso) { fecharModal(); renderizarTudo(); toast('Cliente excluído.', 'sucesso'); }
    }

    // =================================================================
    // 9. ORÇAMENTOS — criar, ver, editar, excluir
    // =================================================================
    async function criarOrcamento(form, botao) {
        const dados = ctrlOrcNovo.obter();
        const erro = validarOrcamento(dados);
        if (erro) { toast(erro, 'aviso'); return; }
        const sucesso = await executar(botao, 'Gerando…', 'Não foi possível gerar o orçamento.', async () => {
            await salvarOrcamentoNoBanco(dados);
            await carregarOrcamentos();
        });
        if (sucesso) {
            ctrlOrcNovo = criarFormularioOrcamento($('#orc-campos'), null, 'orc');
            renderizarTudo();
            toast('Orçamento gerado.', 'sucesso');
        }
    }

    function tabelaItensHtml(orc) {
        return '<table class="mini-tabela"><thead><tr><th>Qtd</th><th>Item</th><th class="num">Valor unit.</th><th class="num">Subtotal</th></tr></thead><tbody>' +
            orc.itens.map((i) => `<tr><td>${esc(fmtQtd(i.quantidade))}</td><td>${esc(i.nome)}</td><td class="num">${esc(moeda(i.preco_unitario))}</td><td class="num">${esc(moeda(i.subtotal))}</td></tr>`).join('') +
            '</tbody></table>';
    }

    function abrirVisualizarOrcamento(id) {
        const orc = acharOrcamento(id);
        if (!orc) return;
        abrirModal(`
            <h2 id="modal-titulo">Orçamento #${pad(orc.numero)} — ${esc(nomeDoCliente(orc.cliente_id))}</h2>
            <dl class="detalhes">
                <div><dt>Cliente</dt><dd>${esc(nomeDoCliente(orc.cliente_id))}</dd></div>
                <div><dt>Data</dt><dd>${esc(dataBR(orc.data))}</dd></div>
                ${orc.itens.length ? `<div class="full-width"><dt>Itens</dt><dd>${tabelaItensHtml(orc)}</dd></div>` : ''}
                <div class="full-width"><dt>Valor total</dt><dd><strong style="font-size:20px;color:var(--success)">${esc(moeda(orc.total))}</strong></dd></div>
                ${orc.descricao ? `<div class="full-width"><dt>Descrição / Complemento</dt><dd>${esc(orc.descricao)}</dd></div>` : ''}
            </dl>
            <div class="modal-rodape">
                <button type="button" class="btn-primary btn-roxo" data-acao="orc-documento" data-id="${esc(id)}">Ver Documento</button>
                <button type="button" class="btn-primary" data-acao="orc-editar" data-id="${esc(id)}">Editar</button>
                <button type="button" class="btn-secondary empurrar" data-acao="modal-fechar">Fechar</button>
            </div>`, { largo: true });
    }

    function abrirEditarOrcamento(id) {
        const orc = acharOrcamento(id);
        if (!orc) return;
        abrirModal(`
            <form id="form-modal" data-tipo="orcamento" data-id="${esc(id)}">
                <h2 id="modal-titulo">Editar Orçamento #${pad(orc.numero)}</h2>
                <div id="edit-orc-campos"></div>
                <div class="modal-rodape">
                    <button type="submit" class="btn-primary">Salvar Alterações</button>
                    <button type="button" class="btn-secondary" data-acao="modal-fechar">Cancelar</button>
                    <button type="button" class="btn-danger empurrar" data-acao="orc-excluir" data-id="${esc(id)}">Excluir Orçamento</button>
                </div>
            </form>`, { largo: true });
        ctrlEdicao = criarFormularioOrcamento($('#edit-orc-campos'), orc, 'edit-orc');
    }

    async function deletarOrcamento(id) {
        const orc = acharOrcamento(id);
        if (!orc) return;
        if (estado.declaracoes.some((d) => d.orcamento_id === id)) {
            toast('Este orçamento tem declaração vinculada. Exclua a declaração antes.', 'aviso', 7000);
            return;
        }
        const sim = await confirmar({
            titulo: 'Excluir orçamento',
            mensagem: `Excluir o orçamento #${pad(orc.numero)} de ${nomeDoCliente(orc.cliente_id)} permanentemente?`,
            textoSim: 'Excluir', perigo: true,
        });
        if (!sim) return;
        const sucesso = await executar(null, '', 'Não foi possível excluir o orçamento.', async () => {
            await excluirRegistro('orcamentos', id);
            await carregarOrcamentos();
        });
        if (sucesso) { fecharModal(); renderizarTudo(); toast('Orçamento excluído.', 'sucesso'); }
    }

    function abrirModalEscolha(id) {
        abrirModal(`
            <h2 id="modal-titulo" style="text-align:center">Qual formato deseja visualizar?</h2>
            <div class="escolha-doc">
                <button type="button" class="btn-primary" data-acao="doc-orcamento" data-id="${esc(id)}">Orçamento (A4)</button>
                <button type="button" class="btn-primary btn-verde" data-acao="doc-os" data-id="${esc(id)}">Ordem de Serviço (Horizontal)</button>
                <button type="button" class="btn-secondary" data-acao="modal-fechar">Cancelar</button>
            </div>`);
    }

    // =================================================================
    // 10. AGENDA
    // =================================================================
    async function criarAgenda(form, botao) {
        const dados = {
            cliente_id: $('#age-cliente').value,
            data: $('#age-data').value,
            horario: valorOuNull($('#age-hora').value),
            servico: $('#age-servico').value.trim(),
            observacao: valorOuNull($('#age-obs').value),
            status: 'agendado',
        };
        if (!dados.cliente_id || !dados.data || !dados.servico) { toast('Selecione o cliente, a data e descreva o serviço.', 'aviso'); return; }
        const sucesso = await executar(botao, 'Agendando…', 'Não foi possível agendar o serviço.', async () => {
            await inserir('agenda', dados);
            await carregarAgenda();
        });
        if (sucesso) { form.reset(); prepararFormularios(); renderizarTudo(); toast('Serviço agendado.', 'sucesso'); }
    }

    function abrirEditarAgenda(id) {
        const a = acharAgenda(id);
        if (!a) return;
        abrirModal(`
            <form id="form-modal" data-tipo="agenda" data-id="${esc(id)}">
                <h2 id="modal-titulo">Editar Serviço</h2>
                <div class="form-grid">
                    <div class="form-group full-width"><label for="edit-age-cliente">Cliente</label>
                        <select id="edit-age-cliente" required>${opcoesClientes(a.cliente_id, 'Selecione...')}</select></div>
                    <div class="form-group"><label for="edit-age-data">Data</label>
                        <input type="date" id="edit-age-data" required value="${esc(a.data)}"></div>
                    <div class="form-group"><label for="edit-age-hora">Horário</label>
                        <input type="time" id="edit-age-hora" value="${esc(horaCurta(a.horario))}"></div>
                    <div class="form-group full-width"><label for="edit-age-servico">Descrição do Serviço</label>
                        <input type="text" id="edit-age-servico" required maxlength="500" value="${esc(a.servico)}"></div>
                    <div class="form-group"><label for="edit-age-status">Status</label>
                        <select id="edit-age-status">${Object.keys(ROTULO_AGENDA).map((s) => `<option value="${s}"${s === a.status ? ' selected' : ''}>${ROTULO_AGENDA[s]}</option>`).join('')}</select></div>
                    <div class="form-group full-width"><label for="edit-age-obs">Observação</label>
                        <textarea id="edit-age-obs" rows="2" maxlength="2000">${esc(a.observacao || '')}</textarea></div>
                </div>
                <div class="modal-rodape">
                    <button type="submit" class="btn-primary">Salvar Alterações</button>
                    <button type="button" class="btn-secondary" data-acao="modal-fechar">Cancelar</button>
                    <button type="button" class="btn-danger empurrar" data-acao="agenda-excluir" data-id="${esc(id)}">Excluir</button>
                </div>
            </form>`);
    }

    async function alternarConclusaoAgenda(id) {
        const a = acharAgenda(id);
        if (!a) return;
        const novo = a.status === 'concluido' ? 'agendado' : 'concluido';
        const sucesso = await executar(null, '', 'Não foi possível atualizar o serviço.', async () => {
            await atualizar('agenda', id, { status: novo });
            await carregarAgenda();
        });
        if (sucesso) { renderizarAgenda(); renderizarDashboard(); toast(novo === 'concluido' ? 'Serviço marcado como concluído.' : 'Serviço reaberto.', 'sucesso'); }
    }

    async function deletarAgenda(id) {
        if (!acharAgenda(id)) return;
        const sim = await confirmar({ titulo: 'Remover da agenda', mensagem: 'Remover este serviço da agenda?', textoSim: 'Remover', perigo: true });
        if (!sim) return;
        const sucesso = await executar(null, '', 'Não foi possível remover o serviço.', async () => {
            await excluirRegistro('agenda', id);
            await carregarAgenda();
        });
        if (sucesso) { fecharModal(); renderizarTudo(); toast('Serviço removido da agenda.', 'sucesso'); }
    }

    // =================================================================
    // 11. DECLARAÇÕES (próprias funções: ver, editar, excluir, documento)
    // =================================================================
    function atualizarDicaDeclaracao() {
        const orc = acharOrcamento($('#dec-orcamento').value);
        $('#dec-dica').textContent = orc ? `Valor do orçamento: ${moeda(orc.total)} · Cliente: ${nomeDoCliente(orc.cliente_id)}` : '';
        return orc;
    }

    async function criarDeclaracao(form, botao) {
        const dados = {
            orcamento_id: $('#dec-orcamento').value,
            data: $('#dec-data').value,
            entrada: lerMoeda($('#dec-entrada')),
            saida: lerMoeda($('#dec-saida')),
            status: $('#dec-status').value,
            observacoes: $('#dec-obs').value.trim(),
        };
        if (!dados.orcamento_id || !dados.data) { toast('Selecione o orçamento e a data.', 'aviso'); return; }
        const sucesso = await executar(botao, 'Gerando…', 'Não foi possível gerar a declaração.', async () => {
            await inserir('declaracoes', dados);
            await carregarDeclaracoes();
        });
        if (sucesso) { form.reset(); prepararFormularios(); renderizarTudo(); toast('Declaração gerada.', 'sucesso'); }
    }

    function abrirVisualizarDeclaracao(id) {
        const d = acharDeclaracao(id);
        if (!d) return;
        const orc = acharOrcamento(d.orcamento_id);
        abrirModal(`
            <h2 id="modal-titulo">Declaração — ${esc(orc ? nomeDoCliente(orc.cliente_id) : 'Cliente removido')}</h2>
            <dl class="detalhes">
                <div><dt>Cliente</dt><dd>${esc(orc ? nomeDoCliente(orc.cliente_id) : '-')}</dd></div>
                <div><dt>Orçamento relacionado</dt><dd>${orc ? `<button type="button" class="btn-link" data-acao="orc-ver" data-id="${esc(orc.id)}">#${pad(orc.numero)} · ${esc(moeda(orc.total))}</button>` : '-'}</dd></div>
                <div><dt>Data</dt><dd>${esc(dataBR(d.data))}</dd></div>
                <div><dt>Status</dt><dd><span class="badge ${esc(d.status)}">${esc(ROTULO_DEC[d.status] || d.status)}</span></dd></div>
                <div><dt>Entradas</dt><dd class="positivo"><strong>+${esc(moeda(d.entrada))}</strong></dd></div>
                <div><dt>Saídas</dt><dd class="negativo"><strong>−${esc(moeda(d.saida))}</strong></dd></div>
                <div class="full-width"><dt>${rotuloResultado(d.resultado)}</dt><dd class="${classeResultado(d.resultado)}"><strong style="font-size:22px">${esc(textoResultado(d.resultado))}</strong></dd></div>
                ${d.observacoes ? `<div class="full-width"><dt>Observações</dt><dd>${esc(d.observacoes)}</dd></div>` : ''}
            </dl>
            <div class="modal-rodape">
                <button type="button" class="btn-primary btn-roxo" data-acao="dec-documento" data-id="${esc(id)}">Gerar Documento</button>
                <button type="button" class="btn-primary" data-acao="dec-editar" data-id="${esc(id)}">Editar</button>
                <button type="button" class="btn-danger" data-acao="dec-excluir" data-id="${esc(id)}">Excluir</button>
                <button type="button" class="btn-secondary empurrar" data-acao="modal-fechar">Fechar</button>
            </div>`);
    }

    function abrirEditarDeclaracao(id) {
        const d = acharDeclaracao(id);
        if (!d) return;
        abrirModal(`
            <form id="form-modal" data-tipo="declaracao" data-id="${esc(id)}">
                <h2 id="modal-titulo">Editar Declaração</h2>
                <div class="form-grid">
                    <div class="form-group full-width"><label for="edit-dec-orc">Orçamento</label>
                        <select id="edit-dec-orc" required>${opcoesOrcamentos(d.orcamento_id)}</select></div>
                    <div class="form-group"><label for="edit-dec-data">Data</label>
                        <input type="date" id="edit-dec-data" required value="${esc(d.data)}"></div>
                    <div class="form-group"><label for="edit-dec-status">Status</label>
                        <select id="edit-dec-status">${Object.keys(ROTULO_DEC).map((s) => `<option value="${s}"${s === d.status ? ' selected' : ''}>${ROTULO_DEC[s]}</option>`).join('')}</select></div>
                    <div class="form-group"><label for="edit-dec-entrada">Entrada (R$)</label>
                        <input type="text" id="edit-dec-entrada" data-moeda inputmode="numeric" autocomplete="off" value="${esc(moeda(d.entrada))}"></div>
                    <div class="form-group"><label for="edit-dec-saida">Saída (R$)</label>
                        <input type="text" id="edit-dec-saida" data-moeda inputmode="numeric" autocomplete="off" value="${esc(moeda(d.saida))}"></div>
                    <div class="form-group full-width"><label for="edit-dec-obs">Observações</label>
                        <textarea id="edit-dec-obs" rows="3" maxlength="2000">${esc(d.observacoes || '')}</textarea></div>
                </div>
                <div class="resumo-resultado" id="edit-dec-previa"></div>
                <div class="modal-rodape">
                    <button type="submit" class="btn-primary">Salvar Alterações</button>
                    <button type="button" class="btn-secondary" data-acao="modal-fechar">Cancelar</button>
                    <button type="button" class="btn-danger empurrar" data-acao="dec-excluir" data-id="${esc(id)}">Excluir Declaração</button>
                </div>
            </form>`);
        atualizarPreviaResultado($('#edit-dec-entrada'), $('#edit-dec-saida'), $('#edit-dec-previa'));
    }

    async function deletarDeclaracao(id) {
        if (!acharDeclaracao(id)) return;
        const sim = await confirmar({ titulo: 'Excluir declaração', mensagem: 'Excluir esta declaração permanentemente?', textoSim: 'Excluir', perigo: true });
        if (!sim) return;
        const sucesso = await executar(null, '', 'Não foi possível excluir a declaração.', async () => {
            await excluirRegistro('declaracoes', id);
            await carregarDeclaracoes();
        });
        if (sucesso) { fecharModal(); renderizarTudo(); toast('Declaração excluída.', 'sucesso'); }
    }

    // =================================================================
    // 12. SALVAR EDIÇÕES (formulário do modal)
    // =================================================================
    async function salvarEdicao(form, botao) {
        const tipo = form.dataset.tipo;
        const id = form.dataset.id;
        let tarefa;
        let recarregar;
        let msg = 'Não foi possível salvar as alterações.';

        if (tipo === 'cliente') {
            const campos = {
                nome: $('#edit-nome').value.trim(), telefone: $('#edit-tel').value.trim(),
                email: valorOuNull($('#edit-email').value), endereco: valorOuNull($('#edit-end').value),
                observacoes: valorOuNull($('#edit-obs').value),
            };
            if (!campos.nome || !campos.telefone) { toast('Informe nome e telefone.', 'aviso'); return; }
            tarefa = () => atualizar('clientes', id, campos);
            recarregar = carregarClientes;     // os orçamentos e a agenda usam o ID: continuam vinculados mesmo trocando o nome
        } else if (tipo === 'orcamento') {
            const dados = ctrlEdicao && ctrlEdicao.obter();
            const erro = validarOrcamento(dados);
            if (erro) { toast(erro, 'aviso'); return; }
            tarefa = () => salvarOrcamentoNoBanco(dados);
            recarregar = carregarOrcamentos;
        } else if (tipo === 'agenda') {
            const campos = {
                cliente_id: $('#edit-age-cliente').value, data: $('#edit-age-data').value,
                horario: valorOuNull($('#edit-age-hora').value), servico: $('#edit-age-servico').value.trim(),
                status: $('#edit-age-status').value, observacao: valorOuNull($('#edit-age-obs').value),
            };
            if (!campos.cliente_id || !campos.data || !campos.servico) { toast('Preencha cliente, data e serviço.', 'aviso'); return; }
            tarefa = () => atualizar('agenda', id, campos);
            recarregar = carregarAgenda;
        } else if (tipo === 'declaracao') {
            const campos = {
                orcamento_id: $('#edit-dec-orc').value, data: $('#edit-dec-data').value,
                status: $('#edit-dec-status').value, entrada: lerMoeda($('#edit-dec-entrada')),
                saida: lerMoeda($('#edit-dec-saida')), observacoes: $('#edit-dec-obs').value.trim(),
            };
            if (!campos.orcamento_id || !campos.data) { toast('Selecione o orçamento e a data.', 'aviso'); return; }
            tarefa = () => atualizar('declaracoes', id, campos);
            recarregar = carregarDeclaracoes;
        } else if (tipo === 'perfil') {
            return salvarPerfil(form, botao);
        } else {
            return;
        }

        const sucesso = await executar(botao, 'Salvando…', msg, async () => { await tarefa(); await recarregar(); });
        if (sucesso) { fecharModal(); renderizarTudo(); toast('Alterações salvas.', 'sucesso'); }
    }

    // =================================================================
    // 13. DOCUMENTOS (orçamento A4, ordem de serviço, declaração)
    // =================================================================
    const LOGO_DOC = '/images/n1protect-documento.png';

    function tabelaItensDocumento(orc) {
        return '<table class="doc-tabela"><thead><tr><th>ITEM</th><th class="qtd">QTD</th><th class="num">VALOR</th><th class="num">TOTAL</th></tr></thead><tbody>' +
            orc.itens.map((i) => `<tr><td>${esc(i.nome)}</td><td class="qtd">${esc(fmtQtd(i.quantidade))}</td><td class="num">${esc(moeda(i.preco_unitario))}</td><td class="num">${esc(moeda(i.subtotal))}</td></tr>`).join('') +
            '</tbody></table>';
    }

    function abrirDocumento(html, { os = false, contexto = null } = {}) {
        $('#conteudo-documento').innerHTML = html;
        $('.documento').classList.toggle('os', os);
        docAtual = contexto;
        $('#overlay-documento').classList.add('aberto');
        atualizarRolagem();
        requestAnimationFrame(ajustarEscalaDocumento);
        $$('#conteudo-documento img').forEach((img) => { if (!img.complete) img.addEventListener('load', ajustarEscalaDocumento, { once: true }); });
    }

    function fecharDocumento() {
        $('#overlay-documento').classList.remove('aberto');
        docAtual = null;
        atualizarRolagem();
    }

    /** Reduz o documento para caber na tela (sem mexer no tamanho real usado na imagem). */
    function ajustarEscalaDocumento() {
        const overlay = $('#overlay-documento');
        if (!overlay.classList.contains('aberto')) return;
        const doc = $('.documento');
        const moldura = $('#documento-moldura');
        doc.style.transform = 'none';
        const larg = doc.offsetWidth;
        const alt = doc.offsetHeight;
        const escala = Math.min(0.9, (overlay.clientWidth - 24) / larg);
        doc.style.transform = `scale(${escala})`;
        moldura.style.width = `${larg * escala}px`;
        moldura.style.height = `${alt * escala}px`;
    }

    function gerarLayoutDocumento(id) {
        const orc = acharOrcamento(id);
        if (!orc) return;
        const cli = acharCliente(orc.cliente_id) || { nome: 'Cliente removido', telefone: '' };
        const titulo = orc.itens.length ? 'DESCRIÇÃO / COMPLEMENTO' : 'DESCRIÇÃO DOS SERVIÇOS';
        abrirDocumento(`
            <div class="doc-cabecalho">
                <img src="${LOGO_DOC}" class="doc-logo" alt="Logo N1 Protect">
                <div class="doc-titulo"><h1>ORÇAMENTO</h1><p>Data: ${esc(dataBR(orc.data))}</p><p>Nº: ${pad(orc.numero)}</p></div>
            </div>
            <div class="doc-secao"><h3>CLIENTE</h3><p class="doc-cliente">${esc(cli.nome)}</p></div>
            ${orc.itens.length ? `<div class="doc-secao"><h3>ITENS</h3>${tabelaItensDocumento(orc)}</div>` : ''}
            ${orc.descricao ? `<div class="doc-secao"><h3>${titulo}</h3><p class="doc-texto">${esc(orc.descricao)}</p></div>` : ''}
            <div class="doc-total"><div><small>VALOR TOTAL:</small><strong>${esc(moeda(orc.total))}</strong></div></div>
            <div class="doc-rodape"><p>N1 PROTECT - Segurança Eletrônica e Tecnologia</p><p>Este documento é uma proposta comercial válida por 14 dias.</p></div>`, {
            contexto: {
                cliente: cli,
                arquivo: `Orcamento_N1_${pad(orc.numero)}_${slug(cli.nome)}.png`,
                mensagem: `Olá ${cli.nome}! Segue o orçamento da *N1 PROTECT* referente aos serviços solicitados.\n*Valor total:* ${moeda(orc.total)}\n\nEstou te enviando a imagem com os detalhes acima. ☝️`,
            },
        });
    }

    function gerarLayoutOS(id) {
        const orc = acharOrcamento(id);
        if (!orc) return;
        const cli = acharCliente(orc.cliente_id) || { nome: 'Cliente removido', telefone: '' };
        abrirDocumento(`
            <div class="doc-cabecalho">
                <div class="doc-titulo" style="text-align:left"><h1 style="font-size:28px">ORDEM DE SERVIÇO</h1>
                    <p><span style="background:#eee;padding:4px 10px;border-radius:4px;font-weight:bold">Nº OS: ${pad(orc.numero)}</span></p></div>
                <div class="doc-titulo"><p style="font-weight:bold;font-size:18px;margin:0">N1 PROTECT</p>
                    <p style="font-size:13px;color:#666">Sistemas de Segurança Eletrônica</p>
                    <p style="font-size:13px;color:#666">Data de Emissão: ${esc(dataBR(orc.data))}</p></div>
            </div>
            <div class="doc-info">
                <div><small>CLIENTE / RAZÃO SOCIAL</small><p>${esc(cli.nome)}</p></div>
                <div><small>CONTATO / WHATSAPP</small><p>${esc(cli.telefone || '(00) 00000-0000')}</p></div>
                <div><small>ENDEREÇO</small><p>${esc(cli.endereco || '-')}</p></div>
            </div>
            <div class="doc-secao"><h3>RELATÓRIO TÉCNICO DE SERVIÇOS E MATERIAIS</h3>
                ${orc.itens.length ? tabelaItensDocumento(orc) : ''}
                ${orc.descricao || !orc.itens.length ? `<p class="doc-texto">${esc(orc.descricao || 'Sem descrição.')}</p>` : ''}
            </div>
            <div class="doc-total">
                <div class="caixa"><small>VALOR TOTAL</small><strong>${esc(moeda(orc.total))}</strong></div>
                <div class="doc-assinatura"><div></div><p>Assinatura do Cliente</p></div>
            </div>`, {
            os: true,
            contexto: {
                cliente: cli,
                arquivo: `OS_N1_${pad(orc.numero)}_${slug(cli.nome)}.png`,
                mensagem: `Olá ${cli.nome}! Segue a ordem de serviço da *N1 PROTECT*.\n*Valor total:* ${moeda(orc.total)}\n\nEstou te enviando a imagem com os detalhes acima. ☝️`,
            },
        });
    }

    function gerarLayoutDeclaracao(id) {
        const d = acharDeclaracao(id);
        if (!d) return;
        const orc = acharOrcamento(d.orcamento_id);
        const cli = (orc && acharCliente(orc.cliente_id)) || { nome: 'Cliente removido', telefone: '' };
        abrirDocumento(`
            <div class="doc-cabecalho">
                <img src="${LOGO_DOC}" class="doc-logo" alt="Logo N1 Protect">
                <div class="doc-titulo"><h1>DECLARAÇÃO</h1><p>Data: ${esc(dataBR(d.data))}</p><p>Orçamento: ${orc ? pad(orc.numero) : '-'}</p></div>
            </div>
            <div class="doc-secao"><h3>CLIENTE</h3><p class="doc-cliente">${esc(cli.nome)}</p>
                <p style="color:#666">Status: ${esc(ROTULO_DEC[d.status] || d.status)}</p></div>
            <div class="doc-secao doc-linhas-decl">
                <div><span>ENTRADAS</span><span class="mais">+${esc(moeda(d.entrada))}</span></div>
                <div><span>SAÍDAS</span><span class="menos">−${esc(moeda(d.saida))}</span></div>
            </div>
            <div class="doc-total ${d.resultado < 0 ? 'negativo' : ''}"><div><small>${esc(rotuloResultado(d.resultado).toUpperCase())}:</small><strong>${esc(textoResultado(d.resultado))}</strong></div></div>
            ${d.observacoes ? `<div class="doc-secao" style="margin-top:28px"><h3>OBSERVAÇÕES</h3><p class="doc-texto">${esc(d.observacoes)}</p></div>` : ''}
            <div class="doc-rodape"><p>N1 PROTECT - Segurança Eletrônica e Tecnologia</p></div>`, {
            contexto: {
                cliente: cli,
                arquivo: `Declaracao_N1_${slug(cli.nome)}_${d.data}.png`,
                mensagem: `Olá ${cli.nome}! Segue a declaração da *N1 PROTECT*${orc ? ` referente ao orçamento #${pad(orc.numero)}` : ''}.\n*${rotuloResultado(d.resultado)}:* ${textoResultado(d.resultado)}\n\nEstou te enviando a imagem com os detalhes acima. ☝️`,
            },
        });
    }

    async function gerarCanvasDocumento() {
        if (typeof window.html2canvas !== 'function') throw new Error('html2canvas indisponível');
        const overlay = $('#overlay-documento');
        const doc = $('.documento');
        await Promise.all($$('img', doc).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
        const rolagem = overlay.scrollTop;
        overlay.scrollTop = 0;
        try {
            return await window.html2canvas(doc, {
                scale: 2, useCORS: true, allowTaint: false, logging: false, backgroundColor: '#ffffff',
                scrollX: 0, scrollY: 0,
                onclone: (clonado) => {                            // a imagem sai em tamanho real, sem a redução de tela
                    const d = clonado.querySelector('.documento');
                    if (d) d.style.transform = 'none';
                    const m = clonado.querySelector('#documento-moldura');
                    if (m) { m.style.width = 'auto'; m.style.height = 'auto'; }
                },
            });
        } finally { overlay.scrollTop = rolagem; }
    }

    const canvasParaBlob = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar a imagem'))), 'image/png'));

    async function baixarDocumentoComoImagem(botao) {
        if (!docAtual) return;
        const arquivo = docAtual.arquivo;
        const original = botao.textContent;
        botao.disabled = true; botao.textContent = 'Gerando...';
        try {
            baixarBlob(await canvasParaBlob(await gerarCanvasDocumento()), arquivo);
        } catch (e) {
            tratarErro(e, 'Não foi possível salvar a imagem do documento.');
        } finally { botao.disabled = false; botao.textContent = original; }
    }

    async function compartilharWhatsapp(botao) {
        if (!docAtual) return;
        const ctx = docAtual;
        const telefone = telefoneWhatsapp(ctx.cliente && ctx.cliente.telefone);
        if (!telefone) { toast('O telefone deste cliente está vazio ou inválido. Edite o cadastro (use DDD).', 'erro', 7000); return; }

        const aba = window.open('about:blank', '_blank');       // abre já no clique, para o navegador não bloquear
        if (aba) aba.opener = null;
        const original = botao.textContent;
        botao.disabled = true; botao.textContent = 'Gerando...';
        try {
            const blob = await canvasParaBlob(await gerarCanvasDocumento());
            let copiada = false;
            try { await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]); copiada = true; } catch (e) { console.warn('[N1] clipboard:', e); }
            if (!copiada) baixarBlob(blob, ctx.arquivo);
            toast(copiada ? 'Imagem copiada! Cole (Ctrl+V) na conversa do WhatsApp.' : 'Não foi possível copiar a imagem; ela foi baixada para você anexar na conversa.', copiada ? 'sucesso' : 'aviso', 8000);

            const url = `https://api.whatsapp.com/send?phone=${telefone}&text=${encodeURIComponent(ctx.mensagem)}`;
            if (aba) aba.location.href = url; else window.open(url, '_blank', 'noopener');
        } catch (e) {
            if (aba) aba.close();
            tratarErro(e, 'Não foi possível preparar o documento para o WhatsApp.');
        } finally { botao.disabled = false; botao.textContent = original; }
    }

    // =================================================================
    // 14. PERFIL E SAÍDA
    // =================================================================
    function abrirPerfil() {
        const leg = lerLegado();
        const temAntigo = temLegado(leg);
        abrirModal(`
            <form id="form-modal" data-tipo="perfil">
                <h2 id="modal-titulo">Meu perfil</h2>
                <div class="perfil-topo">
                    <span class="avatar grande" aria-hidden="true">${htmlAvatar()}</span>
                    <div><strong>${esc(nomeDoUsuario())}</strong><span>${esc(estado.usuario.email || '')}</span></div>
                </div>
                <div class="form-grid">
                    <div class="form-group full-width"><label for="perfil-nome">Nome</label>
                        <input type="text" id="perfil-nome" maxlength="120" value="${esc((estado.perfil && estado.perfil.full_name) || '')}" placeholder="Como você quer ser chamado"></div>
                    <div class="form-group full-width"><label for="perfil-email">E-mail</label>
                        <input type="text" id="perfil-email" readonly class="input-readonly" value="${esc(estado.usuario.email || '')}"></div>
                </div>
                <div class="modal-rodape">
                    <button type="submit" class="btn-primary">Salvar</button>
                    <button type="button" class="btn-secondary" data-acao="modal-fechar">Fechar</button>
                    ${temAntigo ? '<button type="button" class="btn-secondary empurrar" data-acao="legado-limpar">Limpar dados antigos deste navegador</button>' : ''}
                    <button type="button" class="btn-danger ${temAntigo ? '' : 'empurrar'}" data-acao="sair">Sair</button>
                </div>
            </form>`);
    }

    async function salvarPerfil(form, botao) {
        const nome = valorOuNull($('#perfil-nome').value);
        const sucesso = await executar(botao, 'Salvando…', 'Não foi possível salvar o perfil.', async () => {
            const d = ok(await sb.from('profiles').update({ full_name: nome }).eq('id', estado.usuario.id).select('id,email,full_name,avatar_url'));
            if (d && d[0]) estado.perfil = d[0];
        });
        if (sucesso) { fecharModal(); renderizarPerfilLateral(); toast('Perfil atualizado.', 'sucesso'); }
    }

    async function sair() {
        try { await sb.auth.signOut(); } catch (e) { console.warn('[N1] signOut:', e); }
        irParaLogin();
    }

    // =================================================================
    // 15. MIGRAÇÃO DOS DADOS ANTIGOS (localStorage → Supabase)
    // =================================================================
    const CHAVES_LEGADAS = ['n1_clientes', 'n1_orcamentos', 'n1_agenda', 'n1_declaracoes'];
    const chaveMigracao = () => 'n1_migrado_' + estado.usuario.id;

    function lerLegado() {
        const ler = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []; } catch { return []; } };
        return { clientes: ler('n1_clientes'), orcamentos: ler('n1_orcamentos'), agenda: ler('n1_agenda'), declaracoes: ler('n1_declaracoes') };
    }
    const temLegado = (l) => Object.values(l).some((a) => a.length);

    function verificarMigracao() {
        try {
            if (localStorage.getItem(chaveMigracao())) return;           // esta conta já importou
            if (sessionStorage.getItem('n1_migracao_adiada')) return;    // o usuário escolheu "agora não" nesta sessão
        } catch { return; }
        const leg = lerLegado();
        if (!temLegado(leg)) return;
        legadoPendente = leg;
        abrirModal(`
            <h2 id="modal-titulo">Importar dados antigos?</h2>
            <p class="confirmar-texto">Encontramos dados salvos neste navegador pela versão anterior do sistema:</p>
            <div class="relatorio-box">
                ${leg.clientes.length} cliente(s) · ${leg.orcamentos.length} orçamento(s) · ${leg.agenda.length} serviço(s) na agenda · ${leg.declaracoes.length} declaração(ões)
            </div>
            <div class="aviso-box">Os dados serão enviados para a conta <strong>${esc(estado.usuario.email || '')}</strong>. Importe apenas se eles forem desta conta.
            Rodar a importação duas vezes não duplica registros. Os dados antigos continuam no navegador como backup até você limpá-los.</div>
            <div class="modal-rodape" id="migracao-rodape">
                <button type="button" class="btn-primary" data-acao="migracao-importar">Importar agora</button>
                <button type="button" class="btn-secondary" data-acao="migracao-backup">Baixar backup (.json)</button>
                <button type="button" class="btn-secondary empurrar" data-acao="migracao-adiar">Agora não</button>
            </div>`);
    }

    const dataLegadaParaISO = (t) => {
        const s = String(t || '');
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : hojeISO();
    };
    const numeroLegado = (v) => { const n = parseFloat(String(v ?? '0').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? arred2(n) : 0; };
    const idLegado = (v) => { const n = Number(v); return Number.isSafeInteger(n) ? n : null; };
    const cortar = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };

    async function executarMigracao(leg) {
        const uid = estado.usuario.id;
        const rel = { clientes: 0, orcamentos: 0, agenda: 0, declaracoes: 0, ignorados: [] };
        const enviar = async (tabela, linhas) => {
            for (let i = 0; i < linhas.length; i += 100) {
                // onConflict + ignoreDuplicates: registros já importados são ignorados (sem duplicar)
                ok(await sb.from(tabela).upsert(linhas.slice(i, i + 100), { onConflict: 'user_id,legacy_id', ignoreDuplicates: true }));
            }
        };

        // 1) Clientes
        const linhasCli = leg.clientes.filter((c) => c.nome).map((c) => ({
            user_id: uid, legacy_id: idLegado(c.id), nome: cortar(c.nome, 200),
            telefone: cortar(c.telefone, 40) || 'Não informado', email: cortar(c.email, 254),
            endereco: cortar(c.endereco, 300), observacoes: cortar(c.obs ?? c.observacoes, 2000),
        }));
        await enviar('clientes', linhasCli);
        rel.clientes = linhasCli.length;
        await carregarClientes();
        const idPorNome = new Map();
        estado.clientes.forEach((c) => { const k = normalizar(c.nome); if (!idPorNome.has(k)) idPorNome.set(k, c.id); });

        // 2) Orçamentos (em ordem de criação, para a numeração seguir o histórico)
        const linhasOrc = [];
        [...leg.orcamentos].sort((a, b) => Number(a.id) - Number(b.id)).forEach((o) => {
            const cid = idPorNome.get(normalizar(o.cliente));
            if (!cid) { rel.ignorados.push(`Orçamento de “${o.cliente || '?'}” (cliente não encontrado)`); return; }
            linhasOrc.push({
                user_id: uid, legacy_id: idLegado(o.id), cliente_id: cid, data: dataLegadaParaISO(o.data),
                descricao: String(o.descricao ?? '').slice(0, 10000), total: numeroLegado(o.valor),
            });
        });
        await enviar('orcamentos', linhasOrc);
        rel.orcamentos = linhasOrc.length;
        await carregarOrcamentos();

        // Orçamento mais recente de cada cliente: as declarações antigas só guardavam o NOME do cliente
        const ultimoPorCliente = new Map();
        estado.orcamentos.filter((o) => o.legacy_id !== null && o.legacy_id !== undefined).forEach((o) => {
            const atual = ultimoPorCliente.get(o.cliente_id);
            if (!atual || Number(o.legacy_id) > Number(atual.legacy_id)) ultimoPorCliente.set(o.cliente_id, o);
        });

        // 3) Agenda
        const linhasAge = [];
        leg.agenda.forEach((a) => {
            const cid = idPorNome.get(normalizar(a.cliente));
            if (!cid) { rel.ignorados.push(`Serviço de “${a.cliente || '?'}” em ${dataBR(a.data)} (cliente não encontrado)`); return; }
            linhasAge.push({ user_id: uid, legacy_id: idLegado(a.id), cliente_id: cid, data: dataLegadaParaISO(a.data), servico: String(a.servico ?? '').slice(0, 500), status: 'agendado' });
        });
        await enviar('agenda', linhasAge);
        rel.agenda = linhasAge.length;

        // 4) Declarações
        const linhasDec = [];
        leg.declaracoes.forEach((d) => {
            const cid = idPorNome.get(normalizar(d.orcamento));
            const orc = cid && ultimoPorCliente.get(cid);
            if (!orc) { rel.ignorados.push(`Declaração de “${d.orcamento || '?'}” (nenhum orçamento encontrado para vincular)`); return; }
            linhasDec.push({
                user_id: uid, legacy_id: idLegado(d.id), orcamento_id: orc.id, data: dataLegadaParaISO(d.data),
                entrada: numeroLegado(d.entrada), saida: numeroLegado(d.saida), status: 'aberta',
                observacoes: 'Importada do sistema anterior: vínculo com o orçamento inferido pelo nome do cliente.',
            });
        });
        await enviar('declaracoes', linhasDec);
        rel.declaracoes = linhasDec.length;

        await carregarTudo();
        try { localStorage.setItem(chaveMigracao(), new Date().toISOString()); } catch { /* sem localStorage: apenas perguntará de novo */ }
        return rel;
    }

    async function importarDadosAntigos(botao) {
        if (!legadoPendente) return;
        let relatorio = null;
        const sucesso = await executar(botao, 'Importando…', 'Não foi possível importar os dados antigos. Nada foi apagado; tente novamente.', async () => {
            relatorio = await executarMigracao(legadoPendente);
        });
        if (!sucesso || !relatorio) return;
        legadoPendente = null;
        renderizarTudo();
        $('#modal-conteudo').innerHTML = `
            <h2 id="modal-titulo">Importação concluída</h2>
            <div class="relatorio-box">
                Clientes: ${relatorio.clientes}<br>Orçamentos: ${relatorio.orcamentos}<br>
                Serviços na agenda: ${relatorio.agenda}<br>Declarações: ${relatorio.declaracoes}
            </div>
            ${relatorio.ignorados.length ? `<div class="aviso-box"><strong>${relatorio.ignorados.length} registro(s) não puderam ser vinculados e ficaram de fora:</strong><br>${relatorio.ignorados.slice(0, 12).map(esc).join('<br>')}${relatorio.ignorados.length > 12 ? '<br>…' : ''}<br>Eles continuam no navegador (e no backup, se você baixou).</div>` : ''}
            <p class="confirmar-texto" style="margin-top:12px">Os dados antigos seguem neste navegador como backup. Quando quiser, limpe em <strong>Meu perfil</strong>.</p>
            <div class="modal-rodape"><button type="button" class="btn-primary" data-acao="modal-fechar">Concluir</button></div>`;
    }

    async function limparLegado() {
        const sim = await confirmar({
            titulo: 'Limpar dados antigos', textoSim: 'Limpar', perigo: true,
            mensagem: 'Isto apaga do navegador os dados da versão anterior (clientes, orçamentos, agenda e declarações). Só faça isso depois de importar ou baixar o backup.',
        });
        if (!sim) return;
        CHAVES_LEGADAS.forEach((k) => localStorage.removeItem(k));
        legadoPendente = null;
        fecharModal();
        toast('Dados antigos removidos deste navegador.', 'sucesso');
    }

    // =================================================================
    // 16. ACESSO AO SITE (cookie do portão): detecta expiração e renova
    // =================================================================
    function iniciarMonitorAcessoSite() {
        const checar = async () => {
            try {
                const r = await fetch('/api/sessao', { credentials: 'same-origin', cache: 'no-store' });
                if (r.status === 401) {
                    location.replace('/acesso/?motivo=expirada&next=' + encodeURIComponent(location.pathname + location.search));
                }
            } catch { /* offline: tenta de novo depois */ }
        };
        setInterval(checar, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) checar(); });
    }

    // =================================================================
    // 17. RELÓGIO
    // =================================================================
    function atualizarRelogio() {
        const el = $('#data-hora-atual');
        if (!el) return;
        const agora = new Date();
        el.innerHTML = `<strong>${esc(agora.toLocaleDateString('pt-BR'))}</strong> | <strong>${esc(agora.toLocaleTimeString('pt-BR'))}</strong>`;
    }

    // =================================================================
    // 18. EVENTOS
    // =================================================================
    const acoes = {
        'trocar-aba': (d) => trocarAba(d.aba),
        'menu-mobile': () => alternarMenu(),
        'perfil-abrir': () => abrirPerfil(),
        'sair': () => sair(),
        'modal-fechar': () => fecharModal(),

        'cliente-ver': (d) => abrirVisualizarCliente(d.id),
        'cliente-editar': (d) => abrirEditarCliente(d.id),
        'cliente-excluir': (d) => deletarCliente(d.id),

        'orc-ver': (d) => abrirVisualizarOrcamento(d.id),
        'orc-editar': (d) => abrirEditarOrcamento(d.id),
        'orc-excluir': (d) => deletarOrcamento(d.id),
        'orc-documento': (d) => abrirModalEscolha(d.id),
        'doc-orcamento': (d) => { fecharModal(); gerarLayoutDocumento(d.id); },
        'doc-os': (d) => { fecharModal(); gerarLayoutOS(d.id); },

        'agenda-alternar': (d) => alternarConclusaoAgenda(d.id),
        'agenda-editar': (d) => abrirEditarAgenda(d.id),
        'agenda-excluir': (d) => deletarAgenda(d.id),

        'dec-ver': (d) => abrirVisualizarDeclaracao(d.id),
        'dec-editar': (d) => abrirEditarDeclaracao(d.id),
        'dec-excluir': (d) => deletarDeclaracao(d.id),
        'dec-documento': (d) => { fecharModal(); gerarLayoutDeclaracao(d.id); },

        'doc-fechar': () => fecharDocumento(),
        'doc-imagem': (d, el) => baixarDocumentoComoImagem(el),
        'doc-whatsapp': (d, el) => compartilharWhatsapp(el),

        'migracao-importar': (d, el) => importarDadosAntigos(el),
        'migracao-backup': () => {
            const leg = legadoPendente || lerLegado();
            baixarBlob(new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), ...leg }, null, 2)], { type: 'application/json' }), `n1protect-backup-${hojeISO()}.json`);
            toast('Backup baixado.', 'sucesso');
        },
        'migracao-adiar': () => { try { sessionStorage.setItem('n1_migracao_adiada', '1'); } catch { /* ignora */ } fecharModal(); },
        'legado-limpar': () => limparLegado(),
    };

    const formularios = {
        'form-cliente': criarCliente,
        'form-orcamento': criarOrcamento,
        'form-agenda': criarAgenda,
        'form-declaracao': criarDeclaracao,
        'form-modal': salvarEdicao,
    };

    function ligarEventos() {
        document.addEventListener('click', (e) => {
            const el = e.target.closest('[data-acao]');
            if (!el) return;
            const fn = el.dataset.acao === 'doc-fundo' ? () => { if (e.target === el) fecharDocumento(); } : acoes[el.dataset.acao];
            if (fn) fn(el.dataset, el, e);
        });

        document.addEventListener('submit', (e) => {
            const fn = formularios[e.target.id];
            if (!fn) return;
            e.preventDefault();
            fn(e.target, e.submitter || $('[type="submit"]', e.target));
        });

        document.addEventListener('input', (e) => {
            const alvo = e.target;
            if (alvo.matches && alvo.matches('input[data-moeda]')) aplicarMascaraMoeda(alvo);
            if (alvo.id === 'busca-clientes') renderizarClientes();
            if (alvo.id === 'dec-entrada' || alvo.id === 'dec-saida') atualizarPreviaResultado($('#dec-entrada'), $('#dec-saida'), $('#dec-previa'));
            if (alvo.id === 'edit-dec-entrada' || alvo.id === 'edit-dec-saida') atualizarPreviaResultado($('#edit-dec-entrada'), $('#edit-dec-saida'), $('#edit-dec-previa'));
        });

        document.addEventListener('change', (e) => {
            const id = e.target.id;
            if (id === 'ordem-clientes') renderizarClientes();
            if (id === 'filtro-agenda') renderizarAgenda();
            if (id === 'dec-orcamento') {
                const orc = atualizarDicaDeclaracao();
                const entrada = $('#dec-entrada');
                if (orc && !lerMoeda(entrada)) { definirMoeda(entrada, orc.total); }   // sugere a entrada = valor do orçamento
                atualizarPreviaResultado(entrada, $('#dec-saida'), $('#dec-previa'));
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if ($('#overlay-documento').classList.contains('aberto')) fecharDocumento();
                else if ($('#modal').classList.contains('aberto')) fecharModal();
                return;
            }
            // Linhas/cartões clicáveis também funcionam pelo teclado
            if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.clicavel, .note-card')) {
                e.preventDefault();
                e.target.click();
            }
        });

        window.addEventListener('resize', ajustarEscalaDocumento);
    }

    /** Valores iniciais dos formulários fixos. */
    function prepararFormularios() {
        $('#age-data').value = hojeISO();
        $('#dec-data').value = hojeISO();
        $('#dec-dica').textContent = '';
        atualizarPreviaResultado($('#dec-entrada'), $('#dec-saida'), $('#dec-previa'));
    }

    // =================================================================
    // 19. INICIALIZAÇÃO
    // =================================================================
    function mostrarFalha(mensagem, comTentarNovamente) {
        $('.spinner').classList.add('oculto');
        $('#texto-carregando').textContent = mensagem;
        $('#btn-tentar-novamente').classList.toggle('oculto', !comTentarNovamente);
    }

    function revelarAplicacao() {
        document.body.classList.remove('app-oculto');
        const tela = $('#tela-carregando');
        tela.classList.add('sumir');
        setTimeout(() => tela.remove(), 400);
    }

    async function iniciar() {
        ligarEventos();
        $('#btn-tentar-novamente').addEventListener('click', () => location.reload());

        if (!sb) { mostrarFalha('Sistema não configurado: preencha SUPABASE_URL e SUPABASE_ANON_KEY em config.js.', false); return; }

        try {
            const { data: { session } } = await sb.auth.getSession();
            if (!session) return irParaLogin();

            // Confirma no servidor de autenticação que a sessão continua válida (não só no navegador)
            const { data: u, error } = await sb.auth.getUser();
            if (error) {
                if (error.status === 401 || error.status === 403 || /session/i.test(error.name || '')) {
                    await sb.auth.signOut({ scope: 'local' });
                    return irParaLogin();
                }
                throw error;
            }
            if (!u || !u.user) return irParaLogin();
            estado.usuario = u.user;

            $('#texto-carregando').textContent = 'Carregando seus dados…';
            estado.perfil = await N1.garantirPerfil(u.user);
            await carregarTudo();
        } catch (e) {
            console.error('[N1] Falha ao iniciar:', e);
            if (ehErroDeSessao(e)) return irParaLogin();
            mostrarFalha(mensagemDeErro(e, 'Não foi possível carregar seus dados agora.'), true);
            return;
        }

        sb.auth.onAuthStateChange((evento, sessao) => {
            if (evento === 'SIGNED_OUT') irParaLogin();
            else if (evento === 'SIGNED_IN' && sessao && estado.usuario && sessao.user.id !== estado.usuario.id) location.reload();
        });

        ctrlOrcNovo = criarFormularioOrcamento($('#orc-campos'), null, 'orc');
        prepararFormularios();
        renderizarTudo();

        let aba = 'dashboard';
        try { aba = localStorage.getItem('n1_active_tab') || 'dashboard'; } catch { /* ignora */ }
        trocarAba(aba);

        atualizarRelogio();
        setInterval(atualizarRelogio, 1000);
        iniciarMonitorAcessoSite();

        revelarAplicacao();
        verificarMigracao();
    }

    iniciar();
})();
