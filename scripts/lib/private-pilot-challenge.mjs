import { validateWebsiteIntelligencePaymentRequired } from "../../lib/website-intelligence-one-shot.ts";
import {
  canonicalInputHash,
  WEBSITE_INTELLIGENCE_BINDING_EXTENSION,
} from "../../lib/website-intelligence-readiness.ts";
export function assertPilotPaymentChallenge(context, run) {
  const accepted = validateWebsiteIntelligencePaymentRequired(
    context.paymentRequired,
    {
      payTo: run.payTo,
      inputHash: run.expected.inputHash,
      cardHash: run.cardHash,
      resourceUrl:
        "https://website-intelligence-provider.vercel.app/v1/x402/audits",
    },
  );
  const binding =
    context.paymentRequired.extensions?.[WEBSITE_INTELLIGENCE_BINDING_EXTENSION]
      ?.info;
  if (
    binding?.requestId !== run.requestId ||
    binding?.recoveryProof !== run.proof
  )
    throw Error("RECOVERY_BINDING_CHANGED_BEFORE_SIGNATURE");
  if (
    canonicalInputHash(accepted) !==
    canonicalInputHash(context.selectedRequirements)
  )
    throw Error("SELECTED_REQUIREMENTS_CHANGED_BEFORE_SIGNATURE");
}
