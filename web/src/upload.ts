import type { ApiClient } from '@vca/shared';

/** Get a presigned URL from the server, then upload the file straight to S3. Returns its key. */
export async function uploadFile(api: ApiClient, kind: 'photo' | 'cv' | 'post', file: File): Promise<string> {
  const { uploadUrl, key } = await api.uploadUrl({ kind, contentType: file.type || 'application/octet-stream' });
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  if (!res.ok) throw new Error('Upload failed. Please check your connection and try again.');
  return key;
}
