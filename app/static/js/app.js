/**
 * Script carregado em TODAS as páginas (veja templates/base.html).
 * Ativa o comportamento comum: menu lateral e alertas.
 * Os scripts de cada tela (clientes.js, agenda.js...) são carregados à parte.
 */
import { Layout } from "./core/ui.js";

new Layout().iniciar();
