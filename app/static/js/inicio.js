/**
 * Painel inicial: resumo do dia e do mês.
 *
 * Busca tudo de uma vez em /api/painel e desenha os indicadores e as listas.
 * Clicar numa visita abre a mesma janela da Agenda (ModalVisita), então dá
 * para marcar como realizada ou registrar o pagamento sem sair do painel.
 */
import { criarLinhaVisita } from "./agenda/componentes.js";
import { ModalVisita } from "./agenda/modal_visita.js";
import { VisaoLista } from "./agenda/visao_lista.js";
import { ApiClient } from "./core/api.js";
import { Datas } from "./core/datas.js";
import { elemento } from "./core/dom.js";
import { Formatador } from "./core/formatadores.js";
import { Notificacao } from "./core/ui.js";

const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

class PaginaInicio {
  #api = new ApiClient();
  #modal = new ModalVisita(() => this.carregar());
  #abrir = (visita) => this.#modal.abrir(visita.id_visita);

  iniciar() {
    const hoje = Datas.paraDate(Datas.hoje());
    const dataLonga = `${Datas.DIAS_SEMANA[hoje.getDay()]}, ${hoje.getDate()} de ${Datas.MESES[hoje.getMonth()]}`;
    document.getElementById("data-hoje").textContent = dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1);
    return this.carregar();
  }

  async carregar() {
    try {
      this.dados = await this.#api.get("/painel");
    } catch (erro) {
      Notificacao.erro(erro.message);
      return;
    }
    this.renderizar();
  }

  renderizar() {
    const d = this.dados;

    // Indicadores
    const agendadasHoje = d.visitas_hoje.filter((v) => v.status === "AGENDADA").length;
    document.getElementById("kpi-hoje").textContent = d.visitas_hoje.length;
    document.getElementById("kpi-hoje-detalhe").textContent =
      d.visitas_hoje.length === 0 ? "nenhuma marcada" : `${agendadasHoje} ainda ${agendadasHoje === 1 ? "agendada" : "agendadas"}`;

    document.getElementById("kpi-atrasadas").textContent = d.total_atrasadas;
    document.getElementById("cartao-atrasadas").classList.toggle("resumo__item--erro", d.total_atrasadas > 0);

    document.getElementById("kpi-receber").textContent = Formatador.moeda(d.total_a_receber);
    document.getElementById("kpi-receber-detalhe").textContent = plural(d.qtd_a_receber, "visita", "visitas");

    const lucro = document.getElementById("kpi-lucro");
    lucro.textContent = Formatador.moeda(d.mes.lucro);
    lucro.classList.toggle("negativo", d.mes.lucro < 0);
    document.getElementById("kpi-lucro-detalhe").textContent =
      `${Formatador.moeda(d.mes.faturado)} faturado − ${Formatador.moeda(d.mes.despesas)} em despesas`;

    // Conta nova: mostra o passo a passo
    document.getElementById("primeiros-passos").classList.toggle("oculto", d.clientes_ativos > 0 && d.contratos_ativos > 0);

    // Listas
    this.#desenharAtencao(d.atrasadas, d.total_atrasadas);
    this.#desenharLista("lista-hoje", d.visitas_hoje, "Nenhuma visita hoje.", { mostrarDia: false });
    new VisaoLista(document.getElementById("lista-proximas"), this.#abrir).renderizar(d.proximas);
    if (d.proximas.length === 0) {
      document.getElementById("lista-proximas").replaceChildren(
        elemento("p", { class: "vazio vazio--pequeno" }, "Nenhuma visita agendada nos próximos 7 dias."),
      );
    }

    const aReceber = d.a_receber.map((item) => ({ ...item, status: "REALIZADA", data_pagamento: null }));
    this.#desenharLista("lista-receber", aReceber, "Tudo em dia: nada aguardando pagamento.", { mostrarDia: true });
  }

  #desenharLista(id, visitas, vazio, opcoes) {
    const raiz = document.getElementById(id);
    raiz.replaceChildren(
      ...(visitas.length
        ? visitas.map((v) => criarLinhaVisita(v, this.#abrir, opcoes))
        : [elemento("p", { class: "vazio vazio--pequeno" }, vazio)]),
    );
  }

  /** Visitas agendadas cujo horário já passou: a pessoa precisa marcá-las como realizadas ou canceladas. */
  #desenharAtencao(atrasadas, total) {
    const raiz = document.getElementById("lista-atrasadas");
    if (atrasadas.length === 0) {
      raiz.replaceChildren(elemento("p", { class: "vazio vazio--pequeno" }, "Tudo em dia: nenhuma visita esperando confirmação."));
      return;
    }
    const resto = total - atrasadas.length;
    raiz.replaceChildren(
      elemento(
        "p",
        { class: "texto-suave secao__ajuda" },
        `${plural(total, "visita já passou", "visitas já passaram")} e ainda ${total === 1 ? "está" : "estão"} como agendada${total === 1 ? "" : "s"}. Marque como realizada ou cancele.`,
      ),
      elemento("div", { class: "dia-grupo__visitas" }, atrasadas.map((v) => criarLinhaVisita(v, this.#abrir, { mostrarDia: true }))),
      ...(resto > 0 ? [elemento("p", { class: "texto-suave" }, `E mais ${resto} na agenda.`)] : []),
    );
  }
}

new PaginaInicio().iniciar();
