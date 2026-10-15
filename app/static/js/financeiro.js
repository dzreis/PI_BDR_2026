/**
 * Tela do Financeiro.
 *
 * Pergunta à API os números de um período e mostra:
 *   - indicadores (faturado, recebido, a receber, despesas, lucro);
 *   - lucro por serviço (tabela com barra proporcional);
 *   - evolução dos últimos 6 meses (gráfico de colunas);
 *   - visitas realizadas ainda não pagas.
 * O botão "Exportar CSV" gera uma planilha do lucro por serviço do período.
 */
import { ApiClient } from "./core/api.js";
import { Datas } from "./core/datas.js";
import { elemento } from "./core/dom.js";
import { Formatador } from "./core/formatadores.js";
import { Notificacao } from "./core/ui.js";

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" -> "out/26" */
function rotuloMes(anoMes) {
  const [ano, mes] = anoMes.split("-").map(Number);
  return `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}`;
}

const dinheiro = (v) => Formatador.moeda(v);
const percentual = (v) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);

class PaginaFinanceiro {
  #api = new ApiClient();
  #dados = null; // última resposta da API
  #periodo = null; // { inicio, fim (exclusivo) }
  #carregamento = 0;

  constructor() {
    this.seletor = document.getElementById("periodo");
    this.blocoDatas = document.getElementById("periodo-datas");
    this.campoInicio = document.getElementById("data-inicio");
    this.campoFim = document.getElementById("data-fim");
  }

  iniciar() {
    this.seletor.addEventListener("change", () => this.#aoMudarPeriodo());
    this.campoInicio.addEventListener("change", () => this.#carregarPersonalizado());
    this.campoFim.addEventListener("change", () => this.#carregarPersonalizado());
    document.getElementById("exportar").addEventListener("click", () => this.#exportarCsv());
    return this.#aoMudarPeriodo();
  }

  // ------------------------------------------------------------------
  // Período
  // ------------------------------------------------------------------

  /** Primeiro dia do mês `deslocamento` meses a partir deste (0 = este mês). */
  static #primeiroDoMes(deslocamento = 0) {
    const hoje = Datas.paraDate(Datas.hoje());
    return Datas.primeiroDoMes(Datas.somarMeses({ ano: hoje.getFullYear(), mes: hoje.getMonth() }, deslocamento));
  }

  /** Início e fim (exclusivo) de um período pré-definido. */
  static #intervaloPredefinido(nome) {
    const primeiro = PaginaFinanceiro.#primeiroDoMes;
    switch (nome) {
      case "mes_anterior":
        return { inicio: primeiro(-1), fim: primeiro(0) };
      case "3meses":
        return { inicio: primeiro(-2), fim: primeiro(1) };
      case "ano": {
        const ano = Datas.paraDate(Datas.hoje()).getFullYear();
        return { inicio: `${ano}-01-01`, fim: `${ano + 1}-01-01` };
      }
      default: // "mes"
        return { inicio: primeiro(0), fim: primeiro(1) };
    }
  }

  #aoMudarPeriodo() {
    const personalizado = this.seletor.value === "personalizado";
    this.blocoDatas.classList.toggle("oculto", !personalizado);

    if (personalizado) {
      // Começa mostrando o intervalo que já estava na tela, para a pessoa só ajustar.
      if (!this.campoInicio.value && this.#periodo) {
        this.campoInicio.value = this.#periodo.inicio;
        this.campoFim.value = Datas.somarDias(this.#periodo.fim, -1);
      }
      return this.#carregarPersonalizado();
    }
    this.#periodo = PaginaFinanceiro.#intervaloPredefinido(this.seletor.value);
    return this.carregar();
  }

  #carregarPersonalizado() {
    const { value: inicio } = this.campoInicio;
    const { value: fim } = this.campoFim;
    if (!inicio || !fim) return undefined;
    if (fim < inicio) {
      Notificacao.erro("A data final não pode ser antes da inicial.");
      return undefined;
    }
    this.#periodo = { inicio, fim: Datas.somarDias(fim, 1) }; // a API usa fim exclusivo
    return this.carregar();
  }

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------

  async carregar() {
    const numero = ++this.#carregamento;
    try {
      const dados = await this.#api.get("/financeiro", this.#periodo);
      if (numero !== this.#carregamento) return;
      this.#dados = dados;
    } catch (erro) {
      Notificacao.erro(erro.detalhes ? Object.values(erro.detalhes).join(" ") : erro.message);
      return;
    }
    this.renderizar();
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------

  renderizar() {
    const { totais, servicos, mensal, a_receber: aReceber } = this.#dados;

    document.getElementById("rotulo-periodo").textContent =
      `${Formatador.data(this.#periodo.inicio)} a ${Formatador.data(Datas.somarDias(this.#periodo.fim, -1))}`;

    document.getElementById("kpi-faturado").textContent = dinheiro(totais.faturado);
    document.getElementById("kpi-recebido").textContent = dinheiro(totais.recebido);
    document.getElementById("kpi-receber").textContent = dinheiro(totais.a_receber);
    document.getElementById("kpi-despesas").textContent = dinheiro(totais.despesas);

    const lucro = document.getElementById("kpi-lucro");
    lucro.textContent = dinheiro(totais.lucro);
    lucro.classList.toggle("negativo", totais.lucro < 0);
    document.getElementById("kpi-margem").textContent =
      totais.margem === null ? "" : `Margem de ${percentual(totais.margem)}`;

    this.#desenharServicos(servicos);
    this.#desenharGrafico(mensal);
    this.#desenharAReceber(aReceber);
  }

  #desenharServicos(servicos) {
    const raiz = document.getElementById("tabela-servicos");
    if (servicos.length === 0) {
      raiz.replaceChildren(elemento("p", { class: "vazio" }, "Nenhuma visita realizada neste período."));
      return;
    }

    const maior = Math.max(...servicos.map((s) => Math.abs(s.lucro)), 1);
    const linhas = servicos.map((s) =>
      elemento(
        "tr",
        {},
        elemento("th", { scope: "row", class: "tabela__nome" }, s.servico_tipo),
        elemento("td", { class: "col-opcional num" }, String(s.visitas)),
        elemento("td", { class: "num" }, dinheiro(s.faturado)),
        elemento("td", { class: "col-opcional-movel num" }, dinheiro(s.despesas)),
        elemento(
          "td",
          { class: "num" },
          elemento("strong", { class: s.lucro < 0 ? "negativo" : "" }, dinheiro(s.lucro)),
          elemento(
            "span",
            { class: "barra-lucro", "aria-hidden": "true" },
            elemento("i", { class: s.lucro < 0 ? "negativo" : "", style: `width: ${(Math.abs(s.lucro) / maior) * 100}%` }),
          ),
        ),
        elemento("td", { class: "col-opcional num" }, percentual(s.margem)),
      ),
    );

    const t = this.#dados.totais;
    const rodape = elemento(
      "tr",
      { class: "tabela__total" },
      elemento("th", { scope: "row" }, "Total"),
      elemento("td", { class: "col-opcional num" }, String(t.visitas)),
      elemento("td", { class: "num" }, dinheiro(t.faturado)),
      elemento("td", { class: "col-opcional-movel num" }, dinheiro(t.despesas)),
      elemento("td", { class: "num" }, elemento("strong", { class: t.lucro < 0 ? "negativo" : "" }, dinheiro(t.lucro))),
      elemento("td", { class: "col-opcional num" }, percentual(t.margem)),
    );

    const cabecalho = ["Serviço", "Visitas", "Faturado", "Despesas", "Lucro", "Margem"];
    raiz.replaceChildren(
      elemento(
        "table",
        { class: "tabela" },
        elemento(
          "thead",
          {},
          elemento(
            "tr",
            {},
            cabecalho.map((nome, i) =>
              elemento("th", { scope: "col", class: [1, 5].includes(i) ? "col-opcional num" : i === 3 ? "col-opcional-movel num" : i > 1 ? "num" : "" }, nome),
            ),
          ),
        ),
        elemento("tbody", {}, linhas),
        elemento("tfoot", {}, rodape),
      ),
    );
  }

  /** Gráfico de colunas em HTML/CSS: faturado (azul) e despesas (laranja) por mês. */
  #desenharGrafico(mensal) {
    const raiz = document.getElementById("grafico");
    const maior = Math.max(...mensal.map((m) => Math.max(m.faturado, m.despesas)), 0);

    if (maior === 0) {
      raiz.replaceChildren(elemento("p", { class: "vazio" }, "Ainda não há visitas realizadas nos últimos 6 meses."));
      return;
    }

    const altura = (valor) => `height: ${Math.max((valor / maior) * 100, valor > 0 ? 3 : 0)}%`;
    const colunas = mensal.map((m) =>
      elemento(
        "div",
        {
          class: "grafico__mes",
          role: "img",
          "aria-label": `${rotuloMes(m.mes)}: faturado ${dinheiro(m.faturado)}, despesas ${dinheiro(m.despesas)}, lucro ${dinheiro(m.lucro)}`,
        },
        elemento("span", { class: "grafico__valor" }, m.faturado > 0 ? dinheiro(m.faturado) : ""),
        elemento(
          "div",
          { class: "grafico__barras", title: `Lucro: ${dinheiro(m.lucro)}` },
          elemento("i", { class: "grafico__barra grafico__barra--faturado", style: altura(m.faturado) }),
          elemento("i", { class: "grafico__barra grafico__barra--despesa", style: altura(m.despesas) }),
        ),
        elemento("span", { class: "grafico__rotulo" }, rotuloMes(m.mes)),
        elemento("small", { class: `grafico__lucro${m.lucro < 0 ? " negativo" : ""}` }, m.faturado || m.despesas ? `Lucro ${dinheiro(m.lucro)}` : ""),
      ),
    );

    raiz.replaceChildren(
      elemento("div", { class: "grafico" }, colunas),
      elemento(
        "p",
        { class: "grafico__legenda" },
        elemento("span", {}, elemento("i", { class: "grafico__barra--faturado" }), " Faturado"),
        elemento("span", {}, elemento("i", { class: "grafico__barra--despesa" }), " Despesas"),
      ),
    );
  }

  #desenharAReceber({ total, itens }) {
    document.getElementById("total-receber").textContent = itens.length ? dinheiro(total) : "";
    const raiz = document.getElementById("lista-receber");

    if (itens.length === 0) {
      raiz.replaceChildren(elemento("p", { class: "vazio vazio--pequeno" }, "Tudo em dia: nenhuma visita realizada aguardando pagamento."));
      return;
    }
    raiz.replaceChildren(
      ...itens.map((item) =>
        elemento(
          "a",
          { class: "visita visita--realizada visita--link", href: `/agenda?dia=${item.agendamento.slice(0, 10)}` },
          elemento("span", { class: "visita__hora" }, Formatador.data(item.agendamento)),
          elemento("span", { class: "visita__texto" }, elemento("strong", {}, item.cliente_nome), elemento("small", {}, item.servico_tipo)),
          elemento("span", { class: "visita__selos" }, elemento("span", { class: "badge badge--amarelo" }, "A receber")),
          elemento("span", { class: "visita__valor" }, dinheiro(item.valor_cobrado)),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------
  // Exportar
  // ------------------------------------------------------------------

  /** Baixa o lucro por serviço em CSV (separador ";" e vírgula decimal, para abrir direto no Excel brasileiro). */
  #exportarCsv() {
    if (!this.#dados) return;
    const numero = (v) => v.toFixed(2).replace(".", ",");
    const texto = (v) => `"${String(v).replace(/"/g, '""')}"`;

    const linhas = [["Serviço", "Visitas", "Faturado", "Recebido", "A receber", "Despesas", "Lucro", "Margem (%)"]];
    const linha = (nome, s) => [
      texto(nome), s.visitas, numero(s.faturado), numero(s.recebido), numero(s.a_receber),
      numero(s.despesas), numero(s.lucro), s.margem === null ? "" : String(s.margem).replace(".", ","),
    ];
    for (const s of this.#dados.servicos) linhas.push(linha(s.servico_tipo, s));
    linhas.push(linha("TOTAL", this.#dados.totais));

    const conteudo = `﻿${linhas.map((l) => l.join(";")).join("\r\n")}`; // BOM para acentos no Excel
    const link = elemento("a", {
      href: URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" })),
      download: `lucro-por-servico_${this.#periodo.inicio}_a_${Datas.somarDias(this.#periodo.fim, -1)}.csv`,
    });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }
}

new PaginaFinanceiro().iniciar();
