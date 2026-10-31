import { createHmac, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { processarAviso } from "../whatsapp/receber.js";

/* WEBHOOK DO WHATSAPP: o endereço que a META chama para nos avisar das
   mensagens novas. Não tem login (quem chama é a Meta, não uma pessoa).
   A segurança vem de duas conferências:
   1. GET (uma vez, ao configurar): a Meta manda o "token de verificação"
      que VOCÊ inventou e colou no painel dela. Bateu? Respondemos o desafio
   2. POST (cada aviso): a Meta ASSINA o corpo com o "segredo do app".
      Conferimos a assinatura: sem ela, qualquer um poderia mandar
      mensagens falsas para cá fingindo ser a Meta

   O endereço completo, para colar no painel da Meta:
   https://talk-atendimento-api.onrender.com/api/whatsapp/webhook */
export const rotasWhatsapp = Router();

let filaDeAvisos = Promise.resolve();

// GET: a verificação. A Meta manda ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=123
rotasWhatsapp.get("/whatsapp/webhook", (req, res) => {
  const esperado = process.env.WHATSAPP_TOKEN_VERIFICACAO;
  const confere = esperado && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === esperado;
  if (!confere) return res.status(403).send("Token de verificação incorreto.");
  // Responde o desafio EXATAMENTE como veio, em texto puro (não JSON)
  res.type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
});

/* A assinatura: "sha256=<hmac>". O HMAC é calculado sobre os bytes
   EXATOS do corpo, com o segredo do app. Por isso esta rota lê o corpo
   "cru" (express.raw), e não como JSON: transformar em objeto e de volta
   em texto poderia mudar um espaço e a assinatura não bateria mais */
function assinaturaConfere(corpo, cabecalho = "") {
  const segredo = process.env.WHATSAPP_SEGREDO_APP;
  if (!segredo || !Buffer.isBuffer(corpo)) return false;
  const esperada = Buffer.from(`sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`);
  const recebida = Buffer.from(String(cabecalho));
  /* timingSafeEqual: compara sem "pressa". Uma comparação comum para no
     primeiro caractere diferente, e o TEMPO da resposta entregaria quantos
     caracteres o invasor acertou. Esta leva sempre o mesmo tempo */
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
}

rotasWhatsapp.post("/whatsapp/webhook", express.raw({ type: () => true, limit: "1mb" }), (req, res) => {
  /* Anotações nos LOGS (no Render: aba "Logs"). Só o tipo do aviso,
     nunca o conteúdo das mensagens: log não é lugar de conversa de cliente */
  console.log("📩 WhatsApp: aviso recebido da Meta");
  if (!assinaturaConfere(req.body, req.get("X-Hub-Signature-256"))) {
    console.warn("⚠️ WhatsApp: assinatura inválida. Confira o WHATSAPP_SEGREDO_APP (Configurações do app > Básico > Chave secreta)");
    return res.status(401).json({ erro: "Assinatura inválida." });
  }

  let aviso;
  try {
    aviso = JSON.parse(req.body.toString("utf-8"));
  } catch {
    return res.status(400).json({ erro: "Corpo inválido." });
  }

  /* Responde 200 NA HORA e processa depois. A Meta espera resposta
     rápida: se demorar (baixar uma foto pode levar segundos), ela acha
     que falhou e manda o mesmo aviso de novo */
  res.sendStatus(200);

  /* Uma FILA (como a do front): os avisos são processados um de cada vez,
     na ordem em que chegaram. Sem ela, duas mensagens de um cliente novo
     chegando juntas poderiam criar DOIS contatos e DUAS conversas */
  filaDeAvisos = filaDeAvisos
    .then(() => processarAviso(aviso))
    .catch((erro) => console.error("❌ Erro ao processar aviso do WhatsApp:", erro));
});
