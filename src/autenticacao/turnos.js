/* Os 3 turnos do dia (os horários da empresa), os mesmos do front.
   "fim" é exclusivo: às 15:00 já é tarde.

   O turno NÃO decide quem entra (quem entra é a estação). Ele só fica
   REGISTRADO: o login das 15h17 é "Estação 01 · Tarde", e a supervisão
   sabe de qual turno veio cada edição ou exclusão. Atrasos não
   atrapalham: quem chega às 7h10 entra normalmente, já na manhã */
export const TURNOS = [
  { id: "manha", nome: "Manhã", inicio: 7, fim: 15 },
  { id: "tarde", nome: "Tarde", inicio: 15, fim: 23 },
  { id: "noite", nome: "Noite", inicio: 23, fim: 7 },
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
      ? hora >= t.inicio && hora < t.fim // turno normal: 7h às 15h
      : hora >= t.inicio || hora < t.fim // passa da meia-noite: 23h às 7h
  );
}
