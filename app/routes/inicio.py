"""Página inicial (painel) do usuário logado.

Nesta primeira versão ela só dá as boas-vindas e mostra os "primeiros
passos". Mais adiante vira o painel com o resumo financeiro e as próximas
visitas.
"""

from flask import Blueprint, render_template
from flask_login import login_required

bp = Blueprint("inicio", __name__)


@bp.route("/")
@login_required
def painel():
    """Painel inicial."""
    return render_template("inicio.html")
