import express, { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import { ErroDaApi, acharArquivo, exigirId } from "../conversas/regras.js";
import { caminhoDe, existe, guardar } from "../arquivos/disco.js";

/* ARQUIVOS: enviar (upload) e abrir/baixar (download).

   Enviar um arquivo com mensagem são DOIS pedidos:
   1. POST /api/arquivos  -> o arquivo vai para a pasta do servidor
   2. POST /api/conversas/:id/mensagens { tipo: "arquivo", arquivoId } -> a mensagem aponta para ele
   Separados, porque o arquivo é pesado e a mensagem é leve: se a mensagem
   falhar, não precisa mandar o arquivo de novo */
export const rotasArquivos = Router();

export const LIMITE_ARQUIVO = 10 * 1024 * 1024; // 10 MB

/* Só estes tipos entram. Uma LISTA DO QUE PODE (e não do que não pode):
   um tipo novo e perigoso fica de fora sozinho.
   SVG e HTML NUNCA: o navegador roda o código que vem dentro deles */
const TIPOS_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "text/plain",
  "text/csv",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

// Estes o navegador pode MOSTRAR (foto, PDF, áudio). Os outros, só baixar
const MOSTRAVEIS = /^(image\/|audio\/|application\/pdf$)/;

/* POST /api/arquivos
   O corpo do pedido é o PRÓPRIO arquivo (e não um JSON). Os dados sobre
   ele vão nos cabeçalhos:
   - Content-Type: o tipo ("application/pdf")
   - X-Arquivo-Id: o id criado pelo front
   - X-Arquivo-Nome: o nome original (codificado, por causa dos acentos)

   express.raw: lê o corpo como bytes "crus" (um Buffer), até 10 MB.
   Só nesta rota: nas outras, o corpo continua sendo JSON */
rotasArquivos.post(
  "/arquivos",
  exigirLogin,
  express.raw({ type: () => true, limit: LIMITE_ARQUIVO }),
  async (req, res) => {
    const id = exigirId(req.get("X-Arquivo-Id"));
    // "audio/webm;codecs=opus" -> "audio/webm": só o tipo, sem os detalhes
    const tipo = (req.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!TIPOS_PERMITIDOS.has(tipo)) throw new ErroDaApi(415, "Este tipo de arquivo não é aceito.");

    const conteudo = req.body;
    if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) throw new ErroDaApi(400, "O arquivo está vazio.");

    let nome;
    try {
      nome = decodeURIComponent(req.get("X-Arquivo-Nome") || "arquivo");
    } catch {
      nome = "arquivo";
    }
    // Tira caracteres de controle e limita o tamanho: o nome só é MOSTRADO, nunca usado no disco
    nome = nome.replace(/[\u0000-\u001f\\/]/g, "_").slice(0, 120) || "arquivo";

    // Primeiro o disco, depois o banco: se o disco falhar, o banco não fica com um arquivo "fantasma"
    await guardar(id, conteudo);
    await prisma.arquivo.create({
      data: { id, nome, tipo, tamanho: conteudo.length, enviadoPorId: req.usuario.atendenteId },
    });

    res.status(201).json({ id, nome, tipo, tamanho: conteudo.length });
  }
);

/* GET /api/arquivos/:id         -> abre (foto, PDF e áudio aparecem no navegador)
   GET /api/arquivos/:id?baixar  -> baixa, com o nome original */
rotasArquivos.get("/arquivos/:id", exigirLogin, async (req, res) => {
  const arquivo = await acharArquivo(req, req.params.id);
  // 410 = "existiu, mas não está mais aqui" (o disco do Render foi apagado, por exemplo)
  if (!(await existe(arquivo.id))) throw new ErroDaApi(410, "Arquivo indisponível.");

  const baixar = "baixar" in req.query || !MOSTRAVEIS.test(arquivo.tipo);
  // filename*=UTF-8'': o jeito certo de mandar um nome com acentos ("orçamento.pdf")
  const nome = encodeURIComponent(arquivo.nome);
  res.set({
    "Content-Type": arquivo.tipo,
    "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename*=UTF-8''${nome}`,
    // nosniff: o navegador obedece o Content-Type e não tenta "adivinhar" o tipo
    "X-Content-Type-Options": "nosniff",
    // O arquivo nunca muda (o id é sempre de um arquivo só): o navegador pode guardar por 1 dia
    "Cache-Control": "private, max-age=86400",
  });
  res.sendFile(caminhoDe(arquivo.id));
});
