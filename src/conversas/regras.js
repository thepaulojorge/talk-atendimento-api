/* AJUDANTES das rotas que GRAVAM (conversas, mensagens, etiquetas).
   As regras de negócio que antes viviam só no reducer do front agora
   são conferidas aqui também. O front continua aplicando as mesmas
   regras na tela (para responder na hora), mas quem decide é o servidor */
import { prisma } from "../banco.js";
import { linhasDoUsuario } from "../autenticacao/linhas.js";

/* Ids criados pelo front: "m-3f2a9c1e-...". Aceitamos só letras, números,
   "-" e "_", com até 80 caracteres. Nada de espaços, barras ou aspas */
const FORMATO_ID = /^[A-Za-z0-9_-]{1,80}$/;
export const idValido = (id) => typeof id === "string" && FORMATO_ID.test(id);

/* Um erro "esperado", com o código HTTP junto. As rotas lançam com
   throw new ErroDaApi(404, "...") e o tratamento de erros do app.js
   responde com esse código e essa mensagem */
export class ErroDaApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/* Busca a conversa E confere se a pessoa pode mexer nela: ela precisa
   ser de uma LINHA que a pessoa atende. Senão, 404 ("não encontrada"),
   e não 403: assim ninguém descobre que a conversa existe.
   incluir: o que trazer junto (contato, mensagens...) */
export async function acharConversa(req, id, incluir = {}) {
  if (!idValido(id)) throw new ErroDaApi(404, "Conversa não encontrada.");
  const conversa = await prisma.conversa.findUnique({ where: { id }, include: incluir });
  const linhas = await linhasDoUsuario(req.usuario);
  if (!conversa || !linhas.some((l) => l.id === conversa.linhaId)) {
    throw new ErroDaApi(404, "Conversa não encontrada.");
  }
  return conversa;
}

// A mensagem + a conversa dela (já com a permissão conferida)
export async function acharMensagem(req, id) {
  if (!idValido(id)) throw new ErroDaApi(404, "Mensagem não encontrada.");
  const mensagem = await prisma.mensagem.findUnique({ where: { id }, include: { arquivo: true } });
  if (!mensagem) throw new ErroDaApi(404, "Mensagem não encontrada.");
  const conversa = await acharConversa(req, mensagem.conversaId, { contato: true });
  return { mensagem, conversa };
}

// "Mariana Souza" (contato) ou "Frota Teresópolis" (grupo). Precisa do include { contato: true }
export function nomeDaConversa(conversa) {
  return conversa.tipo === "grupo" ? conversa.nomeGrupo : conversa.contato?.nome || "Contato desconhecido";
}

// 22 -> "0:22"
function formatarDuracao(segundos = 0) {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/* O "conteúdo" de uma mensagem em texto, para a auditoria.
   Áudio e arquivo viram descrição (precisa do include { arquivo: true }) */
export function conteudoEmTexto(m) {
  if (m.tipo === "audio") return `🎤 Áudio de ${formatarDuracao(m.duracao)}`;
  if (m.tipo === "arquivo") return `📎 ${m.arquivo?.nome || "Arquivo"}`;
  return m.texto;
}

/* Um evento no histórico ("Carla assumiu a conversa"), no formato do
   prisma.mensagem.create. O id vem do front, para a tela e o banco
   terem o MESMO id */
export function evento(id, conversaId, texto, horario) {
  return { id, conversaId, tipo: "sistema", direcao: "interna", texto, horario, lida: true };
}

/* De onde veio a ação, para a auditoria: "Paulo, Estação 01, turno da manhã".
   Vem do TOKEN (o servidor que assinou), nunca do corpo do pedido */
export function deOndeVeio(req) {
  return { autorId: req.usuario.atendenteId, estacaoId: req.usuario.estacaoId ?? null, turno: req.usuario.turnoId ?? null };
}

// Lê um id do corpo do pedido; sem id válido, erro 400
export function exigirId(id) {
  if (!idValido(id)) throw new ErroDaApi(400, "Id inválido.");
  return id;
}

/* Quem pode ver um ARQUIVO?
   - quem enviou (logo depois do upload, antes de a mensagem existir)
   - quem vê alguma mensagem com ele: de uma linha que a pessoa atende, e
     não apagada (a supervisão vê as apagadas também, como no texto)
   Devolve o arquivo, ou lança 404 */
export async function acharArquivo(req, id) {
  if (!idValido(id)) throw new ErroDaApi(404, "Arquivo não encontrado.");
  const arquivo = await prisma.arquivo.findUnique({ where: { id } });
  if (!arquivo) throw new ErroDaApi(404, "Arquivo não encontrado.");
  if (arquivo.enviadoPorId === req.usuario.atendenteId) return arquivo;

  const supervisao = ["supervisor", "diretoria"].includes(req.usuario.papel);
  const linhas = await linhasDoUsuario(req.usuario);
  const mensagem = await prisma.mensagem.findFirst({
    where: {
      arquivoId: id,
      conversa: { linhaId: { in: linhas.map((l) => l.id) } }, // filtro "através" da relação
      ...(supervisao ? {} : { apagada: false }),
    },
  });
  if (!mensagem) throw new ErroDaApi(404, "Arquivo não encontrado.");
  return arquivo;
}
