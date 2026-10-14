"""Modelo Cliente: pessoas atendidas pelo usuário (tabela `cliente`)."""

from app.models.base import ModeloDoUsuario


class Cliente(ModeloDoUsuario):
    """Uma linha da tabela `cliente`.

    Todas as operações (listar, buscar, criar, atualizar, excluir) são
    herdadas de `ModeloDoUsuario`; aqui só descrevemos a tabela.
    """

    TABELA = "cliente"
    CHAVE = "id_cliente"
    CAMPOS = (
        "id_cliente", "id_usuario", "nome", "telefone", "email",
        "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf",
        "observacoes", "ativo", "data_cadastro",
    )
    CAMPOS_BOOLEANOS = ("ativo",)
    CAMPOS_EDITAVEIS = (
        "nome", "telefone", "email",
        "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf",
        "observacoes", "ativo",
    )
    ORDEM = "nome"
