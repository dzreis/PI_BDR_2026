/**
 * Visão "Calendário": grade mensal (domingo a sábado) com as visitas de cada dia.
 *
 * - Em telas largas cada dia mostra as visitas como etiquetas coloridas.
 * - Em telas pequenas as etiquetas viram pontinhos e o painel "dia selecionado"
 *   (logo abaixo da grade) mostra os detalhes.
 * - Clicar num dia seleciona-o; clicar numa etiqueta abre a visita.
 */
import { Datas } from "../core/datas.js";
import { elemento } from "../core/dom.js";
import { Icone } from "../core/icones.js";
import { criarLinhaVisita, SITUACOES } from "./componentes.js";

const MAX_ETIQUETAS = 3; // acima disso aparece "+N"

export class VisaoCalendario {
  #raiz;
  #aoAbrir;
  #aoNovaVisita;
  #diaSelecionado = null;

  /**
   * @param {HTMLElement} raiz
   * @param {(visita:object)=>void} aoAbrir      Clique numa visita.
   * @param {(dia:string)=>void} aoNovaVisita    Botão "Nova visita neste dia".
   */
  constructor(raiz, aoAbrir, aoNovaVisita) {
    this.#raiz = raiz;
    this.#aoAbrir = aoAbrir;
    this.#aoNovaVisita = aoNovaVisita;
  }

  get diaSelecionado() {
    return this.#diaSelecionado;
  }

  /** Define o dia que vem selecionado (vale se ele estiver no mês exibido). */
  selecionarDia(dia) {
    this.#diaSelecionado = dia;
  }

  /**
   * @param {{ano:number, mes:number}} mes  Mês exibido (mes de 0 a 11).
   * @param {object[]} visitas  Visitas do período da grade, já filtradas.
   */
  renderizar(mes, visitas) {
    const porDia = new Map();
    for (const visita of visitas) {
      const dia = Datas.dia(visita.agendamento);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(visita);
    }

    const hoje = Datas.hoje();
    const grade = Datas.gradeDoMes(mes);

    // Dia selecionado: se saiu do mês exibido, volta para hoje (se estiver no mês) ou dia 1.
    const diasDoMes = grade.filter((d) => d.doMes).map((d) => d.dia);
    if (!this.#diaSelecionado || !diasDoMes.includes(this.#diaSelecionado)) {
      this.#diaSelecionado = diasDoMes.includes(hoje) ? hoje : diasDoMes[0];
    }

    const cabecalho = Datas.DIAS_SEMANA_CURTO.map((nome) => elemento("div", { class: "calendario__semana" }, nome));
    const celulas = grade.map(({ dia, doMes }) => this.#criarCelula(dia, doMes, hoje, porDia.get(dia) ?? []));

    this.#raiz.replaceChildren(
      elemento("div", { class: "calendario", role: "grid" }, ...cabecalho, ...celulas),
      this.#criarPainelDoDia(porDia.get(this.#diaSelecionado) ?? []),
    );
  }

  #criarCelula(dia, doMes, hoje, visitas) {
    const numero = Datas.paraDate(dia).getDate();
    const classes = ["calendario__dia"];
    if (!doMes) classes.push("calendario__dia--fora");
    if (dia === hoje) classes.push("calendario__dia--hoje");
    if (dia === this.#diaSelecionado) classes.push("calendario__dia--selecionado");

    const etiquetas = visitas.slice(0, MAX_ETIQUETAS).map((visita) => {
      const etiqueta = elemento(
        "span",
        {
          class: `etiqueta etiqueta--${SITUACOES[visita.status].classe}`,
          role: "button",
          tabindex: "0",
          title: `${Datas.hora(visita.agendamento)} · ${visita.cliente_nome} · ${visita.servico_tipo}`,
        },
        elemento("b", {}, Datas.hora(visita.agendamento)),
        ` ${visita.cliente_nome}`,
      );
      const abrir = (evento) => {
        evento.stopPropagation(); // não troca o dia selecionado
        this.#aoAbrir(visita);
      };
      etiqueta.addEventListener("click", abrir);
      etiqueta.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          abrir(evento);
        }
      });
      return etiqueta;
    });

    const excedente = visitas.length - MAX_ETIQUETAS;
    const pontos = visitas
      .slice(0, 4)
      .map((v) => elemento("i", { class: `ponto ponto--${SITUACOES[v.status].classe}` }));

    const celula = elemento(
      "div",
      { class: classes.join(" "), role: "gridcell", tabindex: "0", "data-dia": dia, "aria-label": Datas.rotuloDia(dia) },
      elemento(
        "span",
        { class: "calendario__numero" },
        elemento("b", { class: "calendario__num" }, String(numero)),
        visitas.length > 0 ? elemento("small", { class: "calendario__total" }, String(visitas.length)) : null,
      ),
      elemento("div", { class: "calendario__etiquetas" }, etiquetas, excedente > 0 ? elemento("span", { class: "calendario__mais" }, `+${excedente}`) : null),
      elemento("div", { class: "calendario__pontos" }, pontos),
    );

    const selecionar = () => {
      this.#diaSelecionado = dia;
      this.#selecionarNaGrade(dia);
      this.#atualizarPainel(visitas);
    };
    celula.addEventListener("click", selecionar);
    celula.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        selecionar();
      }
    });
    return celula;
  }

  /** Move o destaque de "selecionado" na grade sem redesenhar tudo. */
  #selecionarNaGrade(dia) {
    this.#raiz.querySelectorAll(".calendario__dia--selecionado").forEach((c) => c.classList.remove("calendario__dia--selecionado"));
    this.#raiz.querySelector(`.calendario__dia[data-dia="${dia}"]`)?.classList.add("calendario__dia--selecionado");
  }

  #atualizarPainel(visitas) {
    this.#raiz.querySelector(".painel-dia")?.replaceWith(this.#criarPainelDoDia(visitas));
  }

  /** Painel abaixo da grade com as visitas do dia selecionado. */
  #criarPainelDoDia(visitas) {
    const dia = this.#diaSelecionado;
    const botaoNova = elemento(
      "button",
      { type: "button", class: "btn btn--secundario btn--pequeno" },
      Icone.criar("plus", 16),
      " Nova visita neste dia",
    );
    botaoNova.addEventListener("click", () => this.#aoNovaVisita(dia));

    return elemento(
      "section",
      { class: "painel-dia", "aria-live": "polite" },
      elemento("header", { class: "dia-grupo__cabecalho" }, elemento("h3", {}, Datas.rotuloDia(dia)), botaoNova),
      visitas.length === 0
        ? elemento("p", { class: "vazio vazio--pequeno" }, "Nenhuma visita neste dia.")
        : elemento("div", { class: "dia-grupo__visitas" }, visitas.map((v) => criarLinhaVisita(v, this.#aoAbrir))),
    );
  }
}
