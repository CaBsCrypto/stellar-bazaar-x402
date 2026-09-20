import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <span>✦</span>
      <h1>Recurso no encontrado</h1>
      <p>El servicio o página que buscas no existe o ha sido reubicado.</p>
      <Link className="primary" href="/">
        Volver al Catálogo de Bazaar
      </Link>
    </main>
  );
}
