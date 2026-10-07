/** Hidden TTY input, or an explicitly selected inherited private stdin pipe.
 * The caller must clear the returned Buffer after use. No argv/env/file input.
 */
export async function readPrivateInput({prompt='Secret: ',input=process.stdin,output=process.stderr,maxBytes=65536,allowPipe=false}={}){
 if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>65536)throw Error('INVALID_SECRET_INPUT_LIMIT');
 if(!input.isTTY){if(!allowPipe)throw Error('PRIVATE_TTY_OR_EXPLICIT_PIPE_REQUIRED');const parts=[];let size=0;try{for await(const part of input){size+=part.length;if(size>maxBytes)throw Error('SECRET_INPUT_TOO_LARGE');parts.push(Buffer.from(part));}return Buffer.concat(parts);}finally{for(const part of parts)part.fill(0);}}
 if(typeof input.setRawMode!=='function')throw Error('PRIVATE_TTY_REQUIRED');
 output.write(prompt);const wasRaw=input.isRaw;
 return await new Promise((fulfill,reject)=>{const parts=[];let length=0,done=false;
  const finish=(error)=>{if(done)return;done=true;input.removeListener('data',onData);input.removeListener('error',onError);input.removeListener('end',onError);input.setRawMode(Boolean(wasRaw));input.pause();output.write('\n');const result=Buffer.concat(parts);for(const part of parts)part.fill(0);error?(result.fill(0),reject(error)):fulfill(result);};
  const onError=()=>finish(Error('PRIVATE_INPUT_UNCONFIRMED'));
  const onData=bytes=>{for(const byte of bytes){if(byte===3){finish(Error('PRIVATE_INPUT_CANCELLED'));return;}if(byte===13||byte===10){finish();return;}if(byte===127||byte===8){const last=parts.pop();if(last){length--;last.fill(0);}continue;}if(byte<32)continue;if(++length>maxBytes){finish(Error('SECRET_INPUT_TOO_LARGE'));return;}parts.push(Buffer.from([byte]));}};
  input.setRawMode(true);input.on('data',onData);input.once('error',onError);input.once('end',onError);input.resume();
 });
}
