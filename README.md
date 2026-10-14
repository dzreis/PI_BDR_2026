# Agendô

Aplicação web para pequenos prestadores de serviços recorrentes (jardinagem, estética etc.) organizarem **clientes, agenda de visitas e finanças por serviço**, no lugar de cadernos e planilhas soltas.

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
├── .env.example              # modelo das configurações (o .env real não vai ao Git)
├── database/
│   └── gestao_servicos.sql   # criação do banco e das tabelas
└── app/
    ├── __init__.py           # fábrica da aplicação (criar_app)
    ├── config.py             # configurações lidas do .env
    ├── db.py                 # classe Database: acesso ao MySQL
    ├── security.py           # proteção CSRF
    ├── validacao.py          # classe Validador: regras de validação
    ├── api_utils.py          # respostas padronizadas da API (erros em JSON)
    ├── models/               # uma classe por tabela
    │   ├── base.py           #   ModeloBase e ModeloDoUsuario (CRUD herdado)
    │   └── usuario.py, cliente.py, servico.py
    ├── routes/               # um Blueprint por área (página HTML + API JSON)
    │   └── auth.py, inicio.py, clientes.py, servicos.py
    ├── templates/            # páginas HTML (Jinja2)
    └── static/
        ├── css/style.css     # estilos de todo o sistema
        ├── img/
        └── js/
            ├── app.js        # carregado em todas as páginas
            ├── clientes.js, servicos.js   # uma classe por tela (herdam de PaginaCrud)
            └── core/         # classes reutilizáveis: PaginaCrud, ApiClient, Modal,
                              # Notificacao, Confirmacao, Mascara, ViaCep, Formatador...
```

## Convenções do projeto

- **Back-end:** cada tabela tem uma classe em `app/models/` e cada área tem um Blueprint em `app/routes/` com a variável `bp`. A tela principal de cada área se chama `pagina` (ex.: `clientes.pagina`), e a API fica em `/api/<recurso>`.
- **Segurança:** todo SQL usa parâmetros (`%s`), toda alteração de dados exige token CSRF, e cada usuário só enxerga os próprios dados.
- **Front-end:** as telas conversam com a API apenas pela classe `ApiClient`; avisos, janelas e confirmações usam `Notificacao`, `Modal` e `Confirmacao`. Cada tela de cadastro é uma classe que herda de `PaginaCrud` e só implementa o que é específico dela.
- **Exclusão:** cliente com contratos e serviço usado em contratos não podem ser excluídos (o banco protege com chave estrangeira); a tela orienta a **inativá-los**.

## Andamento

- [x] **Parte 1 — Base:** configuração, banco, login/cadastro/logout, layout e classes JavaScript base
- [x] **Parte 2 — Clientes e Serviços:** CRUD completo, busca, filtro por situação e preenchimento do endereço pelo CEP (ViaCEP)
- [ ] **Parte 3 — Contratos:** CRUD e geração automática das visitas
- [ ] **Parte 4 — Agenda e despesas:** acompanhar visitas, registrar pagamentos e gastos
- [ ] **Parte 5 — Financeiro e painel:** lucro por serviço, painel inicial e ajustes finais
