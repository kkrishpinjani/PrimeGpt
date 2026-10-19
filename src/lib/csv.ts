/** CSV cell escaping, including neutralising spreadsheet formula injection (a cell starting with = + - @ is prefixed with a quote). */
export const csvCell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
