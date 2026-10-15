"""Financeiro: a página (HTML) e a API JSON de resultados por período.

Rotas:
    GET  /financeiro                          página com o lucro por serviço
    GET  /api/financeiro?inicio=&fim=         totais do período, lucro por serviço,
                                              evolução dos últimos 6 meses e valores a receber
                                              (`fim` é exclusivo; período de até 2 anos)
"""

from flask import Blueprint, jsonify, render_template, request
from flask_login import current_user, login_required

from app.api_utils import resposta_validacao
from app.models.financeiro import Financeiro
from app.validacao import Validador

bp = Blueprint("financeiro", __name__)

MAXIMO_DIAS = 731


@bp.route("/financeiro")
@login_required
def pagina():
    return render_template("financeiro.html")


@bp.route("/api/financeiro", methods=["GET"])
@login_required
def resumo():
    (inicio, fim), erros = Validador.periodo(request.args, maximo_dias=MAXIMO_DIAS)
    if erros:
        return resposta_validacao(erros)

    dados = Financeiro.resumo(current_user.id_usuario, inicio, fim)
    dados["mensal"] = Financeiro.evolucao_mensal(current_user.id_usuario)
    itens, total = Financeiro.a_receber(current_user.id_usuario)
    dados["a_receber"] = {"total": total, "itens": itens}
    return jsonify(dados)
