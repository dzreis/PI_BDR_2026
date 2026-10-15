"""Agenda: a página (HTML) e a API JSON de visitas e despesas.

Rotas:
    GET     /agenda                                página (calendário mensal e lista agrupada)
    GET     /api/visitas?inicio=&fim=              visitas do período (fim exclusivo, até 62 dias)
    POST    /api/visitas                           cria uma visita extra
    GET     /api/visitas/<id>                      uma visita, com as despesas
    PATCH   /api/visitas/<id>                      altera valor cobrado e/ou observações
    DELETE  /api/visitas/<id>                      exclui (se não for realizada/paga)
    POST    /api/visitas/<id>/realizar             AGENDADA -> REALIZADA
    POST    /api/visitas/<id>/cancelar             AGENDADA -> CANCELADA
    POST    /api/visitas/<id>/reabrir              REALIZADA/CANCELADA -> AGENDADA
    POST    /api/visitas/<id>/remarcar             REMARCADA + nova visita na data escolhida
    PUT     /api/visitas/<id>/pagamento            registra o pagamento
    DELETE  /api/visitas/<id>/pagamento            desfaz o pagamento
    GET     /api/visitas/<id>/despesas             despesas da visita
    POST    /api/visitas/<id>/despesas             lança uma despesa
    PATCH   /api/despesas/<id>                     altera uma despesa
    DELETE  /api/despesas/<id>                     exclui uma despesa
"""

from flask import Blueprint, jsonify, render_template, request
from flask_login import current_user, login_required

from app.api_utils import corpo_json, resposta_erro, resposta_validacao
from app.models.despesa import Despesa
from app.models.visita import RegraDeVisitaError, Visita
from app.validacao import Validador

bp = Blueprint("agenda", __name__)

VISITA_NAO_ENCONTRADA = "Visita não encontrada."
DESPESA_NAO_ENCONTRADA = "Despesa não encontrada."


def _visita_json(visita):
    """Visita + lista de despesas, no formato que a tela usa."""
    resposta = visita.to_dict()
    resposta["despesas"] = [d.to_dict() for d in Despesa.listar_da_visita(visita.id_visita, current_user.id_usuario)]
    return resposta


def _executar_acao(acao, *argumentos):
    """Roda uma ação do modelo e converte o resultado em resposta HTTP.

    A ação devolve a visita (ou None se não existir) e pode lançar
    `RegraDeVisitaError` (409: a situação da visita não permite).
    """
    try:
        visita = acao(*argumentos)
    except RegraDeVisitaError as erro:
        return resposta_erro(str(erro), 409)
    if visita is None:
        return resposta_erro(VISITA_NAO_ENCONTRADA, 404)
    return jsonify(_visita_json(visita))


@bp.route("/agenda")
@login_required
def pagina():
    return render_template("agenda.html")


# ----------------------------------------------------------------------
# Visitas
# ----------------------------------------------------------------------
@bp.route("/api/visitas", methods=["GET"])
@login_required
def listar():
    (inicio, fim), erros = Validador.periodo(request.args)
    if erros:
        return resposta_validacao(erros)
    visitas = Visita.listar_periodo(current_user.id_usuario, inicio, fim)
    return jsonify([visita.to_dict() for visita in visitas])


@bp.route("/api/visitas", methods=["POST"])
@login_required
def criar():
    dados, erros = Validador.visita_nova(corpo_json())
    if erros:
        return resposta_validacao(erros)
    try:
        visita = Visita.criar_avulsa(
            current_user.id_usuario, dados["id_contrato"], dados["agendamento"],
            dados["valor_cobrado"], dados["observacoes"],
        )
    except RegraDeVisitaError as erro:
        return resposta_erro(str(erro), 409)
    if visita is None:
        return resposta_validacao({"id_contrato": "Contrato não encontrado."})
    return jsonify(_visita_json(visita)), 201


@bp.route("/api/visitas/<int:id_visita>", methods=["GET"])
@login_required
def buscar(id_visita):
    visita = Visita.buscar(id_visita, current_user.id_usuario)
    if visita is None:
        return resposta_erro(VISITA_NAO_ENCONTRADA, 404)
    return jsonify(_visita_json(visita))


@bp.route("/api/visitas/<int:id_visita>", methods=["PATCH"])
@login_required
def atualizar(id_visita):
    dados, erros = Validador.visita_edicao(corpo_json())
    if erros:
        return resposta_validacao(erros)
    return _executar_acao(Visita.atualizar, id_visita, current_user.id_usuario, dados)


@bp.route("/api/visitas/<int:id_visita>", methods=["DELETE"])
@login_required
def excluir(id_visita):
    try:
        excluida = Visita.excluir(id_visita, current_user.id_usuario)
    except RegraDeVisitaError as erro:
        return resposta_erro(str(erro), 409)
    if not excluida:
        return resposta_erro(VISITA_NAO_ENCONTRADA, 404)
    return "", 204


@bp.route("/api/visitas/<int:id_visita>/realizar", methods=["POST"])
@login_required
def realizar(id_visita):
    return _executar_acao(Visita.realizar, id_visita, current_user.id_usuario)


@bp.route("/api/visitas/<int:id_visita>/cancelar", methods=["POST"])
@login_required
def cancelar(id_visita):
    return _executar_acao(Visita.cancelar, id_visita, current_user.id_usuario)


@bp.route("/api/visitas/<int:id_visita>/reabrir", methods=["POST"])
@login_required
def reabrir(id_visita):
    return _executar_acao(Visita.reabrir, id_visita, current_user.id_usuario)


@bp.route("/api/visitas/<int:id_visita>/remarcar", methods=["POST"])
@login_required
def remarcar(id_visita):
    novo_agendamento, erros = Validador.remarcacao(corpo_json())
    if erros:
        return resposta_validacao(erros)
    try:
        resultado = Visita.remarcar(id_visita, current_user.id_usuario, novo_agendamento)
    except RegraDeVisitaError as erro:
        return resposta_erro(str(erro), 409)
    if resultado is None:
        return resposta_erro(VISITA_NAO_ENCONTRADA, 404)
    original, nova = resultado
    return jsonify(original=_visita_json(original), nova=_visita_json(nova))


@bp.route("/api/visitas/<int:id_visita>/pagamento", methods=["PUT"])
@login_required
def registrar_pagamento(id_visita):
    dados, erros = Validador.pagamento(corpo_json())
    if erros:
        return resposta_validacao(erros)
    return _executar_acao(
        Visita.registrar_pagamento, id_visita, current_user.id_usuario,
        dados["data_pagamento"], dados["forma_pagamento"],
    )


@bp.route("/api/visitas/<int:id_visita>/pagamento", methods=["DELETE"])
@login_required
def remover_pagamento(id_visita):
    return _executar_acao(Visita.remover_pagamento, id_visita, current_user.id_usuario)


# ----------------------------------------------------------------------
# Despesas
# ----------------------------------------------------------------------
@bp.route("/api/visitas/<int:id_visita>/despesas", methods=["GET"])
@login_required
def listar_despesas(id_visita):
    if Visita.buscar(id_visita, current_user.id_usuario) is None:
        return resposta_erro(VISITA_NAO_ENCONTRADA, 404)
    despesas = Despesa.listar_da_visita(id_visita, current_user.id_usuario)
    return jsonify([d.to_dict() for d in despesas])


@bp.route("/api/visitas/<int:id_visita>/despesas", methods=["POST"])
@login_required
def criar_despesa(id_visita):
    dados, erros = Validador.despesa(corpo_json())
    if erros:
        return resposta_validacao(erros)
    try:
        despesa = Despesa.criar(id_visita, current_user.id_usuario, dados)
    except RegraDeVisitaError as erro:
        return resposta_erro(str(erro), 409)
    if despesa is None:
        return resposta_erro(VISITA_NAO_ENCONTRADA, 404)
    return jsonify(despesa.to_dict()), 201


@bp.route("/api/despesas/<int:id_despesa>", methods=["PATCH"])
@login_required
def atualizar_despesa(id_despesa):
    dados, erros = Validador.despesa(corpo_json(), parcial=True)
    if erros:
        return resposta_validacao(erros)
    despesa = Despesa.atualizar(id_despesa, current_user.id_usuario, dados)
    if despesa is None:
        return resposta_erro(DESPESA_NAO_ENCONTRADA, 404)
    return jsonify(despesa.to_dict())


@bp.route("/api/despesas/<int:id_despesa>", methods=["DELETE"])
@login_required
def excluir_despesa(id_despesa):
    if not Despesa.excluir(id_despesa, current_user.id_usuario):
        return resposta_erro(DESPESA_NAO_ENCONTRADA, 404)
    return "", 204
