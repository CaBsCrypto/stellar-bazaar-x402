import { handleSandboxPayment } from "@/lib/sandbox-payment-handler";
export const runtime = "nodejs";
export async function GET(request: Request) { return handleSandboxPayment(request); }
