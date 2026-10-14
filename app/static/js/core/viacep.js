/**
 * Consulta de endereço pelo CEP usando o serviço gratuito ViaCEP
 * (https://viacep.com.br). A consulta é feita direto pelo navegador.
 */
export class ViaCep {
  static #TEMPO_LIMITE_MS = 6000;

  /**
   * Busca o endereço de um CEP.
   *
   * @param {string} cep  Com ou sem hífen.
   * @returns {Promise<{logradouro: string, bairro: string, cidade: string, uf: string}|null>}
   *   O endereço, ou `null` se o CEP não existir.
   * @throws {Error} Se o serviço estiver fora do ar ou demorar demais.
   */
  static async buscar(cep) {
    const digitos = String(cep ?? "").replace(/\D/g, "");
    if (digitos.length !== 8) return null;

    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, {
      signal: AbortSignal.timeout(ViaCep.#TEMPO_LIMITE_MS),
    });
    if (!resposta.ok) throw new Error("ViaCEP indisponível.");

    const dados = await resposta.json();
    if (dados.erro) return null; // CEP com formato válido, mas que não existe

    return {
      logradouro: dados.logradouro ?? "",
      bairro: dados.bairro ?? "",
      cidade: dados.localidade ?? "",
      uf: dados.uf ?? "",
    };
  }
}
