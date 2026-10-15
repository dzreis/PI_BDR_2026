"""Financeiro: receitas, despesas e lucro por serviço.

Não é uma tabela, e sim uma classe de CONSULTAS que cruza `visita`, `contrato`,
`servico`, `cliente` e `despesa`. Todas filtram pelo usuário logado.

Definições usadas em todo o sistema (só entram visitas REALIZADAS):

    Faturado   soma do valor cobrado nas visitas realizadas no período
    Recebido   parte do faturado que já foi paga
    A receber  faturado - recebido
    Despesas   gastos lançados nessas mesmas visitas
    Lucro      faturado - despesas        (margem = lucro / faturado)

O período vale pela DATA DA VISITA (não pela data do pagamento), então o lucro
de um serviço no mês reflete o trabalho feito naquele mês.

A agregação é feita em Python (e não com GROUP BY) para ficar fácil de ler e
dar o mesmo resultado em qualquer banco.
"""

from datetime import date, datetime, time
from decimal import Decimal

from app.db import Database
from app.models.base import normalizar_dinheiro

ZERO = Decimal("0.00")


def _inicio_do_dia(dia):
    return datetime.combine(dia, time.min)


def _como_float(valor):
    return float(normalizar_dinheiro(valor))


class _Totais:
    """Acumulador dos valores de um grupo de visitas (um serviço, um mês ou o total)."""

    def __init__(self):
        self.visitas = 0
        self.faturado = ZERO
        self.recebido = ZERO
        self.despesas = ZERO

    def somar(self, visita):
        valor = normalizar_dinheiro(visita["valor_cobrado"])
        self.visitas += 1
        self.faturado += valor
        if visita["data_pagamento"] is not None:
            self.recebido += valor
        self.despesas += normalizar_dinheiro(visita["total_despesas"])

    @property
    def a_receber(self):
        return self.faturado - self.recebido

    @property
    def lucro(self):
        return self.faturado - self.despesas

    @property
    def margem(self):
        """Lucro em % do faturado (None quando nada foi faturado)."""
        if self.faturado == 0:
            return None
        return round(float(self.lucro / self.faturado * 100), 1)

    def to_dict(self):
        return {
            "visitas": self.visitas,
            "faturado": _como_float(self.faturado),
            "recebido": _como_float(self.recebido),
            "a_receber": _como_float(self.a_receber),
            "despesas": _como_float(self.despesas),
            "lucro": _como_float(self.lucro),
            "margem": self.margem,
        }


class Financeiro:
    """Consultas financeiras do usuário."""

    _SELECT_REALIZADAS = """
        SELECT v.id_visita, v.agendamento, v.valor_cobrado, v.data_pagamento,
               cl.id_cliente, cl.nome AS cliente_nome,
               s.id_servico, s.tipo AS servico_tipo,
               (SELECT COALESCE(SUM(d.valor), 0) FROM despesa d
                 WHERE d.id_visita = v.id_visita) AS total_despesas
          FROM visita v
          JOIN contrato c ON c.id_contrato = v.id_contrato
          JOIN cliente cl ON cl.id_cliente = c.id_cliente
          JOIN servico s ON s.id_servico = c.id_servico
         WHERE cl.id_usuario = %s AND v.status = 'REALIZADA'
    """

    @classmethod
    def _realizadas(cls, id_usuario, inicio, fim):
        """Visitas realizadas de `inicio` (inclusive) a `fim` (exclusive), objetos `date`."""
        return Database.consultar(
            cls._SELECT_REALIZADAS + " AND v.agendamento >= %s AND v.agendamento < %s "
            "ORDER BY v.agendamento",
            (id_usuario, _inicio_do_dia(inicio), _inicio_do_dia(fim)),
        )

    # ------------------------------------------------------------------
    # Resumo do período e lucro por serviço
    # ------------------------------------------------------------------
    @classmethod
    def resumo(cls, id_usuario, inicio, fim):
        """Totais do período e a lista de serviços (do mais ao menos lucrativo).

        :returns: {"totais": {...}, "servicos": [{id_servico, servico_tipo, ...}]}
        """
        total = _Totais()
        por_servico = {}
        nomes = {}

        for visita in cls._realizadas(id_usuario, inicio, fim):
            total.somar(visita)
            chave = visita["id_servico"]
            nomes[chave] = visita["servico_tipo"]
            por_servico.setdefault(chave, _Totais()).somar(visita)

        servicos = []
        for chave, acumulado in por_servico.items():
            linha = {"id_servico": chave, "servico_tipo": nomes[chave]}
            linha.update(acumulado.to_dict())
            servicos.append(linha)
        servicos.sort(key=lambda s: (-s["lucro"], s["servico_tipo"]))

        return {"totais": total.to_dict(), "servicos": servicos}

    # ------------------------------------------------------------------
    # Evolução mês a mês
    # ------------------------------------------------------------------
    @classmethod
    def evolucao_mensal(cls, id_usuario, meses=6, hoje=None):
        """Faturado, despesas e lucro dos últimos `meses` meses (o atual é o último).

        Meses sem visitas aparecem zerados, para o gráfico não ter buracos.
        :returns: lista de {"mes": "AAAA-MM", faturado, despesas, lucro, ...}
        """
        hoje = hoje or date.today()
        indice_atual = hoje.year * 12 + hoje.month - 1
        inicio_indice = indice_atual - (meses - 1)

        def primeiro_dia(indice):
            ano, mes = divmod(indice, 12)
            return date(ano, mes + 1, 1)

        acumulados = {inicio_indice + i: _Totais() for i in range(meses)}
        for visita in cls._realizadas(id_usuario, primeiro_dia(inicio_indice), primeiro_dia(indice_atual + 1)):
            agendamento = visita["agendamento"]
            acumulados[agendamento.year * 12 + agendamento.month - 1].somar(visita)

        resultado = []
        for indice, acumulado in acumulados.items():
            linha = {"mes": primeiro_dia(indice).strftime("%Y-%m")}
            linha.update(acumulado.to_dict())
            resultado.append(linha)
        return resultado

    # ------------------------------------------------------------------
    # A receber (de qualquer época)
    # ------------------------------------------------------------------
    @classmethod
    def a_receber(cls, id_usuario):
        """Visitas realizadas e ainda não pagas, das mais antigas para as mais novas.

        :returns: (lista de dicionários, total em reais)
        """
        linhas = Database.consultar(
            cls._SELECT_REALIZADAS + " AND v.data_pagamento IS NULL ORDER BY v.agendamento",
            (id_usuario,),
        )
        itens, total = [], ZERO
        for linha in linhas:
            valor = normalizar_dinheiro(linha["valor_cobrado"])
            total += valor
            itens.append({
                "id_visita": linha["id_visita"],
                "agendamento": linha["agendamento"].isoformat(),
                "cliente_nome": linha["cliente_nome"],
                "servico_tipo": linha["servico_tipo"],
                "valor_cobrado": float(valor),
            })
        return itens, _como_float(total)
