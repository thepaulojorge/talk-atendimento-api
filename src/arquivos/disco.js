/* ONDE O CONTEÚDO DOS ARQUIVOS FICA: uma pasta no servidor.

   Tudo o que mexe no disco está AQUI, num arquivo só. Se um dia os
   arquivos forem para outro lugar (um serviço de armazenamento na nuvem,
   por exemplo), só este arquivo muda: as rotas continuam iguais.

   A pasta vem do .env (PASTA_ARQUIVOS). Sem ela, é a pasta "arquivos"
   dentro do projeto (que está no .gitignore: arquivo de cliente nunca
   vai para o GitHub).

   ⚠️ No Render gratuito, o disco é APAGADO a cada reinício (e ele
   reinicia sempre que "acorda"). Numa máquina da empresa, fica de vez */
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

// path.resolve: transforma "arquivos" num caminho completo ("C:\...\talk-atendimento-api\arquivos")
export const PASTA = path.resolve(process.env.PASTA_ARQUIVOS || "arquivos");

/* O nome do arquivo na pasta é o ID dele, sem extensão ("arq-3f2a9c...").
   Nunca o nome que a pessoa mandou: um nome como "../../servidor.js"
   poderia escrever FORA da pasta. O id já foi conferido (só letras,
   números, "-" e "_"), então não tem como "escapar" da pasta */
export const caminhoDe = (id) => path.join(PASTA, id);

export async function guardar(id, conteudo) {
  await mkdir(PASTA, { recursive: true }); // cria a pasta se ainda não existir
  /* flag "wx": só escreve se o arquivo NÃO existir (nunca sobrescreve outro).
     Se já existir, o Node lança um erro com code "EEXIST" */
  try {
    await writeFile(caminhoDe(id), conteudo, { flag: "wx" });
  } catch (erro) {
    if (erro.code === "EEXIST") {
      // status + message: o tratamento de erros do app.js responde "409: Este arquivo já foi enviado."
      erro.status = 409;
      erro.message = "Este arquivo já foi enviado.";
    }
    throw erro;
  }
}

export async function existe(id) {
  try {
    await access(caminhoDe(id));
    return true;
  } catch {
    return false;
  }
}
