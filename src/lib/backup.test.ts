import {describe,expect,it} from 'vitest';import {safeEmail,sha256} from './backup';
describe('backup helpers',()=>{it('sanitiza pasta de email',()=>expect(safeEmail('../a@b.com','x')).toBe('.._a@b.com'));it('calcula sha256',async()=>expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'))});
