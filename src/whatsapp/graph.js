/* A CONVERSA COM A META (a "Graph API", onde mora o WhatsApp Cloud API).

   Todas as chamadas para a Meta passam por aqui. As configurações vêm do .env:
   - WHATSAPP_TOKEN: a chave de acesso (um "token de usuário do sistema")
   - WHATSAPP_VERSAO: a versão da API (a Meta lança uma nova a cada poucos meses)
   - WHATSAPP_API_URL: o endereço da Meta. Só muda nos testes, para apontar
     para uma "Meta de mentira" no seu computador */

const URL_BASE = () => process.env.WHATSAPP_API_URL || "https://graph.facebook.com";
const VERSAO = () => process.env.WHATSAPP_VERSAO || "v23.0";

// Sem token, nada de WhatsApp de verdade: as linhas continuam em modo simulado
export const whatsappConfigurado = () => Boolean(process.env.WHATSAPP_TOKEN);

/* Um erro da Meta, já com uma explicação em português.
   Os códigos mais comuns: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes */
export class ErroDoWhatsapp extends Error {
  constructor(erroDaMeta) {
    super(traduzir(erroDaMeta));
    this.status = 502; // "o servidor do lado de lá falhou"
    this.expor = true; // a mensagem pode ir para a tela (ela explica o problema, sem detalhes internos)
    this.codigo = erroDaMeta?.code;
  }
}

function traduzir(erro = {}) {
  switch (erro.code) {
    case 131047:
      return "Já passou de 24 horas desde a última mensagem do cliente. Pelo WhatsApp, agora só dá para enviar um modelo aprovado (template).";
    case 131026:
    case 131021:
      return "Este número não pode receber mensagens pelo WhatsApp.";
    case 131030:
      return "No número de teste da Meta, só dá para enviar para números cadastrados na lista de destinatários (no painel da Meta).";
    case 190:
      return "A chave de acesso do WhatsApp (WHATSAPP_TOKEN) venceu ou está errada.";
    case 131053:
      return "O WhatsApp não aceitou este arquivo (tipo ou tamanho).";
    default:
      return `O WhatsApp recusou a mensagem: ${erro.error_data?.details || erro.message || "erro desconhecido"}.`;
  }
}

/* Uma chamada à Graph API. "corpo" vira JSON; "formulario" vai como
   multipart (o formato dos uploads de arquivo). Devolve o JSON da resposta */
export async function chamarMeta(caminho, { metodo = "GET", corpo, formulario } = {}) {
  let resposta;
  try {
    resposta = await fetch(`${URL_BASE()}/${VERSAO()}/${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        ...(corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: formulario ?? (corpo ? JSON.stringify(corpo) : undefined),
    });
  } catch {
    throw new ErroDoWhatsapp({ message: "não foi possível falar com a Meta (sem internet?)" });
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroDoWhatsapp(dados.error);
  return dados;
}

/* BAIXAR uma mídia que o cliente mandou. São dois passos:
   1. pergunta à Meta o endereço do arquivo (GET /<id da mídia>)
   2. baixa o arquivo nesse endereço (também com o token)
   Devolve { conteudo (Buffer), tipo } */
export async function baixarMidia(midiaId) {
  const info = await chamarMeta(encodeURIComponent(midiaId));
  const resposta = await fetch(info.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  if (!resposta.ok) throw new ErroDoWhatsapp({ message: `não foi possível baixar a mídia (${resposta.status})` });
  return { conteudo: Buffer.from(await resposta.arrayBuffer()), tipo: (info.mime_type || "").split(";")[0].trim() };
}

/* SUBIR um arquivo para a Meta, antes de enviá-lo numa mensagem.
   FormData e Blob: os mesmos do navegador, que o Node também tem.
   Devolve o id da mídia na Meta */
export async function subirMidia(telefoneId, { conteudo, tipo, nome }) {
  const formulario = new FormData();
  formulario.append("messaging_product", "whatsapp");
  formulario.append("type", tipo);
  formulario.append("file", new Blob([conteudo], { type: tipo }), nome);
  const { id } = await chamarMeta(`${encodeURIComponent(telefoneId)}/media`, { metodo: "POST", formulario });
  return id;
}

// ENVIAR uma mensagem. Devolve o id dela no WhatsApp ("wamid....")
export async function enviarMensagem(telefoneId, mensagem) {
  const dados = await chamarMeta(`${encodeURIComponent(telefoneId)}/messages`, {
    metodo: "POST",
    corpo: { messaging_product: "whatsapp", recipient_type: "individual", ...mensagem },
  });
  return dados.messages?.[0]?.id;
}
