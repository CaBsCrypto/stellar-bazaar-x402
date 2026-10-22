import type {SignedRouterPacket,ChannelsAcknowledgement,ChannelsTransport} from './adapter.mjs';
export function createChannelsTransport(options?:{
 enabled?:boolean;timeoutMs?:number;apiKey?:string;fetcher?:typeof fetch;
 beforeDispatch?:(packet:SignedRouterPacket)=>Promise<boolean>;
 admit?:(request:{endpoint:string;method:'POST';outboundBytes:number;maximumInboundBytes:number;maximumAttempts:1})=>Promise<boolean>;
}):ChannelsTransport;
