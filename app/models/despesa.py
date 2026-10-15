"""Modelo Despesa: gastos de uma visita, como material e combustível (tabela `despesa`).

A despesa não tem `id_usuario`: o dono é descoberto pelo caminho
despesa -> visita -> contrato -> cliente. Toda consulta filtra pelo usuário.
Despesas só podem ser lançadas em visitas agendadas ou realizadas.
"""

from app.db import Database
from app.models.base import ModeloBase
from app.models.visita import RegraDeVisitaError, Visita


class Despesa(ModeloBase):
    """Uma linha da tabela `despesa`."""

    TABELA = "despesa"
    CHAVE = "id_despesa"
    CAMPOS = ("id_despesa", "id_visita", "descricao", "valor", "data_despesa")

    _SELECT = """
        SELECT d.id_despesa, d.id_visita, d.descricao, d.valor, d.data_despesa
          FROM despesa d
          JOIN visita v ON v.id_visita = d.id_visita
          JOIN contrato c ON c.id_contrato = v.id_contrato
          JOIN cliente cl ON cl.id_cliente = c.id_cliente
         WHERE cl.id_usuario = %s
    """

    @classmethod
    def listar_da_visita(cls, id_visita, id_usuario):
        """Despesas de uma visita do usuário (lista vazia se a visita não for dele)."""
        linhas = Database.consultar(
            cls._SELECT + " AND d.id_visita = %s ORDER BY d.data_despesa, d.id_despesa",
            (id_usuario, id_visita),
        )
        return [cls._de_linha(linha) for linha in linhas]

    @classmethod
    def buscar(cls, id_despesa, id_usuario):
        linha = Database.consultar_um(cls._SELECT + " AND d.id_despesa = %s", (id_usuario, id_despesa))
        return cls._de_linha(linha)

    @classmethod
    def criar(cls, id_visita, id_usuario, dados):
        """Lança uma despesa.

        :returns: a despesa, ou None se a visita não existir.
        :raises RegraDeVisitaError: visita cancelada ou remarcada.
        """
        visita = Visita.buscar(id_visita, id_usuario)
        if visita is None:
            return None
        if visita.status not in ("AGENDADA", "REALIZADA"):
            raise RegraDeVisitaError("Só é possível lançar despesas em visitas agendadas ou realizadas.")
        novo_id = Database.inserir(
            "INSERT INTO despesa (id_visita, descricao, valor, data_despesa) VALUES (%s, %s, %s, %s)",
            (id_visita, dados["descricao"], dados["valor"], dados["data_despesa"]),
        )
        return cls.buscar(novo_id, id_usuario)

    @classmethod
    def atualizar(cls, id_despesa, id_usuario, dados):
        if cls.buscar(id_despesa, id_usuario) is None:
            return None
        colunas = [c for c in ("descricao", "valor", "data_despesa") if c in dados]
        if colunas:
            Database.executar(
                f"UPDATE despesa SET {', '.join(c + ' = %s' for c in colunas)} WHERE id_despesa = %s",
                [dados[c] for c in colunas] + [id_despesa],
            )
        return cls.buscar(id_despesa, id_usuario)

    @classmethod
    def excluir(cls, id_despesa, id_usuario):
        if cls.buscar(id_despesa, id_usuario) is None:
            return False
        Database.executar("DELETE FROM despesa WHERE id_despesa = %s", (id_despesa,))
        return True
