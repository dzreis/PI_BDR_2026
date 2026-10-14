"""Rotas de autenticação: login, cadastro e logout (páginas HTML)."""

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from app.models.usuario import EmailJaCadastradoError, Usuario
from app.validacao import Validador

bp = Blueprint("auth", __name__)


def _destino_seguro(destino):
    """Aceita apenas caminhos internos (ex.: "/clientes") no parâmetro `next`.

    Sem esse cuidado, alguém poderia mandar um link de login que, depois de
    entrar, redireciona para um site falso ("open redirect").
    """
    if destino and destino.startswith("/") and not destino.startswith("//") and "\\" not in destino:
        return destino
    return None


@bp.route("/login", methods=["GET", "POST"])
def login():
    """Tela de login."""
    if current_user.is_authenticated:
        return redirect(url_for("inicio.painel"))

    email = ""
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        senha = request.form.get("senha", "")

        usuario = Usuario.autenticar(email, senha)
        if usuario is not None:
            login_user(usuario)
            destino = _destino_seguro(request.args.get("next"))
            return redirect(destino or url_for("inicio.painel"))

        # Mensagem genérica: não revela se o e-mail existe ou não.
        flash("E-mail ou senha incorretos.", "erro")

    return render_template("auth/login.html", email=email)


@bp.route("/cadastro", methods=["GET", "POST"])
def cadastro():
    """Tela de criação de conta."""
    if current_user.is_authenticated:
        return redirect(url_for("inicio.painel"))

    nome, email = "", ""
    if request.method == "POST":
        nome = request.form.get("nome", "").strip()
        email = request.form.get("email", "").strip().lower()
        senha = request.form.get("senha", "")
        confirmacao = request.form.get("confirmacao", "")

        erros = Validador.cadastro_usuario(nome, email, senha, confirmacao)
        if not erros:
            try:
                usuario = Usuario.criar(nome, email, senha)
            except EmailJaCadastradoError:
                erros.append("Já existe uma conta com este e-mail.")
            else:
                login_user(usuario)
                flash(f"Conta criada! Bem-vindo(a) ao Agendô, {usuario.primeiro_nome()}.", "sucesso")
                return redirect(url_for("inicio.painel"))

        for erro in erros:
            flash(erro, "erro")

    return render_template("auth/cadastro.html", nome=nome, email=email)


@bp.route("/logout", methods=["POST"])
@login_required
def logout():
    """Encerra a sessão. É POST (e não GET) para que um link externo não
    consiga deslogar o usuário sem querer."""
    logout_user()
    flash("Você saiu do sistema.", "info")
    return redirect(url_for("auth.login"))
