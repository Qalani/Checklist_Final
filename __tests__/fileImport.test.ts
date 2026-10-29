import { importListFile, importTaskFile, parseTaskCsv } from '@/features/imports/file-import';

function file(name: string, content: unknown): File {
  return { name, size: 10, text: async () => typeof content === 'string' ? content : JSON.stringify(content) } as File;
}

describe('portable file imports', () => {
  it('parses quoted CSV commas, escaped quotes, and multiline fields', () => {
    expect(parseTaskCsv('title,description\r\n"Plan, next","First line\n""quoted"" line"')).toEqual([
      { title: 'Plan, next', description: 'First line\n"quoted" line' },
    ]);
    expect(() => parseTaskCsv('title\n"unfinished')).toThrow('unterminated');
  });

  it('imports through the normal task save path without a server endpoint or supplied ownership', async () => {
    const save = jest.fn().mockResolvedValue({});
    const result = await importTaskFile(file('tasks.json', [
      { title: ' Local task ', user_id: 'attacker', id: 'old', category: 'Work', completed: 'true' },
      null, { title: 'Another', due_date: 'bad-date' },
    ]), [{ id: 'category', name: 'Work', color: '#123456', user_id: 'me' }], save);
    expect(result).toMatchObject({ imported: 2, skipped: 1, truncated: 0 });
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('invalid due_date')]));
    expect(save.mock.calls[0][0]).toMatchObject({ title: 'Local task', category_color: '#123456', completed: true });
    expect(save.mock.calls[0][0]).not.toHaveProperty('user_id');
    expect(save.mock.calls[0][0]).not.toHaveProperty('id');
  });

  it('caps tasks at 200 and reports failed saves without counting them as imported', async () => {
    const save = jest.fn().mockResolvedValueOnce({ error: 'You must be signed in.' }).mockResolvedValue({});
    const result = await importTaskFile(file('tasks.json', Array.from({ length: 202 }, (_, i) => ({ title: `Task ${i}` }))), [], save);
    expect(save).toHaveBeenCalledTimes(200);
    expect(result).toMatchObject({ imported: 199, skipped: 1, truncated: 2 });
    expect(result.errors[0]).toContain('signed in');
  });

  it('imports lists and items through the regular creation path with the existing size limits', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const result = await importListFile(file('lists.json', [
      { name: ' List ', user_id: 'someone-else', items: [null, { content: ' Item ', completed: 'true' }, { content: 'x'.repeat(1001) }] },
      { name: '' },
    ]), save);
    expect(result).toMatchObject({ imported: 1, skipped: 1 });
    expect(save.mock.calls[0][0]).toEqual({ name: 'List', description: '', items: [
      { content: 'Item', completed: true, position: 1 }, { content: 'x'.repeat(1000), completed: false, position: 2 },
    ] });
  });

  it('rejects unsupported, oversized and invalid top-level files before saving', async () => {
    const save = jest.fn();
    await expect(importTaskFile(file('bad.exe', '[]'), [], save)).rejects.toThrow('Supported');
    await expect(importListFile(file('lists.json', '{}'), save)).rejects.toThrow('array');
    const large = { ...file('tasks.json', '[]'), size: 6 * 1024 * 1024 } as File;
    await expect(importTaskFile(large, [], save)).rejects.toThrow('5 MB');
    expect(save).not.toHaveBeenCalled();
  });
});
