import "server-only";
import { requireViewer } from "./auth/viewer";
import { getDataset, getSettings, isDemoMode } from "./data";
import { parseFilters, type SearchParams } from "./filters";
import { buildContext } from "./metrics";

/** Everything a dashboard page needs: viewer, settings, scoped data, filters and the metric context. */
export async function loadPage(searchParams: Promise<SearchParams>) {
  const [viewer, settings, sp] = await Promise.all([requireViewer(), getSettings(), searchParams]);
  const ds = await getDataset(viewer);
  const filters = parseFilters(sp, settings.reportingTimezone, ds.accounts.map((a) => a.id));
  const ctx = buildContext(ds, settings, filters);
  return { viewer, settings, ds, filters, ctx, sp, demo: isDemoMode() };
}
