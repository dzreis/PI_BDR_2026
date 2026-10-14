/**
 * Tela de Clientes.
 * Herda de PaginaCrud (que já sabe listar, salvar, excluir...) e acrescenta o
 * que é só dos clientes: o desenho do cartão, as máscaras de telefone/CEP e o
 * preenchimento automático do endereço pelo ViaCEP.
 */
import { elemento } from "./core/dom.js";
import { Formatador } from "./core/formatadores.js";
import { Mascara } from "./core/mascaras.js";
import { PaginaCrud } from "./core/pagina_crud.js";
import { ViaCep } from "./core/viacep.js";

class PaginaClientes extends PaginaCrud {
  #cepConsultado = ""; // último CEP enviado ao ViaCEP (evita consultas repetidas)

  constructor() {
    super({
      recurso: "/clientes",
      chave: "id_cliente",
      nomeItem: "cliente",
      nomePlural: "clientes",
    });
  }

  /** Campo do formulário pelo atributo `name`. */
  #campo(nome) {
    return this.formulario.querySelector(`[name="${nome}"]`);
  }

  aoIniciar() {
    Mascara.aplicar(this.#campo("telefone"), Mascara.telefone);
    Mascara.aplicar(this.#campo("cep"), Mascara.cep);
    this.#campo("cep").addEventListener("input", () => this.#buscarEndereco());
  }

  aoPreencherFormulario(cliente) {
    // Os dados chegam só com dígitos; mostramos formatados.
    if (cliente) {
      this.#campo("telefone").value = Formatador.telefone(cliente.telefone);
      this.#campo("cep").value = Formatador.cep(cliente.cep);
    }
    this.#cepConsultado = Formatador.somenteDigitos(this.#campo("cep").value);
    this.#mostrarAjudaCep("");
  }

  // ------------------------------------------------------------------
  // ViaCEP
  // ------------------------------------------------------------------

  #mostrarAjudaCep(texto) {
    document.getElementById("ajuda-cep").textContent = texto;
  }

  /** Quando o CEP tem 8 dígitos, busca o endereço e preenche os campos. */
  async #buscarEndereco() {
    const cep = Formatador.somenteDigitos(this.#campo("cep").value);
    if (cep.length !== 8) {
      this.#cepConsultado = "";
      this.#mostrarAjudaCep("");
      return;
    }
    if (cep === this.#cepConsultado) return;

    this.#cepConsultado = cep;
    this.#mostrarAjudaCep("Buscando endereço...");

    try {
      const endereco = await ViaCep.buscar(cep);
      if (cep !== this.#cepConsultado) return; // a pessoa mudou o CEP durante a busca

      if (!endereco) {
        this.#cepConsultado = "";
        this.#mostrarAjudaCep("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }

      // Só preenche o que o ViaCEP trouxe (CEPs genéricos vêm sem rua).
      for (const [campo, valor] of Object.entries(endereco)) {
        if (valor) this.#campo(campo).value = valor;
      }
      this.#mostrarAjudaCep("Endereço preenchido. Confira e informe o número.");
      this.#campo("numero").focus();
    } catch {
      if (cep !== this.#cepConsultado) return;
      this.#cepConsultado = "";
      this.#mostrarAjudaCep("Não foi possível buscar o CEP agora. Preencha manualmente.");
    }
  }

  // ------------------------------------------------------------------
  // Lista de cartões
  // ------------------------------------------------------------------

  rotuloItem(cliente) {
    return cliente.nome;
  }

  textoBusca(c) {
    return [c.nome, c.telefone, Formatador.telefone(c.telefone), c.email, c.cidade, c.bairro, c.logradouro].join(" ");
  }

  /** "Maria Eduarda Reis" -> "MR" */
  #iniciais(nome) {
    const partes = nome.trim().split(/\s+/);
    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
    return (primeira + ultima).toUpperCase();
  }

  /** Monta as linhas do endereço: "Rua A, 10 (apto 2)" e "Centro · Campinas/SP". */
  #textosDoEndereco(c) {
    const rua = [c.logradouro, c.numero].filter(Boolean).join(", ") + (c.complemento ? ` (${c.complemento})` : "");
    const cidadeUf = c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade || c.uf;
    const local = [c.bairro, cidadeUf].filter(Boolean).join(" · ");
    return { rua: rua || local, local: rua ? local : "" };
  }

  criarCartao(c) {
    const { rua, local } = this.#textosDoEndereco(c);

    return elemento(
      "article",
      { class: `cartao${c.ativo ? "" : " cartao--inativo"}`, "data-id": c.id_cliente },
      elemento(
        "header",
        { class: "cartao__topo" },
        elemento("span", { class: "cartao__avatar", "aria-hidden": "true" }, this.#iniciais(c.nome)),
        elemento("div", { class: "cartao__titulo" }, elemento("h3", {}, c.nome), this.criarSelo(c)),
        this.criarAcoes(c),
      ),
      elemento(
        "ul",
        { class: "cartao__info" },
        this.linhaInfo("phone", Formatador.telefone(c.telefone)),
        this.linhaInfo("mail", c.email),
        this.linhaInfo("map-pin", rua, local),
      ),
      c.observacoes ? elemento("p", { class: "cartao__obs" }, c.observacoes) : null,
      this.criarRodape(c, `Cliente desde ${Formatador.data(c.data_cadastro)}`),
    );
  }
}

new PaginaClientes().iniciar();
