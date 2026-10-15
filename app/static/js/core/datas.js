/**
 * Datas no calendário local (sem surpresas de fuso horário).
 *
 * Todas as datas trafegam como texto "AAAA-MM-DD" (o formato do servidor e do
 * campo <input type="date">). Esta classe converte de/para `Date` sempre no
 * horário LOCAL, para "hoje" ser o dia que a pessoa vê no relógio dela.
 *
 *   Datas.hoje()                  -> "2026-10-14"
 *   Datas.somarDias("2026-10-31", 1)   -> "2026-11-01"
 *   Datas.rotuloDia("2026-10-14") -> "Hoje" | "Amanhã" | "Quinta, 15 de outubro"
 */
export class Datas {
  static MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  static DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  static DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  /** "2026-10-14" -> Date (meio-dia local, longe de qualquer virada de dia/horário de verão). */
  static paraDate(iso) {
    const [ano, mes, dia] = String(iso).slice(0, 10).split("-").map(Number);
    return new Date(ano, mes - 1, dia, 12);
  }

  /** Date -> "2026-10-14" (usando o calendário local). */
  static paraIso(data) {
    const dois = (n) => String(n).padStart(2, "0");
    return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
  }

  static hoje() {
    return Datas.paraIso(new Date());
  }

  /** Dia (AAAA-MM-DD) de um instante "2026-10-14T09:30:00". */
  static dia(instante) {
    return String(instante).slice(0, 10);
  }

  /** Horário "09:30" de um instante "2026-10-14T09:30:00". */
  static hora(instante) {
    return String(instante).slice(11, 16);
  }

  static somarDias(iso, dias) {
    const data = Datas.paraDate(iso);
    data.setDate(data.getDate() + dias);
    return Datas.paraIso(data);
  }

  /** Dia da semana: 0 = domingo ... 6 = sábado. */
  static diaDaSemana(iso) {
    return Datas.paraDate(iso).getDay();
  }

  /** Primeiro dia do mês seguinte/anterior: ("2026-10", +1) -> mês 11. Devolve {ano, mes} (mes 0-11). */
  static somarMeses({ ano, mes }, quantidade) {
    const indice = ano * 12 + mes + quantidade;
    return { ano: Math.floor(indice / 12), mes: ((indice % 12) + 12) % 12 };
  }

  static primeiroDoMes({ ano, mes }) {
    return Datas.paraIso(new Date(ano, mes, 1, 12));
  }

  /** "outubro de 2026" */
  static nomeDoMes({ ano, mes }) {
    return `${Datas.MESES[mes]} de ${ano}`;
  }

  /**
   * Os 42 dias (6 semanas, começando no domingo) que preenchem a grade do mês,
   * incluindo os dias dos meses vizinhos. Devolve [{dia, doMes}].
   */
  static gradeDoMes({ ano, mes }) {
    const primeiro = Datas.primeiroDoMes({ ano, mes });
    const inicio = Datas.somarDias(primeiro, -Datas.diaDaSemana(primeiro));
    return Array.from({ length: 42 }, (_, i) => {
      const dia = Datas.somarDias(inicio, i);
      return { dia, doMes: Datas.paraDate(dia).getMonth() === mes };
    });
  }

  /** "Hoje", "Amanhã", "Ontem" ou "Quinta, 15 de outubro". */
  static rotuloDia(iso) {
    const hoje = Datas.hoje();
    if (iso === hoje) return "Hoje";
    if (iso === Datas.somarDias(hoje, 1)) return "Amanhã";
    if (iso === Datas.somarDias(hoje, -1)) return "Ontem";

    const data = Datas.paraDate(iso);
    const semana = Datas.DIAS_SEMANA[data.getDay()];
    return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${data.getDate()} de ${Datas.MESES[data.getMonth()]}`;
  }
}
