/** Connect only your existing trusted service. This template stays unavailable
 * until real health, persistence and execution are implemented by its owner. */
export async function availability(){return {ready:false};}
export async function execute({operationId,attemptId,input}){
 throw Error('CONNECT_YOUR_EXISTING_TRUSTED_SERVICE');
}
