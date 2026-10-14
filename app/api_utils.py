"""Funções de apoio para as rotas da API (/api/*).

Toda resposta de erro da API segue o mesmo formato, que o JavaScript
(`ApiClient`) já sabe ler:

    { "erro": "mensagem para o usuário", "detalhes": { "campo": "problema" } }
"""

from flask import abort, jsonify, make_response, request


def corpo_json():
    """Devolve o JSON enviado na requisição (um dicionário) ou responde erro 400."""
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        abort(make_response(jsonify(erro="Envie os dados em formato JSON."), 400))
    return dados


def resposta_erro(mensagem, status, detalhes=None):
    """Resposta de erro no formato padrão da API."""
    corpo = {"erro": mensagem}
    if detalhes:
        corpo["detalhes"] = detalhes
    return jsonify(corpo), status


def resposta_validacao(erros):
    """Erro 422: algum campo está inválido (`erros` = {campo: mensagem})."""
    return resposta_erro("Verifique os campos destacados.", 422, erros)
