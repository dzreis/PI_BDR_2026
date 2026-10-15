"""Contratos: a página (HTML) e a API JSON (/api/contratos).

Rotas:
    GET     /contratos                       página com os cartões
    GET     /api/contratos                   lista os contratos do usuário
    POST    /api/contratos                   cria o contrato e as visitas dos próximos 3 meses
    GET     /api/contratos/<id>              busca um contrato
    PUT     /api/contratos/<id>              altera valor, frequência, término e situação
    PATCH   /api/contratos/<id>              altera só os campos enviados (ex.: inativar)
    DELETE  /api/contratos/<id>              exclui (se não tiver histórico de visitas)
    POST    /api/contratos/<id>/visitas      gera as visitas que faltam nos próximos 3 meses
"""

from flask import Blueprint, jsonify, render_template, request
from flask_login import current_user, login_required

from app.api_utils import corpo_json, resposta_erro, resposta_validacao
from app.models.base import RegistroDuplicadoError, RegistroEmUsoError
from app.models.cliente import Cliente
from app.models.contrato import Contrato, ContratoInativoError
from app.models.servico import Servico
from app.validacao import Validador

bp = Blueprint("contratos", __name__)

NAO_ENCONTRADO = "Contrato não encontrado."


def _conferir_vinculos(dados):
    """Garante que o cliente e o serviço escolhidos existem, são do usuário e estão ativos.

    Devolve um dicionário de erros {campo: mensagem} (vazio se estiver tudo certo).
    """
    erros = {}
    verificacoes = (
        ("id_cliente", Cliente, "Cliente não encontrado.", "Este cliente está inativo."),
        ("id_servico", Servico, "Serviço não encontrado.", "Este serviço está inativo."),
    )
    for campo, modelo, msg_inexistente, msg_inativo in verificacoes:
        if campo not in dados:
            continue
        registro = modelo.buscar(dados[campo], current_user.id_usuario)
        if registro is None:
            erros[campo] = msg_inexistente
        elif not registro.ativo:
            erros[campo] = msg_inativo
    return erros


@bp.route("/contratos")
@login_required
def pagina():
    """Página de contratos (os dados chegam depois, pela API)."""
    return render_template("contratos.html")


@bp.route("/api/contratos", methods=["GET"])
@login_required
def listar():
    contratos = Contrato.listar(current_user.id_usuario)
    return jsonify([contrato.to_dict() for contrato in contratos])


@bp.route("/api/contratos", methods=["POST"])
@login_required
def criar():
    dados, erros = Validador.contrato(corpo_json())
    for campo, mensagem in _conferir_vinculos(dados).items():
        erros[campo] = mensagem
    if erros:
        return resposta_validacao(erros)

    horario = dados.pop("horario")
    contrato, geradas = Contrato.criar(current_user.id_usuario, dados, horario)

    resposta = contrato.to_dict()
    resposta["visitas_geradas"] = geradas
    return jsonify(resposta), 201


@bp.route("/api/contratos/<int:id_contrato>", methods=["GET"])
@login_required
def buscar(id_contrato):
    contrato = Contrato.buscar(id_contrato, current_user.id_usuario)
    if contrato is None:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return jsonify(contrato.to_dict())


@bp.route("/api/contratos/<int:id_contrato>", methods=["PUT", "PATCH"])
@login_required
def atualizar(id_contrato):
    existente = Contrato.buscar(id_contrato, current_user.id_usuario)
    if existente is None:
        return resposta_erro(NAO_ENCONTRADO, 404)

    parcial = request.method == "PATCH"
    dados, erros = Validador.contrato(corpo_json(), existente=existente, parcial=parcial)
    if erros:
        return resposta_validacao(erros)

    contrato = Contrato.atualizar(id_contrato, current_user.id_usuario, dados)
    return jsonify(contrato.to_dict())


@bp.route("/api/contratos/<int:id_contrato>", methods=["DELETE"])
@login_required
def excluir(id_contrato):
    try:
        excluido = Contrato.excluir(id_contrato, current_user.id_usuario)
    except RegistroEmUsoError:
        return resposta_erro(
            "Este contrato tem histórico de visitas e não pode ser excluído. "
            "Inative-o para encerrá-lo.",
            409,
        )
    if not excluido:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return "", 204


@bp.route("/api/contratos/<int:id_contrato>/visitas", methods=["POST"])
@login_required
def gerar_visitas(id_contrato):
    """Cria as visitas que faltam nos próximos 3 meses (pode ser chamado sem medo de duplicar)."""
    try:
        geradas = Contrato.gerar_visitas(id_contrato, current_user.id_usuario)
    except ContratoInativoError:
        return resposta_erro("Contrato inativo: ative-o para gerar visitas.", 409)
    except RegistroDuplicadoError:
        return resposta_erro("Algumas visitas já existem. Atualize a página e tente de novo.", 409)

    if geradas is None:
        return resposta_erro(NAO_ENCONTRADO, 404)
    return jsonify(geradas=geradas)
