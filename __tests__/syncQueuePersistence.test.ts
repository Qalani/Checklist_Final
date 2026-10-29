/** @jest-environment node */
import 'fake-indexeddb/auto';
import { db } from '@/lib/local-db';
import { enqueue, getAll, retryEntry } from '@/lib/sync-queue';
import { setSyncUser } from '@/lib/sync-session';
jest.mock('@/lib/supabase', () => ({supabase:{auth:{getSession:async () => ({data:{session:null}})}}}));
beforeEach(async () => { await db.delete(); await db.open(); setSyncUser('alice'); });
afterAll(async () => { await db.delete(); setSyncUser(null); });
it('persists the actor and dependency order across an app restart', async () => {
  await enqueue({table_name:'tasks',operation:'INSERT',payload:{id:'t1'}});
  await enqueue({table_name:'tasks',operation:'UPDATE',payload:{id:'t1',completed:true}});
  await enqueue({table_name:'tasks',operation:'DELETE',payload:{id:'t1'}});
  db.close(); await db.open();
  expect((await getAll()).map(entry => [entry.user_id,entry.operation])).toEqual([['alice','INSERT'],['alice','UPDATE'],['alice','DELETE']]);
});
it('manual retry does not move a failed INSERT behind its dependent UPDATE and DELETE', async () => {
  await enqueue({table_name:'tasks',operation:'INSERT',payload:{id:'t1'}});
  await enqueue({table_name:'tasks',operation:'UPDATE',payload:{id:'t1',completed:true}});
  const [first] = await getAll(); await db.sync_queue.update(first.id!,{retries:3});
  await retryEntry({...first,retries:3});
  const entries=await getAll(); expect(entries.map(entry => entry.operation)).toEqual(['INSERT','UPDATE']);
  expect(entries[0].retries).toBe(0); expect(entries[0].id).toBe(first.id);
});
it('requests replay only after the local mutation transaction commits', async () => {
  const target = new EventTarget();
  Object.defineProperty(globalThis,'window',{value:target,configurable:true});
  let requests=0; target.addEventListener('zen-sync-request',()=>{requests++;});
  try {
    await db.transaction('rw',db.sync_queue,async()=>{
      await enqueue({table_name:'tasks',operation:'INSERT',payload:{id:'t1'}});
      expect(requests).toBe(0);
    });
    await new Promise(resolve=>setTimeout(resolve,10));
    expect(requests).toBe(1); expect(await db.sync_queue.count()).toBe(1);
  } finally { delete (globalThis as any).window; }
});
it('does not request replay for an aborted local mutation', async () => {
  const target=new EventTarget(); Object.defineProperty(globalThis,'window',{value:target,configurable:true});
  let requests=0; target.addEventListener('zen-sync-request',()=>{requests++;});
  try {
    await expect(db.transaction('rw',db.sync_queue,async()=>{
      await enqueue({table_name:'tasks',operation:'INSERT',payload:{id:'t1'}});
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    await new Promise(resolve=>setTimeout(resolve,10));
    expect(requests).toBe(0); expect(await db.sync_queue.count()).toBe(0);
  } finally { delete (globalThis as any).window; }
});
