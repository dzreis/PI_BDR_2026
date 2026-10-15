/**
 * Tela de Contratos.
 * Herda de PaginaCrud e acrescenta o que é só dos contratos: os campos de
 * escolha de cliente/serviço, o desenho do cartão e o botão "Gerar visitas".
 *
 * Regras da tela:
 *  - ao criar, as visitas dos próximos 3 meses são geradas pelo servidor;
 *  - ao editar, cliente, serviço e data de início ficam bloqueados (a agenda é
 *    calculada a partir deles), e o horário não é mostrado.
 */
import { elemento } from "./core/dom.js";
import { Formatador } from "./core/formatadores.js";
import { Icone } from "./core/icones.js";
import { PaginaCrud } from "./core/pagina_crud.js";
import { Notificacao } from "./core/ui.js";

const FREQUENCIAS = { SEMANAL: "Semanal", QUINZENAL: "Quinzenal", MENSAL: "Mensal" };

/** "1 visita" / "3 visitas" */
function visitas(quantidade) {
  return `${quantidade} ${quantidade === 1 ? "visita" : "visitas"}`;
}

class PaginaContratos extends PaginaCrud {
  #clientes = [];
  #servicos = [];
  #valorAutomatico = ""; // último valor preenchido sozinho a partir do preço do serviço

  constructor() {
    super({
      recurso: "/contratos",
      chave: "id_contrato",
      nomeItem: "contrato",
      nomePlural: "contratos",
    });
  }

  /** Campo do formulário pelo atributo `name`. */
  #campo(nome) {
    return this.formulario.querySelector(`[name="${nome}"]`);
  }

  /** 150 -> "150,00" (formato que o campo de valor mostra). */
  #formatarValor(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  // ------------------------------------------------------------------
  // Dados auxiliares (clientes e serviços para os campos de escolha)
  // ------------------------------------------------------------------

  /** Além dos contratos, carrega clientes e serviços para o formulário. */
  async carregar() {
    await Promise.all([this.#carregarOpcoes(), super.carregar()]);
  }

  async #carregarOpcoes() {
    try {
      [this.#clientes, this.#servicos] = await Promise.all([this.api.get("/clientes"), this.api.get("/servicos")]);
    } catch (erro) {
      Notificacao.erro(erro.message);
    }
  }

  /**
   * Preenche um <select>. Ao criar, só entram itens ativos; ao editar, entram
   * todos (o contrato pode ser de um cliente ou serviço hoje inativo).
   */
  #preencherSelect(nome, itens, chave, rotulo, editando) {
    const select = this.#campo(nome);
    const disponiveis = editando ? itens : itens.filter((item) => item.ativo);

    select.replaceChildren(
      elemento("option", { value: "" }, "Selecione..."),
      ...disponiveis.map((item) =>
        elemento("option", { value: item[chave] }, rotulo(item) + (item.ativo ? "" : " (inativo)")),
      ),
    );
  }

  // ------------------------------------------------------------------
  // Formulário
  // ------------------------------------------------------------------

  aoIniciar() {
    // Ao escolher o serviço, sugere o preço padrão (sem sobrescrever o que a pessoa digitou).
    this.#campo("id_servico").addEventListener("change", () => {
      if (this.editando) return;
      const servico = this.#servicos.find((s) => String(s.id_servico) === this.#campo("id_servico").value);
      const valor = this.#campo("valor");
      if (servico && (valor.value === "" || valor.value === this.#valorAutomatico)) {
        valor.value = this.#valorAutomatico = this.#formatarValor(servico.preco_padrao);
      }
    });

    // A data de término não pode ser antes do início.
    this.#campo("data_inicio").addEventListener("change", () => {
      this.#campo("data_fim").min = this.#campo("data_inicio").value;
    });

    // Ao sair do campo de valor, "150,5" vira "150,50".
    const valor = this.#campo("valor");
    valor.addEventListener("blur", () => {
      const numero = Number(valor.value.replace(/\./g, "").replace(",", "."));
      if (valor.value.trim() !== "" && Number.isFinite(numero) && numero >= 0) {
        valor.value = this.#formatarValor(numero);
      }
    });
  }

  /** Antes de criar, confirma que existe ao menos um cliente e um serviço ativos. */
  abrirFormulario(contrato = null) {
    if (!contrato) {
      if (!this.#clientes.some((c) => c.ativo)) {
        Notificacao.erro("Cadastre pelo menos um cliente ativo antes de criar um contrato.");
        return;
      }
      if (!this.#servicos.some((s) => s.ativo)) {
        Notificacao.erro("Cadastre pelo menos um serviço ativo antes de criar um contrato.");
        return;
      }
    }
    super.abrirFormulario(contrato);
  }

  aoPreencherFormulario(contrato) {
    const editando = contrato !== null;
    this.#valorAutomatico = "";

    this.#preencherSelect("id_cliente", this.#clientes, "id_cliente", (c) => c.nome, editando);
    this.#preencherSelect("id_servico", this.#servicos, "id_servico", (s) => s.tipo, editando);

    // Na edição: cliente, serviço e início só aparecem (bloqueados) e o horário some.
    for (const nome of ["id_cliente", "id_servico", "data_inicio"]) {
      this.#campo(nome).disabled = editando;
    }
    document.getElementById("bloco-horario").classList.toggle("oculto", editando);

    const ajuda = document.getElementById("ajuda-visitas");
    const dataInicio = this.#campo("data_inicio");
    const dataFim = this.#campo("data_fim");

    if (editando) {
      this.#campo("id_cliente").value = contrato.id_cliente;
      this.#campo("id_servico").value = contrato.id_servico;
      this.#campo("valor").value = this.#formatarValor(contrato.valor);
      dataInicio.value = contrato.data_inicio;
      dataFim.min = contrato.data_inicio;
      ajuda.textContent =
        "Mudar a frequência, a data de término ou a situação refaz as visitas futuras que ainda não aconteceram. " +
        "Visitas já realizadas ou pagas não são alteradas.";
    } else {
      dataInicio.value = new Date().toLocaleDateString("sv-SE"); // hoje, no formato AAAA-MM-DD
      dataFim.min = dataInicio.value;
      ajuda.textContent = "Ao salvar, o sistema cria automaticamente as visitas dos próximos 3 meses.";
    }
  }

  mensagemSalvo(resposta, eraEdicao) {
    if (eraEdicao) return "Contrato atualizado.";
    const n = resposta.visitas_geradas;
    return n > 0 ? `Contrato criado! ${visitas(n)} agendadas.` : "Contrato criado. Nenhuma visita nos próximos 3 meses.";
  }

  // ------------------------------------------------------------------
  // Gerar visitas
  // ------------------------------------------------------------------

  async aoAcaoPersonalizada(acao, contrato) {
    if (acao !== "gerar") return;

    try {
      const { geradas } = await this.api.post(`${this.recurso}/${contrato.id_contrato}/visitas`, {});
      Notificacao.sucesso(
        geradas > 0 ? `${visitas(geradas)} criadas.` : "As visitas dos próximos 3 meses já estavam geradas.",
      );
      await this.carregar();
    } catch (erro) {
      Notificacao.erro(erro.message);
    }
  }

  // ------------------------------------------------------------------
  // Lista de cartões
  // ------------------------------------------------------------------

  rotuloItem(contrato) {
    return `${contrato.cliente_nome} - ${contrato.servico_tipo}`;
  }

  textoBusca(c) {
    return [c.cliente_nome, c.servico_tipo, FREQUENCIAS[c.frequencia]].join(" ");
  }

  criarCartao(c) {
    const termino = c.data_fim ? `Até ${Formatador.data(c.data_fim)}` : "Sem data de término";
    const proxima = c.proxima_visita
      ? `Próxima visita: ${Formatador.dataHora(c.proxima_visita)}`
      : c.ativo
        ? "Nenhuma visita agendada"
        : null;

    return elemento(
      "article",
      { class: `cartao${c.ativo ? "" : " cartao--inativo"}`, "data-id": c.id_contrato },
      elemento(
        "header",
        { class: "cartao__topo" },
        elemento("span", { class: "cartao__avatar cartao__avatar--quadrado", "aria-hidden": "true" }, Icone.criar("file-text", 22)),
        elemento(
          "div",
          { class: "cartao__titulo" },
          elemento("h3", {}, c.cliente_nome),
          elemento("p", { class: "cartao__subtitulo" }, c.servico_tipo),
          elemento(
            "div",
            { class: "cartao__selos" },
            this.criarSelo(c),
            elemento("span", { class: "badge badge--azul" }, FREQUENCIAS[c.frequencia]),
          ),
        ),
        this.criarAcoes(c),
      ),
      elemento("p", { class: "cartao__preco" }, Formatador.moeda(c.valor), elemento("small", {}, "por visita")),
      elemento(
        "ul",
        { class: "cartao__info" },
        this.linhaInfo("repeat", `Desde ${Formatador.data(c.data_inicio)}`, termino),
        this.linhaInfo("calendar", proxima, c.visitas_agendadas > 0 ? `${visitas(c.visitas_agendadas)} agendadas` : null),
      ),
      elemento(
        "footer",
        { class: "cartao__rodape" },
        elemento(
          "button",
          { type: "button", class: "btn btn--secundario btn--pequeno", "data-acao": "gerar", disabled: !c.ativo },
          "Gerar visitas",
        ),
        elemento("button", { type: "button", class: "btn btn--secundario btn--pequeno", "data-acao": "alternar" }, c.ativo ? "Inativar" : "Ativar"),
      ),
    );
  }
}

new PaginaContratos().iniciar();
