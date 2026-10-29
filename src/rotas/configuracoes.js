import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin, exigirPapel } from "../autenticacao/middleware.js";
import { avisarRecarregar } from "../tempoReal.js";

/* CONFIGURAÇÕES DA EMPRESA (só a diretoria): o nome da marca, a escala
   de turnos e os números de WhatsApp de cada linha.
   A primeira rota do sistema que ESCREVE no banco */
export const rotasConfiguracoes = Router();

rotasConfiguracoes.use("/configuracoes", exigirLogin, exigirPapel("diretoria"));

const TURNOS = ["manha", "tarde", "noite"];

// GET /api/configuracoes: tudo o que a tela de Configurações mostra
rotasConfiguracoes.get("/configuracoes", async (req, res) => {
  const [configuracao, estacoes, linhas] = await Promise.all([
    prisma.configuracao.findUnique({ where: { id: 1 } }),
    prisma.estacao.findMany({ include: { escala: true }, orderBy: { id: "asc" } }),
    prisma.linha.findMany({ orderBy: { id: "asc" } }),
  ]);
  res.json({
    marca: { nome: configuracao?.nomeMarca ?? "Talk Atendimento" },
    estacoes: estacoes.map((e) => ({
      id: e.id,
      nome: e.nome,
      sigla: e.sigla,
      escala: Object.fromEntries(e.escala.map((l) => [l.turno, l.atendenteId])),
    })),
    linhas: linhas.map((l) => ({ id: l.id, numero: l.numero, estacaoId: l.estacaoId, papel: l.papel })),
  });
});

/* PUT /api/configuracoes   corpo: { marca: { nome }, estacoes: [{ id, escala }], linhas: [{ id, numero }] }
   PUT = "substitua por isto": o front manda a configuração INTEIRA de uma vez */
rotasConfiguracoes.put("/configuracoes", async (req, res) => {
  const { marca, estacoes, linhas } = req.body ?? {};

  /* ---------- 1. Validar TUDO antes de gravar QUALQUER coisa ----------
     (nunca confie no front: o pedido pode ter sido montado à mão) */
  const nome = typeof marca?.nome === "string" ? marca.nome.trim() : "";
  if (!nome || nome.length > 40) return res.status(400).json({ erro: "O nome da empresa deve ter de 1 a 40 caracteres." });
  if (!Array.isArray(estacoes) || !Array.isArray(linhas)) return res.status(400).json({ erro: "Configuração incompleta." });

  // Na escala, só cabem atendentes (supervisão e diretoria não são escaladas)
  const atendentes = await prisma.atendente.findMany({ where: { papel: "atendente" } });
  const idsAtendentes = new Set(atendentes.map((a) => a.id));
  for (const estacao of estacoes) {
    for (const turno of TURNOS) {
      const id = estacao.escala?.[turno];
      if (id && !idsAtendentes.has(id)) return res.status(400).json({ erro: "A escala só aceita atendentes (supervisão e diretoria não são escaladas)." });
    }
  }

  // Números: só dígitos, com o 55 do Brasil (12 ou 13 dígitos), sem repetir
  const numeros = linhas.map((l) => String(l.numero ?? "").replace(/\D/g, ""));
  if (numeros.some((n) => n.length < 12 || n.length > 13 || !n.startsWith("55"))) {
    return res.status(400).json({ erro: "Cada número precisa do DDD e do 55 do Brasil, por exemplo +55 21 99999-0001." });
  }
  if (new Set(numeros).size !== numeros.length) {
    return res.status(400).json({ erro: "Duas linhas não podem ter o mesmo número." });
  }

  /* ---------- 2. Gravar tudo numa TRANSAÇÃO ----------
     $transaction: ou TODAS as mudanças acontecem, ou NENHUMA. Se a 5ª
     falhar, as 4 primeiras são desfeitas. Sem isso, um erro no meio
     deixaria a escala meio nova, meio velha */
  await prisma.$transaction([
    prisma.configuracao.upsert({ where: { id: 1 }, create: { id: 1, nomeMarca: nome }, update: { nomeMarca: nome } }),
    ...estacoes.flatMap((estacao) =>
      TURNOS.map((turno) =>
        prisma.escala.upsert({
          where: { estacaoId_turno: { estacaoId: estacao.id, turno } },
          create: { estacaoId: estacao.id, turno, atendenteId: estacao.escala?.[turno] || null },
          update: { atendenteId: estacao.escala?.[turno] || null },
        })
      )
    ),
    ...linhas.map((linha, i) => prisma.linha.update({ where: { id: linha.id }, data: { numero: numeros[i] } })),
  ]);

  res.status(204).end();
  // Nome, escala e números mudaram: todo mundo busca de novo (o nome novo aparece na hora)
  avisarRecarregar();
});
