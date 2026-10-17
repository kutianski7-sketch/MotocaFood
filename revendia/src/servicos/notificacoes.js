// Mensagens automáticas para clientes finais (em nome da revendedora) e para a revendedora.
import { um } from "../db.js";
import { enviarTexto } from "../integracoes/whatsapp.js";
import { reais, dataBR } from "../util.js";

const primeiroNome = (n) => String(n || "").split(" ")[0] || "";

export async function paraCliente(pedido, tipo, extra = {}) {
  const cli = um("SELECT * FROM clientes WHERE id = ?", pedido.cliente_id);
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", pedido.revendedora_id);
  if (!cli?.whatsapp) return;
  const n = primeiroNome(cli.nome), r = primeiroNome(rev.nome);
  const textos = {
    confirmado: `Oi, ${n}! 💛 Aqui é da ${r}. Seu pedido foi anotado: ${extra.resumo}.\nTotal: ${reais(pedido.total)}.${extra.pix ? `\n\nPra pagar no Pix é só copiar o código abaixo:\n${extra.pix}` : ""}\n\nJá vou te avisando cada passo da entrega!`,
    previsao: `${n}, boa notícia! Seu pedido já foi liberado pela marca ✨\nChega aqui comigo em ${dataBR(pedido.previsao_chegada)} e eu te entrego em ${dataBR(pedido.previsao_entrega)}. Te aviso quando o motoboy sair 🛵`,
    pronto: `${n}, seu pedido está pronto! 🎁 Estou separando sua sacolinha e já chamo o motoboy pra levar até você.`,
    saiu: `${n}, seu pedido saiu pra entrega 🛵${extra.motoboy ? ` com ${extra.motoboy}` : ""}.${extra.rastreio ? ` Acompanhe: ${extra.rastreio}` : ""}`,
    entregue: `${n}, pedido entregue! 💛 Obrigada pela confiança. Qualquer coisa é só me chamar aqui.`,
  };
  if (textos[tipo]) await enviarTexto(cli.whatsapp, textos[tipo], { revendedoraId: rev.id, emNomeDaRevendedora: true });
}

export async function paraRevendedora(revendedoraId, texto) {
  const rev = um("SELECT * FROM revendedoras WHERE id = ?", revendedoraId);
  if (rev?.whatsapp) await enviarTexto(rev.whatsapp, texto, { revendedoraId });
}
