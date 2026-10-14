/**
 * Cria um elemento HTML de forma segura.
 *
 * Os textos passados como filhos viram "nós de texto": nunca são
 * interpretados como HTML. Isso impede que um nome como "<script>..." digitado
 * por alguém seja executado na página (ataque XSS).
 *
 * Exemplo:
 *   elemento("p", { class: "aviso", "data-id": 3 },
 *            "Olá, ", elemento("strong", {}, nome))
 *
 * @param {string} tag        Nome da tag ("div", "button"...).
 * @param {object} atributos  Atributos; valores null/undefined/false são ignorados.
 * @param {...(Node|string|null|false)} filhos  Elementos ou textos (listas são aceitas).
 * @returns {HTMLElement}
 */
export function elemento(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);

  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === "class") {
      el.className = valor;
    } else {
      el.setAttribute(chave, valor === true ? "" : valor);
    }
  }

  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(filho instanceof Node ? filho : String(filho));
  }
  return el;
}
