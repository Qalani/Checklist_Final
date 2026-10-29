jest.mock('@/lib/network-status', () => ({ onStatusChange: jest.fn(), isOnline: () => true }));

const mockFrom = jest.fn();
const mockRpc = jest.fn();
let mockActor: string | null = 'user-1';
jest.mock('@/lib/supabase', () => ({ supabase: {
  from: mockFrom, rpc: mockRpc,
  auth: { getSession: jest.fn(async () => ({ data: { session: mockActor ? { user: { id: mockActor } } : null }, error: null })) },
} }));

const mockStores: Record<string, Map<string | number, any>> = {};
function mockTable(name: string) {
  const rows = () => mockStores[name] ??= new Map();
  return {
    get: jest.fn(async (id: string | number) => rows().get(id)),
    toArray: jest.fn(async () => [...rows().values()]),
    put: jest.fn(async (row: any) => rows().set(row.id ?? row.key, row)),
    bulkDelete: jest.fn(async (ids: string[]) => ids.forEach(id => rows().delete(id))),
    delete: jest.fn(async (id: string) => rows().delete(id)),
    where: jest.fn(() => ({ equals: (table: string) => ({
      toArray: async () => [...rows().values()].filter(row => row.table_name === table),
      modify: async (fn: (row: any) => void) => [...rows().values()].filter(row => row.table_name === table).forEach(fn),
    }) })),
  };
}
jest.mock('@/lib/local-db', () => ({ db: {
  ...Object.fromEntries(['tasks','categories','notes','lists','list_items','list_members','zen_reminders','calendar_events','cache_scopes','sync_queue'].map(name => [name, mockTable(name)])),
  transaction: async (...args: any[]) => args[args.length - 1](),
} }));
const mockRemove = jest.fn(async (id: number) => mockStores.sync_queue.delete(id));
const mockIncrement = jest.fn(async (id: number) => { mockStores.sync_queue.get(id).retries++; });
jest.mock('@/lib/sync-queue', () => ({
  getAll: async () => [...(mockStores.sync_queue?.values() ?? [])], remove: mockRemove, incrementRetry: mockIncrement,
}));

import { pullLatest, pushQueue, sanitizePayload } from '@/lib/sync-engine';

function resultQuery(result: any) {
  const query: any = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(), upsert: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(), delete: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}
function seed(table: string, rows: any[]) { mockStores[table] = new Map(rows.map(row => [row.id ?? row.key, row])); }
function queued(id: number, operation: string, payload: any, extra: any = {}) {
  return { id, user_id: 'user-1', table_name: 'tasks', operation, payload, queued_at: '2026-10-29T12:00:00Z', retries: 0, ...extra };
}
beforeEach(() => {
  jest.clearAllMocks(); mockActor = 'user-1';
  for (const table of ['tasks','categories','notes','lists','list_items','list_members','zen_reminders','calendar_events','cache_scopes','sync_queue']) seed(table, []);
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it('strips view-model fields from task and list writes', () => {
  expect(sanitizePayload('tasks', { id:'t1', title:'Task', access_role:'owner', unknown:'value' })).toEqual({ id:'t1', title:'Task' });
  expect(sanitizePayload('lists', { id:'l1', name:'List', owner_id:'u', items:[], access_role:'editor', public_share_enabled:true })).toEqual({ id:'l1', name:'List' });
});
it('replays partial UPDATE using update instead of an insert/upsert', async () => {
  const query = resultQuery({ data: [{ id:'t1', completed:true }], error:null }); mockFrom.mockReturnValue(query);
  seed('sync_queue', [queued(1,'UPDATE',{id:'t1',completed:true,access_role:'owner',user_id:'owner'})]);
  await pushQueue();
  expect(query.update).toHaveBeenCalledWith({ completed:true });
  expect(query.eq).toHaveBeenCalledWith('id','t1');
  expect(query.upsert).not.toHaveBeenCalled();
  expect(mockRemove).toHaveBeenCalledWith(1);
});
it('makes INSERT retries idempotent and sanitizes their data', async () => {
  const query = resultQuery({data:[],error:null}); mockFrom.mockReturnValue(query);
  seed('sync_queue',[queued(1,'INSERT',{id:'t1',title:'Task',access_role:'owner'})]);
  await pushQueue();
  expect(query.upsert).toHaveBeenCalledWith({id:'t1',title:'Task'},{onConflict:'id',ignoreDuplicates:true});
  expect(mockStores.sync_queue.size).toBe(0);
});
it('retains missing/inaccessible UPDATEs and stops dependent operations', async () => {
  jest.useFakeTimers();
  const query = resultQuery({data:[],error:null}); mockFrom.mockReturnValue(query);
  seed('sync_queue',[queued(1,'UPDATE',{id:'t1',completed:true}),queued(2,'DELETE',{id:'t1'})]);
  await pushQueue();
  expect(mockStores.sync_queue.size).toBe(2);
  expect(query.delete).not.toHaveBeenCalled();
  expect(mockIncrement).toHaveBeenCalledWith(1);
});
it('retries entries beyond the previous retry cap on a later pass', async () => {
  const query = resultQuery({data:[],error:null}); mockFrom.mockReturnValue(query);
  seed('sync_queue',[queued(1,'INSERT',{id:'t1'}, {retries:7})]);
  await pushQueue();
  expect(query.upsert).toHaveBeenCalled(); expect(mockStores.sync_queue.size).toBe(0);
});
it('does not replay another account or ambiguous legacy entries', async () => {
  mockFrom.mockReturnValue(resultQuery({data:[],error:null}));
  seed('sync_queue',[
    queued(1,'DELETE',{id:'foreign'},{user_id:'user-2'}),
    queued(2,'DELETE',{id:'unknown'},{user_id:undefined}),
    queued(3,'INSERT',{id:'own',user_id:'user-1'},{user_id:undefined}),
  ]);
  await pushQueue();
  expect(mockFrom).toHaveBeenCalledTimes(1); expect([...mockStores.sync_queue.keys()]).toEqual([1,2]);
});
it('does not send data when signed out', async () => {
  mockActor=null; seed('sync_queue',[queued(1,'DELETE',{id:'t1'})]);
  await pushQueue(); expect(mockFrom).not.toHaveBeenCalled();
});
it('does not overtake a failed INSERT with UPDATE or DELETE', async () => {
  jest.useFakeTimers();
  const query=resultQuery({data:null,error:{message:'offline'}}); mockFrom.mockReturnValue(query);
  seed('sync_queue',[queued(1,'INSERT',{id:'t1'}),queued(2,'UPDATE',{id:'t1',completed:true}),queued(3,'DELETE',{id:'t1'})]);
  await pushQueue(); expect(query.update).not.toHaveBeenCalled(); expect(query.delete).not.toHaveBeenCalled(); expect(mockStores.sync_queue.size).toBe(3);
});
it('pulls shared tasks through the access-aware RPC and preserves role metadata', async () => {
  const task={id:'shared',user_id:'someone-else',title:'Shared',access_role:'editor'};
  const query=resultQuery({data:[task],error:null}); mockRpc.mockReturnValue(query);
  await pullLatest('tasks','user-1');
  expect(mockRpc).toHaveBeenCalledWith('get_tasks_with_access');
  expect(query.eq).not.toHaveBeenCalled(); expect(mockStores.tasks.get('shared')).toEqual(task);
  expect(mockStores.cache_scopes.get('user-1:tasks').row_ids).toEqual(['shared']);
});
it('reconciles remote deletions without deleting pending edits or another account data', async () => {
  seed('tasks',[{id:'gone',user_id:'user-1'},{id:'pending',user_id:'user-1'},{id:'other',user_id:'user-2'}]);
  seed('sync_queue',[queued(1,'UPDATE',{id:'pending',completed:true})]);
  mockRpc.mockReturnValue(resultQuery({data:[],error:null}));
  await pullLatest('tasks','user-1');
  expect([...mockStores.tasks.keys()]).toEqual(['pending','other']);
});
it('removes revoked shared rows from the prior account scope', async () => {
  seed('tasks',[{id:'revoked',user_id:'other'}]);
  seed('cache_scopes',[{key:'user-1:tasks',user_id:'user-1',table_name:'tasks',row_ids:['revoked']}]);
  mockRpc.mockReturnValue(resultQuery({data:[],error:null}));
  await pullLatest('tasks','user-1'); expect(mockStores.tasks.size).toBe(0);
});
it('refreshes existing list names even without an updated_at column', async () => {
  seed('lists',[{id:'l1',name:'Old',user_id:'user-1'}]);
  const query=resultQuery({data:[{id:'l1',name:'New',user_id:'user-1'}],error:null}); mockFrom.mockReturnValue(query);
  await pullLatest('lists','user-1','2026-10-29T23:00:00Z');
  expect(mockStores.lists.get('l1').name).toBe('New');
});
it('paginates the entire snapshot before applying deletions', async () => {
  const rows=Array.from({length:500},(_,i)=>({id:`t${i}`,user_id:'user-1'}));
  const first=resultQuery({data:rows,error:null}),second=resultQuery({data:[{id:'tail',user_id:'user-1'}],error:null});
  mockRpc.mockReturnValueOnce(first).mockReturnValueOnce(second);
  await pullLatest('tasks','user-1');
  expect(first.range).toHaveBeenCalledWith(0,499); expect(second.range).toHaveBeenCalledWith(500,999);
  expect(mockStores.tasks.size).toBe(501);
});
it('keeps the old cache if any snapshot page fails', async () => {
  seed('tasks',[{id:'keep',user_id:'user-1'}]);
  mockRpc.mockReturnValue(resultQuery({data:null,error:{message:'no connection'}}));
  await expect(pullLatest('tasks','user-1')).rejects.toThrow('no connection');
  expect(mockStores.tasks.has('keep')).toBe(true);
});
it('retains legacy UPDATEs even when their row owner matches the current actor', async () => {
  seed('sync_queue',[queued(1,'UPDATE',{id:'shared',user_id:'user-1',title:'Unknown actor'},{user_id:undefined})]);
  await pushQueue(); expect(mockFrom).not.toHaveBeenCalled(); expect(mockStores.sync_queue.size).toBe(1);
});
it('aborts an account-switched snapshot before writing its rows or scope', async () => {
  const query=resultQuery({data:[{id:'private',user_id:'user-2'}],error:null});
  query.then=(resolve:any,reject:any) => { mockActor='user-2'; return Promise.resolve({data:[{id:'private',user_id:'user-2'}],error:null}).then(resolve,reject); };
  mockRpc.mockReturnValue(query);
  await expect(pullLatest('tasks','user-1')).rejects.toThrow('Account changed');
  expect(mockStores.tasks.size).toBe(0); expect(mockStores.cache_scopes.size).toBe(0);
});
it('reconciles an offline calendar import with an existing server identity and remaps later queued edits', async () => {
  seed('calendar_events',[{id:'offline-id',title:'Imported',user_id:'user-1'}]);
  seed('sync_queue',[
    queued(1,'INSERT',{id:'offline-id',user_id:'user-1',title:'Imported',import_source:'calendar.ics',import_uid:'uid'},{table_name:'calendar_events'}),
    queued(2,'UPDATE',{id:'offline-id',title:'Later edit'},{table_name:'calendar_events'}),
  ]);
  const lookup=resultQuery({data:{id:'server-id'},error:null}),insert=resultQuery({data:[{id:'server-id'}],error:null}),update=resultQuery({data:[{id:'server-id'}],error:null});
  mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(insert).mockReturnValueOnce(update);
  await pushQueue();
  expect(insert.upsert).toHaveBeenCalledWith(expect.objectContaining({id:'server-id'}),{onConflict:'id',ignoreDuplicates:false});
  expect(update.eq).toHaveBeenCalledWith('id','server-id');
  expect(mockStores.calendar_events.has('offline-id')).toBe(false); expect(mockStores.sync_queue.size).toBe(0);
});
it('still applies imported content when retrying an already-remapped calendar INSERT', async () => {
  seed('sync_queue',[queued(1,'INSERT',{id:'server-id',user_id:'user-1',title:'Reimported',import_source:'calendar.ics',import_uid:'uid'}, {table_name:'calendar_events',retries:1})]);
  const lookup=resultQuery({data:{id:'server-id'},error:null}),insert=resultQuery({data:[{id:'server-id'}],error:null});
  mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(insert);
  await pushQueue();
  expect(insert.upsert).toHaveBeenCalledWith(expect.objectContaining({id:'server-id',title:'Reimported'}),{onConflict:'id',ignoreDuplicates:false});
});
