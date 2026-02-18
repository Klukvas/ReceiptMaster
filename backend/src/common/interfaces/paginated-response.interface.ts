export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}
