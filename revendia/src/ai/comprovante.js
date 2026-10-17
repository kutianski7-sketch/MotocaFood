// Lê fotos/PDFs de comprovante (Pix ou boleto) para identificar pagamentos automaticamente.
import { temIA, gerarJSON } from "./claude.js";

export async function lerComprovante({ base64, mime }) {
  if (!temIA()) return null;
  const bloco = mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mime || "image/jpeg", data: base64 } };
  return gerarJSON({
    sistema: "Você extrai dados de comprovantes bancários brasileiros (Pix, boleto, TED). Se a imagem não for um comprovante, retorne eh_comprovante=false.",
    mensagem: [bloco, { type: "text", text: "Extraia os dados do comprovante." }],
    schema: { type: "object", additionalProperties: false, required: ["eh_comprovante", "tipo", "valor", "data", "pagador", "recebedor", "linha_digitavel"],
      properties: {
        eh_comprovante: { type: "boolean" }, tipo: { type: "string", enum: ["pix", "boleto", "ted", "outro"] }, valor: { type: "number" },
        data: { type: "string" }, pagador: { type: "string" }, recebedor: { type: "string" }, linha_digitavel: { type: "string" } } },
  });
}
