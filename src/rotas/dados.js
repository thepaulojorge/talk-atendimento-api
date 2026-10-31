import { Router } from "express";
import { prisma } from "../banco.js";
import { exigirLogin } from "../autenticacao/middleware.js";
import { filtroDeContatos, linhasDoUsuario } from "../autenticacao/linhas.js";
import { auditoriaParaFront, conversaParaFront, estacaoParaFront, linhaParaFront } from "../formatos.js";

/* GET /api/dados: TUDO o que o front precisa para abrir.
   Cada pessoa recebe só o que pode ver:
   - conversas: só as das LINHAS que ela atende (ver autenticacao/linhas.js)
   - auditoria e textos apagados: só supervisão e diretoria
   - contatos: na demonstração, sem os clientes reais (ver autenticacao/linhas.js) */
export const rotasDados = Router();

/* exigirLogin vem ANTES da função da rota: sem um token válido, o
   pedido é barrado ali mesmo e a consulta ao banco nem acontece */
rotasDados.get("/dados", exigirLogin, async (req, res) => {
  /* O QUE CADA UM PODE VER. Esconder na tela não é segurança: qualquer um
     abre o F12 e vê a resposta inteira. Quem decide é o SERVIDOR */
  const supervisao = ["supervisor", "diretoria"].includes(req.usuario.papel);
  const linhas = await linhasDoUsuario(req.usuario);
  const idsLinhas = linhas.map((l) => l.id);

  /* Promise.all: dispara as consultas AO MESMO TEMPO e espera todas.
     Uma depois da outra, o tempo de cada ida ao banco iria se somando */
  const [configuracao, atendentes, estacoes, contatos, etiquetas, respostasRapidas, conversas, auditoria, idsExistentes] =
    await Promise.all([
      prisma.configuracao.findUnique({ where: { id: 1 } }),
      prisma.atendente.findMany({ orderBy: { id: "asc" } }),
      // As estações vêm com QUEM está puxando cada uma (para a tela "Estações")
      prisma.estacao.findMany({
        include: { puxadas: true },
        orderBy: { id: "asc" },
      }),
      // Os contatos: todos, menos os clientes reais para quem entrou pela demonstração
      prisma.contato.findMany({ where: filtroDeContatos(req.usuario), orderBy: { nome: "asc" } }),
      prisma.etiqueta.findMany({ orderBy: { id: "asc" } }),
      prisma.respostaRapida.findMany(),
      /* where com "in": só as conversas cujo linhaId está na lista.
         include: traz JUNTO as etiquetas e as mensagens de cada uma */
      prisma.conversa.findMany({
        where: { linhaId: { in: idsLinhas } },
        include: {
          etiquetas: { select: { id: true } },
          // Cada mensagem com o seu arquivo (nome, tipo, tamanho), se tiver
          mensagens: { orderBy: { horario: "asc" }, include: { arquivo: true } },
        },
      }),
      supervisao ? prisma.auditoria.findMany({ orderBy: { quando: "asc" } }) : [],
      // Para a auditoria saber se a conversa de um registro ainda existe
      supervisao ? prisma.conversa.findMany({ select: { id: true } }) : [],
    ]);

  const existentes = new Set(idsExistentes.map((c) => c.id));

  res.json({
    marca: { nome: configuracao?.nomeMarca ?? "Talk Atendimento" },
    atendentes,
    estacoes: estacoes.map(estacaoParaFront),
    linhas: linhas.map((l) => linhaParaFront(l, estacoes)),
    contatos,
    etiquetas,
    respostasRapidas,
    conversas: conversas.map((c) => conversaParaFront(c, { supervisao })),
    auditoria: auditoria.map((r) => auditoriaParaFront(r, existentes)),
  });
});
