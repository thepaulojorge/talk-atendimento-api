import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../banco.js";
import { exigirLogin, exigirPapel } from "../autenticacao/middleware.js";
import { ErroDaApi, idValido } from "../conversas/regras.js";
import { avisarRecarregar } from "../tempoReal.js";

/* CONFIGURAÇÕES (a "administração" do sistema):
   - as ESTAÇÕES: nome, sigla, e-mail e senha do login, número de WhatsApp
   - as linhas EXCLUSIVAS: o número da supervisão e o da diretoria
   - o NOME da empresa (só a diretoria)

   Supervisão e diretoria entram aqui. Quem cria os e-mails é a própria
   empresa (ex.: estacao01@suaempresa.com.br); este cadastro só liga cada
   e-mail a uma estação e a um número */
export const rotasAdmin = Router();
rotasAdmin.use("/admin", exigirLogin, exigirPapel("supervisor", "diretoria"));

/* ---------- Validações (reaproveitadas por várias rotas) ---------- */

// Número: só dígitos, com o 55 do Brasil (12 ou 13 dígitos)
function lerNumero(numero) {
  const digitos = String(numero ?? "").replace(/\D/g, "");
  if (digitos.length < 12 || digitos.length > 13 || !digitos.startsWith("55")) {
    throw new ErroDaApi(400, "O número precisa do DDD e do 55 do Brasil, por exemplo +55 21 99999-0001.");
  }
  return digitos;
}

// ID na Meta: vazio (linha simulada) ou só dígitos
function lerIdMeta(id) {
  const limpo = String(id ?? "").trim();
  if (limpo && !/^\d{5,30}$/.test(limpo)) {
    throw new ErroDaApi(400, 'O ID na Meta tem só números (no painel da Meta, "Phone Number ID").');
  }
  return limpo || null;
}

function lerTexto(valor, { campo, max }) {
  const limpo = typeof valor === "string" ? valor.trim() : "";
  if (!limpo || limpo.length > max) throw new ErroDaApi(400, `${campo} deve ter de 1 a ${max} caracteres.`);
  return limpo;
}

function lerEmail(valor) {
  const email = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  // Uma conferência simples: algo@algo.algo, sem espaços
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new ErroDaApi(400, "E-mail inválido.");
  return email;
}

function lerSigla(valor) {
  const sigla = typeof valor === "string" ? valor.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{1,5}$/.test(sigla)) throw new ErroDaApi(400, "A sigla tem de 1 a 5 letras ou números (ex.: E01, ON01).");
  return sigla;
}

// Senha nova: pelo menos 6 caracteres. Vira hash: a senha em si nunca é guardada
async function lerSenha(valor) {
  if (typeof valor !== "string" || valor.length < 6 || valor.length > 100) {
    throw new ErroDaApi(400, "A senha deve ter pelo menos 6 caracteres.");
  }
  return bcrypt.hash(valor, 10);
}

/* "Isso já está em uso por OUTRA estação?" Para e-mail, sigla, número e
   ID na Meta. Dá uma mensagem clara, em vez do erro genérico de "já existe" */
async function conferirRepetidos({ estacaoId = null, email, sigla, numero, whatsappId }) {
  const [conta, estacao, linhaNumero, linhaMeta] = await Promise.all([
    email ? prisma.conta.findUnique({ where: { email } }) : null,
    sigla ? prisma.estacao.findUnique({ where: { sigla } }) : null,
    numero ? prisma.linha.findUnique({ where: { numero } }) : null,
    whatsappId ? prisma.linha.findUnique({ where: { whatsappId } }) : null,
  ]);
  // "De outra": existe, e não é desta estação (numa estação NOVA, qualquer um que exista é de outra)
  const deOutra = (dono) => !estacaoId || dono !== estacaoId;
  if (conta && deOutra(conta.estacaoId)) throw new ErroDaApi(409, "Este e-mail já é usado por outra conta.");
  if (estacao && deOutra(estacao.id)) throw new ErroDaApi(409, "Esta sigla já é de outra estação.");
  if (linhaNumero && deOutra(linhaNumero.estacaoId)) throw new ErroDaApi(409, "Este número já é de outra linha.");
  if (linhaMeta && deOutra(linhaMeta.estacaoId)) throw new ErroDaApi(409, "Este ID da Meta já é de outra linha.");
}

/* ---------- GET /api/admin: tudo o que a tela de Configurações mostra ---------- */
rotasAdmin.get("/admin", async (req, res) => {
  const [configuracao, estacoes, exclusivas] = await Promise.all([
    prisma.configuracao.findUnique({ where: { id: 1 } }),
    prisma.estacao.findMany({ include: { contas: true, linha: true }, orderBy: { nome: "asc" } }),
    prisma.linha.findMany({ where: { estacaoId: null }, orderBy: { id: "asc" } }),
  ]);
  res.json({
    marca: { nome: configuracao?.nomeMarca ?? "Talk Atendimento" },
    // A senha NUNCA sai daqui (nem o hash): só dá para trocar
    estacoes: estacoes.map((e) => {
      const conta = e.contas[0];
      return {
        id: e.id,
        nome: e.nome,
        sigla: e.sigla,
        email: conta?.email ?? "",
        ativa: conta?.ativa ?? false,
        numero: e.linha?.numero ?? "",
        whatsappId: e.linha?.whatsappId ?? "",
      };
    }),
    exclusivas: exclusivas.map((l) => ({ id: l.id, papel: l.papel, numero: l.numero, whatsappId: l.whatsappId ?? "" })),
  });
});

/* ---------- POST /api/admin/estacoes: estação NOVA ----------
   corpo: { nome, sigla, email, senha, numero, whatsappId? }
   Cria 4 coisas de uma vez (numa transação: todas ou nenhuma):
   a estação, o "atendente" com o nome dela, a conta de login e a linha */
rotasAdmin.post("/admin/estacoes", async (req, res) => {
  const corpo = req.body ?? {};
  const nome = lerTexto(corpo.nome, { campo: "O nome", max: 40 });
  const sigla = lerSigla(corpo.sigla);
  const email = lerEmail(corpo.email);
  const numero = lerNumero(corpo.numero);
  const whatsappId = lerIdMeta(corpo.whatsappId);
  const senhaHash = await lerSenha(corpo.senha);
  await conferirRepetidos({ email, sigla, numero, whatsappId });

  const id = `est-${randomUUID()}`;
  const atendenteId = `at-${id}`;
  await prisma.$transaction([
    prisma.estacao.create({ data: { id, nome, sigla } }),
    prisma.atendente.create({ data: { id: atendenteId, nome, papel: "atendente" } }),
    prisma.conta.create({ data: { email, senhaHash, tipo: "estacao", estacaoId: id, atendenteId } }),
    prisma.linha.create({ data: { id: `linha-${id}`, numero, whatsappId, estacaoId: id } }),
  ]);
  res.status(201).json({ id });
  avisarRecarregar();
});

/* ---------- PUT /api/admin/estacoes/:id: editar ----------
   corpo: { nome, sigla, email, numero, whatsappId, ativa, senha? }
   senha vazia = não muda. ativa = false bloqueia o login (sem apagar nada:
   as conversas e a auditoria da estação continuam lá) */
rotasAdmin.put("/admin/estacoes/:id", async (req, res) => {
  const estacao = idValido(req.params.id)
    ? await prisma.estacao.findUnique({ where: { id: req.params.id }, include: { contas: true, linha: true } })
    : null;
  if (!estacao) throw new ErroDaApi(404, "Estação não encontrada.");

  const corpo = req.body ?? {};
  const nome = lerTexto(corpo.nome, { campo: "O nome", max: 40 });
  const sigla = lerSigla(corpo.sigla);
  const email = lerEmail(corpo.email);
  const numero = lerNumero(corpo.numero);
  const whatsappId = lerIdMeta(corpo.whatsappId);
  const senhaHash = corpo.senha ? await lerSenha(corpo.senha) : null;
  const ativa = corpo.ativa !== false;
  await conferirRepetidos({ estacaoId: estacao.id, email, sigla, numero, whatsappId });

  const conta = estacao.contas[0];
  const operacoes = [prisma.estacao.update({ where: { id: estacao.id }, data: { nome, sigla } })];
  // O "atendente" da estação acompanha o nome (é o nome nas mensagens novas)
  if (conta?.atendenteId) {
    operacoes.push(prisma.atendente.update({ where: { id: conta.atendenteId }, data: { nome } }));
  }
  if (conta) {
    operacoes.push(
      prisma.conta.update({ where: { id: conta.id }, data: { email, ativa, ...(senhaHash ? { senhaHash } : {}) } })
    );
  }
  operacoes.push(
    estacao.linha
      ? prisma.linha.update({ where: { id: estacao.linha.id }, data: { numero, whatsappId } })
      : prisma.linha.create({ data: { id: `linha-${estacao.id}`, numero, whatsappId, estacaoId: estacao.id } })
  );
  await prisma.$transaction(operacoes);

  res.status(204).end();
  avisarRecarregar();
});

/* ---------- PUT /api/admin/linhas/:id: número da supervisão ou da diretoria ----------
   corpo: { numero, whatsappId? } */
rotasAdmin.put("/admin/linhas/:id", async (req, res) => {
  const linha = idValido(req.params.id) ? await prisma.linha.findUnique({ where: { id: req.params.id } }) : null;
  if (!linha || linha.estacaoId) throw new ErroDaApi(404, "Linha exclusiva não encontrada.");

  const numero = lerNumero(req.body?.numero);
  const whatsappId = lerIdMeta(req.body?.whatsappId);
  const [mesmoNumero, mesmoMeta] = await Promise.all([
    prisma.linha.findUnique({ where: { numero } }),
    whatsappId ? prisma.linha.findUnique({ where: { whatsappId } }) : null,
  ]);
  if (mesmoNumero && mesmoNumero.id !== linha.id) throw new ErroDaApi(409, "Este número já é de outra linha.");
  if (mesmoMeta && mesmoMeta.id !== linha.id) throw new ErroDaApi(409, "Este ID da Meta já é de outra linha.");

  await prisma.linha.update({ where: { id: linha.id }, data: { numero, whatsappId } });
  res.status(204).end();
  avisarRecarregar();
});

/* ---------- PUT /api/admin/marca: o nome da empresa (só a diretoria) ---------- */
rotasAdmin.put("/admin/marca", exigirPapel("diretoria"), async (req, res) => {
  const nome = lerTexto(req.body?.nome, { campo: "O nome da empresa", max: 40 });
  await prisma.configuracao.upsert({ where: { id: 1 }, create: { id: 1, nomeMarca: nome }, update: { nomeMarca: nome } });
  res.status(204).end();
  avisarRecarregar();
});
