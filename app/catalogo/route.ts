import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL("/#catalogo", request.url);
  return NextResponse.redirect(url, 308);
}