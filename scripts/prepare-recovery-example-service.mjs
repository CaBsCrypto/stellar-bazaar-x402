import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRecoveryExampleCard } from '../examples/recovery-example-text-service.mjs';

/** Public metadata only. This command never submits, activates or buys a service. */
export function prepareRecoveryExampleService({ providerOrigin, destination }) {
  const publication = createRecoveryExampleCard({ providerOrigin, destination });
  return {
    version: 'bazaar.recovery-example-preparation/v1',
    status: 'draft-not-published',
    ...publication,
    buyerInput: { format: 'text' },
    adapter: 'examples/recovery-example-text-service.mjs',
    automaticWakeConfigured: false,
    publicationSteps: [
      'Configure the provider-owned HTTPS runtime and durable encrypted state.',
      'Bind the seller account, agent, endpoint and exact card hash.',
      'Submit through submit_market_service and prove endpoint control.',
      'Obtain human review, activation and effective capacity.',
      'Review hosted wake integration and measured global budget before production.',
    ],
    recoveryTools: ['get_market_order', 'list_market_orders'],
    paymentInstructions: 'The buyer authorizes the quoted order and signs locally. This preparation does not authorize a transaction.',
    originalOrderMutationPerformed: false,
    productionOrderInspectionPerformed: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw Error('PUBLIC_CONFIGURATION_REQUIRED');
    const [, , providerOrigin, destination] = process.argv;
    process.stdout.write(JSON.stringify(prepareRecoveryExampleService({ providerOrigin, destination }), null, 2) + '\n');
  } catch {
    process.stderr.write('Use: node scripts/prepare-recovery-example-service.mjs <owned-https-origin> <public-testnet-seller-address>\nNo remote action was performed.\n');
    process.exitCode = 1;
  }
}
