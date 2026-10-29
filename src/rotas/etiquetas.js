import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import { ErroDaApi, idValido } from "../conversas/regras.js";
import { avisarEtiquetas } from "../tempoReal.js";

/* ETIQUETAS: renomear as personalizáveis ("Personalizada 1" -> "Cobrança").
   Colocar e tirar etiqueta de uma conversa fica em rotas/conversas.js */
export const rotasEtiquetas = Router();

// Para comparar nomes: "Cobrança" e " cobranca " contam como iguais
const normalizar = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// PATCH /api/etiquetas/:id   corpo: { nome }
rotasEtiquetas.patch("/etiquetas/:id", exigirLogin, async (req, res) => {
  const etiqueta = idValido(req.params.id) && (await prisma.etiqueta.findUnique({ where: { id: req.params.id } }));
  if (!etiqueta) throw new ErroDaApi(404, "Etiqueta não encontrada.");
  if (!etiqueta.editavel) throw new ErroDaApi(403, "Esta etiqueta não pode ser renomeada.");

  const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : "";
  if (!nome || nome.length > 24) throw new ErroDaApi(400, "O nome deve ter de 1 a 24 caracteres.");

  const todas = await prisma.etiqueta.findMany();
  if (todas.some((e) => e.id !== etiqueta.id && normalizar(e.nome) === normalizar(nome))) {
    throw new ErroDaApi(400, "Já existe uma etiqueta com esse nome.");
  }

  await prisma.etiqueta.update({ where: { id: etiqueta.id }, data: { nome } });
  res.status(204).end();
  avisarEtiquetas();
});
