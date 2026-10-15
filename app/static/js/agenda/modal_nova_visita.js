/**
 * Janela "Nova visita": cria uma visita extra (fora da recorrência do contrato).
 * Só aparecem contratos ativos. O valor é opcional (padrão: o do contrato).
 */
import { ApiClient } from "../core/api.js";
import { Datas } from "../core/datas.js";
import { elemento } from "../core/dom.js";
import { Modal, Notificacao } from "../core/ui.js";
import { mensagemDeErro } from "./componentes.js";

export class ModalNovaVisita {
  #api = new ApiClient();
  #modal = new Modal("modal-nova");
  #form = document.getElementById("form-nova");
  #contratos = [];
  #aoCriar;

  /** @param {(visita:object)=>void} aoCriar  Chamado depois de criar. */
  constructor(aoCriar) {
    this.#aoCriar = aoCriar;
    this.#form.addEventListener("submit", (evento) => this.#salvar(evento));
  }

  #campo(nome) {
    return this.#form.elements[nome];
  }

  /** Abre a janela; `dia` (AAAA-MM-DD) é a data sugerida. */
  async abrir(dia = Datas.hoje()) {
    try {
      const todos = await this.#api.get("/contratos");
      this.#contratos = todos.filter((c) => c.ativo);
    } catch (erro) {
      Notificacao.erro(erro.message);
      return;
    }
    if (this.#contratos.length === 0) {
      Notificacao.erro("Crie um contrato ativo antes de agendar uma visita.");
      return;
    }

    this.#form.reset();
    this.#limparErros();
    this.#campo("id_contrato").replaceChildren(
      elemento("option", { value: "" }, "Selecione..."),
      ...this.#contratos.map((c) => elemento("option", { value: c.id_contrato }, `${c.cliente_nome} - ${c.servico_tipo}`)),
    );
    this.#campo("data").value = dia;
    this.#modal.abrir();
    this.#campo("id_contrato").focus();
  }

  #limparErros() {
    this.#form.querySelectorAll(".campo__erro").forEach((e) => e.remove());
    this.#form.querySelectorAll(".campo input, .campo select").forEach((e) => e.removeAttribute("aria-invalid"));
  }

  #mostrarErros(detalhes) {
    for (const [nome, mensagem] of Object.entries(detalhes ?? {})) {
      const bloco = this.#form.querySelector(`[data-campo="${nome}"]`);
      if (!bloco) continue;
      bloco.querySelector("input, select")?.setAttribute("aria-invalid", "true");
      bloco.append(elemento("small", { class: "campo__erro" }, mensagem));
    }
  }

  async #salvar(evento) {
    evento.preventDefault();
    this.#limparErros();
    const dados = Object.fromEntries(new FormData(this.#form));

    try {
      const visita = await this.#api.post("/visitas", dados);
      this.#modal.fechar();
      Notificacao.sucesso("Visita agendada.");
      this.#aoCriar(visita);
    } catch (erro) {
      if (erro.detalhes) this.#mostrarErros(erro.detalhes);
      else Notificacao.erro(mensagemDeErro(erro));
    }
  }
}
