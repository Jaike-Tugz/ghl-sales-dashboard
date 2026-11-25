-- Lead source attribution (UTM / ad platform) captured from GHL contacts.
-- GHL returns `attributionSource` (first touch) and `lastAttributionSource`
-- on GET /contacts/{id}. We store first touch, falling back to last touch,
-- plus the raw objects for anything not broken out into columns.
-- Safe to run more than once.

alter table contacts add column if not exists utm_source            text;
alter table contacts add column if not exists utm_medium            text;
alter table contacts add column if not exists utm_campaign          text;
alter table contacts add column if not exists utm_content           text;
alter table contacts add column if not exists utm_term              text;
-- GHL's own channel fields, e.g. medium "facebook" / session_source "Paid Social".
alter table contacts add column if not exists attribution_medium    text;
alter table contacts add column if not exists session_source        text;
alter table contacts add column if not exists attribution_campaign  text;
alter table contacts add column if not exists attribution           jsonb;
-- Set when the full contact (with attribution) was last fetched, so the
-- reconcile job backfills older contacts exactly once.
alter table contacts add column if not exists attribution_fetched_at timestamptz;

create index if not exists contacts_utm_idx on contacts (account_id, utm_source, utm_medium, utm_campaign);
