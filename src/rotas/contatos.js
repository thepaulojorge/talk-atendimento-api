import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import { ErroDaApi, idValido } from "../conversas/regras.js";
import { formatarNumero, mesmoNumero, semNoveDoCelular, somenteDigitos } from "../whatsapp/numeros.js";
import { avisarContato } from "../tempoReal.js";
import { filtroDeContatos } from "../autenticacao/linhas.js";

/* CONTATOS: editar o NOME e o NÚMERO (só esses dois, de propósito).
   Qualquer pessoa logada pode: corrigir o nome de um cliente é parte
   do atendimento do dia a dia */
export const rotasContatos = Router();

/* O número digitado, do jeito que vier ("(21) 98811-0001", "+55 21 98811 0001"...),
   vira o formato padrão "+55 21 98811-0001".
   Sem o código do país (10 ou 11 dígitos: DDD + número)? É do Brasil: ganha o 55 */
function lerNumero(texto) {
  let digitos = somenteDigitos(texto);
  if (!String(texto).trim().startsWith("+") && (digitos.length === 10 || digitos.length === 11)) {
    digitos = "55" + digitos;
  }
  if (digitos.length < 10 || digitos.length > 15) {
    throw new ErroDaApi(400, "Número inválido. Use DDD + número, por exemplo (21) 98811-0001.");
  }
  return formatarNumero(digitos);
}

// PATCH /api/contatos/:id   corpo: { nome, numero }
rotasContatos.patch("/contatos/:id", exigirLogin, async (req, res) => {
  /* Na demonstração, os clientes REAIS nem aparecem (filtroDeContatos).
     Para quem é da demonstração, eles "não existem": 404 */
  const contato =
    idValido(req.params.id) &&
    (await prisma.contato.findFirst({ where: { id: req.params.id, ...filtroDeContatos(req.usuario) } }));
  if (!contato) throw new ErroDaApi(404, "Contato não encontrado.");

  const nome = typeof req.body?.nome === "string" ? req.body.nome.trim() : "";
  if (!nome || nome.length > 60) throw new ErroDaApi(400, "O nome deve ter de 1 a 60 caracteres.");
  const numero = lerNumero(req.body?.numero ?? "");

  // O mesmo número (com ou sem o 9 do celular) em OUTRO contato? Seriam duas pessoas iguais
  const outros = await prisma.contato.findMany({ where: { id: { not: contato.id } }, select: { numero: true } });
  if (outros.some((c) => mesmoNumero(c.numero, numero))) {
    throw new ErroDaApi(409, "Já existe um contato com esse número.");
  }

  /* Mudou o número de verdade (e não só o jeito de escrever)? Então o
     número que o WhatsApp conhecia (o "wa_id") não vale mais: as próximas
     respostas vão para o número novo. E salvo = true: alguém conferiu */
  const numeroMudou = semNoveDoCelular(numero) !== semNoveDoCelular(contato.numero);
  const atualizado = await prisma.contato.update({
    where: { id: contato.id },
    data: { nome, numero, salvo: true, ...(numeroMudou ? { whatsapp: null } : {}) },
  });
  res.json(atualizado);
  avisarContato(atualizado.id);
});
