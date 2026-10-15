"""Página inicial (painel) do usuário logado.

Rotas:
    GET  /            página do painel (os números chegam pela API)
    GET  /api/painel  resumo: visitas de hoje, próximas, atrasadas, a receber e resultado do mês
"""

from flask import Blueprint, jsonify, render_template
from flask_login import current_user, login_required

from app.models.painel import Painel

bp = Blueprint("inicio", __name__)


@bp.route("/")
@login_required
def painel():
    """Painel inicial."""
    return render_template("inicio.html")


@bp.route("/api/painel", methods=["GET"])
@login_required
def resumo():
    return jsonify(Painel.resumo(current_user.id_usuario))
