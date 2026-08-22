import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mutationDisabled() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "PROVIDER_OWNERSHIP_NOT_IMPLEMENTED",
        message: "Update/delete están deshabilitados hasta disponer de credenciales por proveedor y almacenamiento transaccional.",
        retryable: false,
        stage: "discover",
      },
    },
    { status: 405 },
  );
}

export function PUT() {
  return mutationDisabled();
}

export function DELETE() {
  return mutationDisabled();
}
