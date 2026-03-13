export const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';

  let date = new Date(dateString);

  // If date is invalid (NaN), it might be the custom API Trash format
  // Format: YYYY-MM-DDTHH-mm-ss-mssZ (colons and dots replaced by dashes)
  if (isNaN(date.getTime())) {
    // Regex to match T<HH>-<mm>-<ss>-<mss>Z at the end of the string
    const trashRegex = /T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;
    
    if (trashRegex.test(dateString)) {
      // Restore standard ISO format: T<HH>:<mm>:<ss>.<mss>Z
      const fixedDateString = dateString.replace(trashRegex, 'T$1:$2:$3.$4Z');
      date = new Date(fixedDateString);
    }
  }

  // If still invalid after attempting fix, return original string to prevent crash
  if (isNaN(date.getTime())) {
    return dateString;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch (e) {
    return dateString;
  }
};