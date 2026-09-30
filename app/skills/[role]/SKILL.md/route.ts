import { bazaarRoles, skillDocument, type BazaarRole } from "@/lib/bazaar-skills";
export function GET(_request: Request, context: { params: Promise<{ role: string }> }) {
  return context.params.then(({ role }) => bazaarRoles.includes(role as BazaarRole)
    ? new Response(skillDocument(role as BazaarRole), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `inline; filename="SKILL.md"` } })
    : new Response("Skill not found", { status: 404 }));
}
