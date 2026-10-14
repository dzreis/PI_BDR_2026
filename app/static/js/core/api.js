/**
 * Comunicação com a API do servidor (rotas /api/*).
 *
 * Todas as telas usam a classe `ApiClient` em vez de chamar `fetch` direto.
 * Assim o tratamento de erros, o formato JSON e o token CSRF ficam em um
 * único lugar.
 *
 * Formato dos erros que o servidor devolve:
 *   { "erro": "mensagem para o usuário", "detalhes": { "campo": "problema" } }
 */

/** Erro lançado quando a API responde com falha (ou não responde). */
export class ApiError extends Error {
  /**
   * @param {string} mensagem  Texto amigável, pronto para mostrar ao usuário.
   * @param {number} status    Código HTTP (0 = sem conexão com o servidor).
   * @param {object|null} detalhes  Erros por campo, quando houver.
   */
  constructor(mensagem, status, detalhes = null) {
    super(mensagem);
    this.name = "ApiError";
    this.status = status;
    this.detalhes = detalhes;
  }
}

/** Cliente HTTP para a API JSON do Agendô. */
export class ApiClient {
  #base;

  /** @param {string} base  Prefixo das rotas da API. */
  constructor(base = "/api") {
    this.#base = base;
  }

  /** Lê o token CSRF que o servidor colocou no <head> da página. */
  static #tokenCsrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content ?? "";
  }

  /**
   * Faz a requisição e devolve o JSON da resposta (ou null se vier vazia).
   * @returns {Promise<any>}
   * @throws {ApiError}
   */
  async #requisitar(metodo, caminho, corpo) {
    const opcoes = {
      method: metodo,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "X-CSRF-Token": ApiClient.#tokenCsrf(),
      },
    };

    if (corpo !== undefined) {
      opcoes.headers["Content-Type"] = "application/json";
      opcoes.body = JSON.stringify(corpo);
    }

    let resposta;
    try {
      resposta = await fetch(`${this.#base}${caminho}`, opcoes);
    } catch {
      throw new ApiError("Não foi possível conectar ao servidor. Verifique sua conexão.", 0);
    }

    // Sessão expirada: volta para a tela de login.
    if (resposta.status === 401) {
      window.location.href = "/login";
      throw new ApiError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null);

    if (!resposta.ok) {
      throw new ApiError(dados?.erro ?? "Ocorreu um erro inesperado.", resposta.status, dados?.detalhes ?? null);
    }
    return dados;
  }

  /**
   * GET com parâmetros opcionais na URL (valores vazios são ignorados).
   * Exemplo: api.get("/clientes", { busca: "ana" })  ->  /api/clientes?busca=ana
   */
  get(caminho, parametros = {}) {
    const consulta = new URLSearchParams();
    for (const [chave, valor] of Object.entries(parametros)) {
      if (valor !== null && valor !== undefined && valor !== "") {
        consulta.append(chave, valor);
      }
    }
    const texto = consulta.toString();
    return this.#requisitar("GET", texto ? `${caminho}?${texto}` : caminho);
  }

  post(caminho, corpo) {
    return this.#requisitar("POST", caminho, corpo);
  }

  put(caminho, corpo) {
    return this.#requisitar("PUT", caminho, corpo);
  }

  patch(caminho, corpo) {
    return this.#requisitar("PATCH", caminho, corpo);
  }

  delete(caminho) {
    return this.#requisitar("DELETE", caminho);
  }
}
