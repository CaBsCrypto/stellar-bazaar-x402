import { calculateSwapRisk } from "./swap-risk";
import { reviewDeliveries } from "./review-deliveries";

// Public, editorial presentation only. Never purchase evidence or provider output.
export const servicePortfolios = {
  "swap-risk-quote": {
    title: "Así se ve una consulta de riesgo",
    intro: "Explora cómo se presenta una respuesta de prueba antes de conectar tu agente.",
    receives: ["Una respuesta estructurada con riesgo de ruta e impacto de precio.", "Una categoría de liquidez y los factores usados por la referencia."],
    steps: ["Indicas el par, el monto y si compras o vendes.", "La referencia aplica un cálculo determinista de prueba.", "Recibes los indicadores en una respuesta estructurada."],
    limitation: "Sandbox de conectividad y pagos. Esta muestra no usa datos de mercado ni representa un análisis financiero real.",
    sample: {kind: "risk" as const, result: calculateSwapRisk("XLM/USDC", 2500, "buy")},
  },
  "ai-video-scriptwriter": {
    title: "Una idea, escena por escena",
    intro: "Recorre una muestra de guion: lo que se narra, lo que aparece en pantalla y cómo podría verse.",
    receives: ["El proveedor declara un guion y un visor HTML de teleprompter.", "También declara una entrega compatible con Bazaar. El formato final debe comprobarse con el proveedor."],
    steps: ["Compartes tema, duración y tono con tu agente.", "El servicio prepara el guion según la solicitud.", "Recibes el guion y los formatos que confirme el proveedor."],
    limitation: "Esta pieza fue creada para demostrar Bazaar. No es un trabajo verificado de AI Creative Studio ni garantiza el formato o la calidad de su entrega.",
    sample: {kind: "script" as const, saved: reviewDeliveries.find(item => item.manifest.deliveryId === "demo-script")!},
  },
};
export function getServicePortfolio(id: string) {
  return servicePortfolios[id as keyof typeof servicePortfolios];
}
