/**
 * Peças compartilhadas pelas visões da agenda (lista, calendário e janelas).
 */
import { elemento } from "../core/dom.js";
import { Formatador } from "../core/formatadores.js";
import { Datas } from "../core/datas.js";

/** Como cada situação da visita aparece na tela. */
export const SITUACOES = {
  AGENDADA: { rotulo: "Agendada", badge: "badge--azul", classe: "agendada" },
  REALIZADA: { rotulo: "Realizada", badge: "badge--verde", classe: "realizada" },
  CANCELADA: { rotulo: "Cancelada", badge: "badge--cinza", classe: "cancelada" },
  REMARCADA: { rotulo: "Remarcada", badge: "badge--amarelo", classe: "remarcada" },
};

export const FORMAS_PAGAMENTO = ["PIX", "DINHEIRO", "NOTA FISCAL"];

/** Texto de um erro da API, incluindo o motivo de cada campo quando houver. */
export function mensagemDeErro(erro) {
  const detalhes = erro.detalhes ? Object.values(erro.detalhes) : [];
  return detalhes.length ? detalhes.join(" ") : erro.message;
}

/** A visita está paga? */
export const estaPaga = (visita) => Boolean(visita.data_pagamento);

/** Visita agendada cujo horário já passou (provavelmente falta marcá-la como realizada). */
export function estaAtrasada(visita) {
  if (visita.status !== "AGENDADA") return false;
  const agora = `${Datas.hoje()}T${new Date().toTimeString().slice(0, 5)}`;
  return visita.agendamento.slice(0, 16) < agora;
}

/** Selos (badges) que resumem a situação financeira/operacional da visita. */
export function criarSelos(visita) {
  const selos = [];
  const situacao = SITUACOES[visita.status];
  selos.push(elemento("span", { class: `badge ${situacao.badge}` }, situacao.rotulo));

  if (estaAtrasada(visita)) selos.push(elemento("span", { class: "badge badge--vermelho" }, "Atrasada"));
  if (visita.status === "REALIZADA") {
    selos.push(
      estaPaga(visita)
        ? elemento("span", { class: "badge badge--verde" }, "Paga")
        : elemento("span", { class: "badge badge--amarelo" }, "A receber"),
    );
  }
  return selos;
}

/**
 * Uma linha de visita (usada na lista agrupada e no painel do dia).
 * @param {object} visita
 * @param {(visita:object)=>void} aoAbrir  Chamado ao clicar na linha.
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.mostrarDia]  Inclui o dia na hora (para listas sem agrupamento).
 */
export function criarLinhaVisita(visita, aoAbrir, { mostrarDia = false } = {}) {
  const situacao = SITUACOES[visita.status];
  const hora = Datas.hora(visita.agendamento);

  const linha = elemento(
    "button",
    {
      type: "button",
      class: `visita visita--${situacao.classe}`,
      "data-id": visita.id_visita,
      "aria-label": `${hora} ${visita.cliente_nome}, ${visita.servico_tipo}. ${situacao.rotulo}. Abrir detalhes`,
    },
    elemento("span", { class: "visita__hora" }, mostrarDia ? Formatador.dataHora(visita.agendamento) : hora),
    elemento(
      "span",
      { class: "visita__texto" },
      elemento("strong", {}, visita.cliente_nome),
      elemento("small", {}, visita.servico_tipo),
    ),
    elemento("span", { class: "visita__selos" }, criarSelos(visita)),
    elemento("span", { class: "visita__valor" }, Formatador.moeda(visita.valor_cobrado)),
  );
  linha.addEventListener("click", () => aoAbrir(visita));
  return linha;
}
