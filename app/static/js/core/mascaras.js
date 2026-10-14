/**
 * Máscaras de digitação: formatam o texto enquanto a pessoa digita.
 *   "1999998888" -> "(19) 99999-8888"
 *   "13010000"   -> "13010-000"
 * O servidor guarda só os dígitos; a máscara existe apenas para facilitar a leitura.
 */
export class Mascara {
  static #digitos(texto) {
    return String(texto ?? "").replace(/\D/g, "");
  }

  /** Telefone fixo (10 dígitos) ou celular (11 dígitos), formatado aos poucos. */
  static telefone(valor) {
    const d = Mascara.#digitos(valor).slice(0, 11);
    if (d.length === 0) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  /** CEP no formato 00000-000. */
  static cep(valor) {
    const d = Mascara.#digitos(valor).slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }

  /**
   * Liga uma máscara a um campo: a cada tecla, o valor é reformatado.
   * @param {HTMLInputElement} campo
   * @param {(valor: string) => string} mascara  Ex.: Mascara.telefone
   */
  static aplicar(campo, mascara) {
    campo.addEventListener("input", () => {
      campo.value = mascara(campo.value);
    });
  }
}
