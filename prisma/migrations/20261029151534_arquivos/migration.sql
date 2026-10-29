-- AlterEnum
ALTER TYPE "TipoMensagem" ADD VALUE 'arquivo';

-- AlterTable
ALTER TABLE "mensagens" ADD COLUMN     "arquivo_id" TEXT;

-- CreateTable
CREATE TABLE "arquivos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_por_id" TEXT,

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_arquivo_id_fkey" FOREIGN KEY ("arquivo_id") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "atendentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
