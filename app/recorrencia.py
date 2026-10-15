"""Regra de recorrência: em quais datas as visitas de um contrato acontecem.

Esta é a "inteligência" da agenda. O módulo não conhece banco de dados nem
Flask: recebe datas e devolve datas, o que o torna simples de entender e de
testar.

Como as datas são calculadas
----------------------------
Toda recorrência é ancorada na `data_inicio` do contrato:

* SEMANAL    -> a cada 7 dias   (início, início+7, início+14, ...)
* QUINZENAL  -> a cada 14 dias
* MENSAL     -> no mesmo dia do mês do início. Se o mês não tem esse dia
                (início em 31/01), usa o último dia do mês (28/02, 31/03...).

Janela de geração
-----------------
O sistema não cria visitas "para sempre": cria as dos **próximos 3 meses**.
A janela começa no maior valor entre a data de início do contrato e hoje (não
se criam visitas no passado) e termina 3 meses depois, ou na data de término
do contrato, o que vier primeiro.
"""

import calendar
from datetime import date, time, timedelta

# Horário usado quando a pessoa não informa um (pode ser trocado em cada visita).
HORARIO_PADRAO = time(8, 0)


class Recorrencia:
    """Cálculo das datas das visitas (só métodos estáticos/de classe)."""

    MESES_A_FRENTE = 3
    FREQUENCIAS = ("SEMANAL", "QUINZENAL", "MENSAL")
    _PASSO_EM_DIAS = {"SEMANAL": 7, "QUINZENAL": 14}

    @staticmethod
    def somar_meses(data, meses, dia):
        """Soma `meses` a `data` usando o dia `dia`, ajustado ao tamanho do mês.

        somar_meses(date(2026, 1, 31), 1, 31) -> 2026-02-28
        """
        indice = data.year * 12 + (data.month - 1) + meses
        ano, mes = divmod(indice, 12)
        mes += 1
        ultimo_dia = calendar.monthrange(ano, mes)[1]
        return date(ano, mes, min(dia, ultimo_dia))

    @classmethod
    def datas(cls, frequencia, inicio, de, ate):
        """Datas de visita entre `de` e `ate` (inclusive), ancoradas em `inicio`.

        Nunca devolve datas anteriores a `inicio`.
        """
        if frequencia not in cls.FREQUENCIAS:
            raise ValueError(f"Frequência desconhecida: {frequencia}")

        de = max(de, inicio)
        if ate < de:
            return []

        if frequencia in cls._PASSO_EM_DIAS:
            passo = cls._PASSO_EM_DIAS[frequencia]
            dias_percorridos = (de - inicio).days
            primeiro_indice = -(-dias_percorridos // passo)  # divisão arredondada para cima
            atual = inicio + timedelta(days=primeiro_indice * passo)
            resultado = []
            while atual <= ate:
                resultado.append(atual)
                atual += timedelta(days=passo)
            return resultado

        # MENSAL: procura o primeiro mês cuja data cai a partir de `de`
        meses = max((de.year - inicio.year) * 12 + (de.month - inicio.month), 0)
        atual = cls.somar_meses(inicio, meses, inicio.day)
        while atual < de:
            meses += 1
            atual = cls.somar_meses(inicio, meses, inicio.day)

        resultado = []
        while atual <= ate:
            resultado.append(atual)
            meses += 1
            atual = cls.somar_meses(inicio, meses, inicio.day)
        return resultado

    @classmethod
    def datas_da_janela(cls, frequencia, inicio, fim, hoje):
        """Datas a gerar agora: a partir de hoje (ou do início) pelos próximos 3 meses.

        :param fim: data de término do contrato (None = sem término).
        """
        comeco = max(inicio, hoje)
        limite = cls.somar_meses(comeco, cls.MESES_A_FRENTE, comeco.day)
        if fim is not None:
            limite = min(limite, fim)
        return cls.datas(frequencia, inicio, comeco, limite)
