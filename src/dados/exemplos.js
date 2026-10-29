/* OS DADOS DE EXEMPLO: coloca o dados.json no banco.

   ⚠️ APAGA tudo o que estiver no banco antes de colocar os exemplos.
   É uma ferramenta de desenvolvimento e de demonstração: nunca rode no
   banco de uma empresa.

   Em inglês, isto se chama "seed" (semente): os dados iniciais do banco */
import { readFile, rm } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { caminhoDe } from "../arquivos/disco.js";


const ARQUIVO = new URL("./dados.json", import.meta.url);

/* As datas do dados.json não dizem o fuso: "2026-10-08T18:49:00".
   Sem o fuso, o Node usa o do computador onde roda: no seu PC é o de
   Brasília, mas num servidor na nuvem seria o de Londres (3 horas de
   diferença!). Por isso dizemos qual é: -03:00, o horário de Brasília */
function comoData(texto) {
  if (!texto) return null;
  const temFuso = /([zZ]|[+-]\d{2}:\d{2})$/.test(texto);
  return new Date(temFuso ? texto : `${texto}-03:00`);
}

/* As datas do dados.json são fixas (outubro de 2026). Para os exemplos
   nunca ficarem "velhos", empurramos TODAS as datas a mesma quantidade de
   dias, até a mensagem mais recente cair em hoje. Antes isso era feito no
   front, a cada carregamento; agora que tudo fica no banco, é feito UMA
   vez, na hora de popular */
function diasParaTrazerParaHoje(dados) {
  const horarios = dados.conversas.flatMap((c) => c.mensagens.map((m) => comoData(m.horario).getTime()));
  const maisRecente = Math.max(...horarios);
  const UM_DIA = 24 * 60 * 60 * 1000;
  const TRES_HORAS = 3 * 60 * 60 * 1000;

  /* Quantos dias de CALENDÁRIO (em Brasília) separam a mais recente de hoje.
     Tirar 3 horas "converte" para o horário de Brasília; dividir por um dia
     e arredondar para baixo dá o número do dia */
  const dia = (ms) => Math.floor((ms - TRES_HORAS) / UM_DIA);
  let dias = dia(Date.now()) - dia(maisRecente);
  // Hoje mais cedo do que o horário da mensagem? Ela iria para o futuro: fica em ontem
  if (maisRecente + dias * UM_DIA > Date.now()) dias -= 1;
  return Math.max(0, dias);
}

/* Apaga TUDO e coloca os exemplos. Usada pelo "npm run banco:popular"
   e pelo "Restaurar dados de exemplo" do modo demonstração.
   log: onde escrever o progresso (console.log no terminal, nada na rota) */
export async function popularComExemplos(prisma, log = () => {}) {
  const dados = JSON.parse(await readFile(ARQUIVO, "utf-8"));
  const dias = diasParaTrazerParaHoje(dados);
  // Converte o texto em data E empurra os dias (null continua null)
  const data = (texto) => {
    const d = comoData(texto);
    if (d) d.setDate(d.getDate() + dias);
    return d;
  };

  log("🧹 Apagando os dados antigos...");
  /* A ORDEM importa: primeiro quem DEPENDE de outros (mensagens dependem
     de conversas, que dependem de contatos...). Apagar um contato que
     ainda tem conversas daria erro de chave estrangeira */
  await prisma.puxada.deleteMany();
  await prisma.conta.deleteMany();
  await prisma.auditoria.deleteMany();
  await prisma.mensagem.deleteMany();

  /* Os arquivos enviados: primeiro o conteúdo na pasta, depois o registro.
     Apagamos SÓ os arquivos que o banco conhece, um por um (e nunca a pasta
     inteira: se o PASTA_ARQUIVOS apontasse para o lugar errado, apagar a
     pasta toda seria um desastre). force: se já não existir, tudo bem */
  const arquivos = await prisma.arquivo.findMany({ select: { id: true } });
  for (const { id } of arquivos) await rm(caminhoDe(id), { force: true });
  await prisma.arquivo.deleteMany();
  await prisma.conversa.deleteMany();
  /* B7: as linhas já ligadas ao WhatsApp de verdade continuam ligadas.
     Restaurar os exemplos não pode "desligar" o número da empresa */
  const ligadas = new Map(
    (await prisma.linha.findMany({ where: { whatsappId: { not: null } } })).map((l) => [l.id, l.whatsappId])
  );
  await prisma.linha.deleteMany();
  await prisma.escala.deleteMany();
  await prisma.estacao.deleteMany();
  await prisma.contato.deleteMany();
  await prisma.etiqueta.deleteMany();
  await prisma.respostaRapida.deleteMany();
  await prisma.atendente.deleteMany();
  await prisma.configuracao.deleteMany();

  log("🌱 Colocando os dados de exemplo...");
  await prisma.configuracao.create({ data: { id: 1, nomeMarca: "Talk Atendimento" } });

  // createMany: várias linhas num comando só (bem mais rápido que um por um)
  await prisma.atendente.createMany({ data: dados.atendentes });

  for (const estacao of dados.estacoes) {
    await prisma.estacao.create({
      data: {
        id: estacao.id,
        nome: estacao.nome,
        sigla: estacao.sigla,
        // "create" dentro de "create": cria a estação JÁ com as linhas da escala
        escala: {
          create: Object.entries(estacao.escala).map(([turno, atendenteId]) => ({ turno, atendenteId })),
        },
      },
    });
  }

  /* CONTAS DE DEMONSTRAÇÃO. A senha "demo123" vira um hash: um texto
     como "$2b$10$N9qo8uLOickgx2ZMRZoMy..." que não dá para desfazer.
     O 10 é o "custo": quanto maior, mais lento embaralhar, e mais lento
     para um invasor testar senhas. 10 é o padrão recomendado */
  const senhaHash = await bcrypt.hash("demo123", 10);
  await prisma.conta.createMany({
    data: [
      { email: "estacao01@talk.com", senhaHash, tipo: "estacao", estacaoId: "est01" },
      { email: "estacao02@talk.com", senhaHash, tipo: "estacao", estacaoId: "est02" },
      { email: "supervisao@talk.com", senhaHash, tipo: "pessoal", atendenteId: "at4" },
      { email: "diretoria@talk.com", senhaHash, tipo: "pessoal", atendenteId: "at5" },
    ],
  });

  // As linhas (números de WhatsApp): uma por estação, mais as exclusivas
  await prisma.linha.createMany({
    data: dados.linhas.map((l) => ({ ...l, whatsappId: ligadas.get(l.id) ?? null })),
  });

  await prisma.contato.createMany({ data: dados.contatos.map((c) => ({ ...c, salvo: c.salvo !== false })) });
  await prisma.etiqueta.createMany({ data: dados.etiquetas.map((e) => ({ ...e, editavel: Boolean(e.editavel) })) });
  await prisma.respostaRapida.createMany({ data: dados.respostasRapidas });

  for (const c of dados.conversas) {
    await prisma.conversa.create({
      data: {
        id: c.id,
        tipo: c.tipo,
        linhaId: c.linhaId,
        status: c.status || "aberta",
        arquivada: Boolean(c.arquivada),
        marcadaNaoLida: Boolean(c.marcadaNaoLida),
        fixadaEm: data(c.fixadaEm),
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
        horario: data(m.horario),
        lida: Boolean(m.lida),
        texto: m.texto ?? null,
        audioUrl: m.audioUrl ?? null,
        duracao: m.duracao ?? null,
        // "autor" no front é o id de um atendente OU o nome de um participante
        autorId: idsAtendentes.has(m.autor) ? m.autor : null,
        autorNome: m.autor && !idsAtendentes.has(m.autor) ? m.autor : null,
        editadaEm: data(m.editadaEm),
        versoesAnteriores: m.versoesAnteriores || [],
        apagada: Boolean(m.apagada),
        apagadaEm: data(m.apagadaEm),
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
      quando: data(r.quando),
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
  log("✅ Pronto!");
  const total = {
    atendentes: await prisma.atendente.count(),
    linhas: await prisma.linha.count(),
    contas: await prisma.conta.count(),
    contatos: await prisma.contato.count(),
    conversas: await prisma.conversa.count(),
    mensagens: await prisma.mensagem.count(),
    auditoria: await prisma.auditoria.count(),
  };
  return total;
}

