const encoder = new TextEncoder();
export async function blindTerms(searchKey:CryptoKey, plaintext:string):Promise<string[]> {
  const words=[...new Set(plaintext.normalize('NFKC').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>=2))].sort().slice(0,256);
  const terms=await Promise.all(words.map(async word=>{
    const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',searchKey,encoder.encode(word)));
    return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  }));
  return terms;
}
