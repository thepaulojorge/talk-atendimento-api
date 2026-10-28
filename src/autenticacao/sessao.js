/* QUEM ENTRA COM ESTA CONTA?
   - Conta pessoal (supervisão, diretoria): sempre a mesma pessoa
   - Conta de estação: a pessoa escalada para o turno de AGORA
   Devolve { sessao } quando dá certo, ou { erro } explicando o problema */
import { prisma } from "../banco.js";
import { turnoDe } from "./turnos.js";

export async function resolverSessao(conta) {
  const agora = new Date();

  if (conta.tipo === "pessoal") {
    return {
      sessao: { email: conta.email, atendenteId: conta.atendenteId, estacaoId: null, turnoId: null, desde: agora },
    };
  }

  const turno = turnoDe(agora);
  // findUnique com a chave dupla da tabela de escala: (estação + turno)
  const linha = await prisma.escala.findUnique({
    where: { estacaoId_turno: { estacaoId: conta.estacaoId, turno: turno.id } },
    include: { estacao: true },
  });

  if (!linha?.atendenteId) {
    const estacao = linha?.estacao?.nome || "estação";
    return { erro: `Ninguém está escalado na ${estacao} no turno da ${turno.nome.toLowerCase()}. Fale com a diretoria.` };
  }

  return {
    sessao: { email: conta.email, atendenteId: linha.atendenteId, estacaoId: conta.estacaoId, turnoId: turno.id, desde: agora },
  };
}
