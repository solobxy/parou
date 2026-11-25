// Processo à parte para os relatórios (relatorios.ts): somar meses ou anos de atrasos e avisos demora, e no processo da app
// bloqueava os pedidos (e a vigia reiniciava a app). Uso: fork com ["gerar", período] ou ["guardar"]; responde por IPC.
import { gerarRelatorio, guardarRelatoriosDeHoje, PERIODOS, type Periodo } from '../relatorios';

const [acao, periodo] = process.argv.slice(2);
try {
  if (acao === 'guardar') {
    process.send?.({ ok: true, feitos: guardarRelatoriosDeHoje() });
  } else if (acao === 'gerar' && periodo in PERIODOS) {
    process.send?.({ ok: true, relatorio: gerarRelatorio(periodo as Periodo) });
  } else {
    process.send?.({ ok: false, erro: 'pedido inválido' });
  }
} catch (e: any) {
  process.send?.({ ok: false, erro: String(e?.message || e).slice(0, 200) });
}
setTimeout(() => process.exit(0), 50);
