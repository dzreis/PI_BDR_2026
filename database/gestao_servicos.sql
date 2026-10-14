CREATE DATABASE IF NOT EXISTS gestao_servicos;
USE gestao_servicos;

-- USUARIO: dono do negócio que faz login no sistema
CREATE TABLE usuario (
    id_usuario    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    nome          VARCHAR(100)  NOT NULL,
    email         VARCHAR(120)  NOT NULL,
    senha_hash    VARCHAR(255)  NOT NULL,  -- nunca guardar senha em texto puro
    data_criacao  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_usuario PRIMARY KEY (id_usuario),
    CONSTRAINT uq_usuario_email UNIQUE (email)
) ENGINE = InnoDB;


-- CLIENTE: clientes de cada usuário
CREATE TABLE cliente (
    id_cliente     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    id_usuario     INT UNSIGNED  NOT NULL,
    nome           VARCHAR(100)  NOT NULL,
    telefone       VARCHAR(20)   NOT NULL,
    email          VARCHAR(120)  NULL,
    cep            CHAR(8)       NULL,
    logradouro     VARCHAR(120)  NULL,
    numero         VARCHAR(10)   NULL,
    complemento    VARCHAR(60)   NULL,
    bairro         VARCHAR(60)   NULL,
    cidade         VARCHAR(60)   NULL,
    uf             CHAR(2)       NULL,
    observacoes    TEXT          NULL,
    ativo          BOOLEAN       NOT NULL DEFAULT TRUE,
    data_cadastro  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_cliente PRIMARY KEY (id_cliente),
    CONSTRAINT fk_cliente_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE INDEX idx_cliente_usuario ON cliente (id_usuario);


-- SERVICO: catálogo de serviços de cada usuário
CREATE TABLE servico (
    id_servico       INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    id_usuario       INT UNSIGNED   NOT NULL,
    tipo             VARCHAR(100)   NOT NULL,
    descricao        VARCHAR(255)   NULL,
    preco_padrao     DECIMAL(10,2)  NOT NULL,
    duracao_dias     SMALLINT UNSIGNED NULL,
    ativo            BOOLEAN        NOT NULL DEFAULT TRUE,
    CONSTRAINT pk_servico PRIMARY KEY (id_servico),
    CONSTRAINT uq_servico_usuario_tipo UNIQUE (id_usuario, tipo),
    CONSTRAINT ck_servico_preco CHECK (preco_padrao >= 0),
    CONSTRAINT fk_servico_usuario FOREIGN KEY (id_usuario)
        REFERENCES usuario (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;


-- CONTRATO: serviço recorrente contratado por um cliente
-- (entidade associativa da relação N:M entre cliente e servico)
CREATE TABLE contrato (
    id_contrato     INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    id_cliente      INT UNSIGNED   NOT NULL,
    id_servico      INT UNSIGNED   NOT NULL,
    valor           DECIMAL(10,2)  NOT NULL,
    frequencia      ENUM('SEMANAL','QUINZENAL','MENSAL') NOT NULL,
    data_inicio     DATE           NOT NULL,
    data_fim        DATE           NULL,   -- NULL = sem data de término
    ativo           BOOLEAN        NOT NULL DEFAULT TRUE,
    CONSTRAINT pk_contrato PRIMARY KEY (id_contrato),
    CONSTRAINT ck_contrato_valor CHECK (valor >= 0),
    CONSTRAINT ck_contrato_datas CHECK (data_fim IS NULL OR data_fim >= data_inicio),
    CONSTRAINT fk_contrato_cliente FOREIGN KEY (id_cliente)
        REFERENCES cliente (id_cliente)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_contrato_servico FOREIGN KEY (id_servico)
        REFERENCES servico (id_servico)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE INDEX idx_contrato_cliente ON contrato (id_cliente);
CREATE INDEX idx_contrato_servico ON contrato (id_servico);


-- VISITA: cada atendimento da agenda (gerado a partir do contrato)
-- data_pagamento NULL = ainda não pago
CREATE TABLE visita (
    id_visita            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    id_contrato          INT UNSIGNED   NOT NULL,
    agendamento          DATETIME       NOT NULL,
    status               ENUM('AGENDADA','REALIZADA','CANCELADA','REMARCADA')
                                        NOT NULL DEFAULT 'AGENDADA',
    valor_cobrado        DECIMAL(10,2)  NOT NULL,
    data_pagamento       DATE           NULL,
    forma_pagamento      ENUM('PIX','DINHEIRO', 'NOTA FISCAL') NULL,
    observacoes          VARCHAR(255)   NULL,
    CONSTRAINT pk_visita PRIMARY KEY (id_visita),
    CONSTRAINT uq_visita_contrato_agendamento UNIQUE (id_contrato, agendamento),
    CONSTRAINT ck_visita_valor CHECK (valor_cobrado >= 0),
    CONSTRAINT fk_visita_contrato FOREIGN KEY (id_contrato)
        REFERENCES contrato (id_contrato)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE INDEX idx_visita_agendamento ON visita (agendamento);


-- DESPESA: gastos de cada visita (material, deslocamento etc.)
CREATE TABLE despesa (
    id_despesa    INT UNSIGNED   NOT NULL AUTO_INCREMENT,
    id_visita     INT UNSIGNED   NOT NULL,
    descricao     VARCHAR(120)   NOT NULL,
    valor         DECIMAL(10,2)  NOT NULL,
    data_despesa  DATE           NOT NULL,
    CONSTRAINT pk_despesa PRIMARY KEY (id_despesa),
    CONSTRAINT ck_despesa_valor CHECK (valor > 0),
    CONSTRAINT fk_despesa_visita FOREIGN KEY (id_visita)
        REFERENCES visita (id_visita)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE INDEX idx_despesa_visita ON despesa (id_visita);


SELECT * FROM gestao_servicos.usuario;

