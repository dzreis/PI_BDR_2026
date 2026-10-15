"""Popula o banco com dados de EXEMPLO para demonstrar o sistema.

Cria um usuário de demonstração com clientes, serviços, contratos, visitas
passadas (realizadas, pagas, a receber, canceladas), despesas e as visitas
futuras dos próximos 3 meses. Serve para ver o calendário, o painel e o
financeiro já preenchidos, sem cadastrar tudo na mão.

Como usar (na pasta do projeto, com o ambiente virtual ativo e o banco criado):

    python database/dados_exemplo.py

Login criado:  demo@agendo.com  /  senha  demo12345

Pode ser executado uma única vez (se o usuário de demonstração já existir, o
script avisa e não faz nada). Os dados são gerados em torno da data de hoje.
"""

import os
import random
import sys
from datetime import date, datetime, time, timedelta

# Permite rodar o arquivo direto (python database/dados_exemplo.py).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import criar_app  # noqa: E402
from app.db import Database  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.contrato import Contrato  # noqa: E402
from app.models.servico import Servico  # noqa: E402
from app.models.usuario import EmailJaCadastradoError, Usuario  # noqa: E402
from app.recorrencia import Recorrencia  # noqa: E402

EMAIL = "demo@agendo.com"
SENHA = "demo12345"

CLIENTES = [
    ("Ana Beatriz Souza", "19991230001", "Rua das Flores", "120", "Jardim Primavera"),
    ("Carlos Eduardo Lima", "19991230002", "Av. Brasil", "455", "Centro"),
    ("Mariana Costa", "19991230003", "Rua Sete de Setembro", "89", "Vila Nova"),
    ("Roberto Almeida", "19991230004", "Rua das Acácias", "301", "Jardim Europa"),
    ("Fernanda Rocha", "19991230005", "Alameda dos Ipês", "58", "Parque Verde"),
    ("Paulo Henrique Dias", "19991230006", "Rua XV de Novembro", "770", "Centro"),
]

# (tipo, descricao, preco padrão, duração em dias)
SERVICOS = [
    ("Jardinagem", "Corte de grama, poda e adubação", "150.00", 1),
    ("Limpeza de piscina", "Tratamento da água e aspiração", "220.00", 1),
    ("Manicure e pedicure", "Atendimento em domicílio", "90.00", 1),
]

# (índice do cliente, índice do serviço, valor, frequência, dias atrás em que começou, horário)
CONTRATOS = [
    (0, 0, "150.00", "SEMANAL", 80, time(9, 0)),
    (1, 0, "180.00", "QUINZENAL", 85, time(14, 0)),
    (2, 2, "90.00", "SEMANAL", 70, time(10, 30)),
    (3, 1, "220.00", "SEMANAL", 75, time(8, 0)),
    (4, 2, "100.00", "QUINZENAL", 60, time(16, 0)),
    (5, 1, "250.00", "MENSAL", 90, time(11, 0)),
]

DESPESAS = [("Adubo", 25), ("Combustível", 18), ("Cloro e produtos", 40), ("Material", 15), ("Estacionamento", 8)]
FORMAS = ["PIX", "PIX", "DINHEIRO", "NOTA FISCAL"]


def criar_historico(contrato, horario, aleatorio, hoje):
    """Visitas de ontem para trás: a maioria realizada e paga, algumas pendentes ou canceladas."""
    datas = Recorrencia.datas(contrato.frequencia, contrato.data_inicio, contrato.data_inicio, hoje - timedelta(days=1))
    for dia in datas:
        sorteio = aleatorio.random()
        recente = (hoje - dia).days <= 14
        agendamento = datetime.combine(dia, horario)
        if sorteio < 0.08:
            status, pago = "CANCELADA", None
        elif recente and sorteio < 0.6:
            status, pago = "REALIZADA", None  # realizada há pouco e ainda não paga
        else:
            status, pago = "REALIZADA", dia + timedelta(days=aleatorio.randint(0, 3))
        if pago and pago > hoje:
            pago = hoje

        id_visita = Database.inserir(
            "INSERT INTO visita (id_contrato, agendamento, status, valor_cobrado, data_pagamento, forma_pagamento) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (contrato.id_contrato, agendamento, status, contrato.valor, pago, aleatorio.choice(FORMAS) if pago else None),
        )
        if status == "REALIZADA" and aleatorio.random() < 0.5:
            descricao, valor = aleatorio.choice(DESPESAS)
            Database.inserir(
                "INSERT INTO despesa (id_visita, descricao, valor, data_despesa) VALUES (%s, %s, %s, %s)",
                (id_visita, descricao, valor, dia),
            )


def main():
    aleatorio = random.Random(2026)  # sempre os mesmos números
    hoje = date.today()

    with criar_app().app_context():
        try:
            usuario = Usuario.criar("Usuária Demonstração", EMAIL, SENHA)
        except EmailJaCadastradoError:
            print(f"O usuário {EMAIL} já existe: nada foi feito.")
            return

        id_usuario = usuario.id_usuario
        clientes = [
            Cliente.criar(id_usuario, {
                "nome": nome, "telefone": telefone, "logradouro": rua, "numero": numero,
                "bairro": bairro, "cidade": "Campinas", "uf": "SP",
            })
            for nome, telefone, rua, numero, bairro in CLIENTES
        ]
        servicos = [
            Servico.criar(id_usuario, {"tipo": tipo, "descricao": desc, "preco_padrao": preco, "duracao_dias": dias})
            for tipo, desc, preco, dias in SERVICOS
        ]

        total_futuras = 0
        for i_cliente, i_servico, valor, frequencia, dias_atras, horario in CONTRATOS:
            inicio = hoje - timedelta(days=dias_atras)
            contrato, futuras = Contrato.criar(id_usuario, {
                "id_cliente": clientes[i_cliente].id_cliente,
                "id_servico": servicos[i_servico].id_servico,
                "valor": valor, "frequencia": frequencia, "data_inicio": inicio, "data_fim": None,
            }, horario)
            total_futuras += futuras
            criar_historico(contrato, horario, aleatorio, hoje)

    print("Dados de exemplo criados!")
    print(f"  Login: {EMAIL}   Senha: {SENHA}")
    print(f"  {len(CLIENTES)} clientes, {len(SERVICOS)} serviços, {len(CONTRATOS)} contratos, {total_futuras} visitas futuras.")


if __name__ == "__main__":
    main()
