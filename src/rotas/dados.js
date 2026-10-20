import { Router } from "express";
import { readFile } from "node:fs/promises";

/* ⚠️ ETAPA B1: os dados ainda vêm de um ARQUIVO (o mesmo dados.json do
   front). Na etapa B2 eles passam a vir do banco de dados, e esta rota
   muda por dentro, mas continua respondendo do MESMO jeito. O front nem
   percebe a troca: é para isso que uma API serve */
export const rotasDados = Router();

// O caminho do arquivo a partir DESTE arquivo (funciona de qualquer pasta)
const ARQUIVO = new URL("../dados/dados.json", import.meta.url);

// GET /api/dados
/* "async": ler um arquivo leva tempo. Com await, o servidor não fica
   parado esperando: atende outros pedidos enquanto o disco trabalha.
   No Express 5, se algo der errado aqui, o erro vai sozinho para o
   tratamento de erros do app.js (no Express 4 era preciso um try/catch) */
rotasDados.get("/dados", async (req, res) => {
  const texto = await readFile(ARQUIVO, "utf-8");
  res.json(JSON.parse(texto));
});
