export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit = DEFAULT_PAGE_LIMIT
): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
  const requested = Number(searchParams.get('limit') || defaultLimit);
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, Number.isFinite(requested) ? requested : defaultLimit)
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages };
}

export function paginateArray<T>(items: T[], page: number, limit: number): { items: T[]; meta: PaginationMeta } {
  const total = items.length;
  const meta = buildPaginationMeta(total, page, limit);
  const start = (meta.page - 1) * meta.limit;
  return { items: items.slice(start, start + meta.limit), meta };
}
