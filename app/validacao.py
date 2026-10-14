"""Validações reutilizáveis de dados de entrada.

O navegador também valida os formulários, mas isso é só conforto para o
usuário: quem manda a palavra final é o servidor, pois qualquer pessoa pode
enviar requisições sem passar pela tela. Por isso toda entrada é conferida
aqui antes de chegar ao banco.

Padrão dos métodos:
* `cadastro_usuario` devolve uma lista de mensagens de erro.
* `cliente` e `servico` devolvem `(dados_limpos, erros)`, onde `erros` é um
  dicionário {campo: mensagem}. Os dados limpos já estão no formato do banco
  (telefone só com dígitos, preço como Decimal etc.). Com `parcial=True`
  (usado no PATCH) só os campos enviados são conferidos.
"""

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

# As 27 unidades da federação.
UFS = frozenset(
    "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split()
)


class Validador:
    """Conjunto de regras de validação (só métodos estáticos/de classe)."""

    REGEX_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    TAMANHO_MINIMO_SENHA = 8

    # ------------------------------------------------------------------
    # Regras de campos individuais (cada uma devolve (valor_limpo, erro))
    # ------------------------------------------------------------------
    @staticmethod
    def _texto(dados, campo, rotulo, maximo, obrigatorio=False, minimo=1):
        """Texto sem espaços nas pontas; vazio vira None."""
        bruto = dados.get(campo)
        texto = "" if bruto is None else str(bruto).strip()
        if not texto:
            return None, (f"{rotulo} é obrigatório." if obrigatorio else None)
        if len(texto) < minimo:
            return None, f"{rotulo} deve ter pelo menos {minimo} caracteres."
        if len(texto) > maximo:
            return None, f"{rotulo} deve ter no máximo {maximo} caracteres."
        return texto, None

    @classmethod
    def _email_opcional(cls, dados):
        email, erro = cls._texto(dados, "email", "E-mail", 120)
        if erro is None and email is not None and not cls.email_valido(email):
            return None, "Informe um e-mail válido."
        return (email.lower() if email else None), erro

    @staticmethod
    def _telefone(dados):
        """Telefone obrigatório: guarda só os dígitos (DDD + número = 10 ou 11)."""
        digitos = re.sub(r"\D", "", str(dados.get("telefone") or ""))
        if not digitos:
            return None, "Telefone é obrigatório."
        if len(digitos) not in (10, 11) or digitos[0] == "0":
            return None, "Telefone inválido. Informe o DDD e o número."
        return digitos, None

    @staticmethod
    def _cep(dados):
        """CEP opcional: guarda só os 8 dígitos."""
        digitos = re.sub(r"\D", "", str(dados.get("cep") or ""))
        if not digitos:
            return None, None
        if len(digitos) != 8:
            return None, "CEP inválido. Informe os 8 números."
        return digitos, None

    @staticmethod
    def _uf(dados):
        uf = str(dados.get("uf") or "").strip().upper()
        if not uf:
            return None, None
        if uf not in UFS:
            return None, "UF inválida."
        return uf, None

    @staticmethod
    def _booleano(valor, rotulo):
        if not isinstance(valor, bool):
            return None, f"{rotulo} inválida."
        return valor, None

    @staticmethod
    def _dinheiro(valor, rotulo):
        """Valor em reais obrigatório e não negativo. Aceita "150", "150,50" e "1.500,50"."""
        texto = str(valor if valor is not None else "").replace("R$", "").replace(" ", "")
        if not texto:
            return None, f"{rotulo} é obrigatório."
        if "," in texto:  # formato brasileiro: ponto separa milhar, vírgula separa centavos
            texto = texto.replace(".", "").replace(",", ".")
        try:
            numero = Decimal(texto)
            if not numero.is_finite():
                raise InvalidOperation
            numero = numero.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except InvalidOperation:
            return None, f"{rotulo} inválido. Use apenas números, por exemplo 150,00."
        if numero < 0:
            return None, f"{rotulo} não pode ser negativo."
        if numero > Decimal("99999999.99"):
            return None, f"{rotulo} é alto demais."
        return numero, None

    @staticmethod
    def _inteiro_opcional(valor, rotulo, minimo, maximo):
        """Número inteiro opcional dentro de um intervalo; vazio vira None."""
        if valor is None or str(valor).strip() == "":
            return None, None
        try:
            if isinstance(valor, bool):
                raise ValueError
            numero = int(str(valor).strip())
        except ValueError:
            return None, f"{rotulo} deve ser um número inteiro."
        if not minimo <= numero <= maximo:
            return None, f"{rotulo} deve estar entre {minimo} e {maximo}."
        return numero, None

    # ------------------------------------------------------------------
    # Usuário
    # ------------------------------------------------------------------
    @classmethod
    def email_valido(cls, email):
        """E-mail com formato básico válido e até 120 caracteres (limite do banco)."""
        return bool(email) and len(email) <= 120 and cls.REGEX_EMAIL.match(email) is not None

    @classmethod
    def cadastro_usuario(cls, nome, email, senha, confirmacao):
        """Valida os dados da tela de cadastro e devolve a lista de erros."""
        erros = []

        if not 2 <= len(nome) <= 100:
            erros.append("Informe seu nome (entre 2 e 100 caracteres).")

        if not cls.email_valido(email):
            erros.append("Informe um e-mail válido.")

        if len(senha) < cls.TAMANHO_MINIMO_SENHA:
            erros.append(f"A senha deve ter pelo menos {cls.TAMANHO_MINIMO_SENHA} caracteres.")
        elif senha != confirmacao:
            erros.append("A confirmação não confere com a senha.")

        return erros

    # ------------------------------------------------------------------
    # Cliente e Serviço
    # ------------------------------------------------------------------
    @classmethod
    def cliente(cls, dados, parcial=False):
        """Valida os dados de um cliente. Devolve (dados_limpos, erros)."""
        limpos, erros = {}, {}

        def aplicar(campo, resultado):
            valor, erro = resultado
            if erro:
                erros[campo] = erro
            else:
                limpos[campo] = valor

        def conferir(campo):  # no PATCH só conferimos o que foi enviado
            return not parcial or campo in dados

        if conferir("nome"):
            aplicar("nome", cls._texto(dados, "nome", "Nome", 100, obrigatorio=True, minimo=2))
        if conferir("telefone"):
            aplicar("telefone", cls._telefone(dados))
        if conferir("email"):
            aplicar("email", cls._email_opcional(dados))
        if conferir("cep"):
            aplicar("cep", cls._cep(dados))
        if conferir("uf"):
            aplicar("uf", cls._uf(dados))

        textos = (
            ("logradouro", "Logradouro", 120),
            ("numero", "Número", 10),
            ("complemento", "Complemento", 60),
            ("bairro", "Bairro", 60),
            ("cidade", "Cidade", 60),
            ("observacoes", "Observações", 2000),
        )
        for campo, rotulo, maximo in textos:
            if conferir(campo):
                aplicar(campo, cls._texto(dados, campo, rotulo, maximo))

        if "ativo" in dados:
            aplicar("ativo", cls._booleano(dados["ativo"], "Situação"))

        return limpos, erros

    @classmethod
    def servico(cls, dados, parcial=False):
        """Valida os dados de um serviço. Devolve (dados_limpos, erros)."""
        limpos, erros = {}, {}

        def aplicar(campo, resultado):
            valor, erro = resultado
            if erro:
                erros[campo] = erro
            else:
                limpos[campo] = valor

        def conferir(campo):
            return not parcial or campo in dados

        if conferir("tipo"):
            aplicar("tipo", cls._texto(dados, "tipo", "Tipo de serviço", 100, obrigatorio=True, minimo=2))
        if conferir("descricao"):
            aplicar("descricao", cls._texto(dados, "descricao", "Descrição", 255))
        if conferir("preco_padrao"):
            aplicar("preco_padrao", cls._dinheiro(dados.get("preco_padrao"), "Preço padrão"))
        if conferir("duracao_dias"):
            aplicar("duracao_dias", cls._inteiro_opcional(dados.get("duracao_dias"), "Duração", 1, 65535))
        if "ativo" in dados:
            aplicar("ativo", cls._booleano(dados["ativo"], "Situação"))

        return limpos, erros
