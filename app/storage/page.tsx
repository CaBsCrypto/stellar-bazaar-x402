import { Navbar } from "../../components/Navbar";
import { Footer } from "../../components/Footer";
import {demoConfiguration} from '../../lib/demo-configuration';
export const dynamic='force-dynamic';

export const metadata = {
  title: "Archivos e historial — Stellar Bazaar",
  description: "Conservación de entregas, integridad y estado de la retención de siete días.",
};

export default function StorageInformation() {
  const files=demoConfiguration().features.privateFiles;
  return <>
    <Navbar prefetch={false} />
    <main className="shell ui-page">
      <h1>Archivos e historial</h1>
      <p>Bazaar está en Testnet. Los proveedores ejecutan sus servicios y pueden alojar sus resultados. El historial privado relaciona cada compra con su pago y su entrega.</p>
      <h2>Estado del almacenamiento de Bazaar</h2>
      <p>La integración relaciona cada archivo con una orden pagada, el comprador, el proveedor y un intento y versión inmutables. El almacenamiento es privado en Cloudflare R2, compatible con S3.</p>
      <p>Archivos nuevos en este despliegue: {files.enabled?'habilitados para órdenes que los declaren':`deshabilitados (${files.reason})`}. La habilitación por configuración se comprueba por separado de las pruebas de subida y del recorrido completo con pago Testnet. Consulta las capacidades MCP para ver las funciones disponibles.</p>
      <h2>Qué se conserva</h2>
      <p>El historial relaciona servicio, importe, estado del pago, transacción y entrega. Los archivos incluyen tipo, tamaño y SHA-256. El servicio puede entregar texto, enlaces externos o archivos privados en Bazaar. Un enlace alojado por el proveedor depende de su disponibilidad; guardar el enlace no conserva el archivo.</p>
      <p>La capacidad se reserva antes de aceptar una orden: 50 MB por archivo, 100 MB por cuenta y 5 GB globales, incluyendo reservas pendientes y limpieza aún no confirmada. Las subidas generales están cerradas; solo el agente del proveedor que reclamó la orden pagada obtiene permisos temporales.</p>
      <h2>Plazo de siete días</h2>
      <p>Las consultas y resultados visibles vencen a los siete días. La fecha queda fijada al registrarlos; para órdenes se calcula desde su creación. Las lecturas y reintentos no extienden ese plazo. La aplicación deniega el acceso al contenido vencido.</p>
      <p>El guardián elimina texto, metadatos e índices y solicita borrar los objetos. Si el almacenamiento falla, conserva únicamente los identificadores de limpieza calculados mediante hash y su reserva hasta confirmar el borrado. La configuración de despliegue debe incluir el ciclo de vida de R2 como respaldo para archivos completados; cancelar subidas incompletas por sí solo no cubre esa función.</p>
      <p>La eliminación física puede demorarse y una subida iniciada antes de vencer puede terminar después. Por eso se repite la limpieza, se mantiene la reserva durante su confirmación y se exige el respaldo de ciclo de vida. <a href="https://developers.cloudflare.com/r2/buckets/object-lifecycles/">Cloudflare explica los plazos del ciclo de vida</a>.</p>
      <p>La caducidad de un enlace temporal tampoco elimina el archivo. Los registros mínimos para evitar pagos duplicados requieren una política separada. Las transacciones públicas de Stellar permanecen en la red aunque se elimine el historial de Bazaar.</p>
      <h2>Qué significa verificado</h2>
      <p>Un pago verificado, una entrega disponible y la integridad del archivo son comprobaciones distintas. Un hash declarado por el proveedor no constituye una verificación independiente. Verificar integridad comprueba los bytes recibidos, no la calidad del contenido ni su disponibilidad futura.</p>
      <h2>Acceso y recuperación</h2>
      <p>Solo el comprador y su agente pueden solicitar enlaces temporales de descarga. Las claves de almacenamiento pertenecen al servidor y nunca se publican aquí. Bazaar no almacena claves privadas de wallets. La vinculación previa de wallet es opcional; cada orden fija su pagador y verifica las condiciones del pago.</p>
      <p>Si falla el acceso a una entrega o se pierde una respuesta, consulta la orden existente y solicita recuperación. No repitas un pago únicamente porque falló el historial.</p>
      <a href="/history">Volver al historial privado</a>
    </main>
    <Footer prefetch={false} />
  </>;
}
