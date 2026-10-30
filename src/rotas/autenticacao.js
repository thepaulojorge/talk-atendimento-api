import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../banco.js";
import { criarToken } from "../autenticacao/tokens.js";
import { resolverSessao } from "../autenticacao/sessao.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import { atualizarSalas, avisarEstacoes } from "../tempoReal.js";

export const rotasAutenticacao = Router();

/* LIMITE DE TENTATIVAS: cada endereço de internet (IP) pode errar a senha
   10 vezes a cada 15 minutos. Sem isso, um programa poderia testar
   milhares de senhas por minuto até acertar ("força bruta").
   skipSuccessfulRequests: só os ERROS contam (quem acerta não gasta tentativa) */
const limiteDeTentativas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { erro: "Muitas tentativas erradas. Espere 15 minutos e tente de novo." },
});

/* Um hash qualquer, para quando o e-mail NÃO existe. Comparar a senha com
   ele leva o mesmo tempo que comparar com um hash de verdade. Sem isso,
   "e-mail inexistente" responderia mais rápido que "senha errada", e
   alguém medindo o tempo descobriria quais e-mails existem */
const HASH_FALSO = bcrypt.hashSync("nenhuma-conta-tem-esta-senha", 10);

// Dá certo? Responde com o token e a sessão. Ninguém na escala? Explica
async function responderComSessao(res, conta, { demo = false } = {}) {
  const { sessao, erro } = await resolverSessao(conta);
  if (erro) return res.status(403).json({ erro });
  if (demo) sessao.demo = true;
  /* Login novo, começo limpo: as estações puxadas no turno anterior
     não continuam puxadas. Quem quiser, puxa de novo */
  await prisma.puxada.deleteMany({ where: { atendenteId: sessao.atendenteId } });
  // Tempo real: se a pessoa estava aberta em outro navegador, as salas dela se ajustam
  atualizarSalas(sessao.atendenteId);
  avisarEstacoes();
  res.json({ token: criarToken(sessao), sessao: { ...sessao, desde: sessao.desde.toISOString() } });
}

// POST /api/auth/entrar   corpo: { email, senha }
rotasAutenticacao.post("/entrar", limiteDeTentativas, async (req, res) => {
  const { email, senha } = req.body ?? {};

  // NUNCA confie no que chega: pode não ser texto, pode estar vazio...
  // 400 = "o pedido veio mal formado"
  if (typeof email !== "string" || typeof senha !== "string" || !email.trim() || !senha) {
    return res.status(400).json({ erro: "Informe o e-mail e a senha." });
  }

  const conta = await prisma.conta.findUnique({ where: { email: email.trim().toLowerCase() } });
  // bcrypt.compare embaralha a senha digitada e compara com o hash guardado
  const senhaConfere = await bcrypt.compare(senha, conta?.senhaHash ?? HASH_FALSO);

  /* A MESMA mensagem para "e-mail não existe", "senha errada" e "conta
     bloqueada": dizer qual dos três ajudaria um invasor */
  if (!conta || !senhaConfere || !conta.ativa) {
    return res.status(401).json({ erro: "E-mail ou senha incorretos." });
  }

  await responderComSessao(res, conta);
});

/* POST /api/auth/demonstracao: o botão "Entrar na demonstração" do portfólio.
   Só funciona com MODO_DEMONSTRACAO=true no ambiente. Numa empresa de
   verdade, essa variável fica false (ou nem existe) e esta rota some */
rotasAutenticacao.post("/demonstracao", limiteDeTentativas, async (req, res) => {
  if (process.env.MODO_DEMONSTRACAO !== "true") {
    return res.status(404).json({ erro: "O modo demonstração está desligado." });
  }
  const conta = await prisma.conta.findUnique({ where: { email: process.env.CONTA_DEMONSTRACAO || "" } });
  if (!conta?.ativa) return res.status(404).json({ erro: "A conta de demonstração não existe." });

  /* A estação da demonstração está ligada ao WhatsApp de verdade? Então
     não abre: o visitante cairia numa estação vazia (as conversas reais
     ficam escondidas dele) e não entenderia nada. Melhor avisar */
  if (conta.estacaoId) {
    const linha = await prisma.linha.findUnique({ where: { estacaoId: conta.estacaoId } });
    if (linha?.whatsappId) {
      return res.status(403).json({ erro: "A demonstração está indisponível no momento: a estação dela está ligada ao WhatsApp de verdade." });
    }
  }

  await responderComSessao(res, conta, { demo: true });
});

/* POST /api/auth/sair: solta as estações puxadas. O token em si não
   precisa ser "desligado": o front apaga, e ele vence sozinho em 12 horas */
rotasAutenticacao.post("/sair", exigirLogin, async (req, res) => {
  await prisma.puxada.deleteMany({ where: { atendenteId: req.usuario.atendenteId } });
  atualizarSalas(req.usuario.atendenteId);
  avisarEstacoes();
  res.status(204).end();
});

// GET /api/auth/eu: "quem sou eu?" (útil para testar o token)
rotasAutenticacao.get("/eu", exigirLogin, (req, res) => {
  res.json({ usuario: req.usuario });
});
