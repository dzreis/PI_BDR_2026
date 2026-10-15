/**
 * PaginaCrud: classe-base das telas de cadastro (clientes, serviços...).
 *
 * Ela faz todo o trabalho que se repete: carregar a lista pela API, mostrar
 * os cartões, filtrar pela busca, abrir o formulário num modal, salvar,
 * excluir com confirmação e ativar/inativar. Cada tela só precisa herdar
 * desta classe (`extends PaginaCrud`) e implementar o que é específico dela:
 *
 *   criarCartao(item)   monta o cartão de um registro        (obrigatório)
 *   textoBusca(item)    texto onde a busca procura           (obrigatório)
 *   rotuloItem(item)    nome mostrado nas confirmações       (obrigatório)
 *   aoIniciar()                  gancho: roda uma vez ao abrir a página
 *   aoPreencherFormulario(item)  gancho: ajusta o formulário ao abrir
 *   mensagemSalvo(resposta, eraEdicao)  gancho: texto do aviso após salvar
 *   aoAcaoPersonalizada(acao, item)     gancho: botões extras do cartão
 *                                       (qualquer data-acao além de novo/editar/excluir/alternar)
 *
 * Elementos que a página HTML precisa ter (veja _componentes.html):
 *   #lista  #busca  #filtro-status  #contador  #botao-novo
 *   #modal-form (<dialog>)  #form (<form>)  #modal-titulo
 * Os campos do formulário usam `name` igual ao nome do campo na API e ficam
 * dentro de um bloco com `data-campo="nome-do-campo"` (para mostrar erros).
 */
import { ApiClient, ApiError } from "./api.js";
import { elemento } from "./dom.js";
import { Icone } from "./icones.js";
import { Confirmacao, Modal, Notificacao } from "./ui.js";

/** Tira acentos e maiúsculas, para a busca achar "José" digitando "jose". */
function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function primeiraMaiuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export class PaginaCrud {
  /**
   * @param {object} config
   * @param {string} config.recurso     Caminho na API, ex.: "/clientes".
   * @param {string} config.chave       Nome da chave primária, ex.: "id_cliente".
   * @param {string} config.nomeItem    Singular em minúsculas, ex.: "cliente".
   * @param {string} config.nomePlural  Plural em minúsculas, ex.: "clientes".
   */
  constructor({ recurso, chave, nomeItem, nomePlural }) {
    this.recurso = recurso;
    this.chave = chave;
    this.nomeItem = nomeItem;
    this.nomePlural = nomePlural;

    this.api = new ApiClient();
    this.itens = []; // todos os registros carregados da API
    this.editando = null; // registro aberto no formulário (null = cadastro novo)

    this.lista = document.getElementById("lista");
    this.campoBusca = document.getElementById("busca");
    this.filtroStatus = document.getElementById("filtro-status");
    this.contador = document.getElementById("contador");
    this.formulario = document.getElementById("form");
    this.titulo = document.getElementById("modal-titulo");
    this.botaoSalvar = this.formulario.querySelector('button[type="submit"]');
    this.modal = new Modal("modal-form");
  }

  // ------------------------------------------------------------------
  // Ciclo de vida
  // ------------------------------------------------------------------

  /** Liga os eventos da página e carrega a lista. Chame uma vez. */
  async iniciar() {
    document.getElementById("botao-novo").addEventListener("click", () => this.abrirFormulario());
    this.campoBusca.addEventListener("input", () => this.renderizar());
    this.filtroStatus.addEventListener("change", () => this.renderizar());
    this.formulario.addEventListener("submit", (evento) => this.salvar(evento));
    this.lista.addEventListener("click", (evento) => this.#tratarCliqueNaLista(evento));

    this.aoIniciar();
    await this.carregar();
  }

  /** Busca todos os registros na API e redesenha a lista. */
  async carregar() {
    try {
      this.itens = await this.api.get(this.recurso);
    } catch (erro) {
      Notificacao.erro(erro.message);
      this.lista.replaceChildren(elemento("p", { class: "vazio" }, "Não foi possível carregar a lista."));
      return;
    }
    this.renderizar();
  }

  // ------------------------------------------------------------------
  // Lista
  // ------------------------------------------------------------------

  /** Desenha os cartões aplicando a busca e o filtro de situação. */
  renderizar() {
    const termo = normalizar(this.campoBusca.value.trim());
    const situacao = this.filtroStatus.value; // "todos" | "ativos" | "inativos"

    const visiveis = this.itens.filter((item) => {
      if (situacao === "ativos" && !item.ativo) return false;
      if (situacao === "inativos" && item.ativo) return false;
      return !termo || normalizar(this.textoBusca(item)).includes(termo);
    });

    const total = visiveis.length;
    this.contador.textContent = `${total} ${total === 1 ? this.nomeItem : this.nomePlural}`;

    if (total === 0) {
      this.lista.replaceChildren(this.#criarEstadoVazio());
    } else {
      this.lista.replaceChildren(...visiveis.map((item) => this.criarCartao(item)));
    }
  }

  #criarEstadoVazio() {
    if (this.itens.length > 0) {
      return elemento("div", { class: "estado-vazio" }, elemento("p", {}, `Nenhum ${this.nomeItem} encontrado com esses filtros.`));
    }
    return elemento(
      "div",
      { class: "estado-vazio" },
      elemento("p", {}, `Você ainda não cadastrou nenhum ${this.nomeItem}.`),
      elemento("button", { type: "button", class: "btn btn--primario", "data-acao": "novo" }, `Cadastrar ${this.nomeItem}`),
    );
  }

  /** Um único ouvinte na lista resolve os cliques de todos os cartões. */
  #tratarCliqueNaLista(evento) {
    const botao = evento.target.closest("[data-acao]");
    if (!botao) return;

    const acao = botao.dataset.acao;
    if (acao === "novo") {
      this.abrirFormulario();
      return;
    }

    const id = Number(botao.closest("[data-id]")?.dataset.id);
    const item = this.itens.find((registro) => registro[this.chave] === id);
    if (!item) return;

    if (acao === "editar") this.abrirFormulario(item);
    else if (acao === "excluir") this.excluir(item);
    else if (acao === "alternar") this.alternarAtivo(item);
    else this.aoAcaoPersonalizada(acao, item);
  }

  // ------------------------------------------------------------------
  // Formulário (criar e editar)
  // ------------------------------------------------------------------

  /** Abre o modal vazio (cadastro) ou preenchido com o registro (edição). */
  abrirFormulario(item = null) {
    this.editando = item;
    this.limparErros();
    this.formulario.reset();
    this.titulo.textContent = `${item ? "Editar" : "Novo"} ${this.nomeItem}`;

    if (item) {
      for (const campo of this.formulario.elements) {
        if (!campo.name || !(campo.name in item)) continue;
        if (campo.type === "checkbox") campo.checked = Boolean(item[campo.name]);
        else campo.value = item[campo.name] ?? "";
      }
    }

    this.aoPreencherFormulario(item);
    this.modal.abrir();
  }

  /**
   * Lê os campos do formulário (checkbox vira true/false; textos sem espaços nas pontas).
   * Campos bloqueados (`disabled`) não são enviados: servem só para mostrar o valor.
   */
  coletarDados() {
    const dados = {};
    for (const campo of this.formulario.elements) {
      if (!campo.name || campo.disabled) continue;
      dados[campo.name] = campo.type === "checkbox" ? campo.checked : campo.value.trim();
    }
    return dados;
  }

  /** Envia o formulário para a API (POST se for novo, PUT se for edição). */
  async salvar(evento) {
    evento.preventDefault();
    this.limparErros();
    this.botaoSalvar.disabled = true; // evita duplo clique

    try {
      const dados = this.coletarDados();
      const eraEdicao = this.editando !== null;
      const resposta = eraEdicao
        ? await this.api.put(`${this.recurso}/${this.editando[this.chave]}`, dados)
        : await this.api.post(this.recurso, dados);

      this.modal.fechar();
      Notificacao.sucesso(this.mensagemSalvo(resposta, eraEdicao));
      await this.carregar();
    } catch (erro) {
      if (erro instanceof ApiError && erro.detalhes) {
        this.mostrarErros(erro.detalhes);
      } else {
        Notificacao.erro(erro.message ?? "Ocorreu um erro inesperado.");
      }
    } finally {
      this.botaoSalvar.disabled = false;
    }
  }

  /** Mostra, embaixo de cada campo, o erro que o servidor apontou. */
  mostrarErros(detalhes) {
    let primeiroCampo = null;
    for (const [nomeCampo, mensagem] of Object.entries(detalhes)) {
      const bloco = this.formulario.querySelector(`[data-campo="${nomeCampo}"]`);
      if (!bloco) {
        Notificacao.erro(mensagem);
        continue;
      }
      bloco.classList.add("campo--erro");
      bloco.append(elemento("small", { class: "campo__erro", role: "alert" }, mensagem));
      primeiroCampo ??= bloco.querySelector("input, select, textarea");
    }
    primeiroCampo?.focus();
  }

  limparErros() {
    this.formulario.querySelectorAll(".campo__erro").forEach((aviso) => aviso.remove());
    this.formulario.querySelectorAll(".campo--erro").forEach((bloco) => bloco.classList.remove("campo--erro"));
  }

  // ------------------------------------------------------------------
  // Excluir e ativar/inativar
  // ------------------------------------------------------------------

  async excluir(item) {
    const confirmado = await Confirmacao.perguntar({
      titulo: `Excluir ${this.nomeItem}`,
      mensagem: `Deseja excluir "${this.rotuloItem(item)}"? Esta ação não pode ser desfeita.`,
      textoConfirmar: "Excluir",
      perigo: true,
    });
    if (!confirmado) return;

    try {
      await this.api.delete(`${this.recurso}/${item[this.chave]}`);
      Notificacao.sucesso(`${primeiraMaiuscula(this.nomeItem)} excluído.`);
      await this.carregar();
    } catch (erro) {
      Notificacao.erro(erro.message);
    }
  }

  async alternarAtivo(item) {
    const novoValor = !item.ativo;
    try {
      await this.api.patch(`${this.recurso}/${item[this.chave]}`, { ativo: novoValor });
      Notificacao.sucesso(`${primeiraMaiuscula(this.nomeItem)} ${novoValor ? "ativado" : "inativado"}.`);
      await this.carregar();
    } catch (erro) {
      Notificacao.erro(erro.message);
    }
  }

  // ------------------------------------------------------------------
  // Peças para as classes filhas montarem os cartões
  // ------------------------------------------------------------------

  /** Botões "editar" e "excluir" do canto do cartão. */
  criarAcoes(item) {
    const botao = (acao, nomeIcone, rotulo, perigo) =>
      elemento(
        "button",
        {
          type: "button",
          class: `btn btn--fantasma btn--icone${perigo ? " btn--perigo-suave" : ""}`,
          "data-acao": acao,
          "aria-label": `${rotulo} ${this.rotuloItem(item)}`,
          title: rotulo,
        },
        Icone.criar(nomeIcone, 18),
      );

    return elemento(
      "div",
      { class: "cartao__acoes" },
      botao("editar", "edit", "Editar", false),
      botao("excluir", "trash", "Excluir", true),
    );
  }

  /** Selo "Ativo" / "Inativo". */
  criarSelo(item) {
    return elemento("span", { class: `badge ${item.ativo ? "badge--verde" : "badge--cinza"}` }, item.ativo ? "Ativo" : "Inativo");
  }

  /** Rodapé do cartão: um texto à esquerda e o botão Ativar/Inativar à direita. */
  criarRodape(item, texto) {
    return elemento(
      "footer",
      { class: "cartao__rodape" },
      elemento("small", {}, texto),
      elemento("button", { type: "button", class: "btn btn--secundario btn--pequeno", "data-acao": "alternar" }, item.ativo ? "Inativar" : "Ativar"),
    );
  }

  /** Uma linha de informação com ícone (devolve null se não houver texto, e some do cartão). */
  linhaInfo(nomeIcone, texto, detalhe = null) {
    if (!texto) return null;
    return elemento(
      "li",
      {},
      Icone.criar(nomeIcone, 16),
      elemento("span", {}, texto, detalhe ? elemento("small", {}, detalhe) : null),
    );
  }

  // ------------------------------------------------------------------
  // O que as classes filhas devem implementar
  // ------------------------------------------------------------------

  /** @returns {HTMLElement} O cartão (<article data-id="...">) de um registro. */
  criarCartao(item) {
    throw new Error("A classe filha precisa implementar criarCartao(item).");
  }

  /** @returns {string} Texto em que a caixa de busca deve procurar. */
  textoBusca(item) {
    throw new Error("A classe filha precisa implementar textoBusca(item).");
  }

  /** @returns {string} Nome do registro, usado nas confirmações. */
  rotuloItem(item) {
    throw new Error("A classe filha precisa implementar rotuloItem(item).");
  }

  /** Gancho opcional: texto do aviso mostrado depois de salvar. */
  mensagemSalvo(resposta, eraEdicao) {
    return `${primeiraMaiuscula(this.nomeItem)} salvo com sucesso.`;
  }

  /** Gancho opcional: trata botões extras do cartão (data-acao próprio). */
  aoAcaoPersonalizada(acao, item) {}

  /** Gancho opcional: roda uma vez, antes de carregar a lista. */
  aoIniciar() {}

  /** Gancho opcional: roda sempre que o formulário abre (`item` é null no cadastro). */
  aoPreencherFormulario(item) {}
}
