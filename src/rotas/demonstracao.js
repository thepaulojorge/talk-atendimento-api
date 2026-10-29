import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import { popularComExemplos } from "../dados/exemplos.js";
import { ErroDaApi, acharConversa, acharMensagem, evento, exigirId } from "../conversas/regras.js";

/* FERRAMENTAS DO MODO DEMONSTRAÇÃO (o portfólio).
   Numa empresa de verdade, MODO_DEMONSTRACAO fica false e TODAS as rotas
   daqui respondem 404: é como se não existissem.
   - restaurar os dados de exemplo
   - simular o cliente escrevendo e lendo (até o WhatsApp de verdade, na B7) */
export const rotasDemonstracao = Router();

rotasDemonstracao.use("/demonstracao", exigirLogin, (req, res, next) => {
  if (process.env.MODO_DEMONSTRACAO !== "true") throw new ErroDaApi(404, "O modo demonstração está desligado.");
  next();
});

/* POST /api/demonstracao/restaurar
   ⚠️ Volta o banco INTEIRO ao exemplo, para todo mundo que estiver usando */
rotasDemonstracao.post("/demonstracao/restaurar", async (req, res) => {
  await popularComExemplos(prisma);
  res.status(204).end();
});

/* POST /api/demonstracao/conversas/:id/recebida   corpo: { id, texto, autor? }
   Finge que o cliente escreveu. Conversa resolvida reabre sozinha */
rotasDemonstracao.post("/demonstracao/conversas/:id/recebida", async (req, res) => {
  const conversa = await acharConversa(req, req.params.id);
  const id = exigirId(req.body?.id);
  const texto = String(req.body?.texto ?? "").slice(0, 500);
  // Num grupo, quem escreveu tem que ser um dos participantes
  const autor = conversa.tipo === "grupo" && conversa.participantes.includes(req.body?.autor) ? req.body.autor : null;

  const agora = Date.now();
  const novas = [];
  if (conversa.status === "resolvida") {
    novas.push(evento(`${id}-e0`, conversa.id, "Conversa reaberta: o cliente enviou uma nova mensagem", new Date(agora - 1)));
  }
  novas.push({ id, conversaId: conversa.id, tipo: "texto", direcao: "recebida", texto, autorNome: autor, horario: new Date(agora) });

  await prisma.$transaction([
    prisma.conversa.update({ where: { id: conversa.id }, data: { status: "aberta" } }),
    ...novas.map((data) => prisma.mensagem.create({ data })),
  ]);
  res.status(204).end();
});

// POST /api/demonstracao/mensagens/:id/lida   (finge que o cliente leu: ✓✓ azul)
rotasDemonstracao.post("/demonstracao/mensagens/:id/lida", async (req, res) => {
  const { mensagem } = await acharMensagem(req, req.params.id);
  if (mensagem.direcao === "enviada") await prisma.mensagem.update({ where: { id: mensagem.id }, data: { lida: true } });
  res.status(204).end();
});
