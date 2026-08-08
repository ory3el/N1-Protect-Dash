let clientes = JSON.parse(localStorage.getItem('n1_clientes')) || [];
let orcamentos = JSON.parse(localStorage.getItem('n1_orcamentos')) || [];
let declaracao = JSON.parse(localStorage.getItem('n1_declaracoes')) || [];

// Função para alternar as abas
function switchTab(tabId) {
    const e = window.event; // Adicione esta linha
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    if (e && e.currentTarget && e.currentTarget.classList) {
        e.currentTarget.classList.add('active');
    } else {
// ... resto do código
        const buttons = document.querySelectorAll('.nav-btn');
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick').includes(tabId)) {
                btn.classList.add('active');
            }
        });
    }

    localStorage.setItem('n1_active_tab', tabId);
}

// --- GESTÃO DE CLIENTES ---
document.getElementById('form-cliente').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const novoCliente = {
        id: Date.now(),
        nome: document.getElementById('cli-nome').value,
        telefone: document.getElementById('cli-tel').value,
        email: document.getElementById('cli-email').value,
        endereco: document.getElementById('cli-end').value,
        obs: document.getElementById('cli-obs').value
    };

    clientes.push(novoCliente);
    salvarDados();
    renderizarClientes();
    atualizarSelectClientes();
    this.reset();
});

function deletarCliente(id) {
    if(confirm('Tem certeza que deseja excluir este cliente?')) {
        clientes = clientes.filter(c => c.id !== id);
        salvarDados();
        renderizarClientes();
        atualizarSelectClientes();
    }
}

function renderizarClientes() {
    const tbody = document.getElementById('lista-clientes');
    tbody.innerHTML = '';
  
    clientes.sort((a, b) => a.nome.localeCompare(b.nome));
    clientes.forEach(cli => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${cli.nome}</strong></td>
                <td>${cli.telefone}</td>
                <td>${cli.email || '-'}</td>
                <td>${cli.endereco || '-'}</td>
                <td>
                    <button class="edit-btn" onclick="abrirEditarCliente(${cli.id})">Editar</button>
                    <button class="delete-btn" onclick="deletarCliente(${cli.id})">Excluir</button>
                </td>
            </tr>
        `;
    });
    atualizarSelectClientes();
    document.getElementById('count-clientes').innerText = clientes.length;
}

// --- GESTÃO DE ORÇAMENTOS ---
function atualizarSelectClientes() {
    const selectOrc = document.getElementById('orc-cliente');
    const selectDec = document.getElementById('dec-orcamento');
  
    if(selectOrc) selectOrc.innerHTML = '<option value="">Selecione um cliente...</option>';
  if(selectDec) selectDec.innerHTML = '<option value="">Selecione um Orçamento...</option>';
  
    clientes.forEach(cli => {
        if(selectOrc) selectOrc.innerHTML += `<option value="${cli.nome}">${cli.nome}</option>`;
    });
  
  orcamentos.forEach(orc => {
        if(selectDec) selectDec.innerHTML += `<option value="${orc.cliente}">${orc.cliente}</option>`;
    });
}

document.getElementById('form-orcamento').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const novoOrcamento = {
        id: Date.now(),
        cliente: document.getElementById('orc-cliente').value,
        valor: parseFloat(document.getElementById('orc-valor').value).toFixed(2),
        descricao: document.getElementById('orc-desc').value,
        data: new Date().toLocaleDateString('pt-BR')
    };

    orcamentos.push(novoOrcamento);
    salvarDados();
    renderizarOrcamentos();
    this.reset();
});

function deletarOrcamento(id) {
    if(confirm('Excluir este orçamento?')) {
        orcamentos = orcamentos.filter(o => o.id !== id);
        salvarDados();
        renderizarOrcamentos();
    }
}

function renderizarOrcamentos() {
    const grid = document.getElementById('lista-orcamentos');
    grid.innerHTML = '';

    clientes.sort((a, b) => a.nome.localeCompare(b.nome));
    const tituloSecao = document.querySelector('#orcamentos h2:nth-of-type(2)');
    if (tituloSecao) {
        tituloSecao.innerText = `Orçamentos Ativos (${orcamentos.length})`;
    }

    orcamentos.forEach(orc => {
        grid.innerHTML += `
            <div class="note-card" onclick="openViewOrc(${orc.id})">
                <div class="note-header">
                    <span class="note-client">${orc.cliente}</span>
                    <span class="note-date">${orc.data}</span>
                </div>
                <div class="note-body">${orc.descricao.replace(/\n/g, '<br>')}</div>
                <div class="note-footer">
                    <span class="note-price">R$ ${orc.valor}</span>
                    <div onclick="event.stopPropagation()">
                        <button class="edit-btn" onclick="abrirEditarOrcamento(${orc.id})">Editar</button>
                        <button class="delete-btn" onclick="deletarOrcamento(${orc.id})">Apagar</button>
                    </div>
                </div>
            </div>
        `;
    });
    document.getElementById('count-orcamentos').innerText = orcamentos.length;
}

// --- GESTÃO DE DECLARAÇÃO ---

document.getElementById('form-declaracao').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const novaDeclaracao = {
        id: Date.now(),
        orcamento: document.getElementById('dec-orcamento').value,
        entrada: parseFloat(document.getElementById('dec-entrada').value).toFixed(2),
        saida: parseFloat(document.getElementById('dec-saida').value).toFixed(2),
        data: new Date().toLocaleDateString('pt-BR')
    };

    declaracao.push(novaDeclaracao);
    salvarDados();
    renderizarDeclaracao();
    this.reset();
});

function deletarDeclaracao(id) {
    if(confirm('Excluir esta declaração?')) {
        declaracao = declaracao.filter(d => d.id !== id);
        salvarDados();
        renderizarDeclaracao();
    }
}

function renderizarDeclaracao() {
    const grid = document.getElementById('lista-declaracao');
    grid.innerHTML = '';


    const tituloSecao2 = document.querySelector('#declaracao h2:nth-of-type(2)');
    if (tituloSecao2) {
        tituloSecao2.innerText = `Declarações Ativas (${declaracao.length})`;
    }

  
    declaracao.forEach(dec => {
       let lucro = parseFloat(dec.entrada-dec.saida).toFixed(2);
        grid.innerHTML += `
            <div class="note-card" onclick="openViewOrc(${dec.id})">
                <div class="note-header">
                    <span class="note-orcamento"><h2>${dec.orcamento}</h2></span>
                    <span class="note-date"><h2>${dec.data}</h2></span>
                </div>
                
                <div class="note-footer2">
                    <span class="note-price1"><h4>Entrada:</h4>+R$ ${dec.entrada}</span>
                    <span class="note-price2"><h4>Saída:</h4>-R$ ${dec.saida}</span>

                <div class="note-footer3">
                    <span class="note-price3"><h4>Lucro:</h4>R$ ${lucro}</span>
                                        
                    </div>
                </div>
            </div>
        `;
    });
}


function gerarLayoutDocumento(id) {
    const orc = orcamentos.find(o => o.id === id);
    if (!orc) return;

    const layout = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #333; padding: 0 0 20px 0; margin-bottom: 30px;">
            <img src='data:image/png;base64,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'style="width: 250px; height: auto; margin-top: -30px;" alt="Logo N1 Protect"/>
            
            <div style="text-align: right; font-family: sans-serif;">
                <h1 style="margin: 0; color: #333; font-size: 24px;">ORÇAMENTO</h1>
                <p style="margin: 5px 0;">Data: ${orc.data}</p>
                <p style="margin: 0;">Nº: ${orc.id.toString().slice(-6)}</p>
            </div>
        </div>

        <div style="margin-bottom: 30px; font-family: sans-serif;">
            <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 5px; color: #555; font-size: 20px; font-weight: normal;">CLIENTE</h3>
            <h3 style="font-size: 20px; font-weight: normal; margin: 10px 0; color: #000;">${orc.cliente}</h3>
        </div>

        <div style="margin-bottom: 40px; min-height: 400px; font-family: sans-serif;">
            <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 5px; color: #555; font-size: 20px; font-weight: normal;">DESCRIÇÃO DOS SERVIÇOS</h3>
            <p style="white-space: pre-wrap; line-height: 1.6; margin-top: 15px; color: #333; font-size: 20px; font-weight: normal;">${orc.descricao}</p>
        </div>

        <div style="text-align: left; border-top: 2px solid #333; padding-top: 20px; font-family: sans-serif;">
            <span style="font-size: 14px; color: #666;">VALOR TOTAL:</span>
            <h2 style="margin: 0; color: #28a745; font-size: 32px;">R$ ${orc.valor}</h2>
        </div>

        <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #999; font-family: sans-serif;">
            <p>N1 PROTECT - Segurança Eletrônica e Tecnologia</p>
            <p>Este documento é uma proposta comercial válida por 14 dias.</p>
        </div>
    `;
    
    abrirDocumento(layout);
}

function abrirDocumento(conteudoHtml) {
    const overlay = document.getElementById('overlay-documento');
    const container = document.getElementById('conteudo-documento');
    container.innerHTML = conteudoHtml;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function fecharDocumento() {
    const overlay = document.getElementById('overlay-documento');
    overlay.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function toggleExpandir(elemento) {
    elemento.classList.toggle('expanded');
}

// --- UTILIDADES ---
function salvarDados() {
    localStorage.setItem('n1_clientes', JSON.stringify(clientes));
    localStorage.setItem('n1_orcamentos', JSON.stringify(orcamentos));
    localStorage.setItem('n1_agenda', JSON.stringify(agenda));
    localStorage.setItem('n1_declaracoes', JSON.stringify(declaracao));
}

let editandoId = null;
let tipoEdicao = ''; // 'cliente' ou 'orcamento'

function abrirEditarCliente(id) {
    const cli = clientes.find(c => c.id === id);
    tipoEdicao = 'cliente';
    editandoId = id;
    document.getElementById('modalTitle').innerText = "Editar Cliente";
    document.getElementById('editFields').innerHTML = `
        <div class="form-group full-width"><label>Nome</label><input type="text" id="edit-1" value="${cli.nome}"></div>
        <div class="form-group full-width"><label>Endereço</label><input type="text" id="edit-2" value="${cli.endereco}"></div>
        <div class="form-group"><label>Telefone</label><input type="text" id="edit-3" value="${cli.telefone}"></div>
        <div class="form-group"><label>Email</label><input type="text" id="edit-4" value="${cli.email}"></div>
    `;
    document.getElementById('editModal').style.display = 'flex';
}

function abrirEditarOrcamento(id) {
    const orc = orcamentos.find(o => o.id === id);
    tipoEdicao = 'orcamento';
    editandoId = id;

    document.getElementById('modalTitle').innerText = "Editar Orçamento - " + orc.cliente;
    document.getElementById('editFields').innerHTML = `
        <div class="form-group"><label>Valor (R$)</label><input type="number" id="edit-1" value="${orc.valor}"></div>
        <div class="form-group"><label>Data</label><input type="text" id="edit-2" value="${orc.data}"></div>
        <div class="form-group full-width"><label>Descrição</label><textarea id="edit-3" rows="15">${orc.descricao}</textarea></div>

<div style="form-group full-width" style:"margin-top: 50px; padding-top: 20px; border-top: 1px solid var(--border);">
            <button class="btn-primary" onclick="excluirOrcamentoViaModal(${id})" style="text-align: center; width: 100%; background: #b01717; border: 1px solid #dc3545; border-radius: 6px;">
                Excluir Orçamento
            </button>
        </div>
    `;
    document.getElementById('editModal').style.display = 'flex';
}


function deletarOrcamento(id) {
    if(confirm('Excluir este orçamento?')) {
        orcamentos = orcamentos.filter(o => o.id !== id);
        salvarDados();
        renderizarOrcamentos();
    }
}

function excluirOrcamentoViaModal(id) {
    // Reutiliza a lógica de confirmação que você já tem
    if(confirm('Tem certeza que deseja excluir este orçamento permanentemente?')) {
        // Remove do array
        orcamentos = orcamentos.filter(o => o.id !== id);
        
        // Salva e atualiza a tela
        salvarDados();
        renderizarOrcamentos();
        
        // Fecha o modal de edição
        fecharModal();
    }
}

function fecharModal() { 
    document.getElementById('editModal').style.display = 'none'; 
}


let idDocAtual = null;

function abrirModalEscolha(id) {
    idDocAtual = id;
    document.getElementById('escolhaDocModal').style.display = 'flex';
    
    document.getElementById('btn-ver-orcamento').onclick = function() {
        fecharModalEscolha();
        // Design Vertical (Retrato)
        const doc = document.querySelector('.documento');
        doc.style.maxWidth = '800px'; 
        doc.style.minHeight = '1100px'; 
        gerarLayoutDocumento(idDocAtual);
    };
    
    document.getElementById('btn-ver-os').onclick = function() {
        fecharModalEscolha();
        // Design Horizontal (Paisagem)
        const doc = document.querySelector('.documento');
        doc.style.minWidth = '1500px'; // Mais largo
        doc.style.minHeight = '700px';  // Menos alto
        gerarLayoutOS(idDocAtual);
    };
}

function fecharModalEscolha() {
    document.getElementById('escolhaDocModal').style.display = 'none';
}


function openViewOrc(id) {
    const orc = orcamentos.find(o => o.id === id);
    if (!orc) return;

    document.getElementById('viewModalTitle').innerText = `Detalhes do Orçamento - ${orc.cliente}`;
    
    // Aplicando a classe 'input-readonly' para usar o CSS correto
    document.getElementById('viewFields').innerHTML = `
        <div class="form-group">
            <label>Cliente</label>
            <input type="text" value="${orc.cliente}" readonly class="input-readonly">
        </div>
        <div class="form-group">
            <label>Valor (R$)</label>
            <input type="text" value="R$ ${orc.valor}" readonly class="input-readonly">
        </div>
        <div class="form-group">
            <label>Data</label>
            <input type="text" value="${orc.data}" readonly class="input-readonly">
        </div>
        <div class="form-group full-width">
            <label>Descrição / Materiais</label>
            <textarea readonly rows="10" class="input-readonly">${orc.descricao}</textarea>
        </div>
    `;

    // Injeta os botões configurados para este orçamento específico
    document.getElementById('viewModalFooter').innerHTML = `
        <button class="btn-primary" style="background: #6441c4" onclick="fecharViewModal(); abrirModalEscolha(${orc.id})">Ver Documento</button>
        <button class="btn-primary" onclick="fecharViewModal(); abrirEditarOrcamento(${orc.id})">Editar</button>
        <button class="btn-primary" style="background: #666;" onclick="fecharViewModal()">Fechar</button>
    `;

    document.getElementById('viewModal').style.display = 'flex';
}

function fecharViewModal() {
    document.getElementById('viewModal').style.display = 'none';
}


//DECLARAÇÃO
function abrirEditarDeclaracao(id) {
    const dec = declaracao.find(d => d.id === id);
    tipoEdicao = 'declaracao';
    editandoId = id;

    document.getElementById('modalTitle').innerText = "Editar Declaração";
    document.getElementById('editFields').innerHTML = `
        <div class="form-group"><label>Entrada (R$)</label><input type="number" id="edit-1" value="${dec.entrada}"></div>
        <div class="form-group"><label>Data</label><input type="text" id="edit-2" value="${dec.data}"></div>
        <div class="form-group"><label>Saída (R$)</label><input type="number" id="edit-3" value="${dec.saida}"></div>

<div style="form-group full-width" style:"margin-top: 50px; padding-top: 20px; border-top: 1px solid var(--border);">
            <button class="btn-primary" onclick="excluirDeclaracaoViaModal(${id})" style="text-align: center; width: 100%; background: #b01717; border: 1px solid #dc3545; border-radius: 6px;">
                Excluir Declaração
            </button>
        </div>
    `;
    document.getElementById('editModal').style.display = 'flex';
}


function deletarDeclaracao(id) {
    if(confirm('Excluir esta declaração?')) {
        declaracao = declaracao.filter(d => d.id !== id);
        salvarDados();
        renderizarDeclaracao();
    }
}

function excluirDeclaracaoViaModal(id) {
    if(confirm('Tem certeza que deseja excluir esta declaração permanentemente?')) {
        declaracao = declaracao.filter(d => d.id !== id);
        salvarDados();
        renderizarDeclaracao();
        fecharModal();
    }
}


function baixarDocumentoComoImagem() {
    const elemento = document.querySelector('.documento');
    const botao = event.currentTarget; // Referência ao botão para feedback visual
    
    // Feedback visual simples
    botao.innerText = "Gerando...";
    botao.style.opacity = "0.7";

    // Configurações para alta qualidade
    html2canvas(elemento, {
    scale: 2,
    useCORS: true, 
    allowTaint: false, // Mantenha false para não "sujar" o canvas
    logging: false,
    backgroundColor: "#ffffff"
})

.then(canvas => {
        // Cria um link temporário para download
        const link = document.createElement('a');
        const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        
        link.download = `Orcamento_N1_${dataAtual}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();

        // Volta o botão ao normal
        botao.innerText = "📥 Salvar como Imagem";
        botao.style.opacity = "1";
    }).catch(err => {
        console.error("Erro ao gerar imagem:", err);
        alert("Erro ao salvar imagem. Verifique o console.");
        botao.innerText = "📥 Salvar como Imagem";
        botao.style.opacity = "1";
    });
}

async function compartilharWhatsapp() {
    const elemento = document.querySelector('.documento');
    const nomeCliente = document.querySelector('.documento h3:nth-of-type(2)').innerText;
    const valorTotal = document.querySelector('.documento h2').innerText;
    
    // 1. Localizar o cliente para pegar o telefone
    const clienteDados = clientes.find(c => c.nome === nomeCliente);
    if (!clienteDados || !clienteDados.telefone) {
        alert("Telefone do cliente não encontrado!");
        return;
    }

    // 2. Feedback visual no botão
    const btnWhats = event.currentTarget;
    const textoOriginal = btnWhats.innerHTML;
    btnWhats.innerHTML = "<span>⌛ Gerando e Copiando...</span>";

    try {
        // 3. Gerar o Canvas do documento
        const canvas = await html2canvas(elemento, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#ffffff"
        });

        // 4. Copiar para a Área de Transferência (Clipboard)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const data = [new ClipboardItem({ "image/png": blob })];
        await navigator.clipboard.write(data);

        // 5. Preparar o link do WhatsApp
        const telefoneLimpo = clienteDados.telefone.replace(/\D/g, '');
        const telefoneJK = 42991156144;
        const mensagem = encodeURIComponent(
          `Olá ${nomeCliente}! Segue o orçamento da *N1 PROTECT* referente aos serviços solicitados.\n` +
          `*Valor total:* ${valorTotal}\n\n` +
          `Estou te enviando a imagem com os detalhes acima. ☝️`
        );

        // 6. Abrir o WhatsApp
        const url = `https://api.whatsapp.com/send?phone=55${telefoneJK}&text=${mensagem}`;
        window.open(url, '_blank');

    } catch (err) {
        console.error("Erro:", err);
        alert("Erro ao processar imagem. Verifique se está usando HTTPS ou LocalHost.");
    } finally {
        // Restaurar o botão
        btnWhats.innerHTML = textoOriginal;
    }
}

function salvarEdicao() {
    if (tipoEdicao === 'cliente') {
        const i = clientes.findIndex(c => c.id === editandoId);
        const nomeAntigo = clientes[i].nome;
        const novoNome = document.getElementById('edit-1').value;
        
        clientes[i].nome = novoNome;
        clientes[i].endereco = document.getElementById('edit-2').value;
        clientes[i].telefone = document.getElementById('edit-3').value;
        clientes[i].email = document.getElementById('edit-4').value;
        
        // Atualiza o nome do cliente nos orçamentos já criados
        orcamentos.forEach(orc => {
            if (orc.cliente === nomeAntigo) {
                orc.cliente = novoNome;
            }
        });
    } 
  if (tipoEdicao === 'orcamento') {
        const i = orcamentos.findIndex(o => o.id === editandoId);
        orcamentos[i].valor = parseFloat(document.getElementById('edit-1').value).toFixed(2);
        orcamentos[i].data = document.getElementById('edit-2').value;
        orcamentos[i].descricao = document.getElementById('edit-3').value;
    }
  if (tipoEdicao === 'declaracao') {
    const i = declaracao.findIndex(d => d.id === editandoId);
        declaracao[i].entrada = parseFloat(document.getElementById('edit-1').value).toFixed(2);
        declaracao[i].data = document.getElementById('edit-2').value;
        declaracao[i].saida = parseFloat(document.getElementById('edit-3').value).toFixed(2);
  }
    
    salvarDados();
    renderizarClientes();
    renderizarOrcamentos();
    renderizarAgenda();
    renderizarDeclaracao();
    atualizarSelectClientes();
    fecharModal();
}
  
let agenda = JSON.parse(localStorage.getItem('n1_agenda')) || [];

// Função para salvar e renderizar a agenda
document.getElementById('form-agenda').addEventListener('submit', function(e) {
    e.preventDefault();
    const novo = {
        id: Date.now(),
        cliente: document.getElementById('age-cliente').value,
        data: document.getElementById('age-data').value,
        servico: document.getElementById('age-servico').value
    };
    agenda.push(novo);
    agenda.sort((a, b) => new Date(a.data) - new Date(b.data)); // Ordena por data
    localStorage.setItem('n1_agenda', JSON.stringify(agenda));
    renderizarAgenda();
    this.reset();
});

function renderizarAgenda() {
    const tbody = document.getElementById('lista-agenda');
    const select = document.getElementById('age-cliente');
    tbody.innerHTML = '';
    agenda.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    // Atualiza o select de clientes da agenda
    select.innerHTML = '<option value="">Selecione...</option>';
    clientes.forEach(c => {
        select.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
    });

    // Renderiza a tabela
    agenda.forEach(a => {
        const dataBr = a.data.split('-').reverse().join('/');
        tbody.innerHTML += `
            <tr>
                <td><strong style="color:var(--blue)">${dataBr}</strong></td>
                <td>${a.cliente}</td>
                <td>${a.servico}</td>
                <td><button class="delete-btn" onclick="deletarAgenda(${a.id})">Desmarcar</button></td>
            </tr>`;
    });
}

function deletarAgenda(id) {
    if(confirm('Remover da agenda?')) {
        agenda = agenda.filter(a => a.id !== id);
        localStorage.setItem('n1_agenda', JSON.stringify(agenda));
        renderizarAgenda();
    }
}


function gerarLayoutOS(id) {
    const orc = orcamentos.find(o => o.id === id);
    if (!orc) return;

    const cli = clientes.find(c => c.nome === orc.cliente) || {};

    const layout = `
        <div style="width: 100%; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid var(--primary); padding-bottom: 20px; margin-bottom: 30px;">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div>
                        <h1 style="margin: 0; font-size: 28px; letter-spacing: 1px;">ORDEM DE SERVIÇO</h1>
                        <span style="background: #eee; padding: 4px 10px; border-radius: 4px; font-weight: bold;">Nº OS: ${orc.id.toString().slice(-6)}</span>
                    </div>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-weight: bold; font-size: 18px;">N1 PROTECT</p>
                    <p style="margin: 0; font-size: 13px; color: #666;">Sistemas de Segurança Eletrônica</p>
                    <p style="margin: 0; font-size: 13px; color: #666;">Data de Emissão: ${orc.data}</p>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f9f9f9; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
                <div>
                    <label style="font-size: 11px; text-transform: uppercase; color: #888; font-weight: bold;">Cliente / Razão Social</label>
                    <p style="margin: 5px 0; font-size: 15px; font-weight: 500;">${orc.cliente}</p>
                </div>
                <div>
                    <label style="font-size: 11px; text-transform: uppercase; color: #888; font-weight: bold;">Contato / WhatsApp</label>
                    <p style="margin: 5px 0; font-size: 15px;">${cli.telefone || '(00) 00000-0000'}</p>
                </div>
            </div>

            <div style="margin-bottom: 30px;">
                <h3 style="font-size: 14px; border-left: 5px solid var(--primary); padding-left: 10px; margin-bottom: 15px;">RELATÓRIO TÉCNICO DE  SERVIÇOS E MATERIAIS</h3>
                <div style="border: 1px solid #eee; padding: 20px; border-radius: 8px; min-height: 200px; background: white; font-size: 20px; line-height: 1.6; white-space: pre-wrap;">
    ${orc.descricao}
</div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 50px;">
                
                <div style="background: var(--primary); color: white; padding: 15px 30px; border-radius: 8px; text-align: center;">
                    <span style="font-size: 12px; opacity: 0.9;">VALOR TOTAL</span>
                    <h2 style="margin: 0; font-size: 32px;">R$ ${orc.valor}</h2>
                </div>
                
                <div style="width: 30%; text-align: center;">
                    <div style="border-top: 1px solid #333; margin-bottom: 5px;"></div>
                    <p style="margin: 0; font-size: 12px;">Assinatura do Cliente</p>
                </div>

            </div>
        </div>
    `;
    
    abrirDocumento(layout);
}


function atualizarRelogio() {
    const agora = new Date();
    
    // Formata a data: DD/MM/AAAA
    const data = agora.toLocaleDateString('pt-BR');
    
    // Formata a hora: HH:MM:SS
    const hora = agora.toLocaleTimeString('pt-BR');
    
    const display = document.getElementById('data-hora-atual');
    if (display) {
        display.innerHTML = `<strong>${data}</strong> | <strong>${hora}</strong>`;
    }
}

// Inicia o relógio e faz ele atualizar a cada 1 segundo (1000ms)
setInterval(atualizarRelogio, 1000);

// Chama uma vez imediatamente para não esperar 1 segundo no primeiro carregamento
atualizarRelogio();

// Inicializar renderização ao carregar a página
window.onload = () => {
    renderizarClientes();
    atualizarSelectClientes();
    renderizarOrcamentos();
    renderizarAgenda()
    renderizarDeclaracao()

    const savedTab = localStorage.getItem('n1_active_tab') || 'dashboard';
    switchTab(savedTab);
    atualizarRelogio();
};
