-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('atendente', 'supervisor', 'diretoria');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('manha', 'tarde', 'noite');

-- CreateEnum
CREATE TYPE "TipoConversa" AS ENUM ('contato', 'grupo');

-- CreateEnum
CREATE TYPE "StatusConversa" AS ENUM ('aberta', 'resolvida');

-- CreateEnum
CREATE TYPE "TipoMensagem" AS ENUM ('texto', 'audio', 'nota', 'sistema');

-- CreateEnum
CREATE TYPE "Direcao" AS ENUM ('recebida', 'enviada', 'interna');

-- CreateEnum
CREATE TYPE "TipoAuditoria" AS ENUM ('edicao', 'exclusao', 'conversa');

-- CreateTable
CREATE TABLE "atendentes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'atendente',

    CONSTRAINT "atendentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estacoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "estacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalas" (
    "estacao_id" TEXT NOT NULL,
    "turno" "Turno" NOT NULL,
    "atendente_id" TEXT,

    CONSTRAINT "escalas_pkey" PRIMARY KEY ("estacao_id","turno")
);

-- CreateTable
CREATE TABLE "contatos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "email" TEXT,
    "empresa" TEXT,
    "observacao" TEXT,
    "salvo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "contatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "editavel" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respostas_rapidas" (
    "atalho" TEXT NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "respostas_rapidas_pkey" PRIMARY KEY ("atalho")
);

-- CreateTable
CREATE TABLE "conversas" (
    "id" TEXT NOT NULL,
    "tipo" "TipoConversa" NOT NULL,
    "status" "StatusConversa" NOT NULL DEFAULT 'aberta',
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "marcada_nao_lida" BOOLEAN NOT NULL DEFAULT false,
    "fixada_em" TIMESTAMP(3),
    "contato_id" TEXT,
    "nome_grupo" TEXT,
    "participantes" TEXT[],
    "atendente_id" TEXT,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMensagem" NOT NULL,
    "direcao" "Direcao" NOT NULL,
    "horario" TIMESTAMP(3) NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "texto" TEXT,
    "audio_url" TEXT,
    "duracao" INTEGER,
    "encaminhada" BOOLEAN NOT NULL DEFAULT false,
    "conversa_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "autor_nome" TEXT,
    "resposta_a_id" TEXT,
    "editada_em" TIMESTAMP(3),
    "versoes_anteriores" TEXT[],
    "apagada" BOOLEAN NOT NULL DEFAULT false,
    "apagada_em" TIMESTAMP(3),
    "apagada_por_id" TEXT,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAuditoria" NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL,
    "conversa_id" TEXT NOT NULL,
    "conversa_nome" TEXT NOT NULL,
    "mensagem_id" TEXT,
    "tipo_mensagem" "TipoMensagem",
    "antes" TEXT,
    "depois" TEXT,
    "mensagens" JSONB,
    "estacao_id" TEXT,
    "turno" "Turno",
    "autor_id" TEXT NOT NULL,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nome_marca" TEXT NOT NULL DEFAULT 'Talk Atendimento',

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ConversaToEtiqueta" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ConversaToEtiqueta_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "contatos_numero_key" ON "contatos"("numero");

-- CreateIndex
CREATE INDEX "mensagens_conversa_id_horario_idx" ON "mensagens"("conversa_id", "horario");

-- CreateIndex
CREATE INDEX "auditoria_quando_idx" ON "auditoria"("quando");

-- CreateIndex
CREATE INDEX "_ConversaToEtiqueta_B_index" ON "_ConversaToEtiqueta"("B");

-- AddForeignKey
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_estacao_id_fkey" FOREIGN KEY ("estacao_id") REFERENCES "estacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalas" ADD CONSTRAINT "escalas_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "atendentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_contato_id_fkey" FOREIGN KEY ("contato_id") REFERENCES "contatos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_atendente_id_fkey" FOREIGN KEY ("atendente_id") REFERENCES "atendentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "atendentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_resposta_a_id_fkey" FOREIGN KEY ("resposta_a_id") REFERENCES "mensagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_apagada_por_id_fkey" FOREIGN KEY ("apagada_por_id") REFERENCES "atendentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "atendentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConversaToEtiqueta" ADD CONSTRAINT "_ConversaToEtiqueta_A_fkey" FOREIGN KEY ("A") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConversaToEtiqueta" ADD CONSTRAINT "_ConversaToEtiqueta_B_fkey" FOREIGN KEY ("B") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
