"""Classes-base dos modelos.

Quase toda tabela do sistema precisa das mesmas operações (listar, buscar,
criar, atualizar, excluir). Em vez de repetir esse código em cada modelo,
ele fica aqui e as classes `Cliente`, `Servico` etc. apenas herdam e dizem
qual é a tabela e quais são as colunas (herança em programação orientada a
objetos).

Segurança: os nomes de tabela e de colunas usados nos SQL vêm sempre das
constantes das classes (nunca do que o usuário envia) e todos os VALORES
vão como parâmetros (`%s`).
"""

from datetime import date
from decimal import Decimal

from pymysql.err import IntegrityError

from app.db import Database


def normalizar_dinheiro(valor):
    """Valor em reais com 2 casas, como Decimal (aceita Decimal, float ou texto).

    Serve para comparar valores vindos do banco (Decimal) com valores já
    validados sem cair em diferenças de arredondamento.
    """
    return Decimal(str(valor)).quantize(Decimal("0.01"))


class RegistroDuplicadoError(Exception):
    """Violação de UNIQUE: já existe um registro com esse valor."""


class RegistroEmUsoError(Exception):
    """Violação de chave estrangeira: outros registros dependem deste."""


class ModeloBase:
    """Representa uma linha de uma tabela.

    Cada classe filha declara:
      TABELA            nome da tabela
      CHAVE             nome da chave primária
      CAMPOS            todas as colunas, na ordem em que são lidas
      CAMPOS_BOOLEANOS  colunas BOOLEAN (o MySQL devolve 0/1; viram True/False)
    """

    TABELA = ""
    CHAVE = ""
    CAMPOS = ()
    CAMPOS_BOOLEANOS = ()
    # Informações extras vindas de JOINs/subconsultas (ex.: nome do cliente num
    # contrato). Não são colunas da tabela: só aparecem em consultas especiais.
    EXTRAS = ()

    def __init__(self, **valores):
        for campo in self.CAMPOS + self.EXTRAS:
            setattr(self, campo, valores.get(campo))

    @classmethod
    def _colunas_sql(cls):
        """Colunas separadas por vírgula, para usar no SELECT."""
        return ", ".join(cls.CAMPOS)

    @classmethod
    def _de_linha(cls, linha):
        """Converte uma linha do banco (dicionário) em objeto; None se vazia."""
        return cls(**linha) if linha else None

    @staticmethod
    def _traduzir_erro(erro):
        """Transforma erros do MySQL em erros do nosso sistema."""
        codigo = erro.args[0] if erro.args else None
        if codigo == 1062:  # Duplicate entry
            raise RegistroDuplicadoError() from erro
        if codigo == 1451:  # Cannot delete or update a parent row
            raise RegistroEmUsoError() from erro
        raise erro

    def to_dict(self):
        """Dicionário pronto para virar JSON (decimais e datas viram tipos simples)."""
        dados = {}
        for campo in self.CAMPOS + self.EXTRAS:
            valor = getattr(self, campo)
            if campo in self.CAMPOS_BOOLEANOS:
                valor = bool(valor)
            elif isinstance(valor, Decimal):
                valor = float(valor)
            elif isinstance(valor, date):  # datetime também é um "date"
                valor = valor.isoformat()
            dados[campo] = valor
        return dados


class ModeloDoUsuario(ModeloBase):
    """Modelo de uma tabela que tem a coluna `id_usuario` (cliente, servico).

    TODAS as consultas filtram pelo usuário logado, então ninguém consegue
    ver, alterar ou apagar dados de outra conta, mesmo adivinhando um id.

    Além das constantes de `ModeloBase`, a classe filha define:
      CAMPOS_EDITAVEIS  colunas que o usuário pode gravar (sem ids e datas)
      ORDEM             cláusula ORDER BY da listagem
    """

    CAMPOS_EDITAVEIS = ()
    ORDEM = ""

    @classmethod
    def listar(cls, id_usuario):
        """Todos os registros do usuário, já ordenados."""
        linhas = Database.consultar(
            f"SELECT {cls._colunas_sql()} FROM {cls.TABELA} "
            f"WHERE id_usuario = %s ORDER BY {cls.ORDEM}",
            (id_usuario,),
        )
        return [cls._de_linha(linha) for linha in linhas]

    @classmethod
    def buscar(cls, id_registro, id_usuario):
        """Um registro do usuário pelo id; None se não existir (ou for de outro usuário)."""
        linha = Database.consultar_um(
            f"SELECT {cls._colunas_sql()} FROM {cls.TABELA} "
            f"WHERE {cls.CHAVE} = %s AND id_usuario = %s",
            (id_registro, id_usuario),
        )
        return cls._de_linha(linha)

    @classmethod
    def criar(cls, id_usuario, dados):
        """Insere um registro e o devolve com o id gerado."""
        colunas = ["id_usuario"] + [c for c in cls.CAMPOS_EDITAVEIS if c in dados]
        valores = [id_usuario] + [dados[c] for c in colunas[1:]]
        marcadores = ", ".join(["%s"] * len(colunas))
        try:
            novo_id = Database.inserir(
                f"INSERT INTO {cls.TABELA} ({', '.join(colunas)}) VALUES ({marcadores})",
                valores,
            )
        except IntegrityError as erro:
            cls._traduzir_erro(erro)
        return cls.buscar(novo_id, id_usuario)

    @classmethod
    def atualizar(cls, id_registro, id_usuario, dados):
        """Altera só as colunas enviadas. Devolve o registro novo, ou None se não existir."""
        if cls.buscar(id_registro, id_usuario) is None:
            return None

        colunas = [c for c in cls.CAMPOS_EDITAVEIS if c in dados]
        if colunas:
            atribuicoes = ", ".join(f"{coluna} = %s" for coluna in colunas)
            parametros = [dados[c] for c in colunas] + [id_registro, id_usuario]
            try:
                Database.executar(
                    f"UPDATE {cls.TABELA} SET {atribuicoes} "
                    f"WHERE {cls.CHAVE} = %s AND id_usuario = %s",
                    parametros,
                )
            except IntegrityError as erro:
                cls._traduzir_erro(erro)
        return cls.buscar(id_registro, id_usuario)

    @classmethod
    def excluir(cls, id_registro, id_usuario):
        """Apaga o registro. Devolve False se ele não existir.

        Lança `RegistroEmUsoError` se outras tabelas ainda dependem dele.
        """
        try:
            linhas = Database.executar(
                f"DELETE FROM {cls.TABELA} WHERE {cls.CHAVE} = %s AND id_usuario = %s",
                (id_registro, id_usuario),
            )
        except IntegrityError as erro:
            cls._traduzir_erro(erro)
        return linhas > 0
