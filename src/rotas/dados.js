import { Router } from "express";
import { prisma } from "../banco.js";
import { auditoriaParaFront, conversaParaFront, estacaoParaFront } from "../formatos.js";

/* GET /api/dados: TUDO o que o front precisa para abrir.
   Na B1, isto lia um arquivo. Agora lê do BANCO, e o front nem percebe:
   a resposta continua no mesmo formato (quem traduz é o formatos.js) */
export const rotasDados = Router();

rotasDados.get("/dados", async (req, res) => {
  /* Promise.all: dispara as 8 consultas AO MESMO TEMPO e espera todas.
     Uma depois da outra, o tempo de cada ida ao banco iria se somando */
  const [configuracao, atendentes, estacoes, contatos, etiquetas, respostasRapidas, conversas, auditoria] =
    await Promise.all([
      prisma.configuracao.findUnique({ where: { id: 1 } }),
      prisma.atendente.findMany({ orderBy: { id: "asc" } }),
      prisma.estacao.findMany({ include: { escala: true }, orderBy: { id: "asc" } }),
      prisma.contato.findMany({ orderBy: { nome: "asc" } }),
      prisma.etiqueta.findMany({ orderBy: { id: "asc" } }),
      prisma.respostaRapida.findMany(),
      /* include: traz JUNTO as etiquetas e as mensagens de cada conversa
         (sem isso viriam só as colunas da própria conversa) */
      prisma.conversa.findMany({
        include: {
          etiquetas: { select: { id: true } },
          mensagens: { orderBy: { horario: "asc" } },
        },
      }),
      prisma.auditoria.findMany({ orderBy: { quando: "asc" } }),
    ]);

  res.json({
    marca: { nome: configuracao?.nomeMarca ?? "Talk Atendimento" },
    atendentes,
    estacoes: estacoes.map(estacaoParaFront),
    contatos,
    etiquetas,
    respostasRapidas,
    conversas: conversas.map(conversaParaFront),
    auditoria: auditoria.map(auditoriaParaFront),
  });
});
