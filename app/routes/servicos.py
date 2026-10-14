"""Serviços: a página (HTML) e a API JSON (/api/servicos).

Rotas:
    GET     /servicos             página com os cartões
    GET     /api/servicos         lista os serviços do usuário
    POST    /api/servicos         cria um serviço
    GET     /api/servicos/<id>    busca um serviço
    PUT     /api/servicos/<id>    altera todos os dados
    PATCH   /api/servicos/<id>    altera só os campos enviados (ex.: inativar)
    DELETE  /api/servicos/<id>    exclui (se não estiver em contratos)
"""

from flask import Blueprint, jsonify, render_template, request
from flask_login import current_user, login_required

from app.api_utils import corpo_json, resposta_erro, resposta_validacao
from app.models.base import RegistroDuplicadoError, RegistroEmUsoError
from app.models.servico import Servico
from app.validacao import Validador

bp = Blueprint("servicos", __name__)

NAO_ENCONTRADO = "Serviço não encontrado."
MENSAGEM_DUPLICADO = "Já existe um serviço com este nome."


@bp.route("/servicos")
@login_required
def pagina():
    """Página de serviços (os dados chegam depois, pela API)."""
    return render_template("servicos.html")


@bp.route("/api/servicos", methods=["GET"])
@login_required
def listar():
    servicos = Servico.listar(current_user.id_usuario)
    return jsonify([servico.to_dict() for servico in servicos])


@bp.route("/api/servicos", methods=["POST"])
@login_required
def criar():
    dados, erros = Validador.servico(corpo_json())
    if erros:
        return resposta_validacao(erros)

    try:
        servico = Servico.criar(current_user.id_usuario, dados)
    except RegistroDuplicadoError:
        return resposta_erro(MENSAGEM_DUPLICADO, 409, {"tipo": MENSAGEM_DUPLICADO})
    return jsonify(servico.to_dict()), 201


@bp.route("/api/servicos/<int:id_servico>", methods=["GET"])
@login_required
def buscar(id_servico):
    servico = Servico.buscar(id_servico, current_user.id_usuario)
    if servico is None:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return jsonify(servico.to_dict())


@bp.route("/api/servicos/<int:id_servico>", methods=["PUT", "PATCH"])
@login_required
def atualizar(id_servico):
    parcial = request.method == "PATCH"
    dados, erros = Validador.servico(corpo_json(), parcial=parcial)
    if erros:
        return resposta_validacao(erros)

    try:
        servico = Servico.atualizar(id_servico, current_user.id_usuario, dados)
    except RegistroDuplicadoError:
        return resposta_erro(MENSAGEM_DUPLICADO, 409, {"tipo": MENSAGEM_DUPLICADO})
    if servico is None:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return jsonify(servico.to_dict())


@bp.route("/api/servicos/<int:id_servico>", methods=["DELETE"])
@login_required
def excluir(id_servico):
    try:
        excluido = Servico.excluir(id_servico, current_user.id_usuario)
    except RegistroEmUsoError:
        return resposta_erro(
            "Este serviço está em contratos e não pode ser excluído. "
            "Inative-o para tirá-lo da lista.",
            409,
        )
    if not excluido:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return "", 204
