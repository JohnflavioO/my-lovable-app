import {describe,expect,it} from 'vitest';import {functionErrorMessage,safeEmail,sha256} from './backup';
describe('backup helpers',()=>{
 it('sanitiza pasta de email',()=>expect(safeEmail('../a@b.com','x')).toBe('.._a@b.com'));
 it('calcula sha256',async()=>expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
 it('lê mensagem de erro quando o contexto oferece json',async()=>expect(await functionErrorMessage({message:'fallback',context:{json:async()=>({error:'Chave administrativa inválida'})}})).toBe('Chave administrativa inválida'));
 it('explica quando a função de restauração não está publicada',async()=>expect(await functionErrorMessage({message:'Failed to send a request to the Edge Function',context:{status:404,json:async()=>({code:'NOT_FOUND'})}})).toBe('A restauração ainda não está publicada no banco próprio. Publique a função backup-restore e tente novamente.'));
 it('usa a mensagem original quando o contexto não é uma Response',async()=>expect(await functionErrorMessage({message:'Falha original',context:{}})).toBe('Falha original'));
});
