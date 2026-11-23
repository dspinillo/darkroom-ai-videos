/**
 * Número na tela. Duas regras que já custaram um gráfico errado:
 *
 * - proporção é absoluta: retenção de 100 → 80 é **80%**, não "+80%" (que sugere aumento);
 * - variação contra uma base leva sinal, com o sinal de menos tipográfico (−20%).
 *
 * O renderer calcula o rótulo a partir do valor; ninguém escreve "+10%" à mão.
 */

export type NumberFormat = "number" | "percent" | "index";

export function formatValue(
  value: number,
  format: NumberFormat,
  options: { baseline?: number; locale?: string; digits?: number } = {},
): string {
  const locale = options.locale ?? "pt-BR";
  const digits = options.digits ?? (Number.isInteger(value) ? 0 : 1);
  const number = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (format === "number") return number(value);
  if (format === "percent") return `${number(Math.abs(value))}%`;
  const baseline = options.baseline;
  if (baseline === undefined || baseline === 0) throw new Error("formato index precisa de baseline diferente de zero");
  const change = ((value - baseline) / baseline) * 100;
  const rounded = Number(change.toFixed(digits));
  if (rounded === 0) return `${number(0)}%`;
  return `${rounded > 0 ? "+" : "−"}${number(Math.abs(rounded))}%`;
}
