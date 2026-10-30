/* O "CRACHÁ" DIGITAL (JWT, JSON Web Token).

   Depois do login, o servidor entrega um token: um texto com os dados da
   sessão (quem é, de qual estação, qual turno) e uma ASSINATURA feita com
   uma chave secreta que só o servidor conhece (JWT_SEGREDO, no .env).

   O front guarda o token e o mostra a cada pedido. O servidor confere a
   assinatura: se alguém mudar uma letra do token (trocar "at1" por "at5"
   para virar diretoria, por exemplo), a assinatura não bate mais e o
   pedido é recusado. Por isso a chave secreta NUNCA pode vazar.

   ⚠️ O token NÃO é criptografado: qualquer um consegue LER o que está
   dentro (cole um em jwt.io e veja). Nunca coloque senha nem nada
   secreto num token. Ele é à prova de FALSIFICAÇÃO, não de leitura */
import jwt from "jsonwebtoken";

const SEGREDO = process.env.JWT_SEGREDO;
// Uma chave curta seria fácil de adivinhar por tentativa e erro
if (!SEGREDO || SEGREDO.length < 32) {
  throw new Error("Falta a variável JWT_SEGREDO no .env (com pelo menos 32 caracteres). Veja o .env.example.");
}

// 12 horas: cobre um turno inteiro com folga. Depois disso, login de novo
const VALIDADE = "12h";

export function criarToken(sessao) {
  // "sub" (subject = "de quem é"): o nome padrão do JWT para o dono do token
  return jwt.sign(
    {
      sub: sessao.atendenteId,
      email: sessao.email,
      estacaoId: sessao.estacaoId,
      turnoId: sessao.turnoId,
      // Entrou pelo botão da demonstração? Fica gravado no token (e a assinatura impede de "tirar")
      ...(sessao.demo ? { demo: true } : {}),
    },
    SEGREDO,
    { expiresIn: VALIDADE }
  );
}

/* Confere a assinatura e a validade. Devolve os dados do token,
   ou LANÇA um erro (token falsificado, vencido ou com defeito) */
export function lerToken(token) {
  return jwt.verify(token, SEGREDO);
}
