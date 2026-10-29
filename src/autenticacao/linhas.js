/* QUAIS LINHAS (números de WhatsApp) ESTA PESSOA ATENDE?
   A regra mais importante do sistema: tudo o que chega ao front passa por aqui.

   - Supervisão e diretoria: SÓ a linha exclusiva do seu papel
   - Atendente numa estação: a linha da estação + as das estações que puxou
   - Atendente sem estação (não acontece hoje, mas por segurança): nenhuma */
import { prisma } from "../banco.js";

export async function linhasDoUsuario(usuario) {
  if (usuario.papel !== "atendente") {
    return prisma.linha.findMany({ where: { papel: usuario.papel } });
  }
  if (!usuario.estacaoId) return [];

  const puxadas = await prisma.puxada.findMany({ where: { atendenteId: usuario.atendenteId } });
  const estacoes = [usuario.estacaoId, ...puxadas.map((p) => p.estacaoId)];
  return prisma.linha.findMany({ where: { estacaoId: { in: estacoes } } });
}
