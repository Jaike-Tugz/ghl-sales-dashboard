/**
 * Typed wrappers for the official GHL v2 endpoints this app uses. Each one is
 * a GET listed in github.com/GoHighLevel/highlevel-api-docs with the scope
 * noted. Fields are typed only as far as the published schemas describe them.
 */
import { GHL_VERSION, type GhlClient } from "./client";

export interface GhlLocation {
  id: string;
  companyId?: string;
  name?: string;
  timezone?: string;
}

export interface GhlUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  deleted?: boolean;
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; position?: number }>;
}

export interface GhlCalendar {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface GhlOpportunity {
  id: string;
  name?: string;
  monetaryValue?: number;
  pipelineId?: string;
  pipelineStageId?: string;
  assignedTo?: string;
  status?: string;
  source?: string;
  lastStatusChangeAt?: string;
  lastStageChangeAt?: string;
  lastActionDate?: string;
  createdAt?: string;
  updatedAt?: string;
  contactId?: string;
  locationId?: string;
  contact?: { id?: string; name?: string; companyName?: string; email?: string; phone?: string; tags?: string[] };
}

export interface GhlContact {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  source?: string;
  assignedTo?: string;
  dateAdded?: string;
  dateUpdated?: string;
  /** First touch. Present on GET /contacts/{id}; usually absent from webhooks. */
  attributionSource?: GhlAttribution;
  lastAttributionSource?: GhlAttribution;
}

/** Attribution object on a GHL contact (fields as published; all optional). */
export interface GhlAttribution {
  url?: string;
  campaign?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  campaignId?: string;
  fbclid?: string;
  gclid?: string;
  medium?: string;
  mediumId?: string;
  sessionSource?: string;
  [key: string]: unknown;
}

export interface GhlCalendarEvent {
  id: string;
  title?: string;
  calendarId?: string;
  locationId?: string;
  contactId?: string;
  appointmentStatus?: string;
  assignedUserId?: string;
  startTime?: string;
  endTime?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GhlTransaction {
  _id: string;
  contactId?: string;
  amount?: number;
  amountRefunded?: number;
  currency?: string;
  status?: string;
  liveMode?: boolean;
  createdAt?: string;
}

/** GET /locations/{locationId} — locations.readonly */
export async function getLocation(c: GhlClient): Promise<GhlLocation> {
  const r = await c.get<{ location: GhlLocation }>(`/locations/${encodeURIComponent(c.locationId)}`);
  return r.location;
}

/** GET /users/search — users.readonly (companyId required by the spec). */
export async function listUsers(c: GhlClient, companyId: string): Promise<GhlUser[]> {
  const out: GhlUser[] = [];
  const limit = 100;
  for (let skip = 0; skip < 10_000; skip += limit) {
    const r = await c.get<{ users: GhlUser[]; count?: number }>("/users/search", {
      query: { companyId, locationId: c.locationId, limit, skip },
    });
    out.push(...(r.users ?? []));
    if (!r.users || r.users.length < limit) break;
  }
  return out;
}

/** GET /opportunities/pipelines — opportunities.readonly */
export async function listPipelines(c: GhlClient): Promise<GhlPipeline[]> {
  const r = await c.get<{ pipelines: GhlPipeline[] }>("/opportunities/pipelines", { query: { locationId: c.locationId } });
  return r.pipelines ?? [];
}

/** GET /calendars/ — calendars.readonly (Version 2021-04-15) */
export async function listCalendars(c: GhlClient): Promise<GhlCalendar[]> {
  const r = await c.get<{ calendars: GhlCalendar[] }>("/calendars/", { query: { locationId: c.locationId }, version: GHL_VERSION.calendars });
  return r.calendars ?? [];
}

/**
 * GET /opportunities/search — opportunities.readonly. Cursor pagination via
 * meta.startAfter / meta.startAfterId (limit max 100).
 */
export async function* iterateOpportunities(c: GhlClient, pipelineId?: string): AsyncGenerator<GhlOpportunity[]> {
  let startAfter: number | string | undefined;
  let startAfterId: string | undefined;
  for (let guard = 0; guard < 2_000; guard++) {
    const r = await c.get<{ opportunities: GhlOpportunity[]; meta?: { startAfter?: number; startAfterId?: string; nextPageUrl?: string } }>(
      "/opportunities/search",
      { query: { location_id: c.locationId, pipeline_id: pipelineId, status: "all", limit: 100, startAfter, startAfterId } },
    );
    const page = r.opportunities ?? [];
    if (page.length) yield page;
    if (page.length < 100 || !r.meta?.startAfterId || r.meta.startAfterId === startAfterId) return;
    startAfter = r.meta.startAfter;
    startAfterId = r.meta.startAfterId;
  }
}

/** GET /opportunities/{id} — opportunities.readonly */
export async function getOpportunity(c: GhlClient, id: string): Promise<GhlOpportunity | null> {
  const r = await c.get<{ opportunity: GhlOpportunity }>(`/opportunities/${encodeURIComponent(id)}`);
  return r.opportunity ?? null;
}

/** GET /contacts/{contactId} — contacts.readonly */
export async function getContact(c: GhlClient, id: string): Promise<GhlContact | null> {
  const r = await c.get<{ contact: GhlContact }>(`/contacts/${encodeURIComponent(id)}`);
  return r.contact ?? null;
}

/**
 * GET /calendars/events — calendars/events.readonly (Version 2021-04-15).
 * Requires one of calendarId / userId / groupId; times are epoch millis.
 * Queried in 31-day windows to keep responses bounded.
 */
export async function listCalendarEvents(c: GhlClient, calendarId: string, startMs: number, endMs: number): Promise<GhlCalendarEvent[]> {
  const out: GhlCalendarEvent[] = [];
  const WINDOW = 31 * 86_400_000;
  for (let s = startMs; s < endMs; s += WINDOW) {
    const e = Math.min(endMs, s + WINDOW);
    const r = await c.get<{ events: GhlCalendarEvent[] }>("/calendars/events", {
      query: { locationId: c.locationId, calendarId, startTime: s, endTime: e },
      version: GHL_VERSION.calendars,
    });
    out.push(...(r.events ?? []));
  }
  return out;
}

/** GET /payments/transactions — payments/transactions.readonly (optional). */
export async function* iterateTransactions(c: GhlClient, startAt?: string): AsyncGenerator<GhlTransaction[]> {
  const limit = 100;
  for (let offset = 0; offset < 50_000; offset += limit) {
    const r = await c.get<{ data: GhlTransaction[]; totalCount?: number }>("/payments/transactions", {
      query: { altId: c.locationId, altType: "location", limit, offset, startAt },
    });
    const page = r.data ?? [];
    if (page.length) yield page;
    if (page.length < limit) return;
  }
}
