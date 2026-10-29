/* DO BANCO PARA O FRONT.
   O banco organiza os dados do jeito dele (tabelas separadas, nomes em
   snake_case, datas como Date). O front espera o formato do dados.json.
   Estas funções fazem a "tradução", num lugar só.

   Assim, o front não precisou mudar NADA na troca do arquivo pelo banco:
   o "contrato" da API (o formato da resposta) continuou o mesmo */

// Date -> "2026-10-23T17:30:00.000Z" (ou null). O JSON não tem tipo "data"
const iso = (data) => (data ? data.toISOString() : null);

export function estacaoParaFront(estacao) {
  // As linhas da escala viram o objeto { manha: "at1", tarde: "at2", noite: "at3" }
  const escala = Object.fromEntries(estacao.escala.map((linha) => [linha.turno, linha.atendenteId]));
  return {
    id: estacao.id,
    nome: estacao.nome,
    sigla: estacao.sigla,
    escala,
    // Quem está puxando esta estação agora (ids dos atendentes)
    puxadaPor: (estacao.puxadas || []).map((p) => p.atendenteId),
  };
}

/* Uma linha (número de WhatsApp), com um nome para mostrar na tela:
   a sigla da estação ("E01"), ou "Supervisão" / "Diretoria" */
const NOMES_DOS_PAPEIS = { supervisor: "Supervisão", diretoria: "Diretoria" };

export function linhaParaFront(linha, estacoes) {
  const estacao = estacoes.find((e) => e.id === linha.estacaoId);
  return {
    id: linha.id,
    numero: linha.numero,
    estacaoId: linha.estacaoId,
    papel: linha.papel,
    nome: estacao?.nome ?? NOMES_DOS_PAPEIS[linha.papel] ?? "Linha",
    sigla: estacao?.sigla ?? NOMES_DOS_PAPEIS[linha.papel] ?? "",
  };
}

/* { supervisao }: quem pode ver o que foi apagado ou editado.
   Para os outros, a mensagem apagada chega SEM o conteúdo, e a editada
   sem as versões antigas: o dado nem sai do servidor */
export function mensagemParaFront(m, { supervisao = false } = {}) {
  const esconder = m.apagada && !supervisao;
  return {
    id: m.id,
    tipo: m.tipo,
    texto: esconder ? null : m.texto,
    audioUrl: esconder ? null : m.audioUrl,
    duracao: m.duracao,
    horario: iso(m.horario),
    direcao: m.direcao,
    lida: m.lida,
    // No front, "autor" é um campo só: id do atendente OU nome do participante
    autor: m.autorId ?? m.autorNome ?? null,
    respostaA: m.respostaAId,
    encaminhada: m.encaminhada,
    editadaEm: iso(m.editadaEm),
    versoesAnteriores: supervisao ? m.versoesAnteriores : [],
    apagada: m.apagada,
    apagadaPor: m.apagadaPorId,
    apagadaEm: iso(m.apagadaEm),
  };
}

export function conversaParaFront(c, opcoes = {}) {
  return {
    id: c.id,
    tipo: c.tipo,
    linhaId: c.linhaId,
    ...(c.tipo === "grupo" ? { nome: c.nomeGrupo, participantes: c.participantes } : { contatoId: c.contatoId }),
    atendenteId: c.atendenteId,
    status: c.status,
    arquivada: c.arquivada,
    marcadaNaoLida: c.marcadaNaoLida,
    fixadaEm: iso(c.fixadaEm),
    etiquetas: c.etiquetas.map((e) => e.id), // o front guarda só os ids
    mensagens: c.mensagens.map((m) => mensagemParaFront(m, opcoes)),
  };
}

// existentes: os ids das conversas que ainda existem (para o link "ver na conversa")
export function auditoriaParaFront(r, existentes = new Set()) {
  return {
    id: r.id,
    tipo: r.tipo,
    quando: iso(r.quando),
    conversaId: r.conversaId,
    conversaNome: r.conversaNome,
    conversaExiste: existentes.has(r.conversaId),
    mensagemId: r.mensagemId,
    tipoMensagem: r.tipoMensagem,
    antes: r.antes,
    depois: r.depois,
    mensagens: r.mensagens,
    autorId: r.autorId,
    estacaoId: r.estacaoId,
    turnoId: r.turno,
  };
}
