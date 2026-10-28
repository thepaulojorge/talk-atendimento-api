-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('estacao', 'pessoal');

-- CreateTable
CREATE TABLE "contas" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estacao_id" TEXT,
    "atendente_id" TEXT,

    CONSTRAINT "contas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contas_email_key" ON "contas"("email");

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_estacao_id_fkey" FOREIGN KEY ("estacao_id") REFERENCES "estacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "atendentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
