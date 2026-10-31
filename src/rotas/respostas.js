import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import { ErroDaApi } from "../conversas/regras.js";
import { avisarRespostas } from "../tempoReal.js";

/* RESPOSTAS RÁPIDAS: criar, editar e apagar.
   Liberado para TODA a operação (não só supervisão e diretoria): no meio
   do atendimento, quem precisa de uma resposta nova não pode ficar
   esperando alguém com permissão.

   O atalho é o "nome" da resposta (o que se digita depois da "/"):
   letras minúsculas sem acento, números e "-", de 1 a 20 caracteres.
   Ele é a CHAVE no banco (@id), então dois atalhos iguais não existem */
export const rotasRespostas = Router();

const FORMATO_ATALHO = /^[a-z0-9-]{1,20}$/;
const LIMITE_TEXTO = 1000;

// Confere o corpo { atalho, texto } e devolve os dois já limpos
function lerResposta(corpo) {
  const atalho = typeof corpo?.atalho === "string" ? corpo.atalho.trim().replace(/^\//, "") : "";
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim() : "";
  if (!FORMATO_ATALHO.test(atalho)) {
    throw new ErroDaApi(400, "O atalho deve ter de 1 a 20 caracteres: letras minúsculas sem acento, números e \"-\".");
  }
  if (!texto || texto.length > LIMITE_TEXTO) throw new ErroDaApi(400, `O texto deve ter de 1 a ${LIMITE_TEXTO} caracteres.`);
  return { atalho, texto };
}

/* A DEMONSTRAÇÃO usa o mesmo banco. Se alguma linha estiver ligada ao
   WhatsApp de verdade, as respostas rápidas são as da operação REAL:
   um visitante da demonstração não pode mexer nelas */
async function protegerOperacaoReal(req) {
  if (!req.usuario.demo) return;
  const linhasReais = await prisma.linha.count({ where: { whatsappId: { not: null } } });
  if (linhasReais > 0) throw new ErroDaApi(403, "Na demonstração, as respostas rápidas não podem ser alteradas agora.");
}

// Atalho repetido: o banco recusa com o código P2002 (chave única). Viramos isso em 409
function atalhoRepetido(erro) {
  if (erro.code === "P2002") throw new ErroDaApi(409, "Já existe uma resposta com esse atalho.");
  throw erro;
}

// POST /api/respostas   corpo: { atalho, texto }
rotasRespostas.post("/respostas", exigirLogin, async (req, res) => {
  await protegerOperacaoReal(req);
  const dados = lerResposta(req.body);
  await prisma.respostaRapida.create({ data: dados }).catch(atalhoRepetido);
  res.status(201).json(dados);
  avisarRespostas();
});

/* PUT /api/respostas/:atalho   corpo: { atalho, texto }
   O atalho pode MUDAR ("/boleto" -> "/segunda-via"). Como ele é a chave,
   mudar = apagar a antiga e criar a nova. A $transaction faz as duas
   coisas JUNTAS: se a segunda falhar (atalho repetido), a primeira é
   desfeita, e nada se perde */
rotasRespostas.put("/respostas/:atalho", exigirLogin, async (req, res) => {
  await protegerOperacaoReal(req);
  const antigo = req.params.atalho;
  const dados = lerResposta(req.body);
  if (!FORMATO_ATALHO.test(antigo) || !(await prisma.respostaRapida.findUnique({ where: { atalho: antigo } }))) {
    throw new ErroDaApi(404, "Resposta rápida não encontrada.");
  }

  if (antigo === dados.atalho) {
    await prisma.respostaRapida.update({ where: { atalho: antigo }, data: { texto: dados.texto } });
  } else {
    await prisma
      .$transaction([
        prisma.respostaRapida.delete({ where: { atalho: antigo } }),
        prisma.respostaRapida.create({ data: dados }),
      ])
      .catch(atalhoRepetido);
  }
  res.json(dados);
  avisarRespostas();
});

// DELETE /api/respostas/:atalho
rotasRespostas.delete("/respostas/:atalho", exigirLogin, async (req, res) => {
  await protegerOperacaoReal(req);
  const { count } = await prisma.respostaRapida.deleteMany({ where: { atalho: req.params.atalho } });
  if (count === 0) throw new ErroDaApi(404, "Resposta rápida não encontrada.");
  res.status(204).end();
  avisarRespostas();
});
