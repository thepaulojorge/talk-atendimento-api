/* CONVERTER ÁUDIO para o formato do WhatsApp.

   O Chrome grava áudio em WebM, e o WhatsApp não aceita WebM. Ele aceita
   OGG (com o codec Opus, o mesmo das mensagens de voz do celular).
   A boa notícia: o SOM dentro do WebM do Chrome já é Opus. Só a
   "embalagem" muda (WebM -> OGG), sem recomprimir nada: é rápido.

   Quem faz isso é o ffmpeg, um programa famoso de áudio e vídeo. O
   pacote "ffmpeg-static" baixa o ffmpeg junto com o npm install */
import { spawn } from "node:child_process";
import caminhoDoFfmpeg from "ffmpeg-static";

export function webmParaOgg(conteudo) {
  return new Promise((resolver, rejeitar) => {
    /* -i pipe:0       = lê da "entrada" (o áudio que mandamos)
       -c:a copy      = copia o som como está (sem recomprimir)
       -f ogg pipe:1  = escreve OGG na "saída" (que nós lemos) */
    const ffmpeg = spawn(caminhoDoFfmpeg, ["-i", "pipe:0", "-vn", "-c:a", "copy", "-f", "ogg", "pipe:1"]);
    const pedacos = [];
    ffmpeg.stdout.on("data", (pedaco) => pedacos.push(pedaco));
    ffmpeg.on("error", rejeitar);
    ffmpeg.on("close", (codigo) => (codigo === 0 ? resolver(Buffer.concat(pedacos)) : rejeitar(new Error(`ffmpeg saiu com código ${codigo}`))));
    ffmpeg.stdin.on("error", () => {}); // se o ffmpeg fechar antes, o erro já aparece no "close"
    ffmpeg.stdin.end(conteudo);
  });
}

/* QUANTO DURA um áudio (em segundos)? A Meta não informa a duração das
   mensagens de voz. O ffmpeg "toca" o áudio sem som (-f null) e, no fim,
   escreve no relatório algo como "time=00:00:12.48": é isso que lemos.
   Se não der certo, 0 (o player descobre a duração ao tocar) */
export function duracaoDoAudio(conteudo) {
  return new Promise((resolver) => {
    const ffmpeg = spawn(caminhoDoFfmpeg, ["-i", "pipe:0", "-f", "null", "-"]);
    let relatorio = "";
    ffmpeg.stderr.on("data", (pedaco) => (relatorio += pedaco));
    ffmpeg.on("error", () => resolver(0));
    ffmpeg.on("close", () => {
      const tempos = [...relatorio.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
      const ultimo = tempos.at(-1);
      resolver(ultimo ? Math.round(Number(ultimo[1]) * 3600 + Number(ultimo[2]) * 60 + Number(ultimo[3])) : 0);
    });
    ffmpeg.stdin.on("error", () => {});
    ffmpeg.stdin.end(conteudo);
  });
}
