// Fetches upcoming and recent earnings dates from Nasdaq calendar (free, no key needed)
export async function getEarningsCalendar(daysBack = 90): Promise<Record<string, string>> {
  const results: Record<string, string> = {}; // symbol → date
  try {
    // Nasdaq earnings calendar API
    const from = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${to}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (r.ok) {
      const data = await r.json();
      const rows = data?.data?.rows ?? [];
      for (const row of rows) {
        if (row.symbol) results[row.symbol] = to;
      }
    }
  } catch {}

  // Also try FMP earnings calendar as supplement
  try {
    const from = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const key = process.env.FMP_API_KEY;
    if (key) {
      const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${key}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        for (const item of data) {
          if (item.symbol && item.date) results[item.symbol] = item.date;
        }
      }
    }
  } catch {}

  return results;
}
