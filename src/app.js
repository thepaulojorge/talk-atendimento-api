/* O APP: monta a API com o Express.

   O Express funciona como uma "esteira": cada pedido (request) que chega
   passa pelas peças na ORDEM em que foram registradas com app.use():
   0. trust proxy   -> descobrir o IP de verdade de quem pede (ver abaixo)
   1. cors          -> deixa o site do front conversar com a API
   2. express.json  -> transforma o corpo dos pedidos (texto JSON) em objeto
   3. as rotas      -> respondem cada endereço (/api/saude, /api/dados...)
   4. 404           -> ninguém respondeu? "Rota não encontrada"
   5. erros         -> algo quebrou? Responde com erro 500, sem derrubar o servidor */
import express from "express";
import cors from "cors";
import { rotasSaude } from "./rotas/saude.js";
import { rotasDados } from "./rotas/dados.js";
import { rotasAutenticacao } from "./rotas/autenticacao.js";
import { rotasPublico } from "./rotas/publico.js";
import { rotasEstacoes } from "./rotas/estacoes.js";
import { rotasConfiguracoes } from "./rotas/configuracoes.js";
import { rotasMensagens } from "./rotas/mensagens.js";
import { rotasConversas } from "./rotas/conversas.js";
import { rotasEtiquetas } from "./rotas/etiquetas.js";
import { rotasDemonstracao } from "./rotas/demonstracao.js";
import { rotasArquivos } from "./rotas/arquivos.js";

export const app = express();

/* No Render, os pedidos chegam por um "intermediário" (proxy) deles.
   Sem esta linha, o Express acharia que TODO mundo tem o mesmo IP (o do
   proxy), e o limite de tentativas de senha bloquearia todos de uma vez */
app.set("trust proxy", 1);

/* CORS: por segurança, o navegador BLOQUEIA um site de ler respostas de
   outro endereço. O front (localhost:5173 ou github.io) e a API
   (localhost:3000 ou onrender.com) são endereços diferentes, então a API
   precisa dizer "esses sites podem falar comigo". A lista vem do .env */
export const origensPermitidas = (process.env.ORIGENS_PERMITIDAS || "http://localhost:5173")
  .split(",")
  .map((origem) => origem.trim());

app.use(cors({ origin: origensPermitidas }));
/* O corpo dos pedidos em JSON (até 100 KB, o padrão: só textos).
   Arquivos e áudios têm a rota deles, que aceita até 10 MB (rotas/arquivos.js) */
app.use(express.json());

// Cada grupo de rotas mora no seu arquivo. "/api" na frente de todas
app.use("/api", rotasSaude);
app.use("/api", rotasPublico);
app.use("/api/auth", rotasAutenticacao);
app.use("/api", rotasDados); // protegida: exige login (ver rotas/dados.js)
app.use("/api", rotasEstacoes); // puxar e soltar estações (atendentes)
app.use("/api", rotasConfiguracoes); // configurações da empresa (diretoria)
// B5: as rotas que GRAVAM. Mensagens antes de conversas: as duas começam com /conversas
app.use("/api", rotasMensagens); // enviar, editar e apagar mensagens
app.use("/api", rotasConversas); // assumir, transferir, fixar, etiquetas, excluir...
app.use("/api", rotasEtiquetas); // renomear etiquetas
app.use("/api", rotasDemonstracao); // restaurar e simular (só no modo demonstração)
app.use("/api", rotasArquivos); // enviar e abrir arquivos (fotos, PDFs, áudios)

// Nenhuma rota respondeu: 404 (não encontrado), em JSON como o resto da API
app.use((req, res) => {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

/* Tratamento de erros: o Express reconhece esta função pelos QUATRO
   parâmetros (erro, req, res, next). Um erro em qualquer rota cai aqui.
   O detalhe vai para o terminal; quem pediu recebe uma mensagem genérica
   (detalhes de erro ajudariam um invasor a entender o servidor).
   O "next" não é usado, mas precisa estar lá: são os 4 parâmetros que
   dizem ao Express "esta função trata erros" */
app.use((erro, req, res, next) => {
  // Corpo grande demais (o limite do express.json, ou os 10 MB de um arquivo)
  if (erro.type === "entity.too.large") return res.status(413).json({ erro: "O arquivo passa do limite de 10 MB." });
  // Erro "esperado", lançado de propósito pelas rotas: throw new ErroDaApi(404, "...")
  if (erro.status && erro.status < 500 && erro.message) {
    return res.status(erro.status).json({ erro: erro.message });
  }
  // P2002 = o Prisma avisando "esse valor já existe" (id ou número repetido)
  if (erro.code === "P2002") return res.status(409).json({ erro: "Isso já existe no sistema." });

  console.error("❌ Erro:", erro);
  res.status(500).json({ erro: "Erro interno no servidor." });
});
