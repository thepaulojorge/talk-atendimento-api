/*
  Warnings:

  - Added the required column `linha_id` to the `conversas` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sigla` to the `estacoes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "conversas" ADD COLUMN     "linha_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "estacoes" ADD COLUMN     "sigla" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "linhas" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "estacao_id" TEXT,
    "papel" "Papel",

    CONSTRAINT "linhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puxadas" (
    "atendente_id" TEXT NOT NULL,
    "estacao_id" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puxadas_pkey" PRIMARY KEY ("atendente_id","estacao_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "linhas_numero_key" ON "linhas"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "linhas_estacao_id_key" ON "linhas"("estacao_id");

-- CreateIndex
CREATE INDEX "conversas_linha_id_idx" ON "conversas"("linha_id");

-- AddForeignKey
ALTER TABLE "linhas" ADD CONSTRAINT "linhas_estacao_id_fkey" FOREIGN KEY ("estacao_id") REFERENCES "estacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puxadas" ADD CONSTRAINT "puxadas_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "atendentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puxadas" ADD CONSTRAINT "puxadas_estacao_id_fkey" FOREIGN KEY ("estacao_id") REFERENCES "estacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_linha_id_fkey" FOREIGN KEY ("linha_id") REFERENCES "linhas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
