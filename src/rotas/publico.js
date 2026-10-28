import { Router } from "express";
import { prisma } from "../banco.js";

/* Rotas PÚBLICAS: respondem sem login. Só o que a tela de login precisa
   saber antes de alguém entrar. Nada de conversas */
export const rotasPublico = Router();

// GET /api/publico/configuracao
rotasPublico.get("/publico/configuracao", async (req, res) => {
  const configuracao = await prisma.configuracao.findUnique({ where: { id: 1 } });
  res.json({
    marca: { nome: configuracao?.nomeMarca ?? "Talk Atendimento" },
    /* O botão "Entrar na demonstração" só aparece se o SERVIDOR aceitar.
       Uma variável só (MODO_DEMONSTRACAO) liga e desliga as duas coisas */
    modoDemonstracao: process.env.MODO_DEMONSTRACAO === "true",
  });
});
