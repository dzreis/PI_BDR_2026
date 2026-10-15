"""Modelo Visita: cada atendimento da agenda (tabela `visita`).

A classe tem duas responsabilidades:

1. GERAR as visitas a partir dos contratos (métodos que recebem um `cursor`
   aberto por `Database.transacao()`, para que criar o contrato e as suas
   visitas aconteça numa única transação).
2. ACOMPANHAR a agenda: listar por período, realizar, cancelar, reabrir,
   remarcar, registrar pagamento, editar e excluir.

Como o `visita` não tem `id_usuario`, o dono é descoberto pelo caminho
visita -> contrato -> cliente, e toda consulta filtra pelo usuário logado.

Ciclo de vida de uma visita
---------------------------
    AGENDADA --realizar--> REALIZADA --pagamento--> (paga)
    AGENDADA --cancelar--> CANCELADA
    AGENDADA --remarcar--> REMARCADA  (+ uma nova AGENDADA na data escolhida)
    REALIZADA / CANCELADA --reabrir--> AGENDADA   (se não houver pagamento)
"""

from datetime import date, datetime, time, timedelta

from pymysql.err import IntegrityError

from app.db import Database
from app.models.base import ModeloBase, normalizar_dinheiro
from app.recorrencia import HORARIO_PADRAO, Recorrencia

LIMITE_OBSERVACAO = 255  # tamanho da coluna `observacoes`


class RegraDeVisitaError(Exception):
    """Ação não permitida pela situação atual da visita (a mensagem é para o usuário)."""


def _formatar(momento):
    """dd/mm/aaaa HH:MM, usado nas observações automáticas."""
    return momento.strftime("%d/%m/%Y %H:%M")


def _anexar_observacao(atual, texto):
    """Junta `texto` ao fim das observações existentes, respeitando o limite da coluna."""
    junto = f"{atual} | {texto}" if atual else texto
    return junto if len(junto) <= LIMITE_OBSERVACAO else texto[:LIMITE_OBSERVACAO]


class Visita(ModeloBase):
    """Uma linha da tabela `visita`, com dados do cliente/serviço e resumo das despesas."""

    TABELA = "visita"
    CHAVE = "id_visita"
    CAMPOS = (
        "id_visita", "id_contrato", "agendamento", "status",
        "valor_cobrado", "data_pagamento", "forma_pagamento", "observacoes",
    )
    EXTRAS = (
        "id_cliente", "cliente_nome", "cliente_telefone", "servico_tipo",
        "qtd_despesas", "total_despesas",
    )

    # Consulta da agenda: visita + cliente + serviço + resumo das despesas.
    # O último %s é sempre o id do usuário (isolamento entre contas).
    _SELECT = """
        SELECT v.id_visita, v.id_contrato, v.agendamento, v.status, v.valor_cobrado,
               v.data_pagamento, v.forma_pagamento, v.observacoes,
               cl.id_cliente, cl.nome AS cliente_nome, cl.telefone AS cliente_telefone,
               s.tipo AS servico_tipo,
               (SELECT COUNT(*) FROM despesa d WHERE d.id_visita = v.id_visita) AS qtd_despesas,
               (SELECT COALESCE(SUM(d.valor), 0) FROM despesa d
                 WHERE d.id_visita = v.id_visita) AS total_despesas
          FROM visita v
          JOIN contrato c ON c.id_contrato = v.id_contrato
          JOIN cliente cl ON cl.id_cliente = c.id_cliente
          JOIN servico s ON s.id_servico = c.id_servico
         WHERE cl.id_usuario = %s
    """

    # Visitas que o sistema pode apagar/refazer sozinho: agendadas de HOJE EM DIANTE,
    # sem pagamento, sem despesas e sem observações escritas pela pessoa. Qualquer
    # outra (já realizada, cancelada, paga, de dias passados...) faz parte do
    # histórico e nunca é alterada. O %s é o início do dia de hoje.
    _CONDICAO_VISITA_ABERTA = (
        "status = 'AGENDADA' AND data_pagamento IS NULL AND observacoes IS NULL "
        "AND agendamento >= %s "
        "AND NOT EXISTS (SELECT 1 FROM despesa WHERE despesa.id_visita = visita.id_visita)"
    )

    @staticmethod
    def inicio_de_hoje():
        """Hoje às 00:00: referência de "de hoje em diante" (uma visita de hoje cujo
        horário já passou ainda pode não ter sido marcada como realizada)."""
        return datetime.combine(date.today(), time.min)

    @staticmethod
    def horario_habitual(cursor, id_contrato):
        """Horário da última visita do contrato (ou o padrão, se ainda não há visitas)."""
        cursor.execute(
            "SELECT agendamento FROM visita WHERE id_contrato = %s "
            "ORDER BY agendamento DESC LIMIT 1",
            (id_contrato,),
        )
        linha = cursor.fetchone()
        return linha["agendamento"].time() if linha else HORARIO_PADRAO

    @classmethod
    def gerar_para_contrato(cls, cursor, contrato, horario, hoje=None):
        """Cria as visitas dos próximos 3 meses que ainda não existem.

        Pode ser chamado várias vezes sem duplicar: uma data que já tem visita
        (em qualquer situação, até cancelada) é pulada.

        :param contrato: objeto com id_contrato, frequencia, data_inicio,
                         data_fim e valor.
        :param horario: `datetime.time` das visitas novas.
        :returns: quantas visitas foram criadas.
        """
        datas = Recorrencia.datas_da_janela(
            contrato.frequencia, contrato.data_inicio, contrato.data_fim, hoje or date.today()
        )
        if not datas:
            return 0

        # Datas do período que já têm visita (comparamos só o dia, ignorando a hora,
        # porque uma visita remarcada pode ter horário diferente).
        cursor.execute(
            "SELECT agendamento FROM visita "
            "WHERE id_contrato = %s AND agendamento >= %s AND agendamento < %s",
            (
                contrato.id_contrato,
                datetime.combine(datas[0], time.min),
                datetime.combine(datas[-1] + timedelta(days=1), time.min),
            ),
        )
        ocupadas = {linha["agendamento"].date() for linha in cursor.fetchall()}

        novas = [
            (contrato.id_contrato, datetime.combine(dia, horario), "AGENDADA", contrato.valor)
            for dia in datas
            if dia not in ocupadas
        ]
        if novas:
            cursor.executemany(
                "INSERT INTO visita (id_contrato, agendamento, status, valor_cobrado) "
                "VALUES (%s, %s, %s, %s)",
                novas,
            )
        return len(novas)

    @classmethod
    def remover_futuras_abertas(cls, cursor, id_contrato):
        """Apaga as visitas de hoje em diante que o sistema pode refazer (veja `_CONDICAO_VISITA_ABERTA`)."""
        cursor.execute(
            f"DELETE FROM visita WHERE id_contrato = %s AND {cls._CONDICAO_VISITA_ABERTA}",
            (id_contrato, cls.inicio_de_hoje()),
        )
        return cursor.rowcount

    @classmethod
    def atualizar_valor_futuras(cls, cursor, id_contrato, valor):
        """Aplica o novo valor do contrato às visitas de hoje em diante ainda abertas."""
        cursor.execute(
            f"UPDATE visita SET valor_cobrado = %s WHERE id_contrato = %s AND {cls._CONDICAO_VISITA_ABERTA}",
            (valor, id_contrato, cls.inicio_de_hoje()),
        )
        return cursor.rowcount

    # ------------------------------------------------------------------
    # Consultas da agenda
    # ------------------------------------------------------------------
    @classmethod
    def listar_periodo(cls, id_usuario, inicio, fim):
        """Visitas do usuário com agendamento de `inicio` (inclusive) até `fim` (exclusive).

        :param inicio, fim: objetos `date`.
        """
        linhas = Database.consultar(
            cls._SELECT + " AND v.agendamento >= %s AND v.agendamento < %s "
            "ORDER BY v.agendamento, v.id_visita",
            (
                id_usuario,
                datetime.combine(inicio, time.min),
                datetime.combine(fim, time.min),
            ),
        )
        return [cls._de_linha(linha) for linha in linhas]

    @classmethod
    def listar_atrasadas(cls, id_usuario, ate):
        """Visitas ainda AGENDADAS cujo horário já passou (falta marcá-las como realizadas).

        :param ate: `datetime` de corte (normalmente agora). Mais antigas primeiro.
        """
        linhas = Database.consultar(
            cls._SELECT + " AND v.status = 'AGENDADA' AND v.agendamento < %s "
            "ORDER BY v.agendamento, v.id_visita",
            (id_usuario, ate),
        )
        return [cls._de_linha(linha) for linha in linhas]

    @classmethod
    def buscar(cls, id_visita, id_usuario):
        """Uma visita do usuário; None se não existir (ou for de outra conta)."""
        linha = Database.consultar_um(cls._SELECT + " AND v.id_visita = %s", (id_usuario, id_visita))
        return cls._de_linha(linha)

    @property
    def paga(self):
        return self.data_pagamento is not None

    # ------------------------------------------------------------------
    # Mudança de situação
    # ------------------------------------------------------------------
    @classmethod
    def _carregar(cls, id_visita, id_usuario):
        """Visita do usuário ou None (usado no início de cada ação)."""
        return cls.buscar(id_visita, id_usuario)

    @classmethod
    def _mudar_status(cls, id_visita, id_usuario, permitidos, novo, mensagem):
        """Troca o status se o atual estiver em `permitidos`; senão lança RegraDeVisitaError."""
        visita = cls._carregar(id_visita, id_usuario)
        if visita is None:
            return None
        if visita.status not in permitidos:
            raise RegraDeVisitaError(mensagem)
        if visita.paga:
            raise RegraDeVisitaError("Remova o pagamento antes de alterar a situação desta visita.")
        Database.executar("UPDATE visita SET status = %s WHERE id_visita = %s", (novo, id_visita))
        return cls.buscar(id_visita, id_usuario)

    @classmethod
    def realizar(cls, id_visita, id_usuario):
        """AGENDADA -> REALIZADA."""
        return cls._mudar_status(
            id_visita, id_usuario, ("AGENDADA",), "REALIZADA",
            "Só visitas agendadas podem ser marcadas como realizadas.",
        )

    @classmethod
    def cancelar(cls, id_visita, id_usuario):
        """AGENDADA -> CANCELADA."""
        return cls._mudar_status(
            id_visita, id_usuario, ("AGENDADA",), "CANCELADA",
            "Só visitas agendadas podem ser canceladas.",
        )

    @classmethod
    def reabrir(cls, id_visita, id_usuario):
        """REALIZADA/CANCELADA -> AGENDADA (desfaz um engano)."""
        return cls._mudar_status(
            id_visita, id_usuario, ("REALIZADA", "CANCELADA"), "AGENDADA",
            "Só visitas realizadas ou canceladas podem ser reabertas.",
        )

    @classmethod
    def remarcar(cls, id_visita, id_usuario, novo_agendamento):
        """Marca a visita como REMARCADA e cria outra AGENDADA na nova data/hora.

        As duas ficam ligadas por uma observação ("Remarcada para..." / "Remarcada de..."),
        o que também impede o sistema de refazer a nova visita ao editar o contrato.

        :returns: (visita_original, visita_nova), ou None se a visita não existir.
        :raises RegraDeVisitaError: situação não permite, ou já existe visita nesse horário.
        """
        original = cls._carregar(id_visita, id_usuario)
        if original is None:
            return None
        if original.status != "AGENDADA":
            raise RegraDeVisitaError("Só visitas agendadas podem ser remarcadas.")
        if original.paga:
            raise RegraDeVisitaError("Remova o pagamento antes de remarcar esta visita.")
        if novo_agendamento == original.agendamento:
            raise RegraDeVisitaError("Escolha uma data ou horário diferente do atual.")

        try:
            with Database.transacao() as cursor:
                cursor.execute(
                    "UPDATE visita SET status = 'REMARCADA', observacoes = %s WHERE id_visita = %s",
                    (
                        _anexar_observacao(original.observacoes, f"Remarcada para {_formatar(novo_agendamento)}"),
                        id_visita,
                    ),
                )
                cursor.execute(
                    "INSERT INTO visita (id_contrato, agendamento, status, valor_cobrado, observacoes) "
                    "VALUES (%s, %s, 'AGENDADA', %s, %s)",
                    (
                        original.id_contrato, novo_agendamento, original.valor_cobrado,
                        f"Remarcada de {_formatar(original.agendamento)}",
                    ),
                )
                id_nova = cursor.lastrowid
        except IntegrityError as erro:
            if erro.args and erro.args[0] == 1062:
                raise RegraDeVisitaError("Já existe uma visita deste contrato nesse dia e horário.") from erro
            raise
        return cls.buscar(id_visita, id_usuario), cls.buscar(id_nova, id_usuario)

    # ------------------------------------------------------------------
    # Pagamento
    # ------------------------------------------------------------------
    @classmethod
    def registrar_pagamento(cls, id_visita, id_usuario, data_pagamento, forma_pagamento):
        """Registra (ou corrige) o pagamento de uma visita REALIZADA."""
        visita = cls._carregar(id_visita, id_usuario)
        if visita is None:
            return None
        if visita.status != "REALIZADA":
            raise RegraDeVisitaError("O pagamento só pode ser registrado em visitas realizadas.")
        Database.executar(
            "UPDATE visita SET data_pagamento = %s, forma_pagamento = %s WHERE id_visita = %s",
            (data_pagamento, forma_pagamento, id_visita),
        )
        return cls.buscar(id_visita, id_usuario)

    @classmethod
    def remover_pagamento(cls, id_visita, id_usuario):
        """Desfaz o pagamento (a visita volta a ficar "a receber")."""
        visita = cls._carregar(id_visita, id_usuario)
        if visita is None:
            return None
        Database.executar(
            "UPDATE visita SET data_pagamento = NULL, forma_pagamento = NULL WHERE id_visita = %s",
            (id_visita,),
        )
        return cls.buscar(id_visita, id_usuario)

    # ------------------------------------------------------------------
    # Editar, criar avulsa, excluir
    # ------------------------------------------------------------------
    @classmethod
    def atualizar(cls, id_visita, id_usuario, dados):
        """Altera valor cobrado e/ou observações (só as chaves presentes em `dados`)."""
        visita = cls._carregar(id_visita, id_usuario)
        if visita is None:
            return None
        if "valor_cobrado" in dados and visita.paga and (
            normalizar_dinheiro(dados["valor_cobrado"]) != normalizar_dinheiro(visita.valor_cobrado)
        ):
            raise RegraDeVisitaError("Remova o pagamento antes de mudar o valor cobrado.")

        colunas = [c for c in ("valor_cobrado", "observacoes") if c in dados]
        if colunas:
            Database.executar(
                f"UPDATE visita SET {', '.join(c + ' = %s' for c in colunas)} WHERE id_visita = %s",
                [dados[c] for c in colunas] + [id_visita],
            )
        return cls.buscar(id_visita, id_usuario)

    @classmethod
    def criar_avulsa(cls, id_usuario, id_contrato, agendamento, valor_cobrado, observacoes):
        """Cria uma visita extra (fora da recorrência) num contrato ativo do usuário.

        :returns: a visita criada, ou None se o contrato não existir.
        :raises RegraDeVisitaError: contrato inativo ou horário já ocupado.
        """
        contrato = Database.consultar_um(
            "SELECT c.id_contrato, c.valor, c.ativo FROM contrato c "
            "JOIN cliente cl ON cl.id_cliente = c.id_cliente "
            "WHERE c.id_contrato = %s AND cl.id_usuario = %s",
            (id_contrato, id_usuario),
        )
        if contrato is None:
            return None
        if not contrato["ativo"]:
            raise RegraDeVisitaError("Este contrato está inativo.")
        if valor_cobrado is None:
            valor_cobrado = contrato["valor"]
        try:
            novo_id = Database.inserir(
                "INSERT INTO visita (id_contrato, agendamento, status, valor_cobrado, observacoes) "
                "VALUES (%s, %s, 'AGENDADA', %s, %s)",
                (id_contrato, agendamento, valor_cobrado, observacoes or "Visita extra"),
            )
        except IntegrityError as erro:
            if erro.args and erro.args[0] == 1062:
                raise RegraDeVisitaError("Já existe uma visita deste contrato nesse dia e horário.") from erro
            raise
        return cls.buscar(novo_id, id_usuario)

    @classmethod
    def excluir(cls, id_visita, id_usuario):
        """Exclui a visita (e as despesas dela). Visitas realizadas ou pagas são histórico.

        :returns: False se não existir.
        :raises RegraDeVisitaError: visita realizada ou paga.
        """
        visita = cls._carregar(id_visita, id_usuario)
        if visita is None:
            return False
        if visita.status == "REALIZADA" or visita.paga:
            raise RegraDeVisitaError(
                "Visitas realizadas ou pagas fazem parte do histórico. Reabra a visita antes de excluir."
            )
        Database.executar("DELETE FROM visita WHERE id_visita = %s", (id_visita,))
        return True
