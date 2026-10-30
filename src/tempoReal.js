/* TEMPO REAL com Socket.io.

   Até a B5, o front só ficava sabendo das mudanças quando PEDIA (ao
   abrir ou recarregar). Agora o servidor AVISA: cada navegador mantém
   uma conexão aberta (um WebSocket), e o servidor manda um recado por
   ela sempre que algo muda.

   SALAS (rooms): grupos de conexões. Um recado para a sala "linha:linha-e01"
   chega a todo mundo que atende a linha da Estação 01, e a mais ninguém.
   Cada conexão entra nas salas:
   - "linha:<id>"       uma por linha que a pessoa atende (a dela + as puxadas)
   - "atendente:<id>"   só dela (para avisos pessoais, como "suas salas mudaram")
   - "supervisao"       supervisão e diretoria (recebem a auditoria)
   - "todos"            todo mundo logado (etiquetas, estações, contatos novos) */
import { Server } from "socket.io";
import { prisma } from "./banco.js";
import { lerToken } from "./autenticacao/tokens.js";
import { linhasDoUsuario } from "./autenticacao/linhas.js";
import { auditoriaParaFront, conversaParaFront, estacaoParaFront } from "./formatos.js";

let io = null; // o servidor Socket.io (criado uma vez, no iniciarTempoReal)

const ehSupervisao = (papel) => ["supervisor", "diretoria"].includes(papel);

/* As rotas chamam os avisos DEPOIS de responder, sem esperar (sem await):
   quem fez a ação não precisa aguardar os outros serem avisados. Por isso
   cada aviso passa pelo "seguro": um erro aqui só é anotado no terminal,
   e nunca derruba o servidor */
const seguro =
  (aviso) =>
  (...argumentos) =>
    Promise.resolve()
      .then(() => aviso(...argumentos))
      .catch((erro) => console.error("❌ Erro no tempo real:", erro));

export function iniciarTempoReal(servidorHttp, origensPermitidas) {
  // O Socket.io "pega carona" no mesmo servidor e na mesma porta da API
  io = new Server(servidorHttp, { cors: { origin: origensPermitidas } });

  /* O PORTEIRO do tempo real, como o exigirLogin das rotas: a conexão só
     é aceita com um token válido. O front manda o token no "auth" */
  io.use(async (socket, next) => {
    try {
      const dados = lerToken(socket.handshake.auth?.token);
      const atendente = await prisma.atendente.findUnique({ where: { id: dados.sub } });
      if (!atendente) return next(new Error("sessao"));
      // socket.data: o "bolso" da conexão, para guardar quem ela é
      socket.data.usuario = {
        atendenteId: atendente.id,
        papel: atendente.papel,
        estacaoId: dados.estacaoId,
        turnoId: dados.turnoId,
        demo: dados.demo === true, // a demonstração não entra nas salas das linhas reais
      };
      next(); // pode entrar
    } catch {
      next(new Error("sessao")); // o front entende "sessao" como "entre de novo"
    }
  });

  io.on("connection", async (socket) => {
    const { usuario } = socket.data;
    socket.join(["todos", `atendente:${usuario.atendenteId}`]);
    if (ehSupervisao(usuario.papel)) socket.join("supervisao");
    await entrarNasSalasDasLinhas(socket);
  });
}

// Sai das salas de linha antigas e entra nas atuais (as linhas mudam ao puxar/soltar estações)
async function entrarNasSalasDasLinhas(socket) {
  for (const sala of socket.rooms) {
    if (sala.startsWith("linha:")) socket.leave(sala);
  }
  const linhas = await linhasDoUsuario(socket.data.usuario);
  socket.join(linhas.map((l) => `linha:${l.id}`));
}

/* Puxou ou soltou uma estação: as salas de TODAS as conexões dessa pessoa
   (ela pode estar em dois navegadores) são refeitas.
   fetchSockets(): a lista de conexões que estão numa sala */
export const atualizarSalas = seguro(async function atualizarSalas(atendenteId) {
  if (!io) return;
  const conexoes = await io.in(`atendente:${atendenteId}`).fetchSockets();
  await Promise.all(conexoes.map(entrarNasSalasDasLinhas));
});

/* ---------- Os avisos ----------
   Todos começam com "if (!io) return": se o tempo real não estiver ligado
   (nos testes, por exemplo), as rotas continuam funcionando normalmente */

/* Uma conversa mudou (mensagem nova, assumida, etiqueta...): manda a
   conversa INTEIRA, já atualizada, para quem atende a linha dela.
   Cada conexão recebe a versão que pode ver: a supervisão com o texto
   das mensagens apagadas; o atendente, sem (a mesma regra do /api/dados) */
export const avisarConversa = seguro(async function avisarConversa(conversaId) {
  if (!io) return;
  const conversa = await prisma.conversa.findUnique({
    where: { id: conversaId },
    include: {
      etiquetas: { select: { id: true } },
      mensagens: { orderBy: { horario: "asc" }, include: { arquivo: true } },
    },
  });
  if (!conversa) return;

  const conexoes = await io.in(`linha:${conversa.linhaId}`).fetchSockets();
  // Formata no máximo duas vezes (com e sem supervisão), e não uma por conexão
  const versoes = {};
  for (const conexao of conexoes) {
    const supervisao = ehSupervisao(conexao.data.usuario.papel);
    versoes[supervisao] ??= conversaParaFront(conversa, { supervisao });
    conexao.emit("conversa", versoes[supervisao]);
  }
});

// A conversa foi excluída: some da tela de quem atende a linha
export function avisarConversaExcluida(conversaId, linhaId) {
  io?.to(`linha:${linhaId}`).emit("conversaExcluida", { id: conversaId });
}

// Um registro novo na auditoria: só para supervisão e diretoria
export const avisarAuditoria = seguro(async function avisarAuditoria(registroId) {
  if (!io) return;
  const registro = await prisma.auditoria.findUnique({ where: { id: registroId } });
  const existe = await prisma.conversa.findUnique({ where: { id: registro.conversaId }, select: { id: true } });
  io.to("supervisao").emit("auditoria", auditoriaParaFront(registro, new Set(existe ? [existe.id] : [])));
});

// Etiquetas renomeadas: a lista nova para todo mundo
export const avisarEtiquetas = seguro(async function avisarEtiquetas() {
  if (!io) return;
  io.to("todos").emit("etiquetas", await prisma.etiqueta.findMany({ orderBy: { id: "asc" } }));
});

// Contato novo (iniciado pelo número): todo mundo passa a conhecê-lo
export const avisarContato = seguro(async function avisarContato(contatoId) {
  if (!io) return;
  const contato = await prisma.contato.findUnique({ where: { id: contatoId } });
  if (contato) io.to("todos").emit("contato", contato);
});

// Alguém puxou ou soltou uma estação: a tela "Estações" de todos se atualiza
export const avisarEstacoes = seguro(async function avisarEstacoes() {
  if (!io) return;
  const estacoes = await prisma.estacao.findMany({ include: { escala: true, puxadas: true }, orderBy: { id: "asc" } });
  io.to("todos").emit("estacoes", estacoes.map(estacaoParaFront));
});

/* Mudança grande (configurações salvas, banco restaurado): é mais simples
   cada um buscar tudo de novo do que mandar pedaço por pedaço */
export function avisarRecarregar() {
  io?.to("todos").emit("recarregar");
}
