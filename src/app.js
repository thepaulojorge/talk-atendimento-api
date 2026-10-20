/* O APP: monta a API com o Express.

   O Express funciona como uma "esteira": cada pedido (request) que chega
   passa pelas peças na ORDEM em que foram registradas com app.use():
   1. cors          -> deixa o site do front conversar com a API
   2. express.json  -> transforma o corpo dos pedidos (texto JSON) em objeto
   3. as rotas      -> respondem cada endereço (/api/saude, /api/dados...)
   4. 404           -> ninguém respondeu? "Rota não encontrada"
   5. erros         -> algo quebrou? Responde com erro 500, sem derrubar o servidor */
import express from "express";
import cors from "cors";
import { rotasSaude } from "./rotas/saude.js";
import { rotasDados } from "./rotas/dados.js";

export const app = express();

/* CORS: por segurança, o navegador BLOQUEIA um site de ler respostas de
   outro endereço. O front (localhost:5173 ou github.io) e a API
   (localhost:3000 ou onrender.com) são endereços diferentes, então a API
   precisa dizer "esses sites podem falar comigo". A lista vem do .env */
const origensPermitidas = (process.env.ORIGENS_PERMITIDAS || "http://localhost:5173")
  .split(",")
  .map((origem) => origem.trim());

app.use(cors({ origin: origensPermitidas }));
app.use(express.json());

// Cada grupo de rotas mora no seu arquivo. "/api" na frente de todas
app.use("/api", rotasSaude);
app.use("/api", rotasDados);

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
  console.error("❌ Erro:", erro);
  res.status(500).json({ erro: "Erro interno no servidor." });
});
