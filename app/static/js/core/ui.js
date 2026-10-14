/**
 * Componentes de interface reutilizáveis (programação orientada a objetos).
 *
 *   Notificacao  -> avisos rápidos no canto da tela ("Cliente salvo!")
 *   Modal        -> janela sobre a página (usa o elemento nativo <dialog>)
 *   Confirmacao  -> pergunta "Tem certeza?" antes de uma ação perigosa
 *   Layout       -> comportamento do menu lateral e dos alertas da página
 */

/** Avisos rápidos (toasts) que somem sozinhos. */
export class Notificacao {
  /**
   * @param {string} mensagem
   * @param {"info"|"sucesso"|"erro"} tipo
   * @param {number} duracaoMs  Tempo na tela, em milissegundos.
   */
  static mostrar(mensagem, tipo = "info", duracaoMs = 4000) {
    const area = document.getElementById("toasts");
    if (!area) return;

    const toast = document.createElement("div");
    toast.className = `toast toast--${tipo}`;
    toast.setAttribute("role", tipo === "erro" ? "alert" : "status");
    toast.textContent = mensagem; // textContent: nunca interpreta HTML (evita XSS)
    area.append(toast);

    setTimeout(() => toast.remove(), duracaoMs);
  }

  static sucesso(mensagem) {
    Notificacao.mostrar(mensagem, "sucesso");
  }

  static erro(mensagem) {
    Notificacao.mostrar(mensagem, "erro", 6000);
  }
}


/**
 * Janela modal baseada em <dialog class="modal">.
 * Fecha com a tecla Esc, ao clicar fora da janela ou em qualquer botão com
 * o atributo `data-fechar-modal`.
 */
export class Modal {
  #dialogo;

  /** @param {string|HTMLDialogElement} alvo  O elemento <dialog> ou o seu id. */
  constructor(alvo) {
    this.#dialogo = typeof alvo === "string" ? document.getElementById(alvo) : alvo;
    if (!this.#dialogo) throw new Error("Modal: elemento <dialog> não encontrado.");

    // Clique no fundo escuro (o próprio <dialog>, fora do conteúdo) fecha o modal.
    this.#dialogo.addEventListener("click", (evento) => {
      if (evento.target === this.#dialogo) this.fechar();
    });

    this.#dialogo.querySelectorAll("[data-fechar-modal]").forEach((botao) => {
      botao.addEventListener("click", () => this.fechar());
    });
  }

  /** O elemento <dialog> (útil para acessar os campos de dentro). */
  get elemento() {
    return this.#dialogo;
  }

  abrir() {
    if (!this.#dialogo.open) this.#dialogo.showModal();
  }

  fechar() {
    if (this.#dialogo.open) this.#dialogo.close();
  }

  /** Executa uma função sempre que o modal for fechado (por qualquer motivo). */
  aoFechar(funcao) {
    this.#dialogo.addEventListener("close", funcao);
  }
}


/** Caixa de confirmação: `await Confirmacao.perguntar({...})` devolve true/false. */
export class Confirmacao {
  /**
   * @param {object} opcoes
   * @param {string} opcoes.titulo
   * @param {string} opcoes.mensagem
   * @param {string} [opcoes.textoConfirmar]
   * @param {boolean} [opcoes.perigo]  Botão vermelho (para exclusões).
   * @returns {Promise<boolean>}
   */
  static perguntar({ titulo, mensagem, textoConfirmar = "Confirmar", perigo = false }) {
    return new Promise((resolver) => {
      const dialogo = document.createElement("dialog");
      dialogo.className = "modal";
      dialogo.innerHTML = `
        <div class="modal__cabecalho"><h2></h2></div>
        <div class="modal__corpo"><p></p></div>
        <div class="modal__rodape">
          <button type="button" class="btn btn--secundario" data-resposta="nao">Cancelar</button>
          <button type="button" class="btn ${perigo ? "btn--perigo" : "btn--primario"}" data-resposta="sim"></button>
        </div>`;

      // Os textos entram por textContent para nunca interpretar HTML.
      dialogo.querySelector("h2").textContent = titulo;
      dialogo.querySelector("p").textContent = mensagem;
      dialogo.querySelector('[data-resposta="sim"]').textContent = textoConfirmar;

      let resposta = false;
      dialogo.addEventListener("click", (evento) => {
        const botao = evento.target.closest("[data-resposta]");
        if (botao) {
          resposta = botao.dataset.resposta === "sim";
          dialogo.close();
        } else if (evento.target === dialogo) {
          dialogo.close(); // clique no fundo = cancelar
        }
      });
      // "close" dispara em qualquer saída (botões, Esc ou clique no fundo).
      dialogo.addEventListener("close", () => {
        dialogo.remove();
        resolver(resposta);
      });

      document.body.append(dialogo);
      dialogo.showModal();
    });
  }
}


/** Comportamento comum a todas as páginas com menu lateral. */
export class Layout {
  iniciar() {
    this.#configurarMenuMobile();
    this.#configurarAlertas();
  }

  /** Em telas pequenas o menu é uma gaveta aberta pelo botão "hambúrguer". */
  #configurarMenuMobile() {
    const botao = document.getElementById("botao-menu");
    const menu = document.getElementById("sidebar");
    const fundo = document.getElementById("overlay");
    if (!botao || !menu || !fundo) return;

    const definir = (aberto) => {
      menu.classList.toggle("sidebar--aberta", aberto);
      fundo.classList.toggle("app__overlay--visivel", aberto);
      botao.setAttribute("aria-expanded", String(aberto));
    };

    botao.addEventListener("click", () => definir(!menu.classList.contains("sidebar--aberta")));
    fundo.addEventListener("click", () => definir(false));
    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") definir(false);
    });
  }

  /** Botão "×" dos alertas e sumiço automático das mensagens de sucesso. */
  #configurarAlertas() {
    document.querySelectorAll(".alerta__fechar").forEach((botao) => {
      botao.addEventListener("click", () => botao.closest(".alerta").remove());
    });

    document.querySelectorAll(".alerta--sucesso").forEach((alerta) => {
      setTimeout(() => alerta.remove(), 6000);
    });
  }
}
