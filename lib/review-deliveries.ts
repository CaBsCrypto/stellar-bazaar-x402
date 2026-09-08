import type { SavedDeliverable, DeliveryFile } from "./deliverable";
import type { ActivityEvent } from "./activity";
// Public demonstration files only. Never used as evidence of a purchase or as an authenticated fallback.
const imageA: DeliveryFile = {
  id: "poster-a",
  name: "afiche-orbita.png",
  mediaType: "image/png",
  size: 38183,
  sha256: "bdd585a9f50efc6628792c067ccf6818522e762f8576732bf53920427860b2bd",
};
const imageB: DeliveryFile = {
  id: "poster-b",
  name: "afiche-pulso.png",
  mediaType: "image/png",
  size: 34473,
  sha256: "2d0cf6ee29849b11d25f13bac01ba48828c31a240d838eb9fb08cf104d1e46ff",
};
const video: DeliveryFile = {
  id: "video-demo",
  name: "clip-demostracion.mp4",
  mediaType: "video/mp4",
  size: 219483,
  sha256: "9ed0bdfac1adb859ed61ee3bcd793843fdb08f64235a733e97066555c098e4c2",
};
const captions: DeliveryFile = {
  id: "captions-demo",
  name: "subtitulos.vtt",
  mediaType: "text/vtt",
  size: 125,
  sha256: "4b45402cbd7f0fc8ff6763666a33ee2523bd74ff1bb4082689c29399379a5518",
};
export const reviewFilePaths: Record<string, string> = {
  "poster-a": "/demo-deliveries/afiche-orbita.png",
  "poster-b": "/demo-deliveries/afiche-pulso.png",
  "video-demo": "/demo-deliveries/clip-demostracion.mp4",
  "captions-demo": "/demo-deliveries/subtitulos.vtt",
};
const shared = {
  schemaVersion: "bazaar.deliverable/v1" as const,
  versionLabel: "Versión 1",
  files: [],
};
const saved = (manifest: SavedDeliverable["manifest"]): SavedDeliverable => ({
  manifest,
  operationId: manifest.deliveryId,
  taskId: "review-creative",
  agentId: "agente-demo",
  createdAt: "2026-09-08T12:00:00Z",
  files: Object.fromEntries(manifest.files.map((f) => [f.id, "available"])),
});
export const reviewDeliveries: SavedDeliverable[] = [
  saved({
    ...shared,
    deliveryId: "demo-script",
    versionId: "script-v1",
    title: "Una idea merece salir al mundo",
    summary:
      "Guion de demostración · cuatro escenas para una pieza de 30 segundos. Narración, texto en pantalla e indicaciones visuales en un mismo lugar.",
    content: {
      kind: "script",
      scenes: [
        {
          id: "scene-01",
          title: "La idea",
          durationSeconds: 6,
          narration:
            "Todo empieza con una idea. Una nota en el teléfono, un dibujo, algo que todavía no sabe cómo salir al mundo.",
          screenText: "Todo empieza con una idea.",
          visual:
            "Plano detalle de una libreta. Luz natural y movimiento lento sobre un boceto.",
        },
        {
          id: "scene-02",
          title: "La primera forma",
          durationSeconds: 8,
          narration:
            "Después llegan las palabras, las imágenes y el ritmo. La idea empieza a encontrar su propia forma.",
          screenText: "Palabras. Imágenes. Ritmo.",
          visual:
            "Transición entre la página del guion, dos variantes de un afiche y una línea de tiempo de video.",
        },
        {
          id: "scene-03",
          title: "El resultado",
          durationSeconds: 10,
          narration:
            "Tu agente reúne el trabajo. Tú puedes verlo, recorrer cada parte y llevarte los archivos que necesitas.",
          screenText: "Tu trabajo, en un solo lugar.",
          visual:
            "Recorrido por una biblioteca de entregas: abrir un informe, ampliar una imagen y reproducir un clip.",
        },
        {
          id: "scene-04",
          title: "El siguiente paso",
          durationSeconds: 6,
          narration:
            "Abre el resultado. Hazlo tuyo. La próxima idea ya está esperando.",
          screenText: "Explora tu próxima idea.",
          visual:
            "Cierre con una composición simple. Mantener el texto legible durante los últimos tres segundos.",
        },
      ],
    },
  }),
  saved({
    ...shared,
    deliveryId: "demo-video",
    versionId: "video-v1",
    title: "Movimiento, color y una idea",
    summary:
      "Clip de demostración de ocho segundos. Reproduce el archivo, recorre el tiempo y activa los subtítulos desde el reproductor.",
    files: [video, captions],
    content: {
      kind: "video",
      clips: [
        {
          id: "clip-01",
          title: "Clip principal",
          fileId: video.id,
          captionsFileId: captions.id,
          durationSeconds: 8,
        },
      ],
    },
  }),
  saved({
    ...shared,
    deliveryId: "demo-gallery",
    versionId: "gallery-v1",
    title: "Órbita / Pulso",
    summary:
      "Dos direcciones visuales para una misma campaña ficticia. Amplía las piezas, compáralas lado a lado y descarga cada original.",
    files: [imageA, imageB],
    content: {
      kind: "gallery",
      variants: [
        {
          id: "variant-a",
          title: "Órbita · dirección editorial",
          fileId: imageA.id,
          description:
            "Tonos cálidos, geometría orbital y una composición pausada.",
        },
        {
          id: "variant-b",
          title: "Pulso · dirección expresiva",
          fileId: imageB.id,
          description:
            "Contraste intenso, formas expansivas y un ritmo más enérgico.",
        },
      ],
    },
  }),
  saved({
    ...shared,
    deliveryId: "demo-report",
    versionId: "report-v1",
    title: "De la idea a la campaña",
    summary:
      "Informe visual de ejemplo: un resumen breve, decisiones creativas y una lista de entregables. Los contenidos son ficticios y no representan una investigación real.",
    content: {
      kind: "report",
      sections: [
        {
          id: "overview",
          title: "Resumen ejecutivo",
          body: "Esta demostración reúne cuatro maneras de recibir el trabajo de un agente. El objetivo es reconocer rápidamente qué llegó, revisar su contenido y encontrar los archivos originales.",
          findings: [
            "El resultado ocupa el centro de la experiencia.",
            "La actividad y el comprobante siguen disponibles en sus propias pestañas.",
          ],
        },
        {
          id: "direction",
          title: "Dirección creativa",
          body: "La campaña ficticia parte de una idea sencilla: transformar un boceto en algo que puede compartirse. El guion, el clip y los afiches ilustran distintas salidas de ese mismo proceso.",
          findings: [
            "Una voz cercana y frases breves.",
            "Dos composiciones visuales para comparar.",
            "Una pieza audiovisual corta para revisar ritmo y subtítulos.",
          ],
        },
        {
          id: "deliveries",
          title: "Qué incluye la entrega",
          body: "Un guion de cuatro escenas, un clip de ocho segundos y dos variantes gráficas. Cada archivo conserva su identidad para permitir referencias precisas en versiones futuras.",
        },
        {
          id: "next",
          title: "Cómo usar el material",
          body: "Recorre las escenas del guion, reproduce el video y compara los afiches. Puedes descargar los archivos de ejemplo. Los comentarios y las solicitudes de mejora se incorporarán en una etapa posterior.",
        },
      ],
    },
  }),
];
export function reviewEvents(delivery: SavedDeliverable): ActivityEvent[] {
  return [
    "task-started",
    "service-selected",
    "delivery-reported",
    "task-completed",
  ].map((kind, i) => ({
    eventId: delivery.manifest.deliveryId + "-" + i,
    taskId: "review-creative",
    operationId: delivery.operationId,
    agentId: "agente-demo",
    mode: "mock",
    kind: kind as ActivityEvent["kind"],
    title: [
      "Tarea de demostración iniciada",
      "Servicio de ejemplo seleccionado",
      "Resultado de prueba recibido",
      "Tarea de ejemplo terminada",
    ][i],
    recordedAt: "2026-09-08T12:0" + i + ":00Z",
    evidence: "agent-reported",
  }));
}
