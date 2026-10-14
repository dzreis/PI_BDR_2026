"""Modelo Usuario: dono do negócio que faz login no sistema (tabela `usuario`)."""

from flask_login import UserMixin
from pymysql.err import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from app.db import Database

# Hash de uma senha qualquer. Quando o e-mail não existe, comparamos a senha
# digitada com ele só para gastar o mesmo tempo de um login real. Sem isso,
# um atacante poderia descobrir quais e-mails estão cadastrados medindo a
# demora da resposta.
_HASH_FALSO = generate_password_hash("senha-falsa-para-igualar-tempo")

_COLUNAS = "id_usuario, nome, email, senha_hash, data_criacao"


class EmailJaCadastradoError(Exception):
    """Lançada ao tentar cadastrar um e-mail que já existe."""


class Usuario(UserMixin):
    """Representa uma linha da tabela `usuario`.

    Herda de `UserMixin` (Flask-Login), que já fornece `is_authenticated`,
    `is_active` etc. A senha nunca é guardada em texto puro: só o hash.
    """

    def __init__(self, id_usuario, nome, email, senha_hash, data_criacao=None):
        self.id_usuario = id_usuario
        self.nome = nome
        self.email = email
        self.senha_hash = senha_hash
        self.data_criacao = data_criacao

    # ------------------------------------------------------------------
    # Flask-Login
    # ------------------------------------------------------------------
    def get_id(self):
        """Identificador gravado na sessão (o Flask-Login exige texto)."""
        return str(self.id_usuario)

    # ------------------------------------------------------------------
    # Comportamento
    # ------------------------------------------------------------------
    def verificar_senha(self, senha):
        """Confere a senha digitada com o hash guardado."""
        return check_password_hash(self.senha_hash, senha)

    def primeiro_nome(self):
        """Primeiro nome, usado nas saudações da interface."""
        return self.nome.split()[0]

    # ------------------------------------------------------------------
    # Consultas e gravação (acesso ao banco)
    # ------------------------------------------------------------------
    @classmethod
    def _de_linha(cls, linha):
        """Converte uma linha do banco (dicionário) em objeto Usuario."""
        return cls(**linha) if linha else None

    @classmethod
    def buscar_por_id(cls, id_usuario):
        """Busca um usuário pelo id; devolve None se não existir."""
        linha = Database.consultar_um(
            f"SELECT {_COLUNAS} FROM usuario WHERE id_usuario = %s", (id_usuario,)
        )
        return cls._de_linha(linha)

    @classmethod
    def buscar_por_email(cls, email):
        """Busca um usuário pelo e-mail; devolve None se não existir."""
        linha = Database.consultar_um(
            f"SELECT {_COLUNAS} FROM usuario WHERE email = %s", (email,)
        )
        return cls._de_linha(linha)

    @classmethod
    def autenticar(cls, email, senha):
        """Devolve o Usuario se e-mail e senha conferem; senão, None."""
        usuario = cls.buscar_por_email(email)
        if usuario is None:
            check_password_hash(_HASH_FALSO, senha)  # igualar o tempo de resposta
            return None
        return usuario if usuario.verificar_senha(senha) else None

    @classmethod
    def criar(cls, nome, email, senha):
        """Cadastra um novo usuário e o devolve já com o id gerado.

        Lança `EmailJaCadastradoError` se o e-mail já existir (a restrição
        UNIQUE do banco garante isso mesmo se dois cadastros chegarem juntos).
        """
        senha_hash = generate_password_hash(senha)
        try:
            id_usuario = Database.inserir(
                "INSERT INTO usuario (nome, email, senha_hash) VALUES (%s, %s, %s)",
                (nome, email, senha_hash),
            )
        except IntegrityError as erro:
            # 1062 = "Duplicate entry" (violação de UNIQUE)
            if erro.args and erro.args[0] == 1062:
                raise EmailJaCadastradoError(email) from erro
            raise
        return cls.buscar_por_id(id_usuario)
