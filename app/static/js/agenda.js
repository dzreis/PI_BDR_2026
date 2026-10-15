/**
 * Tela da Agenda.
 *
 * Mostra as visitas do mês em duas visões que o usuário alterna:
 *   - Calendário: grade mensal com as visitas de cada dia;
 *   - Lista: visitas agrupadas por dia.
 * Os filtros (situação e busca por cliente) valem para as duas.
 *
 * A classe PaginaAgenda guarda o estado (mês, visão, filtros), busca os dados
 * na API e delega o desenho às classes VisaoCalendario e VisaoLista. Os
 * detalhes de uma visita ficam em ModalVisita.
 */
import { ModalNovaVisita } from "./agenda/modal_nova_visita.js";
import { ModalVisita } from "./agenda/modal_visita.js";
import { estaPaga } from "./agenda/componentes.js";
import { VisaoCalendario } from "./agenda/visao_calendario.js";
import { VisaoLista } from "./agenda/visao_lista.js";
import { ApiClient } from "./core/api.js";
import { Datas } from "./core/datas.js";
import { Formatador } from "./core/formatadores.js";
import { Notificacao } from "./core/ui.js";

/** Tira acentos e maiúsculas (a busca acha "José" digitando "jose"). */
function normalizar(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

class PaginaAgenda {
  #api = new ApiClient();
  #mes; // { ano, mes } exibido (mes de 0 a 11)
  #visao = "calendario"; // "calendario" | "lista"
  #visitas = []; // visitas da grade do mês (42 dias), sem filtro
  #carregamento = 0; // evita que uma resposta antiga sobrescreva uma mais nova

  constructor() {
    const hoje = Datas.paraDate(Datas.hoje());
    this.#mes = { ano: hoje.getFullYear(), mes: hoje.getMonth() };

    this.raiz = document.getElementById("visao");
    this.titulo = document.getElementById("titulo-mes");
    this.filtroSituacao = document.getElementById("filtro-situacao");
    this.campoBusca = document.getElementById("busca");

    this.modalVisita = new ModalVisita(() => this.carregar());
    this.modalNova = new ModalNovaVisita(() => this.carregar());
    this.calendario = new VisaoCalendario(
      this.raiz,
      (visita) => this.modalVisita.abrir(visita.id_visita),
      (dia) => this.modalNova.abrir(dia),
    );
    this.lista = new VisaoLista(this.raiz, (visita) => this.modalVisita.abrir(visita.id_visita));

    // Links como /agenda?dia=2026-10-14 (vindos do painel e do financeiro) abrem naquele dia.
    const dia = new URLSearchParams(window.location.search).get("dia");
    if (/^\d{4}-\d{2}-\d{2}$/.test(dia ?? "") && !Number.isNaN(Datas.paraDate(dia).getTime())) {
      const data = Datas.paraDate(dia);
      this.#mes = { ano: data.getFullYear(), mes: data.getMonth() };
      this.calendario.selecionarDia(dia);
    }
  }

  iniciar() {
    document.getElementById("mes-anterior").addEventListener("click", () => this.#irParaMes(-1));
    document.getElementById("mes-seguinte").addEventListener("click", () => this.#irParaMes(1));
    document.getElementById("ir-hoje").addEventListener("click", () => this.#irParaHoje());
    document.getElementById("botao-novo").addEventListener("click", () => {
      const selecionado = this.#visao === "calendario" ? this.calendario.diaSelecionado : null;
      this.modalNova.abrir(selecionado ?? Datas.hoje());
    });

    document.querySelectorAll("[data-visao]").forEach((botao) => {
      botao.addEventListener("click", () => this.#trocarVisao(botao.dataset.visao));
    });
    this.filtroSituacao.addEventListener("change", () => this.renderizar());
    this.campoBusca.addEventListener("input", () => this.renderizar());

    // Lembra a última visão escolhida (se o navegador permitir).
    try {
      const salva = localStorage.getItem("agendo.visao");
      if (salva === "lista" || salva === "calendario") this.#visao = salva;
    } catch { /* sem armazenamento: usa o padrão */ }
    this.#atualizarBotoesDeVisao();

    return this.carregar();
  }

  // ------------------------------------------------------------------
  // Navegação
  // ------------------------------------------------------------------

  #irParaMes(quantidade) {
    this.#mes = Datas.somarMeses(this.#mes, quantidade);
    return this.carregar();
  }

  #irParaHoje() {
    const hoje = Datas.paraDate(Datas.hoje());
    this.#mes = { ano: hoje.getFullYear(), mes: hoje.getMonth() };
    return this.carregar();
  }

  #trocarVisao(visao) {
    this.#visao = visao;
    try { localStorage.setItem("agendo.visao", visao); } catch { /* ignora */ }
    this.#atualizarBotoesDeVisao();
    this.renderizar();
  }

  #atualizarBotoesDeVisao() {
    document.querySelectorAll("[data-visao]").forEach((botao) => {
      const ativo = botao.dataset.visao === this.#visao;
      botao.classList.toggle("alternador__opcao--ativa", ativo);
      botao.setAttribute("aria-pressed", String(ativo));
    });
  }

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------

  /** Busca as visitas dos 42 dias da grade do mês exibido e redesenha. */
  async carregar() {
    const numero = ++this.#carregamento;
    const grade = Datas.gradeDoMes(this.#mes);
    const inicio = grade[0].dia;
    const fim = Datas.somarDias(grade[grade.length - 1].dia, 1); // fim é exclusivo

    try {
      const visitas = await this.#api.get("/visitas", { inicio, fim });
      if (numero !== this.#carregamento) return; // chegou uma resposta mais nova
      this.#visitas = visitas;
    } catch (erro) {
      Notificacao.erro(erro.message);
    }
    this.renderizar();
  }

  /** Aplica os filtros de situação e de busca. */
  #filtradas() {
    const situacao = this.filtroSituacao.value;
    const busca = normalizar(this.campoBusca.value.trim());

    return this.#visitas.filter((v) => {
      if (situacao === "A_RECEBER") {
        if (v.status !== "REALIZADA" || estaPaga(v)) return false;
      } else if (situacao !== "todas" && v.status !== situacao) {
        return false;
      }
      return !busca || normalizar(`${v.cliente_nome} ${v.servico_tipo}`).includes(busca);
    });
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------

  renderizar() {
    this.titulo.textContent = Datas.nomeDoMes(this.#mes);
    const filtradas = this.#filtradas();

    // Só as visitas do mês aparecem no resumo e na lista (a grade inclui dias vizinhos).
    const prefixo = Datas.primeiroDoMes(this.#mes).slice(0, 7);
    const doMes = filtradas.filter((v) => v.agendamento.startsWith(prefixo));
    this.#atualizarResumo(this.#visitas.filter((v) => v.agendamento.startsWith(prefixo)));

    if (this.#visao === "calendario") this.calendario.renderizar(this.#mes, filtradas);
    else this.lista.renderizar(doMes);
  }

  /** Cartões de resumo do mês (não dependem dos filtros). */
  #atualizarResumo(doMes) {
    const contar = (fn) => doMes.filter(fn).length;
    const somar = (fn) => doMes.filter(fn).reduce((total, v) => total + Number(v.valor_cobrado), 0);

    document.getElementById("resumo-agendadas").textContent = contar((v) => v.status === "AGENDADA");
    document.getElementById("resumo-realizadas").textContent = contar((v) => v.status === "REALIZADA");
    document.getElementById("resumo-receber").textContent = Formatador.moeda(
      somar((v) => v.status === "REALIZADA" && !estaPaga(v)),
    );
    document.getElementById("resumo-recebido").textContent = Formatador.moeda(somar((v) => estaPaga(v)));
  }
}

new PaginaAgenda().iniciar();
