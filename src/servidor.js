/* PONTO DE PARTIDA: liga o servidor numa porta.

   Separado do app.js de propósito: o app.js MONTA a API (rotas, regras),
   este arquivo só a coloca para rodar. Mais adiante, os testes vão usar
   o app.js sem precisar ligar um servidor de verdade. */
import { app } from "./app.js";

/* process.env: as VARIÁVEIS DE AMBIENTE, configurações que ficam FORA
   do código (no arquivo .env em casa; no painel do Render, na nuvem).
   Se PORTA não existir, usa 3000. O Render escolhe a porta e avisa pela
   variável PORT, por isso olhamos as duas */
const porta = Number(process.env.PORT || process.env.PORTA || 3000);

app.listen(porta, () => {
  console.log(`✅ API do Talk Atendimento rodando em http://localhost:${porta}`);
  console.log(`   Teste no navegador: http://localhost:${porta}/api/saude`);
});
