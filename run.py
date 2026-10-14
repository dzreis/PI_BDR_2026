"""Ponto de entrada: `python run.py` inicia o servidor de desenvolvimento."""

import os

from app import criar_app

app = criar_app()

if __name__ == "__main__":
    # FLASK_DEBUG=1 no .env liga o modo de desenvolvimento (recarrega sozinho
    # quando o código muda e mostra erros detalhados). Nunca use em produção.
    app.run(debug=os.getenv("FLASK_DEBUG", "0") == "1")
