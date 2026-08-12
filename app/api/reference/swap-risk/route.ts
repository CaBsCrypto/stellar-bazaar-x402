import {NextRequest,NextResponse} from "next/server";
import {calculateSwapRisk,type SwapSide} from "@/lib/swap-risk";
export const dynamic="force-dynamic";
export function GET(request:NextRequest){
  const pair=request.nextUrl.searchParams.get("pair")??""; const amount=Number(request.nextUrl.searchParams.get("amount")); const side=request.nextUrl.searchParams.get("side") as SwapSide;
  try{return NextResponse.json({ok:true,provider:{id:"bazaar-reference-swap-risk",mode:"in-process-reference",extractionPlanned:true},result:calculateSwapRisk(pair,amount,side),payment:{required:false,reason:"Instawards MVP reference flow; x402 testnet is the next milestone"}},{headers:{"Cache-Control":"no-store"}})}
  catch(error){const code=error instanceof Error?error.message:"INVALID_REQUEST";return NextResponse.json({ok:false,error:{code,message:"Parámetros inválidos para el proveedor de referencia.",retryable:false,stage:"call"}},{status:400})}
}
