interface CsvColumn<T> {
  key: keyof T;
  header: string;
  format?: (value: T[keyof T]) => string;
}

export function exportToCsv<T extends Record<string, unknown>>(
  data: T[],
  columns: CsvColumn<T>[],
  filename: string,
) {
  const header = columns.map((c) => c.header).join(',');
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const raw = row[col.key];
        const value = col.format ? col.format(raw) : String(raw ?? '');
        // Escape CSV values that contain commas, quotes, or newlines
        if (/[",\n\r]/.test(value)) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(','),
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
