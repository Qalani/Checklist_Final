import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limiter';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_LISTS = 50;
const MAX_ITEMS_PER_LIST = 500;
const MAX_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_ITEM_CONTENT_LENGTH = 1_000;

interface RawListItem {
  content?: unknown;
  completed?: unknown;
}

interface RawList {
  name?: unknown;
  description?: unknown;
  items?: unknown;
}

function parseJSON(text: string): RawList[] {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('JSON must be an array of list objects.');
  }
  return parsed as RawList[];
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

  const rateLimit = checkRateLimit(userId, 'api/lists/import/POST', { maxRequests: 5 });
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
    return NextResponse.json({ error: 'Upload a .json file to import.' }, { status: 400 });
  }

  const fileName = fileEntry.name.toLowerCase();
  if (!fileName.endsWith('.json')) {
    return NextResponse.json({ error: 'Only .json files are supported for list import.' }, { status: 400 });
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const text = buffer.toString('utf8').trim();

  if (!text) {
    return NextResponse.json({ error: 'The uploaded file was empty.' }, { status: 400 });
  }

  let rawLists: RawList[];
  try {
    rawLists = parseJSON(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to parse the JSON file.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (rawLists.length === 0) {
    return NextResponse.json({ error: 'No lists found in the file.' }, { status: 400 });
  }

  const errors: string[] = [];
  const truncated = rawLists.length > MAX_LISTS;
  const listsToProcess = truncated ? rawLists.slice(0, MAX_LISTS) : rawLists;
  let importedCount = 0;

  for (let i = 0; i < listsToProcess.length; i++) {
    const raw = listsToProcess[i];
    const rowLabel = `List ${i + 1}`;

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) {
      errors.push(`${rowLabel}: name is required and must not be empty.`);
      continue;
    }
    if (name.length > MAX_NAME_LENGTH) {
      errors.push(`${rowLabel}: name exceeds ${MAX_NAME_LENGTH} characters.`);
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

    // Create the list
    const { data: listData, error: listError } = await supabaseAdmin
      .from('lists')
      .insert({ name, description, user_id: userId })
      .select('id')
      .single();

    if (listError || !listData) {
      errors.push(`${rowLabel} ("${name}"): failed to create list — ${listError?.message ?? 'unknown error'}.`);
      continue;
    }

    const listId = listData.id as string;

    // Process items if present
    const rawItems = Array.isArray(raw.items) ? (raw.items as RawListItem[]) : [];
    const itemsToInsert = rawItems
      .slice(0, MAX_ITEMS_PER_LIST)
      .map((item, index) => {
        const content =
          typeof item.content === 'string' ? item.content.trim().slice(0, MAX_ITEM_CONTENT_LENGTH) : '';
        const completed =
          typeof item.completed === 'boolean'
            ? item.completed
            : typeof item.completed === 'string'
              ? item.completed.toLowerCase() === 'true'
              : false;
        return { list_id: listId, content, completed, position: index };
      })
      .filter((item) => item.content.length > 0);

    if (itemsToInsert.length > 0) {
      const { error: itemsError } = await supabaseAdmin.from('list_items').insert(itemsToInsert);
      if (itemsError) {
        errors.push(`${rowLabel} ("${name}"): list created but items could not be saved — ${itemsError.message}.`);
      }
    }

    importedCount++;
  }

  if (importedCount === 0) {
    return NextResponse.json(
      { error: 'No valid lists could be imported.', errors },
      { status: 400 },
    );
  }

  return NextResponse.json({
    imported: importedCount,
    skipped: listsToProcess.length - importedCount,
    truncated: rawLists.length - listsToProcess.length,
    errors,
  });
}
