import { generateHistoryKeypair } from '../lib/operation-history-auth.ts';
import { preparePrivateDirectory, savePrivatePair } from './history-private-files.mjs';
if (process.argv.length !== 4 || process.argv[2] !== '--out') throw new Error('Usage: node scripts/provision-history-account.mjs --out <new-private-directory>');
const output=preparePrivateDirectory(process.argv[3]);
savePrivatePair(output,generateHistoryKeypair());
console.log('Private files created. No server registration performed. Follow docs/HISTORY_IDENTITY.md.');
