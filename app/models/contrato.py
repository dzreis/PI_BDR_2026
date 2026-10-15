"""Modelo Contrato: serviço recorrente de um cliente (tabela `contrato`).

Diferente de `Cliente` e `Servico`, a tabela `contrato` não tem `id_usuario`:
o dono do contrato é descoberto pelo cliente (`cliente.id_usuario`). Por isso
todas as consultas fazem JOIN com `cliente` e filtram pelo usuário logado,
impedindo que alguém veja ou altere contratos de outra conta.

Ligação com a agenda
--------------------
* Ao CRIAR um contrato ativo, as visitas dos próximos 3 meses são geradas na
  mesma transação.
* Ao EDITAR, mudar a frequência, a data de término ou ativar/inativar refaz as
  visitas agendadas de hoje em diante; mudar o valor atualiza o valor delas.
  Visitas realizadas, canceladas, pagas, com despesas ou com observações, e as
  de dias passados, nunca são alteradas.
* Ao EXCLUIR, só é possível se não restar histórico (veja acima).
"""

from pymysql.err import IntegrityError

from app.db import Database
from app.models.base import ModeloBase, normalizar_dinheiro
from app.models.visita import Visita


class ContratoInativoError(Exception):
    """Lançada ao tentar gerar visitas para um contrato inativo."""


class Contrato(ModeloBase):
    """Uma linha da tabela `contrato`, com dados do cliente e do serviço."""

    TABELA = "contrato"
    CHAVE = "id_contrato"
    CAMPOS = (
        "id_contrato", "id_cliente", "id_servico", "valor",
        "frequencia", "data_inicio", "data_fim", "ativo",
    )
    CAMPOS_BOOLEANOS = ("ativo",)
    EXTRAS = ("cliente_nome", "servico_tipo", "total_visitas", "visitas_agendadas", "proxima_visita")

    # Campos que podem mudar depois de criado (cliente, serviço e início são fixos).
    CAMPOS_EDITAVEIS = ("valor", "frequencia", "data_fim", "ativo")

    # Consulta com os dados do cliente/serviço e um resumo das visitas.
    # Os dois primeiros %s são o início de hoje (visitas de hoje em diante); o último é o id do usuário.
    _SELECT = """
        SELECT c.id_contrato, c.id_cliente, c.id_servico, c.valor, c.frequencia,
               c.data_inicio, c.data_fim, c.ativo,
               cl.nome AS cliente_nome, s.tipo AS servico_tipo,
               (SELECT COUNT(*) FROM visita v
                 WHERE v.id_contrato = c.id_contrato) AS total_visitas,
               (SELECT COUNT(*) FROM visita v
                 WHERE v.id_contrato = c.id_contrato
                   AND v.status = 'AGENDADA' AND v.agendamento >= %s) AS visitas_agendadas,
               (SELECT MIN(v.agendamento) FROM visita v
                 WHERE v.id_contrato = c.id_contrato
                   AND v.status = 'AGENDADA' AND v.agendamento >= %s) AS proxima_visita
          FROM contrato c
          JOIN cliente cl ON cl.id_cliente = c.id_cliente
          JOIN servico s ON s.id_servico = c.id_servico
         WHERE cl.id_usuario = %s
    """

    # ------------------------------------------------------------------
    # Consultas
    # ------------------------------------------------------------------
    @classmethod
    def listar(cls, id_usuario):
        """Todos os contratos do usuário, ordenados por cliente e serviço."""
        desde = Visita.inicio_de_hoje()
        linhas = Database.consultar(
            cls._SELECT + " ORDER BY cl.nome, s.tipo, c.id_contrato",
            (desde, desde, id_usuario),
        )
        return [cls._de_linha(linha) for linha in linhas]

    @classmethod
    def buscar(cls, id_contrato, id_usuario):
        """Um contrato do usuário; None se não existir (ou for de outra conta)."""
        desde = Visita.inicio_de_hoje()
        linha = Database.consultar_um(
            cls._SELECT + " AND c.id_contrato = %s",
            (desde, desde, id_usuario, id_contrato),
        )
        return cls._de_linha(linha)

    # ------------------------------------------------------------------
    # Criar
    # ------------------------------------------------------------------
    @classmethod
    def criar(cls, id_usuario, dados, horario):
        """Cria o contrato e, se estiver ativo, as visitas dos próximos 3 meses.

        A rota já conferiu que o cliente e o serviço pertencem ao usuário.

        :param dados: id_cliente, id_servico, valor, frequencia, data_inicio,
                      data_fim e (opcional) ativo, já validados.
        :param horario: `datetime.time` das visitas geradas.
        :returns: (contrato, quantidade_de_visitas_geradas)
        """
        ativo = dados.get("ativo", True)
        try:
            with Database.transacao() as cursor:
                cursor.execute(
                    "INSERT INTO contrato "
                    "(id_cliente, id_servico, valor, frequencia, data_inicio, data_fim, ativo) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (
                        dados["id_cliente"], dados["id_servico"], dados["valor"],
                        dados["frequencia"], dados["data_inicio"], dados.get("data_fim"), ativo,
                    ),
                )
                id_contrato = cursor.lastrowid

                geradas = 0
                if ativo:
                    novo = cls(
                        id_contrato=id_contrato, valor=dados["valor"], frequencia=dados["frequencia"],
                        data_inicio=dados["data_inicio"], data_fim=dados.get("data_fim"),
                    )
                    geradas = Visita.gerar_para_contrato(cursor, novo, horario)
        except IntegrityError as erro:
            cls._traduzir_erro(erro)
        return cls.buscar(id_contrato, id_usuario), geradas

    # ------------------------------------------------------------------
    # Atualizar
    # ------------------------------------------------------------------
    @classmethod
    def atualizar(cls, id_contrato, id_usuario, dados):
        """Altera valor, frequência, término e/ou situação e ajusta as visitas de hoje em diante.

        :returns: o contrato atualizado, ou None se não existir.
        """
        atual = cls.buscar(id_contrato, id_usuario)
        if atual is None:
            return None

        colunas = [c for c in cls.CAMPOS_EDITAVEIS if c in dados]
        agenda_mudou = any(c in dados and dados[c] != getattr(atual, c) for c in ("frequencia", "data_fim", "ativo"))
        valor_mudou = "valor" in dados and normalizar_dinheiro(dados["valor"]) != normalizar_dinheiro(atual.valor)

        try:
            with Database.transacao() as cursor:
                if colunas:
                    atribuicoes = ", ".join(f"{c} = %s" for c in colunas)
                    cursor.execute(
                        f"UPDATE contrato SET {atribuicoes} WHERE id_contrato = %s",
                        [dados[c] for c in colunas] + [id_contrato],
                    )

                if valor_mudou:
                    Visita.atualizar_valor_futuras(cursor, id_contrato, dados["valor"])

                if agenda_mudou:
                    horario = Visita.horario_habitual(cursor, id_contrato)
                    Visita.remover_futuras_abertas(cursor, id_contrato)

                    novo = {c: dados.get(c, getattr(atual, c)) for c in cls.CAMPOS_EDITAVEIS}
                    if novo["ativo"]:
                        contrato = cls(
                            id_contrato=id_contrato, valor=novo["valor"], frequencia=novo["frequencia"],
                            data_inicio=atual.data_inicio, data_fim=novo["data_fim"],
                        )
                        Visita.gerar_para_contrato(cursor, contrato, horario)
        except IntegrityError as erro:
            cls._traduzir_erro(erro)
        return cls.buscar(id_contrato, id_usuario)

    # ------------------------------------------------------------------
    # Gerar visitas (renovação)
    # ------------------------------------------------------------------
    @classmethod
    def gerar_visitas(cls, id_contrato, id_usuario):
        """Cria as visitas que faltam nos próximos 3 meses (botão "Gerar visitas").

        :returns: quantas visitas foram criadas, ou None se o contrato não existir.
        :raises ContratoInativoError: se o contrato estiver inativo.
        """
        contrato = cls.buscar(id_contrato, id_usuario)
        if contrato is None:
            return None
        if not contrato.ativo:
            raise ContratoInativoError()

        try:
            with Database.transacao() as cursor:
                horario = Visita.horario_habitual(cursor, id_contrato)
                return Visita.gerar_para_contrato(cursor, contrato, horario)
        except IntegrityError as erro:
            cls._traduzir_erro(erro)

    # ------------------------------------------------------------------
    # Excluir
    # ------------------------------------------------------------------
    @classmethod
    def excluir(cls, id_contrato, id_usuario):
        """Exclui o contrato e as suas visitas agendadas de hoje em diante.

        Se sobrar histórico (visitas realizadas, pagas, com despesas ou de dias
        passados), o banco recusa a exclusão e TUDO é desfeito (as visitas voltam).

        :returns: False se o contrato não existir.
        :raises RegistroEmUsoError: se o contrato tiver histórico.
        """
        if cls.buscar(id_contrato, id_usuario) is None:
            return False

        try:
            with Database.transacao() as cursor:
                Visita.remover_futuras_abertas(cursor, id_contrato)
                cursor.execute("DELETE FROM contrato WHERE id_contrato = %s", (id_contrato,))
        except IntegrityError as erro:
            cls._traduzir_erro(erro)
        return True
