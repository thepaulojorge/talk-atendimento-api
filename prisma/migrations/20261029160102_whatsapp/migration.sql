/*
  Warnings:

  - A unique constraint covering the columns `[whatsapp_id]` on the table `linhas` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[whatsapp_id]` on the table `mensagens` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "contatos" ADD COLUMN     "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "linhas" ADD COLUMN     "whatsapp_id" TEXT;

-- AlterTable
ALTER TABLE "mensagens" ADD COLUMN     "erro_envio" TEXT,
ADD COLUMN     "whatsapp_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "linhas_whatsapp_id_key" ON "linhas"("whatsapp_id");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_whatsapp_id_key" ON "mensagens"("whatsapp_id");
