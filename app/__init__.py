"""Agendô: sistema de gestão de clientes, agenda e finanças para prestadores
de serviços recorrentes.

Este arquivo contém a "fábrica" da aplicação (`criar_app`): ela monta o Flask,
liga o banco, o login, a segurança e registra as rotas.
"""

from flask import Flask, flash, jsonify, redirect, render_template, request, url_for
from flask_login import LoginManager
from werkzeug.exceptions import HTTPException

from app.config import Config
from app.db import Database
from app.models.usuario import Usuario
from app.security import gerar_token, validar_csrf

login_manager = LoginManager()

# Mensagens amigáveis para os erros HTTP mais comuns.
MENSAGENS_ERRO = {
    400: "Requisição inválida ou sessão expirada. Recarregue a página e tente de novo.",
    403: "Você não tem permissão para acessar este conteúdo.",
    404: "A página que você procura não existe.",
    405: "Esta ação não é permitida aqui.",
    500: "Algo deu errado no servidor. Tente novamente em instantes.",
}


def criar_app(config_class=Config):
    """Cria e configura a aplicação Flask."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    Database.iniciar_app(app)
    _configurar_login(app)
    _configurar_seguranca(app)
    _configurar_templates(app)
    _registrar_blueprints(app)
    _registrar_tratadores_de_erro(app)

    return app


def _configurar_login(app):
    """Configura o Flask-Login (sessão do usuário)."""
    login_manager.init_app(app)

    @login_manager.user_loader
    def carregar_usuario(id_usuario):
        """Recupera o usuário a partir do id guardado na sessão."""
        try:
            return Usuario.buscar_por_id(int(id_usuario))
        except ValueError:
            return None

    @login_manager.unauthorized_handler
    def nao_autorizado():
        """Chamado quando alguém sem login tenta abrir uma página protegida."""
        if request.path.startswith("/api/"):
            return jsonify(erro="Sessão expirada. Faça login novamente."), 401
        flash("Faça login para acessar esta página.", "info")
        return redirect(url_for("auth.login", next=request.path))


def _configurar_seguranca(app):
    """Exige o token CSRF em toda requisição que altera dados."""
    app.before_request(validar_csrf)


def _configurar_templates(app):
    """Disponibiliza variáveis e funções para todos os templates."""

    @app.context_processor
    def variaveis_globais():
        return {"NOME_APP": app.config["NOME_APP"], "csrf_token": gerar_token}

    # Usada no menu: só mostra o link se a página já existe no sistema.
    app.jinja_env.globals["tem_rota"] = lambda endpoint: endpoint in app.view_functions


def _registrar_blueprints(app):
    """Registra as rotas de cada área do sistema.

    Ao criar uma nova área (clientes, serviços...), importe o módulo aqui e
    registre o seu `bp`.
    """
    from app.routes import agenda, auth, clientes, contratos, financeiro, inicio, servicos

    app.register_blueprint(auth.bp)
    app.register_blueprint(inicio.bp)
    app.register_blueprint(clientes.bp)
    app.register_blueprint(servicos.bp)
    app.register_blueprint(contratos.bp)
    app.register_blueprint(agenda.bp)
    app.register_blueprint(financeiro.bp)


def _registrar_tratadores_de_erro(app):
    """Erros em /api/* respondem em JSON; nas demais páginas, em HTML."""

    @app.errorhandler(HTTPException)
    def tratar_erro_http(erro):
        codigo = erro.code or 500
        mensagem = MENSAGENS_ERRO.get(codigo, erro.description)
        if request.path.startswith("/api/"):
            return jsonify(erro=mensagem), codigo
        return render_template("erro.html", codigo=codigo, mensagem=mensagem), codigo
