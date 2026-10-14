"""Clientes: a página (HTML) e a API JSON (/api/clientes).

Rotas:
    GET     /clientes             página com os cartões
    GET     /api/clientes         lista os clientes do usuário
    POST    /api/clientes         cria um cliente
    GET     /api/clientes/<id>    busca um cliente
    PUT     /api/clientes/<id>    altera todos os dados
    PATCH   /api/clientes/<id>    altera só os campos enviados (ex.: inativar)
    DELETE  /api/clientes/<id>    exclui (se não tiver contratos)
"""

from flask import Blueprint, jsonify, render_template, request
from flask_login import current_user, login_required

from app.api_utils import corpo_json, resposta_erro, resposta_validacao
from app.models.base import RegistroEmUsoError
from app.models.cliente import Cliente
from app.validacao import Validador

bp = Blueprint("clientes", __name__)

NAO_ENCONTRADO = "Cliente não encontrado."


@bp.route("/clientes")
@login_required
def pagina():
    """Página de clientes (os dados chegam depois, pela API)."""
    return render_template("clientes.html")


@bp.route("/api/clientes", methods=["GET"])
@login_required
def listar():
    clientes = Cliente.listar(current_user.id_usuario)
    return jsonify([cliente.to_dict() for cliente in clientes])


@bp.route("/api/clientes", methods=["POST"])
@login_required
def criar():
    dados, erros = Validador.cliente(corpo_json())
    if erros:
        return resposta_validacao(erros)

    cliente = Cliente.criar(current_user.id_usuario, dados)
    return jsonify(cliente.to_dict()), 201


@bp.route("/api/clientes/<int:id_cliente>", methods=["GET"])
@login_required
def buscar(id_cliente):
    cliente = Cliente.buscar(id_cliente, current_user.id_usuario)
    if cliente is None:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return jsonify(cliente.to_dict())


@bp.route("/api/clientes/<int:id_cliente>", methods=["PUT", "PATCH"])
@login_required
def atualizar(id_cliente):
    parcial = request.method == "PATCH"
    dados, erros = Validador.cliente(corpo_json(), parcial=parcial)
    if erros:
        return resposta_validacao(erros)

    cliente = Cliente.atualizar(id_cliente, current_user.id_usuario, dados)
    if cliente is None:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return jsonify(cliente.to_dict())


@bp.route("/api/clientes/<int:id_cliente>", methods=["DELETE"])
@login_required
def excluir(id_cliente):
    try:
        excluido = Cliente.excluir(id_cliente, current_user.id_usuario)
    except RegistroEmUsoError:
        return resposta_erro(
            "Este cliente possui contratos e não pode ser excluído. "
            "Inative-o para tirá-lo da lista.",
            409,
        )
    if not excluido:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return "", 204
