export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * Combines a local date string (YYYY-MM-DD), local time string (HH:MM),
 * and an IANA timezone into a UTC ISO string.
 */
export function localToUtcIso(
  dateStr: string,
  timeStr: string,
  timezone: string
): string {
  try {
    const dateTimeStr = `${dateStr}T${timeStr}:00`;
    // We can use Intl or standard Date arithmetic
    const targetDate = new Date(dateTimeStr);
    
    // Formatting with target timezone to find offset
    const invDate = new Date(
      targetDate.toLocaleString("en-US", { timeZone: timezone })
    );
    const diff = targetDate.getTime() - invDate.getTime();
    
    return new Date(targetDate.getTime() + diff).toISOString();
  } catch (err) {
    // Fallback if timezone is invalid
    return new Date(`${dateStr}T${timeStr}:00Z`).toISOString();
  }
}

/**
 * Formats a UTC ISO string into the user's localized timezone.
 */
export function formatInTimezone(
  utcIso: string | null | undefined,
  timezone: string = "UTC",
  options?: Intl.DateTimeFormatOptions
): string {
  if (!utcIso) return "N/A";
  try {
    const date = new Date(utcIso);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      ...options,
    }).format(date);
  } catch (err) {
    return new Date(utcIso).toLocaleString();
  }
}
