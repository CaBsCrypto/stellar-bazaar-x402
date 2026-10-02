import {generateAlgorithmicScript} from './engine/script-generator.js';

// New text product: the existing deterministic engine, without a model API or
// the legacy x402 route. A marketplace seller invokes it only after claiming
// an order whose payment Bazaar has verified.
export function generateMarketplaceText(input: unknown): string {
 if(!input || typeof input!=='object' || Array.isArray(input)) throw Error('INVALID_INPUT');
 const value=input as Record<string,unknown>;
 if(Object.keys(value).sort().join(',')!=='durationSeconds,tone,topic' ||
   typeof value.topic!=='string' || !value.topic.trim() || value.topic.length>200 ||
   typeof value.tone!=='string' || !value.tone.trim() || value.tone.length>40 ||
   !Number.isInteger(value.durationSeconds) || Number(value.durationSeconds)<15 ||
   Number(value.durationSeconds)>30) throw Error('INVALID_INPUT');
 const result=generateAlgorithmicScript({topic:value.topic.trim(),tone:value.tone.trim(),durationSeconds:Number(value.durationSeconds)});
 const text=['Guion algorítmico · '+result.topic, ...result.scenes.map(scene=>
   `${scene.timeRange} · ${scene.name}\n${scene.spokenScript}`)].join('\n\n');
 if(!text.length || text.length>2000) throw Error('TEXT_LIMIT_2000');
 return text;
}
