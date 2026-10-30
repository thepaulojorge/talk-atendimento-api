/* QUAIS LINHAS (números de WhatsApp) ESTA PESSOA ATENDE?
   A regra mais importante do sistema: tudo o que chega ao front passa por aqui.

   - Supervisão e diretoria: SÓ a linha exclusiva do seu papel
   - Atendente numa estação: a linha da estação + as das estações que puxou
   - Atendente sem estação (não acontece hoje, mas por segurança): nenhuma
   - DEMONSTRAÇÃO (o botão do portfólio): nunca uma linha ligada ao WhatsApp
     de verdade. Qualquer visitante entra pelo botão, sem senha: ele não
     pode ler (nem responder) conversas reais de clientes */
import { prisma } from "../banco.js";

export async function linhasDoUsuario(usuario) {
  // Na demonstração, um filtro a mais: só as linhas SEM o ID da Meta (as simuladas)
  const soSimuladas = usuario.demo ? { whatsappId: null } : {};

  if (usuario.papel !== "atendente") {
    return prisma.linha.findMany({ where: { papel: usuario.papel, ...soSimuladas } });
  }
  if (!usuario.estacaoId) return [];

  const puxadas = await prisma.puxada.findMany({ where: { atendenteId: usuario.atendenteId } });
  const estacoes = [usuario.estacaoId, ...puxadas.map((p) => p.estacaoId)];
  return prisma.linha.findMany({ where: { estacaoId: { in: estacoes }, ...soSimuladas } });
}
