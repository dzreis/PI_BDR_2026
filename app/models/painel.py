"""Painel inicial: um resumo do dia e do mês reunido numa só consulta da API.

Monta o que a página inicial mostra: visitas de hoje e dos próximos dias,
visitas atrasadas, valores a receber e o resultado do mês.
"""

from datetime import datetime, timedelta

from app.db import Database
from app.models.financeiro import Financeiro
from app.models.visita import Visita

DIAS_A_FRENTE = 7  # janela de "próximas visitas"


class Painel:
    @classmethod
    def resumo(cls, id_usuario, agora=None):
        """Dados do painel do usuário.

        :param agora: instante de referência (só para testes).
        """
        agora = agora or datetime.now()
        hoje = agora.date()
        primeiro_do_mes = hoje.replace(day=1)
        proximo_mes = (primeiro_do_mes + timedelta(days=32)).replace(day=1)

        # Hoje e próximos dias (visitas que ainda valem: agendadas ou já realizadas hoje).
        visitas = Visita.listar_periodo(id_usuario, hoje, hoje + timedelta(days=DIAS_A_FRENTE + 1))
        visitas = [v for v in visitas if v.status in ("AGENDADA", "REALIZADA")]
        hoje_iso = hoje.isoformat()
        de_hoje = [v for v in visitas if v.agendamento.date() == hoje]
        proximas = [v for v in visitas if v.agendamento.date() > hoje and v.status == "AGENDADA"]

        atrasadas = Visita.listar_atrasadas(id_usuario, agora)
        a_receber, total_a_receber = Financeiro.a_receber(id_usuario)
        mes = Financeiro.resumo(id_usuario, primeiro_do_mes, proximo_mes)["totais"]

        contagens = Database.consultar_um(
            "SELECT "
            "(SELECT COUNT(*) FROM cliente WHERE id_usuario = %s AND ativo = 1) AS clientes, "
            "(SELECT COUNT(*) FROM contrato c JOIN cliente cl ON cl.id_cliente = c.id_cliente "
            "  WHERE cl.id_usuario = %s AND c.ativo = 1) AS contratos",
            (id_usuario, id_usuario),
        )

        return {
            "hoje": hoje_iso,
            "clientes_ativos": contagens["clientes"],
            "contratos_ativos": contagens["contratos"],
            "visitas_hoje": [v.to_dict() for v in de_hoje],
            "proximas": [v.to_dict() for v in proximas[:8]],
            "atrasadas": [v.to_dict() for v in atrasadas[:10]],
            "total_atrasadas": len(atrasadas),
            "a_receber": a_receber[-10:][::-1],  # as 10 mais recentes primeiro
            "total_a_receber": total_a_receber,
            "qtd_a_receber": len(a_receber),
            "mes": mes,
        }
