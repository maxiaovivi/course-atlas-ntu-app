export const materialShelves = ['Lectures', 'Assignments', 'Study aids', 'Quiz', 'Exams'] as const;

export type MaterialShelf = typeof materialShelves[number];
export type MaterialVisibility = 'public' | 'private';

export type LibraryMaterial = {
  id: string;
  course: string;
  shelf: MaterialShelf;
  title: string;
  size: number;
  sha256: string;
  visibility: MaterialVisibility;
  readable: boolean;
  updatedAt: string;
};

export type LibraryPayload = {
  materials: LibraryMaterial[];
  updatedAt: string | null;
  storageAvailable: boolean;
};

export const emptyLibrary: LibraryPayload = {
  materials: [],
  updatedAt: null,
  storageAvailable: false,
};

const MAX_MATERIALS = 512;
const MAX_PDF_BYTES = 75 * 1024 * 1024;
const COURSE_CODES = new Set(['EE6221', 'EE6406', 'EE6407', 'EE6497']);
const SHELVES = new Set<string>(materialShelves);
const PAYLOAD_KEYS = new Set(['materials', 'updatedAt', 'storageAvailable']);
const MATERIAL_KEYS = new Set([
  'id',
  'course',
  'shelf',
  'title',
  'size',
  'sha256',
  'visibility',
  'readable',
  'updatedAt',
]);

function hasExactKeys(value: object, allowed: Set<string>) {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function isCleanText(value: unknown, maxLength: number) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function isInstant(value: unknown) {
  return typeof value === 'string'
    && value.length <= 40
    && Number.isFinite(Date.parse(value));
}

function isLibraryMaterial(value: unknown): value is LibraryMaterial {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, MATERIAL_KEYS)) return false;
  const material = value as Partial<LibraryMaterial>;
  return typeof material.id === 'string' && /^[a-z0-9-]{16,96}$/.test(material.id)
    && typeof material.course === 'string' && COURSE_CODES.has(material.course)
    && typeof material.shelf === 'string' && SHELVES.has(material.shelf)
    && typeof material.title === 'string'
    && isCleanText(material.title, 240) && material.title.toLowerCase().endsWith('.pdf')
    && Number.isInteger(material.size) && Number(material.size) > 0 && Number(material.size) <= MAX_PDF_BYTES
    && typeof material.sha256 === 'string' && /^[a-f0-9]{64}$/.test(material.sha256)
    && (material.visibility === 'public' || material.visibility === 'private')
    && typeof material.readable === 'boolean'
    && isInstant(material.updatedAt);
}

export function isLibraryPayload(value: unknown): value is LibraryPayload {
  if (!value || typeof value !== 'object' || !hasExactKeys(value, PAYLOAD_KEYS)) return false;
  const payload = value as Partial<LibraryPayload>;
  if (!Array.isArray(payload.materials)
    || payload.materials.length > MAX_MATERIALS
    || !payload.materials.every(isLibraryMaterial)
    || new Set(payload.materials.map((item) => item.id)).size !== payload.materials.length
    || (payload.updatedAt !== null && !isInstant(payload.updatedAt))
    || typeof payload.storageAvailable !== 'boolean') return false;
  return true;
}

export function materialsForCourse(materials: LibraryMaterial[], courseCode: string) {
  const priority = (material: LibraryMaterial) => {
    if (/课后练习|练习题|习题|practice/i.test(material.title)) return 0;
    return 1;
  };
  return materials
    .filter((material) => material.course === courseCode)
    .slice()
    .sort((left, right) => priority(left) - priority(right)
      || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      || left.title.localeCompare(right.title, 'zh-CN'))
    .slice(0, 3);
}

export function formatMaterialSize(size: number) {
  if (size >= 1024 * 1024) {
    const megabytes = size / 1024 / 1024;
    return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}
