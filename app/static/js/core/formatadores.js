/**
 * Funções de formatação para exibir dados no padrão brasileiro.
 * São só métodos estáticos: use direto, sem criar objeto.
 *   Formatador.moeda(150)            -> "R$ 150,00"
 *   Formatador.data("2026-10-14")    -> "14/10/2026"
 */
export class Formatador {
  static #moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  /** Remove tudo que não for dígito ("(19) 9999" -> "199999"). */
  static somenteDigitos(texto) {
    return String(texto ?? "").replace(/\D/g, "");
  }

  /** 1234.5 -> "R$ 1.234,50" */
  static moeda(valor) {
    return Formatador.#moeda.format(Number(valor) || 0);
  }

  /**
   * "2026-10-14" ou "2026-10-14T09:30:00" -> "14/10/2026".
   * Os números são separados à mão (sem `new Date`) para o fuso horário
   * não "empurrar" a data para o dia anterior.
   */
  static data(iso) {
    if (!iso) return "";
    const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
    return `${dia}/${mes}/${ano}`;
  }

  /** "2026-10-14T09:30:00" -> "14/10/2026 09:30". */
  static dataHora(iso) {
    if (!iso) return "";
    const hora = String(iso).slice(11, 16);
    return hora ? `${Formatador.data(iso)} ${hora}` : Formatador.data(iso);
  }

  /** "19999998888" -> "(19) 99999-8888"; aceita fixo (10 dígitos) e celular (11). */
  static telefone(valor) {
    const d = Formatador.somenteDigitos(valor);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return valor ?? "";
  }

  /** "13010000" -> "13010-000". */
  static cep(valor) {
    const d = Formatador.somenteDigitos(valor);
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (valor ?? "");
  }
}
