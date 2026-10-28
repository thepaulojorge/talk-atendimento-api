/* POPULAR O BANCO com os dados de exemplo (o mesmo dados.json do front).
   Rode com: npm run banco:popular

   ⚠️ APAGA tudo o que estiver no banco antes de colocar os exemplos.
   É uma ferramenta de desenvolvimento: nunca rode no banco de uma empresa.

   Em inglês, isto se chama "seed" (semente): os dados iniciais do banco */
import { readFile } from "node:fs/promises";

try {
  process.loadEnvFile(); // lê o .env (como o --env-file do npm run dev)
} catch {
  // sem .env: as variáveis já estão no ambiente
}

// Importado DEPOIS de ler o .env: o banco.js precisa do DATABASE_URL
const { prisma } = await import("../src/banco.js");

const dados = JSON.parse(await readFile(new URL("../src/dados/dados.json", import.meta.url), "utf-8"));

/* As datas do dados.json não dizem o fuso: "2026-10-08T18:49:00".
   Sem o fuso, o Node usa o do computador onde roda: no seu PC é o de
   Brasília, mas num servidor na nuvem seria o de Londres (3 horas de
   diferença!). Por isso dizemos qual é: -03:00, o horário de Brasília */
function comoData(texto) {
  if (!texto) return null;
  const temFuso = /([zZ]|[+-]\d{2}:\d{2})$/.test(texto);
  return new Date(temFuso ? texto : `${texto}-03:00`);
}

async function popular() {
  console.log("🧹 Apagando os dados antigos...");
  /* A ORDEM importa: primeiro quem DEPENDE de outros (mensagens dependem
     de conversas, que dependem de contatos...). Apagar um contato que
     ainda tem conversas daria erro de chave estrangeira */
  await prisma.auditoria.deleteMany();
  await prisma.mensagem.deleteMany();
  await prisma.conversa.deleteMany();
  await prisma.escala.deleteMany();
  await prisma.estacao.deleteMany();
  await prisma.contato.deleteMany();
  await prisma.etiqueta.deleteMany();
  await prisma.respostaRapida.deleteMany();
  await prisma.atendente.deleteMany();
  await prisma.configuracao.deleteMany();

  console.log("🌱 Colocando os dados de exemplo...");
  await prisma.configuracao.create({ data: { id: 1, nomeMarca: "Talk Atendimento" } });

  // createMany: várias linhas num comando só (bem mais rápido que um por um)
  await prisma.atendente.createMany({ data: dados.atendentes });

  for (const estacao of dados.estacoes) {
    await prisma.estacao.create({
      data: {
        id: estacao.id,
        nome: estacao.nome,
        // "create" dentro de "create": cria a estação JÁ com as linhas da escala
        escala: {
          create: Object.entries(estacao.escala).map(([turno, atendenteId]) => ({ turno, atendenteId })),
        },
      },
    });
  }

  await prisma.contato.createMany({ data: dados.contatos.map((c) => ({ ...c, salvo: c.salvo !== false })) });
  await prisma.etiqueta.createMany({ data: dados.etiquetas.map((e) => ({ ...e, editavel: Boolean(e.editavel) })) });
  await prisma.respostaRapida.createMany({ data: dados.respostasRapidas });

  for (const c of dados.conversas) {
    await prisma.conversa.create({
      data: {
        id: c.id,
        tipo: c.tipo,
        status: c.status || "aberta",
        arquivada: Boolean(c.arquivada),
        marcadaNaoLida: Boolean(c.marcadaNaoLida),
        fixadaEm: comoData(c.fixadaEm),
        contatoId: c.tipo === "contato" ? c.contatoId : null,
        nomeGrupo: c.tipo === "grupo" ? c.nome : null,
        participantes: c.participantes || [],
        atendenteId: c.atendenteId,
        // "connect": liga a conversa a etiquetas que JÁ existem (pelo id)
        etiquetas: { connect: (c.etiquetas || []).map((id) => ({ id })) },
      },
    });

    /* Mensagens em DUAS passadas: uma resposta aponta para outra mensagem,
       que precisa existir antes. 1º todas sem o "respostaA"; 2º liga as respostas */
    const idsAtendentes = new Set(dados.atendentes.map((a) => a.id));
    await prisma.mensagem.createMany({
      data: c.mensagens.map((m) => ({
        id: m.id,
        conversaId: c.id,
        tipo: m.tipo,
        direcao: m.direcao,
        horario: comoData(m.horario),
        lida: Boolean(m.lida),
        texto: m.texto ?? null,
        audioUrl: m.audioUrl ?? null,
        duracao: m.duracao ?? null,
        // "autor" no front é o id de um atendente OU o nome de um participante
        autorId: idsAtendentes.has(m.autor) ? m.autor : null,
        autorNome: m.autor && !idsAtendentes.has(m.autor) ? m.autor : null,
        editadaEm: comoData(m.editadaEm),
        versoesAnteriores: m.versoesAnteriores || [],
        apagada: Boolean(m.apagada),
        apagadaEm: comoData(m.apagadaEm),
        apagadaPorId: m.apagadaPor ?? null,
        encaminhada: Boolean(m.encaminhada),
      })),
    });

    for (const m of c.mensagens.filter((m) => m.respostaA)) {
      await prisma.mensagem.update({ where: { id: m.id }, data: { respostaAId: m.respostaA } });
    }
  }

  await prisma.auditoria.createMany({
    data: dados.auditoria.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      quando: comoData(r.quando),
      conversaId: r.conversaId,
      conversaNome: r.conversaNome,
      mensagemId: r.mensagemId ?? null,
      tipoMensagem: r.tipoMensagem ?? null,
      antes: r.antes ?? null,
      depois: r.depois ?? null,
      mensagens: r.mensagens ?? undefined,
      autorId: r.autorId,
    })),
  });

  // Um resumo, para conferir
  const total = {
    atendentes: await prisma.atendente.count(),
    contatos: await prisma.contato.count(),
    conversas: await prisma.conversa.count(),
    mensagens: await prisma.mensagem.count(),
    auditoria: await prisma.auditoria.count(),
  };
  console.log("✅ Pronto!", total);
}

/* finally: acontecendo o que acontecer (deu certo ou deu erro), fecha a
   conexão. Sem isso, o terminal ficaria "preso" esperando o banco */
try {
  await popular();
} catch (erro) {
  console.error("❌ Erro ao popular o banco:", erro);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
