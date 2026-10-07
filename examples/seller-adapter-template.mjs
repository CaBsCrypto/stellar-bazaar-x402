/** Replace this body with your existing trusted service; return 1..2000 characters. */
export async function execute({operationId,attemptId,input}){
 if(typeof input.prompt!=='string'||!input.prompt.trim())throw Error('PROMPT_REQUIRED');
 // Supply operationId + attemptId to your own service's idempotency mechanism.
 // Never catch a lost response and invoke the service again.
 const text=input.prompt.trim();
 return {text};
}
