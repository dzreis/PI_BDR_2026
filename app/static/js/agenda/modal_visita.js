/**
 * Janela de uma visita: detalhes, ações da situação, pagamento, remarcação e despesas.
 *
 * Toda ação chama a API e redesenha a janela com a visita atualizada; ao
 * mesmo tempo avisa a página (`aoMudar`) para recarregar a agenda por trás.
 *
 * O que cada situação permite (as mesmas regras do servidor):
 *   AGENDADA   realizar, remarcar, cancelar, excluir, lançar despesas
 *   REALIZADA  registrar/desfazer pagamento, reabrir, lançar despesas
 *   CANCELADA  reabrir, excluir
 *   REMARCADA  apenas consulta (a nova visita é que vale) e excluir
 */
import { ApiClient } from "../core/api.js";
import { Datas } from "../core/datas.js";
import { elemento } from "../core/dom.js";
import { Formatador } from "../core/formatadores.js";
import { Icone } from "../core/icones.js";
import { Confirmacao, Modal, Notificacao } from "../core/ui.js";
import { criarSelos, estaPaga, FORMAS_PAGAMENTO, mensagemDeErro } from "./componentes.js";

/** Campo de formulário com rótulo: <div class="campo"><label/>entrada</div>. */
function campo(rotulo, entrada, classe = "") {
  const id = `vis-${entrada.name}`;
  entrada.id = id;
  return elemento("div", { class: `campo ${classe}`.trim() }, elemento("label", { for: id }, rotulo), entrada);
}

function botao(texto, classe, aoClicar, { icone = null, tipo = "button" } = {}) {
  const el = elemento("button", { type: tipo, class: `btn ${classe}` }, icone ? Icone.criar(icone, 16) : null, texto);
  if (aoClicar) el.addEventListener("click", aoClicar);
  return el;
}

export class ModalVisita {
  #api = new ApiClient();
  #modal = new Modal("modal-visita");
  #titulo = document.getElementById("visita-titulo");
  #corpo = document.getElementById("visita-corpo");
  #aoMudar;
  #visita = null;
  #painel = null; // null | "pagamento" | "remarcar"

  /** @param {()=>void} aoMudar  Chamado depois de qualquer alteração. */
  constructor(aoMudar) {
    this.#aoMudar = aoMudar;
  }

  /** Abre a janela de uma visita (busca os dados completos, com as despesas). */
  async abrir(id) {
    try {
      this.#visita = await this.#api.get(`/visitas/${id}`);
    } catch (erro) {
      Notificacao.erro(erro.message);
      return;
    }
    this.#painel = null;
    this.#desenhar();
    this.#modal.abrir();
  }

  fechar() {
    this.#modal.fechar();
  }

  // ------------------------------------------------------------------
  // Chamadas à API
  // ------------------------------------------------------------------

  /**
   * Executa uma chamada, atualiza a janela com a visita devolvida e avisa a página.
   * @param {()=>Promise<object>} chamada  Devolve a visita (ou {original, nova}).
   * @param {string} sucesso  Aviso para o usuário.
   * @returns {Promise<boolean>} true se deu certo.
   */
  async #executar(chamada, sucesso) {
    try {
      const resposta = await chamada();
      this.#visita = resposta.original ?? resposta;
      this.#painel = null;
      this.#desenhar();
      Notificacao.sucesso(sucesso);
      this.#aoMudar();
      return true;
    } catch (erro) {
      Notificacao.erro(mensagemDeErro(erro));
      return false;
    }
  }

  #acao(nome, sucesso) {
    return this.#executar(() => this.#api.post(`/visitas/${this.#visita.id_visita}/${nome}`, {}), sucesso);
  }

  async #cancelar() {
    const ok = await Confirmacao.perguntar({
      titulo: "Cancelar visita",
      mensagem: `Cancelar a visita de ${this.#visita.cliente_nome} em ${Formatador.dataHora(this.#visita.agendamento)}? Você poderá reabri-la depois.`,
      textoConfirmar: "Cancelar visita",
      perigo: true,
    });
    if (ok) await this.#acao("cancelar", "Visita cancelada.");
  }

  async #excluir() {
    const ok = await Confirmacao.perguntar({
      titulo: "Excluir visita",
      mensagem: "A visita e as suas despesas serão apagadas de vez. Para só desmarcar, prefira cancelar.",
      textoConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    try {
      await this.#api.delete(`/visitas/${this.#visita.id_visita}`);
      Notificacao.sucesso("Visita excluída.");
      this.fechar();
      this.#aoMudar();
    } catch (erro) {
      Notificacao.erro(mensagemDeErro(erro));
    }
  }

  // ------------------------------------------------------------------
  // Desenho da janela
  // ------------------------------------------------------------------

  #desenhar() {
    const v = this.#visita;
    this.#titulo.textContent = v.cliente_nome;

    const partes = [this.#criarResumo(), this.#criarAcoes()];
    if (this.#painel === "pagamento") partes.push(this.#criarFormPagamento());
    if (this.#painel === "remarcar") partes.push(this.#criarFormRemarcar());
    partes.push(this.#criarDetalhes(), this.#criarDespesas());
    this.#corpo.replaceChildren(...partes);
  }

  /** Cabeçalho: serviço, data/hora, selos, telefone e situação do pagamento. */
  #criarResumo() {
    const v = this.#visita;
    const itens = [
      elemento("li", {}, Icone.criar("calendar", 18), elemento("span", {}, Formatador.dataHora(v.agendamento))),
      elemento("li", {}, Icone.criar("briefcase", 18), elemento("span", {}, v.servico_tipo)),
    ];
    if (v.cliente_telefone) {
      itens.push(
        elemento(
          "li",
          {},
          Icone.criar("phone", 18),
          elemento("a", { href: `tel:${v.cliente_telefone}` }, Formatador.telefone(v.cliente_telefone)),
        ),
      );
    }
    if (estaPaga(v)) {
      itens.push(
        elemento(
          "li",
          {},
          Icone.criar("dollar-sign", 18),
          elemento("span", {}, `Pago em ${Formatador.data(v.data_pagamento)} · ${v.forma_pagamento}`),
        ),
      );
    }

    return elemento(
      "section",
      { class: "visita-resumo" },
      elemento("div", { class: "cartao__selos" }, criarSelos(v)),
      elemento("ul", { class: "cartao__info" }, itens),
    );
  }

  /** Botões principais, conforme a situação. */
  #criarAcoes() {
    const v = this.#visita;
    const botoes = [];

    if (v.status === "AGENDADA") {
      botoes.push(
        botao("Marcar como realizada", "btn--primario", () => this.#acao("realizar", "Visita realizada!"), { icone: "check" }),
        botao("Remarcar", "btn--secundario", () => this.#abrirPainel("remarcar"), { icone: "repeat" }),
        botao("Cancelar visita", "btn--secundario", () => this.#cancelar(), { icone: "x" }),
      );
    } else if (v.status === "REALIZADA") {
      if (estaPaga(v)) {
        botoes.push(
          botao("Desfazer pagamento", "btn--secundario", async () => {
            const ok = await Confirmacao.perguntar({
              titulo: "Desfazer pagamento",
              mensagem: "A visita voltará a aparecer como \"a receber\".",
              textoConfirmar: "Desfazer",
            });
            if (ok) this.#executar(() => this.#api.delete(`/visitas/${v.id_visita}/pagamento`), "Pagamento desfeito.");
          }),
        );
      } else {
        botoes.push(
          botao("Registrar pagamento", "btn--primario", () => this.#abrirPainel("pagamento"), { icone: "dollar-sign" }),
          botao("Reabrir", "btn--secundario", () => this.#acao("reabrir", "Visita reaberta.")),
        );
      }
    } else if (v.status === "CANCELADA") {
      botoes.push(botao("Reabrir", "btn--secundario", () => this.#acao("reabrir", "Visita reaberta.")));
    }

    if (v.status !== "REALIZADA") {
      botoes.push(botao("Excluir", "btn--fantasma btn--perigo-texto", () => this.#excluir(), { icone: "trash" }));
    }
    return elemento("section", { class: "visita-acoes" }, botoes);
  }

  #abrirPainel(nome) {
    this.#painel = nome;
    this.#desenhar();
    this.#corpo.querySelector(".visita-painel input, .visita-painel select")?.focus();
  }

  // ------------------------------------------------------------------
  // Pagamento e remarcação (painéis que aparecem sob os botões)
  // ------------------------------------------------------------------

  #criarFormPagamento() {
    const v = this.#visita;
    const data = elemento("input", { type: "date", name: "data_pagamento", value: Datas.hoje(), max: Datas.hoje(), required: true });
    const forma = elemento(
      "select",
      { name: "forma_pagamento", required: true },
      elemento("option", { value: "" }, "Selecione..."),
      FORMAS_PAGAMENTO.map((f) => elemento("option", { value: f }, f.charAt(0) + f.slice(1).toLowerCase())),
    );

    return this.#criarPainel(
      `Receber ${Formatador.moeda(v.valor_cobrado)}`,
      [campo("Data do pagamento", data), campo("Forma de pagamento", forma)],
      "Confirmar pagamento",
      () =>
        this.#executar(
          () => this.#api.put(`/visitas/${v.id_visita}/pagamento`, { data_pagamento: data.value, forma_pagamento: forma.value }),
          "Pagamento registrado!",
        ),
    );
  }

  #criarFormRemarcar() {
    const v = this.#visita;
    const data = elemento("input", { type: "date", name: "data", value: Datas.dia(v.agendamento), required: true });
    const hora = elemento("input", { type: "time", name: "horario", value: Datas.hora(v.agendamento), required: true });

    return this.#criarPainel(
      "Remarcar para",
      [campo("Nova data", data), campo("Horário", hora)],
      "Confirmar remarcação",
      () =>
        this.#executar(
          () => this.#api.post(`/visitas/${v.id_visita}/remarcar`, { data: data.value, horario: hora.value }),
          `Remarcada para ${Formatador.data(data.value)} às ${hora.value}.`,
        ),
    );
  }

  /** Caixa com título, campos e botões Confirmar/Voltar. */
  #criarPainel(titulo, campos, textoConfirmar, aoConfirmar) {
    const form = elemento(
      "form",
      { class: "visita-painel", novalidate: true },
      elemento("h3", {}, titulo),
      elemento("div", { class: "visita-painel__campos" }, campos),
      elemento(
        "div",
        { class: "visita-painel__botoes" },
        botao("Voltar", "btn--secundario", () => {
          this.#painel = null;
          this.#desenhar();
        }),
        botao(textoConfirmar, "btn--primario", null, { tipo: "submit" }),
      ),
    );
    form.addEventListener("submit", (evento) => {
      evento.preventDefault();
      if (form.reportValidity()) aoConfirmar();
    });
    return form;
  }

  // ------------------------------------------------------------------
  // Valor e observações
  // ------------------------------------------------------------------

  #criarDetalhes() {
    const v = this.#visita;
    const valor = elemento("input", {
      type: "text", name: "valor_cobrado", inputmode: "decimal", required: true,
      value: Number(v.valor_cobrado).toFixed(2).replace(".", ","),
      disabled: estaPaga(v), // para mudar o valor, desfaça o pagamento antes
    });
    const observacoes = elemento("input", { type: "text", name: "observacoes", maxlength: "255", value: v.observacoes ?? "", placeholder: "Ex.: trazer adubo" });

    const form = elemento(
      "form",
      { class: "visita-secao", novalidate: true },
      elemento("h3", {}, "Valor e observações"),
      elemento("div", { class: "visita-secao__linha" }, campo("Valor cobrado (R$)", valor, "campo--estreito"), campo("Observações", observacoes)),
      estaPaga(v) ? elemento("small", { class: "campo__ajuda" }, "Para mudar o valor, desfaça o pagamento primeiro.") : null,
      elemento("div", { class: "visita-secao__rodape" }, botao("Salvar alterações", "btn--secundario btn--pequeno", null, { tipo: "submit" })),
    );
    form.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const dados = { observacoes: observacoes.value };
      if (!valor.disabled) dados.valor_cobrado = valor.value;
      this.#executar(() => this.#api.patch(`/visitas/${v.id_visita}`, dados), "Visita atualizada.");
    });
    return form;
  }

  // ------------------------------------------------------------------
  // Despesas
  // ------------------------------------------------------------------

  #criarDespesas() {
    const v = this.#visita;
    const permiteLancar = v.status === "AGENDADA" || v.status === "REALIZADA";
    const total = Number(v.total_despesas) || 0;

    const lista = v.despesas.map((d) => {
      const remover = botao("", "btn--fantasma btn--icone btn--pequeno", () => this.#removerDespesa(d), { icone: "trash" });
      remover.setAttribute("aria-label", `Excluir despesa ${d.descricao}`);
      return elemento(
        "li",
        { class: "despesa" },
        elemento("span", { class: "despesa__texto" }, elemento("strong", {}, d.descricao), elemento("small", {}, Formatador.data(d.data_despesa))),
        elemento("span", { class: "despesa__valor" }, Formatador.moeda(d.valor)),
        remover,
      );
    });

    const secao = elemento(
      "section",
      { class: "visita-secao" },
      elemento("h3", {}, "Despesas da visita"),
      lista.length
        ? elemento("ul", { class: "despesas" }, lista)
        : elemento("p", { class: "texto-suave" }, "Nenhuma despesa lançada (material, combustível...)."),
    );

    if (lista.length) {
      secao.append(
        elemento(
          "p",
          { class: "visita-lucro" },
          elemento("span", {}, `Despesas: ${Formatador.moeda(total)}`),
          v.status === "REALIZADA" ? elemento("strong", {}, `Lucro da visita: ${Formatador.moeda(Number(v.valor_cobrado) - total)}`) : null,
        ),
      );
    }
    if (permiteLancar) secao.append(this.#criarFormDespesa());
    return secao;
  }

  #criarFormDespesa() {
    const descricao = elemento("input", { type: "text", name: "descricao", maxlength: "120", required: true, placeholder: "Ex.: Adubo" });
    const valor = elemento("input", { type: "text", name: "valor", inputmode: "decimal", required: true, placeholder: "0,00" });
    const data = elemento("input", { type: "date", name: "data_despesa", value: Datas.hoje(), required: true });

    const form = elemento(
      "form",
      { class: "despesa-form", novalidate: true },
      campo("Descrição", descricao, "despesa-form__descricao"),
      campo("Valor (R$)", valor),
      campo("Data", data),
      botao("Adicionar", "btn--secundario", null, { icone: "plus", tipo: "submit" }),
    );
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      if (!form.reportValidity()) return;
      try {
        await this.#api.post(`/visitas/${this.#visita.id_visita}/despesas`, {
          descricao: descricao.value, valor: valor.value, data_despesa: data.value,
        });
        this.#visita = await this.#api.get(`/visitas/${this.#visita.id_visita}`);
        this.#desenhar();
        Notificacao.sucesso("Despesa adicionada.");
        this.#aoMudar();
      } catch (erro) {
        Notificacao.erro(mensagemDeErro(erro));
      }
    });
    return form;
  }

  async #removerDespesa(despesa) {
    const ok = await Confirmacao.perguntar({
      titulo: "Excluir despesa",
      mensagem: `Excluir "${despesa.descricao}" (${Formatador.moeda(despesa.valor)})?`,
      textoConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    try {
      await this.#api.delete(`/despesas/${despesa.id_despesa}`);
      this.#visita = await this.#api.get(`/visitas/${this.#visita.id_visita}`);
      this.#desenhar();
      Notificacao.sucesso("Despesa excluída.");
      this.#aoMudar();
    } catch (erro) {
      Notificacao.erro(mensagemDeErro(erro));
    }
  }
}
