/*
  Warnings:

  - You are about to drop the `escalas` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[sigla]` on the table `estacoes` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "escalas" DROP CONSTRAINT "escalas_atendente_id_fkey";

-- DropForeignKey
ALTER TABLE "escalas" DROP CONSTRAINT "escalas_estacao_id_fkey";

-- DropTable
DROP TABLE "escalas";

-- CreateIndex
CREATE UNIQUE INDEX "estacoes_sigla_key" ON "estacoes"("sigla");
