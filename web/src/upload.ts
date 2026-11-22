import type { ApiClient } from '@vca/shared';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};
const ALLOWED: Record<'photo' | 'post' | 'cv', string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  post: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  cv: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
};

export function uploadContentType(file: File, kind: 'photo' | 'cv' | 'post'): string {
  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Files must be 5 MB or smaller.');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = file.type || CONTENT_TYPES[extension] || '';
  if (!ALLOWED[kind].includes(contentType)) throw new Error('That file type isn’t allowed here.');
  return contentType;
}

/** Upload through the server so file size and content are validated before storage. */
export async function uploadFile(api: ApiClient, kind: 'photo' | 'cv' | 'post', file: File): Promise<string> {
  const contentType = uploadContentType(file, kind);
  const { uploadUrl, key } = await api.uploadUrl({ kind, contentType });
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || 'Upload failed. Please check your connection and try again.');
  }
  return key;
}
