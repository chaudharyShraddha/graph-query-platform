/** Validate a CSV file for upload. */
export function validateCSVFile(file: File): { isValid: boolean; error?: string } {
  if (!file.name.toLowerCase().endsWith('.csv')) return { isValid: false, error: 'Only CSV files are allowed' };
  if (file.size === 0) return { isValid: false, error: 'File is empty' };
  if (file.size > 100 * 1024 * 1024) return { isValid: false, error: 'File size exceeds 100MB limit' };
  return { isValid: true };
}
