/* A CONEXÃO COM O BANCO: um único "prisma" para a API inteira.

   O Prisma 7 conversa com o Postgres através de um "adaptador": aqui,
   o PrismaPg, que usa a biblioteca pg (a mais usada com Node).
   DATABASE_URL é o endereço COM pooler (o do dia a dia), lá do .env.

   Por que UM só? Cada PrismaClient abre o seu próprio grupo de conexões.
   Criar um a cada pedido esgotaria as conexões do banco em minutos */
import { PrismaPg } from "@prisma/adapter-pg";
// O código gerado pelo Prisma (npm run banco:gerar) é TypeScript (.ts):
// o Node 24 lê esses arquivos direto, sem instalar nada a mais
import { PrismaClient } from "./generated/prisma/client.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("Falta a variável DATABASE_URL no .env (o endereço do banco na Neon).");
}

const adaptador = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter: adaptador });
