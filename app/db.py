"""Acesso ao banco de dados MySQL (via PyMySQL).

A classe `Database` concentra tudo que fala com o banco. Os modelos
(`app/models/`) usam apenas estes métodos e nunca abrem conexões por conta
própria. Assim, trocar a forma de conectar mexe em um único lugar.

Todas as consultas usam parâmetros (`%s`) em vez de montar o SQL com
concatenação de texto. Isso protege contra SQL Injection.
"""

from contextlib import contextmanager

import pymysql
from flask import current_app, g
from pymysql.cursors import DictCursor


class Database:
    """Camada de acesso ao banco: uma conexão por requisição HTTP."""

    @staticmethod
    def conexao():
        """Devolve a conexão da requisição atual, criando-a se necessário.

        A conexão fica guardada em `flask.g`, que vale só durante uma
        requisição. Ao final, `fechar` é chamada automaticamente.
        """
        if "db" not in g:
            config = current_app.config
            g.db = pymysql.connect(
                host=config["DB_HOST"],
                port=config["DB_PORT"],
                user=config["DB_USER"],
                password=config["DB_PASSWORD"],
                database=config["DB_NAME"],
                charset="utf8mb4",
                cursorclass=DictCursor,  # linhas vêm como dicionários
                autocommit=False,  # nós decidimos quando confirmar (commit)
            )
        return g.db

    @staticmethod
    def fechar(erro=None):
        """Fecha a conexão ao final da requisição (registrada em `iniciar_app`)."""
        conexao = g.pop("db", None)
        if conexao is not None:
            conexao.close()

    @classmethod
    def iniciar_app(cls, app):
        """Liga o fechamento automático da conexão à aplicação Flask."""
        app.teardown_appcontext(cls.fechar)

    # ------------------------------------------------------------------
    # Leitura
    # ------------------------------------------------------------------
    @classmethod
    def consultar(cls, sql, parametros=None):
        """Executa um SELECT e devolve todas as linhas (lista de dicionários)."""
        with cls.conexao().cursor() as cursor:
            cursor.execute(sql, parametros)
            return cursor.fetchall()

    @classmethod
    def consultar_um(cls, sql, parametros=None):
        """Executa um SELECT e devolve a primeira linha (ou None se não houver)."""
        with cls.conexao().cursor() as cursor:
            cursor.execute(sql, parametros)
            return cursor.fetchone()

    # ------------------------------------------------------------------
    # Escrita
    # ------------------------------------------------------------------
    @classmethod
    def inserir(cls, sql, parametros=None):
        """Executa um INSERT e devolve o id gerado (AUTO_INCREMENT)."""
        id_gerado, _ = cls._escrever(sql, parametros)
        return id_gerado

    @classmethod
    def executar(cls, sql, parametros=None):
        """Executa um UPDATE/DELETE e devolve quantas linhas foram afetadas."""
        _, linhas_afetadas = cls._escrever(sql, parametros)
        return linhas_afetadas

    @classmethod
    @contextmanager
    def transacao(cls):
        """Agrupa vários comandos numa só transação: ou todos valem, ou nenhum.

        Uso:
            with Database.transacao() as cursor:
                cursor.execute("INSERT ...", (...))
                cursor.execute("UPDATE ...", (...))

        Se tudo correr bem, o `commit` é feito ao sair do bloco. Se qualquer
        comando lançar erro, o `rollback` desfaz tudo o que foi feito dentro do
        bloco (ex.: um contrato não fica sem as suas visitas).
        """
        conexao = cls.conexao()
        try:
            with conexao.cursor() as cursor:
                yield cursor
            conexao.commit()
        except Exception:
            conexao.rollback()
            raise

    @classmethod
    def _escrever(cls, sql, parametros):
        """Executa um comando de escrita; confirma (commit) ou desfaz (rollback)."""
        conexao = cls.conexao()
        try:
            with conexao.cursor() as cursor:
                cursor.execute(sql, parametros)
                id_gerado = cursor.lastrowid
                linhas_afetadas = cursor.rowcount
            conexao.commit()
            return id_gerado, linhas_afetadas
        except Exception:
            conexao.rollback()  # não deixa a operação pela metade
            raise
