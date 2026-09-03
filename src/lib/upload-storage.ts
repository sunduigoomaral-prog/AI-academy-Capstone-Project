/**
 * Upload хийсэн ЭХ ФАЙЛЫГ хадгалах давхарга.
 *
 * ⚠️ ЗАРЧИМ: эх файл ба нормчилсон өгөгдөл ЯЛГААТАЙ хадгалагдана.
 *   • эх файл  → диск дээр, БАЙГАА ХЭВЭЭР, хэзээ ч дарж бичихгүй
 *   • нормчилсон өгөгдөл → PostgreSQL
 * Ингэснээр аливаа маргаантай тоог эх файл руу буцаж тулгах боломжтой.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads');

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Файлын нэрийг замын халдлагаас цэвэрлэнэ (эх нэрийг хадгалах нь тусдаа) */
export function safeFileName(originalName: string): string {
  return path.basename(originalName).replace(/[^\p{L}\p{N}._ -]/gu, '_');
}

export interface StoredFile {
  storagePath: string;
  fileHash: string;
  sizeBytes: number;
}

/**
 * Эх файлыг hash-аар нэрлэсэн хавтсанд хадгална.
 * Ижил файлыг дахин upload хийвэл ижил зам гарна — дискэнд давхардахгүй.
 */
export async function storeOriginal(
  buffer: Buffer,
  originalName: string,
): Promise<StoredFile> {
  const fileHash = sha256(buffer);
  const dir = path.join(UPLOAD_ROOT, fileHash.slice(0, 2), fileHash);
  await mkdir(dir, { recursive: true });

  const storagePath = path.join(dir, safeFileName(originalName));
  // `wx` — байвал дарж бичихгүй. Ижил агуулгатай файл аль хэдийн байна гэсэн үг.
  try {
    await writeFile(storagePath, buffer, { flag: 'wx' });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw error;
  }

  return { storagePath, fileHash, sizeBytes: buffer.byteLength };
}
