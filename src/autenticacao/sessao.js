/* QUEM ENTRA COM ESTA CONTA?
   - Conta de ESTAÇÃO: a própria estação. O "atendente" dela tem o nome da
     estação ("Estação 01"): é esse nome que aparece nas mensagens e na
     auditoria. Não importa quem está sentado ali, nem a que horas chegou:
     o horário do login só define o TURNO que fica registrado (turnos.js)
   - Conta PESSOAL (supervisão, diretoria): sempre a mesma pessoa
   Devolve { sessao } quando dá certo, ou { erro } explicando o problema */
import { turnoDe } from "./turnos.js";

export async function resolverSessao(conta) {
  if (!conta.atendenteId) {
    return { erro: "Esta conta não está ligada a nenhuma estação. Fale com a supervisão." };
  }
  return {
    sessao: {
      email: conta.email,
      atendenteId: conta.atendenteId,
      estacaoId: conta.tipo === "estacao" ? conta.estacaoId : null,
      // O turno do horário do login (só nas estações): fica registrado na auditoria
      turnoId: conta.tipo === "estacao" ? turnoDe(new Date()).id : null,
      desde: new Date(),
    },
  };
}
