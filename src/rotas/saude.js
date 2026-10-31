import { Router } from "express";

/* "Health check": uma rota que só responde "estou vivo".
   Serve para você testar no navegador e, depois, para o Render saber
   que o servidor subiu direito */
export const rotasSaude = Router();

// GET /api/saude
rotasSaude.get("/saude", (req, res) => {
  res.json({
    status: "ok",
    servico: "talk-atendimento-api",
    horario: new Date().toISOString(),
  });
});
