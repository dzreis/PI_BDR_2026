"""Configurações do Agendô.

Todos os valores sensíveis (senha do banco, chave secreta) vêm de variáveis
de ambiente, lidas do arquivo `.env` (veja `.env.example`). Assim nenhuma
senha fica escrita no código nem vai para o GitHub.
"""

import os

from dotenv import load_dotenv

# Lê o arquivo .env (se existir) e coloca os valores em os.environ.
load_dotenv()


class Config:
    """Configuração única da aplicação (carregada por `app.config.from_object`).

    O Flask só enxerga atributos escritos em MAIÚSCULAS.
    """

    # Nome exibido no título, menu e telas de login.
    NOME_APP = "Agendô"

    # Chave usada para assinar a sessão (cookies). Em produção use um valor
    # longo e aleatório; este padrão serve apenas para desenvolvimento.
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-troque-esta-chave")

    # --- Conexão com o MySQL ---
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "gestao_servicos")

    # --- Cookie de sessão ---
    # HttpOnly: o JavaScript não consegue ler o cookie (protege contra XSS).
    SESSION_COOKIE_HTTPONLY = True
    # Lax: o navegador não envia o cookie em requisições vindas de outros sites.
    SESSION_COOKIE_SAMESITE = "Lax"
