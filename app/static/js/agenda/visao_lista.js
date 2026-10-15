/**
 * Visão "Lista": as visitas do mês agrupadas por dia, em ordem cronológica.
 * O dia de hoje ganha destaque; dias sem visitas não aparecem.
 */
import { Datas } from "../core/datas.js";
import { elemento } from "../core/dom.js";
import { criarLinhaVisita } from "./componentes.js";

export class VisaoLista {
  #raiz;
  #aoAbrir;

  /**
   * @param {HTMLElement} raiz  Onde a lista é desenhada.
   * @param {(visita:object)=>void} aoAbrir  Clique numa visita.
   */
  constructor(raiz, aoAbrir) {
    this.#raiz = raiz;
    this.#aoAbrir = aoAbrir;
  }

  /** @param {object[]} visitas  Já filtradas e dentro do mês exibido. */
  renderizar(visitas) {
    if (visitas.length === 0) {
      this.#raiz.replaceChildren(
        elemento("p", { class: "vazio" }, "Nenhuma visita neste mês com os filtros escolhidos."),
      );
      return;
    }

    // Agrupa por dia mantendo a ordem (a API já devolve ordenado por data/hora).
    const porDia = new Map();
    for (const visita of visitas) {
      const dia = Datas.dia(visita.agendamento);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(visita);
    }

    const hoje = Datas.hoje();
    const grupos = [...porDia].map(([dia, doDia]) =>
      elemento(
        "section",
        { class: `dia-grupo${dia === hoje ? " dia-grupo--hoje" : ""}`, "data-dia": dia },
        elemento(
          "header",
          { class: "dia-grupo__cabecalho" },
          elemento("h3", {}, Datas.rotuloDia(dia)),
          elemento("span", { class: "texto-suave" }, `${doDia.length} ${doDia.length === 1 ? "visita" : "visitas"}`),
        ),
        elemento("div", { class: "dia-grupo__visitas" }, doDia.map((v) => criarLinhaVisita(v, this.#aoAbrir))),
      ),
    );
    this.#raiz.replaceChildren(...grupos);
  }
}
