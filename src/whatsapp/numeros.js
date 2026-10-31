/* NÚMEROS DE TELEFONE e o "9 do celular".

   No Brasil, os celulares ganharam um 9 na frente em 2012-2016. Mas o
   WhatsApp guarda muitos números ANTIGOS sem esse 9: o cliente com
   +55 21 98811-0001 pode chegar como "552188110001" (12 dígitos).
   Para saber se dois números são a MESMA pessoa, comparamos a forma
   "sem o 9" dos dois */

export const somenteDigitos = (texto = "") => String(texto).replace(/\D/g, "");

// "5521988110001" -> "552188110001" (tira o 9 do celular brasileiro, se tiver)
export function semNoveDoCelular(numero) {
  const d = somenteDigitos(numero);
  return d.length === 13 && d.startsWith("55") && d[4] === "9" ? d.slice(0, 4) + d.slice(5) : d;
}

export const mesmoNumero = (a, b) => semNoveDoCelular(a) === semNoveDoCelular(b);

/* Para MOSTRAR: "552188110001" -> "+55 21 98811-0001".
   Celular sem o 9 (começa com 6, 7, 8 ou 9) ganha o 9 de volta.
   O mesmo formato que o front usa (utilidades/texto.js) */
export function formatarNumero(numero) {
  let d = somenteDigitos(numero);
  if (d.length === 12 && d.startsWith("55") && /[6-9]/.test(d[4])) d = d.slice(0, 4) + "9" + d.slice(4);
  if (d.length === 13) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}
