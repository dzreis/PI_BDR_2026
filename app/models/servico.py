"""Modelo Servico: catálogo de serviços do usuário (tabela `servico`)."""

from app.models.base import ModeloDoUsuario


class Servico(ModeloDoUsuario):
    """Uma linha da tabela `servico`.

    O banco impede dois serviços com o mesmo nome para o mesmo usuário
    (UNIQUE em id_usuario + tipo); nesse caso `criar` e `atualizar` lançam
    `RegistroDuplicadoError`.
    """

    TABELA = "servico"
    CHAVE = "id_servico"
    CAMPOS = (
        "id_servico", "id_usuario", "tipo", "descricao",
        "preco_padrao", "duracao_dias", "ativo",
    )
    CAMPOS_BOOLEANOS = ("ativo",)
    CAMPOS_EDITAVEIS = ("tipo", "descricao", "preco_padrao", "duracao_dias", "ativo")
    ORDEM = "tipo"
