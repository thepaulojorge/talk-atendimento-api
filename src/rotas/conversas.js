import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import { linhasDoUsuario } from "../autenticacao/linhas.js";
import {
  ErroDaApi,
  acharConversa,
  conteudoEmTexto,
  deOndeVeio,
  evento,
  exigirId,
  idValido,
  nomeDaConversa,
} from "../conversas/regras.js";

/* CONVERSAS: tudo o que muda uma conversa (menos as mensagens, que
   estão em rotas/mensagens.js).

   Cada rota responde 204 ("deu certo, nada a devolver"): o front já
   mostrou a mudança na tela antes de pedir. Se der erro, ele busca
   tudo de novo e a tela volta a ficar igual ao banco */
export const rotasConversas = Router();
rotasConversas.use("/conversas", exigirLogin);

const LIMITE_FIXADAS = 3;

/* POST /api/conversas   (iniciar uma conversa pela aba Contatos)
   corpo: { id, contatoId, linhaId, novoContato? } */
rotasConversas.post("/conversas", async (req, res) => {
  const { id, contatoId, linhaId, novoContato } = req.body ?? {};
  exigirId(id);
  exigirId(contatoId);

  // Só dá para começar pela linha que a pessoa atende
  const linhas = await linhasDoUsuario(req.usuario);
  if (!linhas.some((l) => l.id === linhaId)) throw new ErroDaApi(400, "Você não atende esta linha.");

  if (novoContato) {
    // Número não salvo: o contato nasce aqui, com salvo = false
    const numero = String(novoContato.numero ?? "");
    if (novoContato.id !== contatoId || !/^\+?[\d\s()-]{10,20}$/.test(numero)) {
      throw new ErroDaApi(400, "Número inválido.");
    }
    await prisma.contato.create({ data: { id: contatoId, nome: numero, numero, salvo: false } });
  } else if (!(await prisma.contato.findUnique({ where: { id: contatoId } }))) {
    throw new ErroDaApi(400, "Contato não encontrado.");
  }

  await prisma.conversa.create({
    data: { id, tipo: "contato", linhaId, contatoId, atendenteId: req.usuario.atendenteId },
  });
  res.status(204).end();
});

/* PATCH /api/conversas/:id   (as marcações simples)
   corpo: só o que mudou -> { fixada?, arquivada?, marcadaNaoLida?, lida? }
   PATCH = "mude só estes campos" (o PUT trocaria o objeto inteiro).
   O front manda o valor FINAL ("fixada: true") e não "alterne": assim,
   repetir o pedido (internet instável) não desfaz o que foi feito */
rotasConversas.patch("/conversas/:id", async (req, res) => {
  const conversa = await acharConversa(req, req.params.id);
  const { fixada, arquivada, marcadaNaoLida, lida } = req.body ?? {};
  const dados = {};

  if (typeof arquivada === "boolean") {
    dados.arquivada = arquivada;
    if (arquivada) dados.fixadaEm = null; // arquivar também desafixa
  }

  if (typeof fixada === "boolean" && !dados.arquivada) {
    if (fixada && !conversa.fixadaEm) {
      if (conversa.arquivada) throw new ErroDaApi(400, "Conversa arquivada não pode ser fixada.");
      // O limite conta as fixadas que ESTA pessoa vê (as das linhas dela)
      const linhas = await linhasDoUsuario(req.usuario);
      const fixadas = await prisma.conversa.count({
        where: { linhaId: { in: linhas.map((l) => l.id) }, fixadaEm: { not: null } },
      });
      if (fixadas >= LIMITE_FIXADAS) throw new ErroDaApi(400, `Você só pode fixar até ${LIMITE_FIXADAS} conversas.`);
      dados.fixadaEm = new Date();
    } else if (!fixada) {
      dados.fixadaEm = null;
    }
  }

  if (marcadaNaoLida === true) dados.marcadaNaoLida = true;

  /* lida: as mensagens RECEBIDAS ficam lidas e a marcação manual some.
     São duas tabelas, então vai numa transação: as duas mudam, ou nenhuma */
  const operacoes = [];
  if (lida === true) {
    dados.marcadaNaoLida = false;
    operacoes.push(
      prisma.mensagem.updateMany({ where: { conversaId: conversa.id, direcao: "recebida", lida: false }, data: { lida: true } })
    );
  }
  operacoes.push(prisma.conversa.update({ where: { id: conversa.id }, data: dados }));
  await prisma.$transaction(operacoes);

  res.status(204).end();
});

/* POST /api/conversas/:id/assumir   corpo: { eventoId }
   Quem assume é SEMPRE quem está logado (vem do token, não do corpo) */
rotasConversas.post("/conversas/:id/assumir", async (req, res) => {
  const conversa = await acharConversa(req, req.params.id);
  const eventoId = exigirId(req.body?.eventoId);
  if (conversa.atendenteId === req.usuario.atendenteId) return res.status(204).end(); // já era sua

  await prisma.$transaction([
    prisma.conversa.update({ where: { id: conversa.id }, data: { atendenteId: req.usuario.atendenteId } }),
    prisma.mensagem.create({ data: evento(eventoId, conversa.id, `${req.usuario.nome} assumiu a conversa`, new Date()) }),
  ]);
  res.status(204).end();
});

/* POST /api/conversas/:id/transferir   corpo: { destinoId, eventoId }
   destinoId = id de um atendente, ou null para devolver à fila */
rotasConversas.post("/conversas/:id/transferir", async (req, res) => {
  const conversa = await acharConversa(req, req.params.id);
  const eventoId = exigirId(req.body?.eventoId);
  const destinoId = req.body?.destinoId ?? null;
  if (conversa.atendenteId === destinoId) return res.status(204).end();

  let texto = `${req.usuario.nome} devolveu a conversa para a fila`;
  if (destinoId !== null) {
    const destino = idValido(destinoId) && (await prisma.atendente.findUnique({ where: { id: destinoId } }));
    if (!destino) throw new ErroDaApi(400, "Atendente não encontrado.");
    texto = `${req.usuario.nome} transferiu a conversa para ${destino.nome}`;
  }

  await prisma.$transaction([
    prisma.conversa.update({ where: { id: conversa.id }, data: { atendenteId: destinoId } }),
    prisma.mensagem.create({ data: evento(eventoId, conversa.id, texto, new Date()) }),
  ]);
  res.status(204).end();
});

/* POST /api/conversas/:id/resolver   corpo: { resolvida: true|false, eventoId } */
rotasConversas.post("/conversas/:id/resolver", async (req, res) => {
  const conversa = await acharConversa(req, req.params.id);
  const eventoId = exigirId(req.body?.eventoId);
  const resolvida = req.body?.resolvida === true;
  if ((conversa.status === "resolvida") === resolvida) return res.status(204).end(); // já estava assim

  const texto = resolvida ? `${req.usuario.nome} marcou a conversa como resolvida` : `${req.usuario.nome} reabriu a conversa`;
  await prisma.$transaction([
    prisma.conversa.update({ where: { id: conversa.id }, data: { status: resolvida ? "resolvida" : "aberta" } }),
    prisma.mensagem.create({ data: evento(eventoId, conversa.id, texto, new Date()) }),
  ]);
  res.status(204).end();
});

/* PUT e DELETE /api/conversas/:id/etiquetas/:etiquetaId
   PUT = coloca a etiqueta; DELETE = tira. Os dois podem ser repetidos sem problema */
rotasConversas.put("/conversas/:id/etiquetas/:etiquetaId", async (req, res) => {
  const conversa = await acharConversa(req, req.params.id);
  const etiqueta = idValido(req.params.etiquetaId) && (await prisma.etiqueta.findUnique({ where: { id: req.params.etiquetaId } }));
  if (!etiqueta) throw new ErroDaApi(404, "Etiqueta não encontrada.");
  // connect: liga a conversa à etiqueta (na tabela do meio, que o Prisma cuida)
  await prisma.conversa.update({ where: { id: conversa.id }, data: { etiquetas: { connect: { id: etiqueta.id } } } });
  res.status(204).end();
});

rotasConversas.delete("/conversas/:id/etiquetas/:etiquetaId", async (req, res) => {
  const conversa = await acharConversa(req, req.params.id, { etiquetas: true });
  if (conversa.etiquetas.some((e) => e.id === req.params.etiquetaId)) {
    await prisma.conversa.update({ where: { id: conversa.id }, data: { etiquetas: { disconnect: { id: req.params.etiquetaId } } } });
  }
  res.status(204).end();
});

/* DELETE /api/conversas/:id   (excluir a conversa inteira)
   Antes de apagar, uma CÓPIA em texto vai para a auditoria: excluir a
   conversa não pode ser um jeito de esconder mensagens da supervisão */
rotasConversas.delete("/conversas/:id", async (req, res) => {
  const conversa = await acharConversa(req, req.params.id, {
    contato: true,
    mensagens: { orderBy: { horario: "asc" }, include: { autor: true } },
  });
  const nome = nomeDaConversa(conversa);

  // Quem escreveu cada mensagem, com nome (o registro é lido depois, por outra pessoa)
  const quem = (m) => {
    if (m.tipo === "nota") return `📝 ${m.autor?.nome || "Equipe"}`;
    if (m.direcao === "enviada") return m.autor?.nome || "Equipe";
    return m.autorNome || nome; // participante do grupo, ou o próprio contato
  };
  const copia = conversa.mensagens
    .filter((m) => m.tipo !== "sistema")
    .map((m) => ({
      quem: quem(m),
      quando: m.horario.toISOString(),
      texto: conteudoEmTexto(m) + (m.apagada ? " (já estava apagada)" : ""),
    }));

  /* Uma transação: o registro na auditoria E a exclusão. Se um falhar,
     o outro é desfeito (nunca uma conversa sumida sem registro).
     As mensagens vão junto sozinhas (onDelete: Cascade no schema) */
  await prisma.$transaction([
    prisma.auditoria.create({
      data: {
        id: `aud-${randomUUID()}`,
        tipo: "conversa",
        quando: new Date(),
        conversaId: conversa.id,
        conversaNome: nome,
        mensagens: copia,
        ...deOndeVeio(req),
      },
    }),
    prisma.conversa.delete({ where: { id: conversa.id } }),
  ]);
  res.status(204).end();
});
