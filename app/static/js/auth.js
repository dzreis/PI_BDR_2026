/**
 * Comportamento das telas de login e de cadastro.
 * A validação de verdade acontece no servidor; aqui só melhoramos a
 * experiência (mostrar senha, avisar se a confirmação não confere, etc.).
 */

class FormularioAuth {
  #form;
  #botaoEnviar;
  #textoOriginal;

  /** @param {HTMLFormElement} form */
  constructor(form) {
    this.#form = form;
    this.#botaoEnviar = form.querySelector('button[type="submit"]');
    this.#textoOriginal = this.#botaoEnviar.textContent;
  }

  iniciar() {
    this.#ativarMostrarSenha();
    this.#ativarConfirmacaoDeSenha();
    this.#evitarEnvioDuplo();
  }

  /** Botão "Mostrar/Ocultar" ao lado dos campos de senha. */
  #ativarMostrarSenha() {
    this.#form.querySelectorAll("[data-alternar-senha]").forEach((botao) => {
      const campo = this.#form.querySelector(`#${botao.dataset.alternarSenha}`);

      botao.addEventListener("click", () => {
        const mostrar = campo.type === "password";
        campo.type = mostrar ? "text" : "password";
        botao.textContent = mostrar ? "Ocultar" : "Mostrar";
        botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
      });
    });
  }

  /** No cadastro: o campo "Confirmar senha" deve ser igual ao campo "Senha". */
  #ativarConfirmacaoDeSenha() {
    const confirmacao = this.#form.querySelector("[data-confirma]");
    if (!confirmacao) return;
    const senha = this.#form.querySelector(`#${confirmacao.dataset.confirma}`);

    const conferir = () => {
      const diferente = confirmacao.value !== "" && confirmacao.value !== senha.value;
      confirmacao.setCustomValidity(diferente ? "As senhas não conferem." : "");
    };

    senha.addEventListener("input", conferir);
    confirmacao.addEventListener("input", conferir);
  }

  /** Desativa o botão após o envio, para não criar duas contas com um clique duplo. */
  #evitarEnvioDuplo() {
    this.#form.addEventListener("submit", () => {
      this.#botaoEnviar.disabled = true;
      this.#botaoEnviar.textContent = "Aguarde...";
    });

    // Se a pessoa voltar para esta página pelo botão "voltar" do navegador,
    // o botão precisa estar liberado de novo.
    window.addEventListener("pageshow", () => {
      this.#botaoEnviar.disabled = false;
      this.#botaoEnviar.textContent = this.#textoOriginal;
    });
  }
}

document.querySelectorAll("[data-formulario-auth]").forEach((form) => {
  new FormularioAuth(form).iniciar();
});
