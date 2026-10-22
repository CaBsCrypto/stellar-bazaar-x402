// Generated locally by scripts/prepare-example-budget-command-catalog.mjs.
// Exact native Lua hashes: no prefix match, unreviewed script or loop discount.
import {createHash} from 'node:crypto';
import {WorkspaceError} from './workspace-types.ts';
export const EXAMPLE_BUDGET_SCRIPT_CATALOG=Object.freeze([
 {
  "category": "continuous-budget",
  "scriptSha256": "0139651752ea2584d7d213508d29a83ac1ecc2ff67c91e03d77915a8c834eeb9",
  "keyCount": 1,
  "argCount": 2,
  "maximumRedisCommands": 4
 },
 {
  "category": "maintenance-read",
  "scriptSha256": "fc0773672bf7f88038959d76bc8a7daf5b4e4b295c72d965aa239a732753ed95",
  "keyCount": 1,
  "argCount": 0,
  "maximumRedisCommands": 3
 },
 {
  "category": "market-cas-legacy",
  "scriptSha256": "526b7308765939e9b2820b5238e1a640e3715452b6b4b491aaf6dcdd50d4daec",
  "keyCount": 5,
  "argCount": 14,
  "maximumRedisCommands": 10
 },
 {
  "category": "market-joint-g0-operation",
  "scriptSha256": "d92740286e7746a6a121b9977416a0587caf0c6739fbc3bc74d6499814d37582",
  "keyCount": 6,
  "argCount": 21,
  "maximumRedisCommands": 17
 },
 {
  "category": "market-joint-g0-plain",
  "scriptSha256": "e3d0194b01add2a07ca01d70a60634140e91d63f66a216fa75b067e2527b30d6",
  "keyCount": 5,
  "argCount": 19,
  "maximumRedisCommands": 14
 },
 {
  "category": "market-joint-g1-operation",
  "scriptSha256": "5d072837cafd210edddd7a69f2410e98dd26d577470e49ed6978a1690a000a86",
  "keyCount": 7,
  "argCount": 21,
  "maximumRedisCommands": 17
 },
 {
  "category": "market-joint-g1-plain",
  "scriptSha256": "b7ff22bdbbeddefc1c8a236c88eef73a49d7168755a619ffec8a0cb8e4c04566",
  "keyCount": 6,
  "argCount": 19,
  "maximumRedisCommands": 14
 },
 {
  "category": "market-joint-g2-operation",
  "scriptSha256": "b2ae209c52e7b1a61cc0a4a1079c164094440084aada6c8c57b90b418d4d6fdb",
  "keyCount": 8,
  "argCount": 21,
  "maximumRedisCommands": 17
 },
 {
  "category": "market-joint-g2-plain",
  "scriptSha256": "5a02e76cff2bf8fa9e15f3fa921e59c8cb778a41b6badff3499645452510abf1",
  "keyCount": 7,
  "argCount": 19,
  "maximumRedisCommands": 14
 },
 {
  "category": "permission-cas-legacy",
  "scriptSha256": "02da6ad8c3d87c49fd53ba91070adf0e69e045eef8ddf88943bd9bab3de45123",
  "keyCount": 4,
  "argCount": 5,
  "maximumRedisCommands": 6
 },
 {
  "category": "permission-cas-storage",
  "scriptSha256": "c5d991fe2c9f9e93104b1aec9d3cd53d9d44ed0658f462d3caf4f66898a41ab2",
  "keyCount": 5,
  "argCount": 7,
  "maximumRedisCommands": 8
 },
 {
  "category": "permission-read",
  "scriptSha256": "27d842655e5bde5cd0f0e7949fac058d9ca9d2286490595483ac4a6f4211285b",
  "keyCount": 4,
  "argCount": 0,
  "maximumRedisCommands": 5
 },
 {
  "category": "review-cas-storage",
  "scriptSha256": "82f7e3a9a70944ddde5a71e50b98610de2f659e9572caf31de3a54818e3e800f",
  "keyCount": 2,
  "argCount": 5,
  "maximumRedisCommands": 5
 },
 {
  "category": "settlement-cas-legacy",
  "scriptSha256": "b81a0c6febc320778d78886986a9455270f143521f04ecce27c29021161b8e68",
  "keyCount": 1,
  "argCount": 3,
  "maximumRedisCommands": 3
 },
 {
  "category": "workspace-cas-continuous",
  "scriptSha256": "83ffd14a1cb8c78476b5db00d1ebd086324b586d13434c0bf4009dd4a476701f",
  "keyCount": 4,
  "argCount": 6,
  "maximumRedisCommands": 8
 },
 {
  "category": "workspace-cas-legacy",
  "scriptSha256": "f5633598b4e85ac2323574afc775a7cb5d1c2d27820f6ed2aa0deb3b81cdbb69",
  "keyCount": 3,
  "argCount": 5,
  "maximumRedisCommands": 7
 },
 {
  "category": "workspace-cas-storage",
  "scriptSha256": "4585551c57b82f4456b91a4332371de2db8d5762296b60b989210674ddac46d9",
  "keyCount": 5,
  "argCount": 8,
  "maximumRedisCommands": 10
 },
 {
  "category": "workspace-read",
  "scriptSha256": "3eb521c4ea5723b3097237cf612c13fc94982a744de383fc2e9385812db6f26a",
  "keyCount": 3,
  "argCount": 0,
  "maximumRedisCommands": 4
 },
 {
  "category": "workspace-storage-read",
  "scriptSha256": "7d3391bd264b2964214dbf12878e50c156addb03892dc72d9c09efa5e78cbf5e",
  "keyCount": 1,
  "argCount": 0,
  "maximumRedisCommands": 2
 }
].map(row=>Object.freeze(row)));
const unavailable=()=>new WorkspaceError('EXAMPLE_TEXT_REDIS_SCRIPT_UNREVIEWED',503,60);
/** Includes EVAL itself and every possible redis.call in the exact reviewed
 * native script. JSON iteration in these scripts performs no Redis calls.
 * Initialization and maintenance loops are intentionally outside this list. */
export function exampleBudgetCommandDescriptor(body:unknown):{category:string;maximumRedisCommands:number;keys:string[]}{
 if(!Array.isArray(body)||typeof body[0]!=='string')throw unavailable();
 const command=body[0].toLowerCase(),key=(value:unknown)=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=512;
 if(command==='get'){if(body.length!==2||!key(body[1]))throw unavailable();return {category:'get',maximumRedisCommands:1,keys:[body[1] as string]};}
 if(command!=='eval'||typeof body[1]!=='string'||Buffer.byteLength(body[1])>65536||!['number','string'].includes(typeof body[2]))throw unavailable();
 const keyCount=Number(body[2]);if(!Number.isSafeInteger(keyCount)||keyCount<1||keyCount>8||body.slice(3,3+keyCount).some(value=>!key(value)))throw unavailable();
 const scriptSha256=createHash('sha256').update(body[1]).digest('hex'),argCount=body.length-3-keyCount;
 const match=EXAMPLE_BUDGET_SCRIPT_CATALOG.find(row=>row.scriptSha256===scriptSha256&&row.keyCount===keyCount&&row.argCount===argCount);
 if(!match||body.slice(3+keyCount).some(value=>typeof value!=='string'))throw unavailable();
 return {category:match.category,maximumRedisCommands:match.maximumRedisCommands,keys:body.slice(3,3+keyCount) as string[]};
}
export function exampleBudgetCommandWeight(body:unknown):number{return exampleBudgetCommandDescriptor(body).maximumRedisCommands;}
