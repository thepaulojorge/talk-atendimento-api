/* Configuração do Prisma (a ferramenta de linha de comando: migrar, popular...).

   O Prisma 7 não lê o .env sozinho. process.loadEnvFile() é do próprio
   Node (igual ao --env-file do "npm run dev"): lê o .env e coloca as
   variáveis em process.env. No Render não existe .env (as variáveis vêm
   do painel), então o erro de "arquivo não encontrado" é ignorado */
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // sem .env: as variáveis já estão no ambiente (Render)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // "npm run banco:popular" roda este arquivo
    seed: "node prisma/popular.js",
  },
  datasource: {
    /* Migrações usam a conexão DIRETA (sem pooler): criar e alterar
       tabelas precisa de uma conexão "exclusiva", sem a fila no meio */
    url: process.env.DIRECT_URL,
  },
});
