/* RECEBER: o que fazer com cada aviso (webhook) que a Meta manda.

   Um aviso pode trazer:
   - messages: mensagens novas dos clientes
   - statuses: o que aconteceu com as NOSSAS mensagens (enviada, entregue, lida, falhou)

   O formato (resumido):
   { entry: [{ changes: [{ value: {
       metadata: { phone_number_id },       <- PARA qual número da empresa
       contacts: [{ wa_id, profile: { name } }],
       messages: [{ id, from, timestamp, type, text: { body } }],
       statuses: [{ id, status, errors }]
   } }] }] } */
import { randomUUID } from "node:crypto";
import { prisma } from "../banco.js";
import { guardar } from "../arquivos/disco.js";
import { evento } from "../conversas/regras.js";
import { avisarContato, avisarConversa } from "../tempoReal.js";
import { baixarMidia } from "./graph.js";
import { formatarNumero, mesmoNumero } from "./numeros.js";
import { duracaoDoAudio } from "./audio.js";

const LIMITE_MIDIA = 16 * 1024 * 1024; // 16 MB: o que passar disso fica só como aviso no texto

export async function processarAviso(aviso) {
  for (const entrada of aviso?.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      if (mudanca.field !== "messages") continue;
      const valor = mudanca.value ?? {};

      // Para QUAL linha (número da empresa) é este aviso?
      const linha = await prisma.linha.findUnique({ where: { whatsappId: String(valor.metadata?.phone_number_id ?? "") } });
      if (!linha) {
        console.warn("⚠️ WhatsApp: aviso para um número que nenhuma linha usa:", valor.metadata?.phone_number_id);
        continue;
      }

      for (const mensagem of valor.messages ?? []) {
        const perfil = valor.contacts?.find((c) => c.wa_id === mensagem.from);
        await receberMensagem(linha, mensagem, perfil);
      }
      for (const status of valor.statuses ?? []) {
        await atualizarStatus(status);
      }
    }
  }
}

/* ---------- Uma mensagem nova do cliente ---------- */
async function receberMensagem(linha, msg, perfil) {
  // A Meta pode mandar o MESMO aviso mais de uma vez: se já guardamos, ignora
  if (await prisma.mensagem.findUnique({ where: { whatsappId: msg.id } })) return;
  // Reação (👍 numa mensagem) não vira mensagem nova
  if (msg.type === "reaction") return;

  const contato = await acharOuCriarContato(msg.from, perfil?.profile?.name);
  const conversa = await acharOuCriarConversa(linha, contato);
  const conteudo = await lerConteudo(msg);

  /* O horário vem da Meta em SEGUNDOS. Duas mensagens no mesmo segundo
     (uma foto e a legenda, por exemplo) empatariam, e a ordem na tela
     ficaria trocada. Por isso: nunca antes da última mensagem da conversa */
  const ultima = await prisma.mensagem.findFirst({ where: { conversaId: conversa.id }, orderBy: { horario: "desc" } });
  const segundos = Number(msg.timestamp) * 1000 || Date.now();
  const horario = new Date(Math.max(segundos, (ultima?.horario.getTime() ?? 0) + 1));
  const id = `m-${randomUUID()}`;
  const operacoes = [];

  // Conversa resolvida? O cliente escreveu de novo: ela reabre (com um evento no histórico)
  if (conversa.status === "resolvida") {
    operacoes.push(
      prisma.conversa.update({ where: { id: conversa.id }, data: { status: "aberta" } }),
      prisma.mensagem.create({
        data: evento(`${id}-e0`, conversa.id, "Conversa reaberta: o cliente enviou uma nova mensagem", new Date(horario.getTime() - 1)),
      })
    );
  }

  // O cliente respondeu (citou) uma mensagem? Achamos qual, pelo id do WhatsApp
  const citada = msg.context?.id ? await prisma.mensagem.findUnique({ where: { whatsappId: msg.context.id } }) : null;

  operacoes.push(
    prisma.mensagem.create({
      data: {
        id,
        conversaId: conversa.id,
        direcao: "recebida",
        horario,
        whatsappId: msg.id,
        respostaAId: citada?.conversaId === conversa.id ? citada.id : null,
        ...conteudo,
      },
    })
  );
  try {
    await prisma.$transaction(operacoes);
  } catch (erro) {
    // P2002: o mesmo aviso chegou duas vezes ao mesmo tempo, e o outro já gravou. Tudo certo
    if (erro.code === "P2002") return;
    throw erro;
  }
  avisarConversa(conversa.id); // aparece ao vivo na tela de quem atende a linha
}

/* O contato pelo número. Já existe (com ou sem o 9 do celular)? Usa ele.
   Senão, cria um "não salvo" com o nome do perfil do WhatsApp */
async function acharOuCriarContato(waId, nomeDoPerfil) {
  const todos = await prisma.contato.findMany({ select: { id: true, numero: true, whatsapp: true } });
  const existente = todos.find((c) => mesmoNumero(c.numero, waId));
  if (existente) {
    // Guarda o número do jeito que o WhatsApp conhece: é para ele que vamos responder
    if (existente.whatsapp !== waId) await prisma.contato.update({ where: { id: existente.id }, data: { whatsapp: waId } });
    return existente;
  }
  const numero = formatarNumero(waId);
  const novo = await prisma.contato.create({
    data: { id: `ct-${randomUUID()}`, nome: nomeDoPerfil?.trim() || numero, numero, whatsapp: waId, salvo: false },
  });
  avisarContato(novo.id);
  return novo;
}

/* A conversa deste contato NESTA linha (o mesmo cliente pode falar com a
   E01 e com a E02: são conversas separadas). Não existe? Nasce na fila */
async function acharOuCriarConversa(linha, contato) {
  const existente = await prisma.conversa.findFirst({ where: { linhaId: linha.id, contatoId: contato.id, tipo: "contato" } });
  if (existente) return existente;
  return prisma.conversa.create({
    data: { id: `c-${randomUUID()}`, tipo: "contato", linhaId: linha.id, contatoId: contato.id },
  });
}

/* O CONTEÚDO da mensagem, no formato da tabela de mensagens.
   Texto vira texto; foto, áudio, documento, vídeo e figurinha viram ARQUIVO
   (baixado da Meta e guardado na nossa pasta). O resto vira um aviso em texto */
const TIPOS_COM_MIDIA = ["image", "audio", "document", "video", "sticker"];
const NOMES = { location: "localização", contacts: "contato", interactive: "resposta de botão", button: "resposta de botão", unsupported: "mensagem" };

async function lerConteudo(msg) {
  if (msg.type === "text") return { tipo: "texto", texto: msg.text?.body ?? "" };

  if (TIPOS_COM_MIDIA.includes(msg.type)) {
    const midia = msg[msg.type]; // { id, mime_type, caption?, filename?, voice? }
    try {
      const guardado = await guardarMidia(midia, msg.type);
      if (!guardado) return { tipo: "texto", texto: `📎 O cliente enviou um arquivo grande demais (mais de 16 MB).` };
      return {
        tipo: msg.type === "audio" ? "audio" : "arquivo",
        arquivoId: guardado.arquivo.id,
        texto: midia.caption || null, // a legenda da foto ou do documento
        // A Meta não informa a duração do áudio: o ffmpeg mede
        duracao: msg.type === "audio" ? await duracaoDoAudio(guardado.conteudo) : null,
      };
    } catch (erro) {
      console.error("❌ WhatsApp: não foi possível baixar a mídia:", erro.message);
      return { tipo: "texto", texto: "📎 O cliente enviou um arquivo, mas não foi possível baixá-lo." };
    }
  }

  return { tipo: "texto", texto: `ℹ️ O cliente enviou um(a) ${NOMES[msg.type] || msg.type}, que este sistema ainda não mostra.` };
}

/* Baixa da Meta e guarda na pasta + na tabela de arquivos (como um upload).
   Devolve { arquivo, conteudo }, ou null se for grande demais */
async function guardarMidia(midia, tipoDaMensagem) {
  const { conteudo, tipo } = await baixarMidia(midia.id);
  if (conteudo.length > LIMITE_MIDIA) return null;
  const id = `arq-${randomUUID()}`;
  const extensao = (tipo.split("/")[1] || "bin").replace("mpeg", "mp3").replace("jpeg", "jpg");
  const nome = midia.filename || `${tipoDaMensagem}-${new Date().toISOString().slice(0, 10)}.${extensao}`;
  await guardar(id, conteudo);
  const arquivo = await prisma.arquivo.create({
    data: { id, nome: nome.slice(0, 120), tipo: tipo || "application/octet-stream", tamanho: conteudo.length },
  });
  return { arquivo, conteudo };
}

/* ---------- O que aconteceu com uma mensagem NOSSA ----------
   sent (✓) -> delivered (✓✓) -> read (✓✓ azul), ou failed */
async function atualizarStatus(status) {
  const mensagem = await prisma.mensagem.findUnique({ where: { whatsappId: status.id } });
  if (!mensagem) return; // uma mensagem que não saiu daqui (ex.: enviada pelo celular)

  if (status.status === "read" && !mensagem.lida) {
    await prisma.mensagem.update({ where: { id: mensagem.id }, data: { lida: true } });
  } else if (status.status === "failed") {
    const erro = status.errors?.[0];
    const motivo = erro?.error_data?.details || erro?.title || erro?.message || "o WhatsApp não entregou";
    await prisma.mensagem.update({ where: { id: mensagem.id }, data: { erroEnvio: motivo.slice(0, 300) } });
  } else {
    return; // "sent" e "delivered": por enquanto, nada muda na tela
  }
  avisarConversa(mensagem.conversaId);
}
