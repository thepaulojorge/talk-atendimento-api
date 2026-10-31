/* ENVIAR pelo WhatsApp: monta a mensagem no formato da Meta.

   Texto vai direto. Arquivo são dois passos: primeiro o arquivo sobe para
   a Meta (e ganha um id lá), depois a mensagem aponta para esse id */
import { readFile } from "node:fs/promises";
import { caminhoDe } from "../arquivos/disco.js";
import { ErroDaApi } from "../conversas/regras.js";
import { enviarMensagem, subirMidia } from "./graph.js";
import { webmParaOgg } from "./audio.js";
import { somenteDigitos } from "./numeros.js";

// Os formatos que o WhatsApp aceita em cada tipo de mensagem
const FOTOS = ["image/jpeg", "image/png"];
const AUDIOS = ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"];

/* Devolve o id da mensagem no WhatsApp ("wamid....").
   citadaWhatsappId: a mensagem respondida (o cliente vê a citação no celular) */
export async function enviarPeloWhatsapp({ linha, contato, tipo, texto, arquivo, citadaWhatsappId }) {
  const base = {
    // O número do jeito que o WhatsApp conhece (o "wa_id"), ou o do cadastro
    to: contato.whatsapp || somenteDigitos(contato.numero),
    ...(citadaWhatsappId ? { context: { message_id: citadaWhatsappId } } : {}),
  };

  if (tipo === "texto") {
    return enviarMensagem(linha.whatsappId, { ...base, type: "text", text: { body: texto, preview_url: false } });
  }

  // ---------- Arquivo (foto, documento ou áudio) ----------
  let conteudo;
  try {
    conteudo = await readFile(caminhoDe(arquivo.id));
  } catch {
    throw new ErroDaApi(410, "O arquivo não está mais no servidor. Envie de novo.");
  }
  let mime = arquivo.tipo;
  let nome = arquivo.nome;

  // Áudio gravado no Chrome (WebM): converte para OGG, o formato das mensagens de voz
  if (mime === "audio/webm") {
    conteudo = await webmParaOgg(conteudo);
    mime = "audio/ogg";
    nome = nome.replace(/\.webm$/i, ".ogg");
  }

  /* Qual "tipo" de mensagem do WhatsApp? Foto e áudio só em alguns
     formatos; o que não couber vai como DOCUMENTO (o cliente baixa) */
  let tipoWhatsapp = "document";
  if (FOTOS.includes(mime)) tipoWhatsapp = "image";
  else if (tipo === "audio" && AUDIOS.includes(mime)) tipoWhatsapp = "audio";

  const midiaId = await subirMidia(linha.whatsappId, { conteudo, tipo: mime, nome });
  const midia = { id: midiaId };
  if (tipoWhatsapp === "document") midia.filename = nome; // o nome que aparece para o cliente
  return enviarMensagem(linha.whatsappId, { ...base, type: tipoWhatsapp, [tipoWhatsapp]: midia });
}
