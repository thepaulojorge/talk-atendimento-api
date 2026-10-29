/* POPULAR O BANCO com os dados de exemplo. Rode com: npm run banco:popular
   O trabalho de verdade está em src/dados/exemplos.js: o mesmo código
   serve para o "Restaurar dados de exemplo" do modo demonstração */
try {
  process.loadEnvFile(); // lê o .env (como o --env-file do npm run dev)
} catch {
  // sem .env: as variáveis já estão no ambiente
}

// Importados DEPOIS de ler o .env: o banco.js precisa do DATABASE_URL
const { prisma } = await import("../src/banco.js");
const { popularComExemplos } = await import("../src/dados/exemplos.js");

/* finally: acontecendo o que acontecer (deu certo ou deu erro), fecha a
   conexão. Sem isso, o terminal ficaria "preso" esperando o banco */
try {
  const total = await popularComExemplos(prisma, console.log);
  console.log(total);
} catch (erro) {
  console.error("❌ Erro ao popular o banco:", erro);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
