/**
 * Tela de Serviços.
 * Herda de PaginaCrud e só define o que é específico dos serviços: o desenho
 * do cartão e a formatação do preço.
 */
import { elemento } from "./core/dom.js";
import { Formatador } from "./core/formatadores.js";
import { Icone } from "./core/icones.js";
import { PaginaCrud } from "./core/pagina_crud.js";

class PaginaServicos extends PaginaCrud {
  constructor() {
    super({
      recurso: "/servicos",
      chave: "id_servico",
      nomeItem: "serviço",
      nomePlural: "serviços",
    });
  }

  /** 150 -> "150,00" (formato que o campo de preço mostra). */
  #formatarPreco(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  aoIniciar() {
    // Ao sair do campo de preço, "150,5" vira "150,50" (sempre duas casas decimais).
    const campo = this.formulario.querySelector('[name="preco_padrao"]');
    campo.addEventListener("blur", () => {
      const numero = Number(campo.value.replace(/\./g, "").replace(",", "."));
      if (campo.value.trim() !== "" && Number.isFinite(numero) && numero >= 0) {
        campo.value = this.#formatarPreco(numero);
      }
    });
  }

  aoPreencherFormulario(servico) {
    if (servico) {
      this.formulario.querySelector('[name="preco_padrao"]').value = this.#formatarPreco(servico.preco_padrao);
    }
  }

  rotuloItem(servico) {
    return servico.tipo;
  }

  textoBusca(s) {
    return [s.tipo, s.descricao].join(" ");
  }

  criarCartao(s) {
    const duracao = s.duracao_dias ? `${s.duracao_dias} ${s.duracao_dias === 1 ? "dia" : "dias"} por visita` : null;

    return elemento(
      "article",
      { class: `cartao${s.ativo ? "" : " cartao--inativo"}`, "data-id": s.id_servico },
      elemento(
        "header",
        { class: "cartao__topo" },
        elemento("span", { class: "cartao__avatar cartao__avatar--quadrado", "aria-hidden": "true" }, Icone.criar("briefcase", 22)),
        elemento("div", { class: "cartao__titulo" }, elemento("h3", {}, s.tipo), this.criarSelo(s)),
        this.criarAcoes(s),
      ),
      elemento("p", { class: "cartao__preco" }, Formatador.moeda(s.preco_padrao), elemento("small", {}, "preço padrão")),
      s.descricao ? elemento("p", { class: "cartao__texto" }, s.descricao) : null,
      elemento("ul", { class: "cartao__info" }, this.linhaInfo("clock", duracao)),
      this.criarRodape(s, s.ativo ? "Disponível para novos contratos" : "Fora do catálogo"),
    );
  }
}

new PaginaServicos().iniciar();
