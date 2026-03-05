import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limiter';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_TASKS = 200;
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 10_000;

const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

const DEFAULT_COLORS = [
  '#8B9E77', // sage
  '#7C9AB5', // blue
  '#B58B7C', // warm
  '#9B8BB5', // purple
  '#7CB5A0', // teal
  '#B5A07C', // amber
];

function pickDefaultColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
}

interface RawTask {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  category?: unknown;
  due_date?: unknown;
  completed?: unknown;
}

function parseJSON(text: string): RawTask[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('JSON must be an array of task objects.');
  }
  return parsed as RawTask[];
}

function parseCSV(text: string): RawTask[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('CSV file is empty.');
  }

  // Parse a single CSV field that may be quoted
  function parseField(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('"')) {
      return trimmed.slice(1, trimmed.endsWith('"') ? -1 : undefined).replace(/""/g, '"');
    }
    return trimmed;
  }

  function splitCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields.map((f) => f.trim());
  }

  const headerFields = splitCSVLine(lines[0]).map((h) => parseField(h).toLowerCase());
  const titleIndex = headerFields.indexOf('title');

  if (titleIndex === -1) {
    throw new Error('CSV must include a "title" column header.');
  }

  const descIndex = headerFields.indexOf('description');
  const priorityIndex = headerFields.indexOf('priority');
  const categoryIndex = headerFields.indexOf('category');
  const dueDateIndex = headerFields.indexOf('due_date');
  const completedIndex = headerFields.indexOf('completed');

  return lines.slice(1).map((line) => {
    const fields = splitCSVLine(line);
    return {
      title: titleIndex !== -1 ? parseField(fields[titleIndex] ?? '') : undefined,
      description: descIndex !== -1 ? parseField(fields[descIndex] ?? '') : undefined,
      priority: priorityIndex !== -1 ? parseField(fields[priorityIndex] ?? '') : undefined,
      category: categoryIndex !== -1 ? parseField(fields[categoryIndex] ?? '') : undefined,
      due_date: dueDateIndex !== -1 ? parseField(fields[dueDateIndex] ?? '') : undefined,
      completed: completedIndex !== -1 ? parseField(fields[completedIndex] ?? '') : undefined,
    };
  });
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 500 });
  }

  let userId: string;
  try {
    const { user } = await authenticateRequest(request);
    userId = user.id;
  } catch (error) {
    const status = error instanceof Error && 'status' in error ? (error as { status?: number }).status ?? 401 : 401;
    const message = error instanceof Error ? error.message : 'Unauthorized.';
    return NextResponse.json({ error: message }, { status });
  }

  const rateLimit = checkRateLimit(userId, 'api/tasks/import/POST', { maxRequests: 5 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many import requests. Please wait before importing again.' },
      { status: 429, headers: rateLimitHeaders(5, rateLimit) },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data payload.' }, { status: 400 });
  }

  const fileEntry = formData.get('file');
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'Upload a .json or .csv file to import.' }, { status: 400 });
  }

  const fileName = fileEntry.name.toLowerCase();
  const isCSV = fileName.endsWith('.csv');
  const isJSON = fileName.endsWith('.json');

  if (!isCSV && !isJSON) {
    return NextResponse.json({ error: 'Only .json and .csv files are supported.' }, { status: 400 });
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const text = buffer.toString('utf8').trim();

  if (!text) {
    return NextResponse.json({ error: 'The uploaded file was empty.' }, { status: 400 });
  }

  let rawTasks: RawTask[];
  try {
    rawTasks = isCSV ? parseCSV(text) : parseJSON(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to parse the file.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (rawTasks.length === 0) {
    return NextResponse.json({ error: 'No tasks found in the file.' }, { status: 400 });
  }

  // Fetch user's existing categories to resolve colors
  const { data: existingCategories } = await supabaseAdmin
    .from('categories')
    .select('name, color')
    .eq('user_id', userId);

  const categoryColorMap = new Map<string, string>();
  for (const cat of existingCategories ?? []) {
    if (typeof cat.name === 'string' && typeof cat.color === 'string') {
      categoryColorMap.set(cat.name.toLowerCase(), cat.color);
    }
  }

  // Fetch current max order for the user's tasks
  const { data: orderData } = await supabaseAdmin
    .from('tasks')
    .select('order')
    .eq('user_id', userId)
    .order('order', { ascending: false })
    .limit(1);

  let nextOrder = (orderData?.[0]?.order ?? -1) + 1;

  const errors: string[] = [];
  const records: Record<string, unknown>[] = [];
  const truncated = rawTasks.length > MAX_TASKS;
  const tasksToProcess = truncated ? rawTasks.slice(0, MAX_TASKS) : rawTasks;

  for (let i = 0; i < tasksToProcess.length; i++) {
    const raw = tasksToProcess[i];
    const rowLabel = `Row ${i + 1}`;

    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) {
      errors.push(`${rowLabel}: title is required and must not be empty.`);
      continue;
    }
    if (title.length > MAX_TITLE_LENGTH) {
      errors.push(`${rowLabel}: title exceeds ${MAX_TITLE_LENGTH} characters.`);
      continue;
    }

    const description =
      typeof raw.description === 'string' && raw.description.trim().length > 0
        ? raw.description.trim()
        : null;

    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`${rowLabel}: description exceeds ${MAX_DESCRIPTION_LENGTH} characters.`);
      continue;
    }

    const rawPriority = typeof raw.priority === 'string' ? raw.priority.trim().toLowerCase() : '';
    const priority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : 'medium';

    const categoryName =
      typeof raw.category === 'string' && raw.category.trim().length > 0
        ? raw.category.trim()
        : 'General';

    const categoryColor =
      categoryColorMap.get(categoryName.toLowerCase()) ?? pickDefaultColor(categoryName);

    let dueDate: string | null = null;
    if (typeof raw.due_date === 'string' && raw.due_date.trim().length > 0) {
      const parsed = new Date(raw.due_date.trim());
      if (Number.isNaN(parsed.getTime())) {
        errors.push(`${rowLabel}: due_date "${raw.due_date}" is not a valid date — skipping due date.`);
      } else {
        dueDate = parsed.toISOString();
      }
    }

    const rawCompleted = raw.completed;
    const completed =
      typeof rawCompleted === 'boolean'
        ? rawCompleted
        : typeof rawCompleted === 'string'
          ? rawCompleted.toLowerCase() === 'true' || rawCompleted === '1'
          : false;

    records.push({
      user_id: userId,
      title,
      description,
      priority,
      category: categoryName,
      category_color: categoryColor,
      completed,
      due_date: dueDate,
      order: nextOrder,
    });

    nextOrder++;
  }

  if (records.length === 0) {
    return NextResponse.json(
      { error: 'No valid tasks found to import.', errors },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabaseAdmin.from('tasks').insert(records);

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message || 'Unable to import tasks. Please try again.' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    imported: records.length,
    skipped: tasksToProcess.length - records.length,
    truncated: rawTasks.length - tasksToProcess.length,
    errors,
  });
}
