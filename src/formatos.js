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
  return { id: estacao.id, nome: estacao.nome, escala };
}

export function mensagemParaFront(m) {
  return {
    id: m.id,
    tipo: m.tipo,
    texto: m.texto,
    audioUrl: m.audioUrl,
    duracao: m.duracao,
    horario: iso(m.horario),
    direcao: m.direcao,
    lida: m.lida,
    // No front, "autor" é um campo só: id do atendente OU nome do participante
    autor: m.autorId ?? m.autorNome ?? null,
    respostaA: m.respostaAId,
    encaminhada: m.encaminhada,
    editadaEm: iso(m.editadaEm),
    versoesAnteriores: m.versoesAnteriores,
    apagada: m.apagada,
    apagadaPor: m.apagadaPorId,
    apagadaEm: iso(m.apagadaEm),
  };
}

export function conversaParaFront(c) {
  return {
    id: c.id,
    tipo: c.tipo,
    ...(c.tipo === "grupo" ? { nome: c.nomeGrupo, participantes: c.participantes } : { contatoId: c.contatoId }),
    atendenteId: c.atendenteId,
    status: c.status,
    arquivada: c.arquivada,
    marcadaNaoLida: c.marcadaNaoLida,
    fixadaEm: iso(c.fixadaEm),
    etiquetas: c.etiquetas.map((e) => e.id), // o front guarda só os ids
    mensagens: c.mensagens.map(mensagemParaFront),
  };
}

export function auditoriaParaFront(r) {
  return {
    id: r.id,
    tipo: r.tipo,
    quando: iso(r.quando),
    conversaId: r.conversaId,
    conversaNome: r.conversaNome,
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
