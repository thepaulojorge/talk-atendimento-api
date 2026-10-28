/* O "PORTEIRO": um middleware que fica na frente das rotas protegidas.

   Um middleware é uma peça da esteira do Express que recebe o pedido
   ANTES da rota. Ele pode deixar passar (chamando next()) ou barrar
   (respondendo ele mesmo, com um erro).

   Uso: rotas.get("/dados", exigirLogin, async (req, res) => { ... })
   Dentro da rota, req.usuario diz quem está pedindo */
import { prisma } from "../banco.js";
import { lerToken } from "./tokens.js";

export async function exigirLogin(req, res, next) {
  // O front manda: Authorization: Bearer eyJhbGciOi... ("Bearer" = "portador")
  const [tipo, token] = (req.headers.authorization || "").split(" ");
  if (tipo !== "Bearer" || !token) {
    return res.status(401).json({ erro: "Faça login para continuar." });
  }

  let dados;
  try {
    dados = lerToken(token);
  } catch (erro) {
    // 401 = "não sei quem você é" (sem login ou login vencido)
    const vencido = erro.name === "TokenExpiredError";
    return res.status(401).json({ erro: vencido ? "Sua sessão expirou. Entre de novo." : "Sessão inválida. Entre de novo." });
  }

  /* O PAPEL é buscado no banco a CADA pedido, e não guardado no token.
     Assim, se a diretoria tirar a permissão de alguém, vale na hora,
     sem esperar o token de 12 horas vencer */
  const atendente = await prisma.atendente.findUnique({ where: { id: dados.sub } });
  if (!atendente) return res.status(401).json({ erro: "Usuário não encontrado. Entre de novo." });

  req.usuario = {
    atendenteId: atendente.id,
    nome: atendente.nome,
    papel: atendente.papel,
    email: dados.email,
    estacaoId: dados.estacaoId,
    turnoId: dados.turnoId,
  };
  next(); // pode passar: segue para a rota
}

/* Só alguns papéis passam: exigirPapel("supervisor", "diretoria").
   Vem DEPOIS do exigirLogin (precisa do req.usuario).
   403 = "sei quem você é, mas você não pode fazer isto" */
export function exigirPapel(...papeis) {
  return (req, res, next) => {
    if (!papeis.includes(req.usuario?.papel)) {
      return res.status(403).json({ erro: "Você não tem permissão para isto." });
    }
    next();
  };
}
