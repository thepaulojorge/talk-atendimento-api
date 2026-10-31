import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import {
  ErroDaApi,
  acharArquivo,
  acharConversa,
  acharMensagem,
  conteudoEmTexto,
  deOndeVeio,
  evento,
  exigirId,
  idValido,
  nomeDaConversa,
} from "../conversas/regras.js";
import { avisarAuditoria, avisarConversa } from "../tempoReal.js";
import { whatsappConfigurado } from "../whatsapp/graph.js";
import { enviarPeloWhatsapp } from "../whatsapp/enviar.js";

/* MENSAGENS: enviar (texto, áudio, nota, encaminhada), editar e apagar */
export const rotasMensagens = Router();

const LIMITE_TEXTO = 4096; // o mesmo limite do WhatsApp

/* POST /api/conversas/:id/mensagens
   corpo: { id, tipo: "texto"|"nota"|"audio"|"arquivo", texto?, arquivoId?, duracao?, respostaA?, encaminhada? }
   Áudio e arquivo: o arquivo já foi enviado antes (POST /api/arquivos) */
rotasMensagens.post("/conversas/:id/mensagens", exigirLogin, async (req, res) => {
  const conversa = await acharConversa(req, req.params.id);
  const { id, tipo, texto, arquivoId, duracao, respostaA, encaminhada } = req.body ?? {};
  exigirId(id);

  // ---------- 1. Validar o conteúdo ----------
  const conteudo = {};
  let arquivo = null;
  if (tipo === "texto" || tipo === "nota") {
    const limpo = typeof texto === "string" ? texto.trim() : "";
    if (!limpo || limpo.length > LIMITE_TEXTO) throw new ErroDaApi(400, `A mensagem deve ter de 1 a ${LIMITE_TEXTO} caracteres.`);
    conteudo.texto = limpo;
  } else if (tipo === "audio" || tipo === "arquivo") {
    /* acharArquivo confere se a pessoa pode usar este arquivo: foi ela que
       enviou, ou ele está numa conversa que ela vê (encaminhar) */
    arquivo = await acharArquivo(req, arquivoId);
    if (tipo === "audio" && !arquivo.tipo.startsWith("audio/")) throw new ErroDaApi(400, "Este arquivo não é um áudio.");
    conteudo.arquivoId = arquivo.id;
    if (tipo === "audio") conteudo.duracao = Number.isInteger(duracao) && duracao >= 0 && duracao <= 3600 ? duracao : 0;
  } else {
    throw new ErroDaApi(400, "Tipo de mensagem inválido.");
  }

  const ehNota = tipo === "nota";

  // Citação: só de uma mensagem da MESMA conversa
  let citada = null;
  if (respostaA && !ehNota) {
    citada = await prisma.mensagem.findFirst({ where: { id: String(respostaA), conversaId: conversa.id } });
  }

  /* ---------- 2. B7: a linha é um WhatsApp DE VERDADE? ----------
     Então a mensagem sai pela Meta ANTES de ser gravada aqui. Se a Meta
     recusar (24 horas, número inválido...), nada é gravado e quem enviou
     recebe o motivo. Nota interna nunca sai: ela é só da equipe */
  let whatsappId = null;
  const linha = await prisma.linha.findUnique({ where: { id: conversa.linhaId } });
  if (!ehNota && linha.whatsappId && whatsappConfigurado()) {
    if (conversa.tipo !== "contato") throw new ErroDaApi(400, "Mensagens para grupos ainda não saem pelo WhatsApp.");
    const contato = await prisma.contato.findUnique({ where: { id: conversa.contatoId } });
    whatsappId = await enviarPeloWhatsapp({
      linha,
      contato,
      tipo,
      texto: conteudo.texto,
      arquivo,
      citadaWhatsappId: citada?.whatsappId,
    });
  }

  /* ---------- 2. As regras (as mesmas do reducer do front) ----------
     - conversa da fila: quem respondeu assume
     - conversa resolvida: reabre
     Nota interna não conta como atender: não assume nem reabre */
  const agora = Date.now();
  const textosDosEventos = [];
  const mudancas = {};
  if (!ehNota && !conversa.atendenteId) {
    mudancas.atendenteId = req.usuario.atendenteId;
    textosDosEventos.push(`${req.usuario.nome} assumiu a conversa`);
  }
  if (!ehNota && conversa.status === "resolvida") {
    mudancas.status = "aberta";
    textosDosEventos.push(`${req.usuario.nome} reabriu a conversa`);
  }

  /* Os eventos ganham 1 milissegundo a menos cada: a lista é ordenada pelo
     horário, e "Paulo assumiu a conversa" precisa aparecer ANTES da mensagem.
     Os ids seguem o padrão do front: "<id da mensagem>-e0", "-e1"... */
  const eventos = textosDosEventos.map((t, i) =>
    evento(`${id}-e${i}`, conversa.id, t, new Date(agora - (textosDosEventos.length - i)))
  );

  await prisma.$transaction([
    prisma.conversa.update({ where: { id: conversa.id }, data: mudancas }),
    ...eventos.map((data) => prisma.mensagem.create({ data })),
    prisma.mensagem.create({
      data: {
        id,
        conversaId: conversa.id,
        tipo,
        ...conteudo,
        horario: new Date(agora),
        direcao: ehNota ? "interna" : "enviada",
        lida: ehNota, // nota: ninguém "lê" do outro lado
        autorId: req.usuario.atendenteId,
        respostaAId: citada?.id ?? null,
        encaminhada: encaminhada === true,
        whatsappId,
      },
    }),
  ]);
  res.status(204).end();
  avisarConversa(conversa.id);
});

/* Só quem escreveu edita ou apaga (as mesmas regras do permissoes.js do front).
   Áudio não se edita, só se apaga */
function podeEditar(usuario, m) {
  return !m.apagada && m.autorId === usuario.atendenteId && ((m.direcao === "enviada" && m.tipo === "texto") || m.tipo === "nota");
}
function podeApagar(usuario, m) {
  return !m.apagada && m.autorId === usuario.atendenteId && (m.direcao === "enviada" || m.tipo === "nota");
}

/* PATCH /api/mensagens/:id   corpo: { texto }
   A versão anterior vai para o histórico, e a supervisão ganha um registro */
rotasMensagens.patch("/mensagens/:id", exigirLogin, async (req, res) => {
  const { mensagem, conversa } = await acharMensagem(req, req.params.id);
  if (!podeEditar(req.usuario, mensagem)) throw new ErroDaApi(403, "Você não pode editar esta mensagem.");

  const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
  if (!texto || texto.length > LIMITE_TEXTO) throw new ErroDaApi(400, `A mensagem deve ter de 1 a ${LIMITE_TEXTO} caracteres.`);
  if (texto === mensagem.texto) return res.status(204).end(); // nada mudou, nada a registrar

  const agora = new Date();
  // O id do registro vem do front (o mesmo que ele já mostrou na tela), ou é criado aqui
  const idRegistro = idValido(req.body?.auditoriaId) ? req.body.auditoriaId : `aud-${randomUUID()}`;
  await prisma.$transaction([
    prisma.mensagem.update({
      where: { id: mensagem.id },
      // push: acrescenta no fim da lista (o Postgres guarda listas)
      data: { texto, editadaEm: agora, versoesAnteriores: { push: mensagem.texto } },
    }),
    prisma.auditoria.create({
      data: {
        id: idRegistro,
        tipo: "edicao",
        quando: agora,
        conversaId: conversa.id,
        conversaNome: nomeDaConversa(conversa),
        mensagemId: mensagem.id,
        tipoMensagem: mensagem.tipo,
        antes: conteudoEmTexto(mensagem),
        depois: texto,
        ...deOndeVeio(req),
      },
    }),
  ]);
  res.status(204).end();
  avisarConversa(conversa.id);
  avisarAuditoria(idRegistro);
});

/* DELETE /api/mensagens/:id
   Soft delete: a mensagem continua no banco, só marcada como apagada */
rotasMensagens.delete("/mensagens/:id", exigirLogin, async (req, res) => {
  const { mensagem, conversa } = await acharMensagem(req, req.params.id);
  if (!podeApagar(req.usuario, mensagem)) throw new ErroDaApi(403, "Você não pode apagar esta mensagem.");

  const agora = new Date();
  const idRegistro = idValido(req.body?.auditoriaId) ? req.body.auditoriaId : `aud-${randomUUID()}`;
  await prisma.$transaction([
    prisma.mensagem.update({
      where: { id: mensagem.id },
      data: { apagada: true, apagadaEm: agora, apagadaPorId: req.usuario.atendenteId },
    }),
    prisma.auditoria.create({
      data: {
        id: idRegistro,
        tipo: "exclusao",
        quando: agora,
        conversaId: conversa.id,
        conversaNome: nomeDaConversa(conversa),
        mensagemId: mensagem.id,
        tipoMensagem: mensagem.tipo,
        antes: conteudoEmTexto(mensagem),
        ...deOndeVeio(req),
      },
    }),
  ]);
  res.status(204).end();
  avisarConversa(conversa.id);
  avisarAuditoria(idRegistro);
});
