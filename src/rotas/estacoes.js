import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin, exigirPapel } from "../autenticacao/middleware.js";
import { atualizarSalas, avisarEstacoes } from "../tempoReal.js";

/* PUXAR ESTAÇÕES: atender outras estações além da sua (intervalo do
   colega, fim de semana com 3 ou 4 estações numa pessoa só...).
   Só para quem entrou por uma ESTAÇÃO: supervisão e diretoria têm só a
   linha delas e não puxam estações */
export const rotasEstacoes = Router();

// Todas as rotas daqui: login + papel de atendente
rotasEstacoes.use("/estacoes", exigirLogin, exigirPapel("atendente"));

// Confere se dá para puxar/soltar ESTA estação. Devolve a mensagem de erro, ou null
async function problemaCom(req) {
  if (!req.usuario.estacaoId) return "Só quem entrou por uma estação pode puxar outras.";
  if (req.params.id === req.usuario.estacaoId) return "Esta já é a sua estação.";
  const estacao = await prisma.estacao.findUnique({ where: { id: req.params.id } });
  if (!estacao) return "Estação não encontrada.";
  return null;
}

// POST /api/estacoes/:id/puxar
rotasEstacoes.post("/estacoes/:id/puxar", async (req, res) => {
  const problema = await problemaCom(req);
  if (problema) return res.status(400).json({ erro: problema });

  /* upsert = "update or insert": cria se não existe, e não faz nada se já
     existe. Puxar duas vezes (clique duplo) não dá erro de chave repetida */
  const chave = { atendenteId: req.usuario.atendenteId, estacaoId: req.params.id };
  await prisma.puxada.upsert({ where: { atendenteId_estacaoId: chave }, create: chave, update: {} });

  /* Tempo real: as conexões desta pessoa entram na sala da linha puxada.
     COM await: quando o front receber a resposta, já vai receber os avisos
     da estação nova */
  await atualizarSalas(req.usuario.atendenteId);

  // 204 = "deu certo, e não tenho nada para devolver"
  res.status(204).end();
  avisarEstacoes(); // a tela "Estações" de todos mostra quem puxou
});

// DELETE /api/estacoes/:id/puxar   (soltar a estação)
rotasEstacoes.delete("/estacoes/:id/puxar", async (req, res) => {
  const problema = await problemaCom(req);
  if (problema) return res.status(400).json({ erro: problema });

  // deleteMany (e não delete): soltar o que não estava puxado também não é erro
  await prisma.puxada.deleteMany({ where: { atendenteId: req.usuario.atendenteId, estacaoId: req.params.id } });
  await atualizarSalas(req.usuario.atendenteId); // sai da sala: os avisos da estação param de chegar
  res.status(204).end();
  avisarEstacoes();
});
