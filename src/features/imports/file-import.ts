import type { Category, Task } from '@/types';
import type { CreateListItemInput } from '@/features/lists/listTypes';

export interface ImportResult {
  imported: number;
  skipped: number;
  truncated: number;
  errors: string[];
}

export type ImportedList = { name: string; description?: string; items: CreateListItemInput[] };
type SaveResult = void | { error?: string };
const COLORS = ['#8B9E77', '#7C9AB5', '#B58B7C', '#9B8BB5', '#7CB5A0', '#B5A07C'];

function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function jsonRows(text: string): unknown[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('JSON must be an array of objects.');
  return parsed;
}

/** Parse RFC 4180 fields, including quoted commas, quotes and line breaks. */
export function parseTaskCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(value => value.trim())) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  row.push(field); if (row.some(value => value.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map(value => value.trim().toLowerCase());
  if (!headers.includes('title')) throw new Error('CSV must include a "title" column header.');
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])));
}

async function readFile(file: File, extensions: string[]): Promise<string> {
  if (!extensions.some(extension => file.name.toLowerCase().endsWith(extension))) {
    throw new Error(`Supported file types: ${extensions.join(', ')}.`);
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a file smaller than 5 MB.');
  const text = (await file.text()).replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('The uploaded file was empty.');
  return text;
}

async function saveRows<T>(rows: unknown[], limit: number, normalize: (raw: Record<string, unknown>, row: number, errors: string[]) => T, save: (input: T) => Promise<SaveResult>): Promise<ImportResult> {
  if (!rows.length) throw new Error('No records found in the file.');
  const result: ImportResult = { imported: 0, skipped: 0, truncated: Math.max(0, rows.length - limit), errors: [] };
  for (const [index, value] of rows.slice(0, limit).entries()) {
    try {
      const input = normalize(record(value), index + 1, result.errors);
      const saved = await save(input);
      if (saved?.error) throw new Error(saved.error);
      result.imported++;
    } catch (error) {
      result.skipped++;
      result.errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : 'Unable to save record.'}`);
    }
  }
  return result;
}

/** Reuse the regular creation path, including its auth checks and offline queue. */
export async function importTaskFile(file: File, categories: Category[], save: (input: Partial<Task>) => Promise<SaveResult>): Promise<ImportResult> {
  const text = await readFile(file, ['.json', '.csv']);
  const rows = file.name.toLowerCase().endsWith('.csv') ? parseTaskCsv(text) : jsonRows(text);
  return saveRows(rows, 200, (raw, index, errors) => {
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title || title.length > 500) throw new Error('title must contain 1–500 characters.');
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    if (description.length > 10_000) throw new Error('description exceeds 10000 characters.');
    const category = typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'General';
    const rawPriority = typeof raw.priority === 'string' ? raw.priority.trim().toLowerCase() : '';
    const priority: Task['priority'] = rawPriority === 'low' || rawPriority === 'high' ? rawPriority : 'medium';
    let dueDate: string | null = null;
    if (typeof raw.due_date === 'string' && raw.due_date.trim()) {
      const date = new Date(raw.due_date);
      if (Number.isNaN(date.getTime())) errors.push(`Row ${index}: invalid due_date was omitted.`);
      else dueDate = date.toISOString();
    }
    return {
      title, description, category, priority, due_date: dueDate,
      category_color: categories.find(item => item.name.toLowerCase() === category.toLowerCase())?.color ?? colorFor(category),
      completed: raw.completed === true || raw.completed === '1' || (typeof raw.completed === 'string' && raw.completed.toLowerCase() === 'true'),
    };
  }, save);
}

export async function importListFile(file: File, save: (input: ImportedList) => Promise<SaveResult>): Promise<ImportResult> {
  const rows = jsonRows(await readFile(file, ['.json']));
  return saveRows(rows, 50, raw => {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > 255) throw new Error('name must contain 1–255 characters.');
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    if (description.length > 10_000) throw new Error('description exceeds 10000 characters.');
    const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 500).map((value, position) => {
      const item = record(value);
      return {
        content: typeof item.content === 'string' ? item.content.trim().slice(0, 1000) : '', position,
        completed: item.completed === true || (typeof item.completed === 'string' && item.completed.toLowerCase() === 'true'),
      };
    }).filter(item => item.content);
    return { name, description, items };
  }, save);
}
