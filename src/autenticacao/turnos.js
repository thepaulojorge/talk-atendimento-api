/* Os 3 turnos do dia, os mesmos do front. "fim" é exclusivo: às 14:00 já é tarde */
export const TURNOS = [
  { id: "manha", nome: "Manhã", inicio: 6, fim: 14 },
  { id: "tarde", nome: "Tarde", inicio: 14, fim: 22 },
  { id: "noite", nome: "Noite", inicio: 22, fim: 6 },
];

/* A HORA EM BRASÍLIA. O servidor do Render roda no horário de Londres
   (UTC): às 9h da manhã aqui, lá já são 12h. Usar data.getHours() direto
   colocaria o Paulo no turno errado. O Intl converte para o fuso que
   pedirmos, não importa onde o servidor esteja */
const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "numeric",
  hourCycle: "h23", // 0 a 23 (e não "12 AM")
});

export function horaEmBrasilia(data) {
  return Number(formatoHora.format(data));
}

// Qual turno é neste momento (em Brasília)?
export function turnoDe(data) {
  const hora = horaEmBrasilia(data);
  return TURNOS.find((t) =>
    t.inicio < t.fim
      ? hora >= t.inicio && hora < t.fim // turno normal: 6h às 14h
      : hora >= t.inicio || hora < t.fim // passa da meia-noite: 22h às 6h
  );
}
