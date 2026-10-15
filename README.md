# Agendô

Aplicação web para pequenos prestadores de serviços recorrentes (como jardinagem) organizarem **clientes, agenda de visitas e finanças por serviço**, no lugar de cadernos e planilhas soltas.

Projeto Integrador das disciplinas de Banco de Dados Relacional e Desenvolvimento Web.

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Front-end | HTML, CSS e JavaScript (ES modules, programação orientada a objetos com classes) |
| Back-end | Python 3 + Flask (páginas HTML e API JSON) |
| Banco de dados | MySQL 8 (6 tabelas em 3FN) |
| Autenticação | Flask-Login + senhas com hash (nunca em texto puro) |

## Como rodar

Pré-requisitos: **Python 3.10+** e **MySQL 8.0.16+** (as restrições `CHECK` do banco só são aplicadas a partir dessa versão).

```bash
# 1. Ambiente virtual e dependências
python -m venv venv
venv\Scripts\activate          # Windows  (Linux/Mac: source venv/bin/activate)
pip install -r requirements.txt

# 2. Banco de dados (cria o banco "gestao_servicos" e as tabelas)
mysql -u root -p < database/gestao_servicos.sql

# 3. Configuração: copie o modelo e ajuste usuário/senha do MySQL
copy .env.example .env         # Linux/Mac: cp .env.example .env

# 4. Iniciar
python run.py
```

Abra <http://127.0.0.1:5000> e crie sua conta.

> O script SQL não pode ser executado duas vezes seguidas (as tabelas já existem). Para recomeçar do zero: `DROP DATABASE gestao_servicos;` e rode o passo 2 de novo.

## Estrutura de pastas

```
PI_BDR_2026/
├── run.py                    # inicia o servidor
├── requirements.txt
├── .env.example              # modelo das configurações
├── database/
│   ├── gestao_servicos.sql   # criação do banco e das tabelas
└── app/
    ├── __init__.py           # fábrica da aplicação (criar_app)
    ├── config.py             # configurações lidas do .env
    ├── db.py                 # classe Database: acesso ao MySQL
    ├── security.py           # proteção CSRF
    ├── validacao.py          # classe Validador: regras de validação
    ├── api_utils.py          # respostas padronizadas da API (erros em JSON)
    ├── recorrencia.py        # classe Recorrencia: em que datas caem as visitas
    ├── models/               # uma classe por tabela
    │   ├── base.py           #   ModeloBase e ModeloDoUsuario (CRUD)
    │   └── usuario.py, cliente.py, servico.py, contrato.py, visita.py, despesa.py,
    │                         #   financeiro.py (lucro por serviço), painel.py (resumo da página inicial)
    ├── routes/               # um Blueprint por área (página HTML + API JSON)
    │   └── auth.py, inicio.py, clientes.py, servicos.py, contratos.py, agenda.py, financeiro.py
    ├── templates/            # páginas HTML (Jinja2)
    └── static/
        ├── css/style.css     # estilos de todo o sistema
        ├── img/
        └── js/
            ├── app.js        # carregado em todas as páginas
            ├── clientes.js, servicos.js, contratos.js   # uma classe por tela (herdam de PaginaCrud)
            ├── inicio.js, financeiro.js   # painel inicial e financeiro
            ├── agenda.js     # tela da agenda (PaginaAgenda)
            ├── agenda/       # VisaoCalendario, VisaoLista, ModalVisita, ModalNovaVisita
            └── core/         # classes reutilizáveis: PaginaCrud, ApiClient, Modal,
                              # Notificacao, Confirmacao, Mascara, ViaCep, Formatador...
```

## Como as visitas são geradas

Ao criar um contrato ativo, o sistema cria sozinho as visitas dos **próximos 3 meses** (regra em `app/recorrencia.py`):

| Frequência | Datas das visitas |
| --- | --- |
| Semanal | a cada 7 dias a partir da data de início |
| Quinzenal | a cada 14 dias a partir da data de início |
| Mensal | no mesmo dia do mês do início (início em 31/01 → 28/02, 31/03...) |

- A janela começa na data de início ou em **hoje** (o que for mais tarde), então nunca nascem visitas no passado, e termina em 3 meses ou na **data de término** do contrato.
- Todas as visitas nascem como `AGENDADA`, com o valor do contrato em `valor_cobrado` e no horário escolhido (padrão 08:00).
- Passados os 3 meses, o botão **Gerar visitas** do cartão cria as que faltam. Ele pode ser usado à vontade: datas que já têm visita são puladas.
- Ao **editar** o contrato (frequência, término, valor, ativar/inativar), as visitas agendadas **de hoje em diante** são refeitas ou atualizadas. Visitas realizadas, canceladas, pagas, com despesas, com observações ou de dias passados **nunca** são alteradas.
- Um contrato só pode ser **excluído** se não tiver esse histórico; caso contrário, o sistema orienta a inativá-lo.

## Como funciona a agenda

A tela **Agenda** mostra as visitas do mês de duas formas, que se alternam no botão **Calendário / Lista**: uma grade mensal e uma lista agrupada por dia. Há resumo do mês (agendadas, realizadas, a receber, recebido), busca por cliente e filtro por situação. Clicar numa visita abre uma janela com as ações:

| Situação | O que se pode fazer |
| --- | --- |
| Agendada | marcar como realizada, remarcar, cancelar, excluir, lançar despesas |
| Realizada | registrar ou desfazer o pagamento (data + PIX/dinheiro/nota fiscal), reabrir, lançar despesas |
| Cancelada | reabrir, excluir |
| Remarcada | apenas consulta (a nova visita criada na data escolhida é a que vale) |

- Visitas **realizadas ou pagas** não podem ser excluídas (histórico). Para mudar o valor de uma visita paga, desfaça o pagamento antes.
- **Despesas** (material, combustível, etc) ficam dentro da visita; a janela mostra o lucro da visita (valor cobrado − despesas).
- **Nova visita** cria uma visita extra fora da recorrência do contrato.
- Visitas remarcadas ou com observações nunca são refeitas ao editar o contrato.

## Painel inicial e financeiro

- **Início:** resumo do dia — visitas de hoje, visitas **atrasadas** (agendadas cujo horário já passou), próximos 7 dias, valores **aguardando pagamento** e o lucro do mês. Dá para marcar como realizada e registrar pagamento direto dali.
- **Financeiro:** indicadores do período (este mês, mês anterior, últimos 3 meses, este ano ou datas personalizadas), **lucro por serviço**, gráfico dos últimos 6 meses, lista de visitas a receber e exportação para **CSV** (abre no Excel).

Como os números são calculados (só visitas **realizadas**, pela data da visita):

| Indicador | Cálculo |
| --- | --- |
| Faturado | soma do valor cobrado nas visitas realizadas |
| Recebido | parte do faturado que já tem pagamento registrado |
| A receber | faturado − recebido |
| Despesas | gastos lançados nessas visitas |
| Lucro | faturado − despesas |
| Margem | lucro ÷ faturado |

## Banco de dados

Seis tabelas relacionadas (script em `database/gestao_servicos.sql`):

```
usuario ──< cliente ──< contrato >── servico >── usuario
                           │
                           └──< visita ──< despesa
```

(`A ──< B` = um registro de A tem vários de B)

Um **usuário** tem seus **clientes** e **serviços**; o **contrato** liga um cliente a um serviço (valor, frequência, datas); cada contrato gera **visitas** (situação, valor cobrado, pagamento); cada visita pode ter várias **despesas**. Toda consulta filtra pelo usuário logado, então cada conta enxerga somente os próprios dados.

## Convenções do projeto

- **Back-end:** cada tabela tem uma classe em `app/models/` e cada área tem um Blueprint em `app/routes/` com a variável `bp`. A tela principal de cada área se chama `pagina` (ex.: `clientes.pagina`), e a API fica em `/api/<recurso>`.
- **Segurança:** todo SQL usa parâmetros (`%s`), toda alteração de dados exige token CSRF, e cada usuário só enxerga os próprios dados.
- **Front-end:** as telas conversam com a API apenas pela classe `ApiClient`; avisos, janelas e confirmações usam `Notificacao`, `Modal` e `Confirmacao`. Cada tela de cadastro é uma classe que herda de `PaginaCrud` e só implementa o que é específico dela.
- **Exclusão:** cliente com contratos e serviço usado em contratos não podem ser excluídos (o banco protege com chave estrangeira); a tela orienta a **inativá-los**.
