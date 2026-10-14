"""Proteção contra CSRF (Cross-Site Request Forgery).

CSRF é quando um site malicioso faz o navegador do usuário (já logado no
Agendô) enviar um POST/PUT/DELETE sem que ele perceba. A defesa é exigir um
token secreto, guardado na sessão, em toda requisição que altera dados:

* formulários HTML enviam o token em um campo oculto `csrf_token`;
* o JavaScript (`ApiClient`) envia no cabeçalho `X-CSRF-Token`.

O token é gerado uma vez por sessão e comparado com `hmac.compare_digest`
(comparação em tempo constante).
"""

import hmac
import secrets

from flask import abort, request, session

NOME_CAMPO = "csrf_token"
NOME_CABECALHO = "X-CSRF-Token"

# Métodos que apenas leem dados e, portanto, não precisam de token.
METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


def gerar_token():
    """Devolve o token CSRF da sessão, criando-o na primeira vez."""
    if NOME_CAMPO not in session:
        session[NOME_CAMPO] = secrets.token_hex(32)
    return session[NOME_CAMPO]


def validar_csrf():
    """Confere o token em toda requisição que altera dados (before_request)."""
    if request.method in METODOS_SEGUROS:
        return

    esperado = session.get(NOME_CAMPO, "")
    recebido = request.headers.get(NOME_CABECALHO) or request.form.get(NOME_CAMPO, "")

    if not esperado or not hmac.compare_digest(esperado, recebido):
        abort(400)
