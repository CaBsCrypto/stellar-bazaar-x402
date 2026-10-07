import {pathToFileURL} from 'node:url';
const projectId='prj_90kScJhUr9FlOY4LAmvb5Xg1mnS3',teamId='team_XjolcoWJ9V9yamVnCdpC7EMY';
export function prepareOpenOperationsProjectTimeout(){
 return {version:1,sourceOnly:true,remoteRequestPerformed:false,projectName:'stellar-bazaar-x402',projectId,teamId,scope:'cabscryptocontacto-6028s-projects',method:'PATCH',endpoint:'/v9/projects/'+projectId+'?teamId='+teamId,body:{resourceConfig:{functionDefaultTimeout:15}},verify:{method:'GET',endpoint:'/v9/projects/'+projectId+'?teamId='+teamId,expectedResourceConfig:{functionDefaultTimeout:15},expectedNodeVersion:'24.x',expectedFramework:'nextjs'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);if(args.some(arg=>arg!=='--body'))throw Error('Only --body is supported; this helper never applies remote configuration');
 const plan=prepareOpenOperationsProjectTimeout();console.log(JSON.stringify(args.includes('--body')?plan.body:plan,null,2));
}
