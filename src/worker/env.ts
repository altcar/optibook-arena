export interface Env {
  ASSETS: Fetcher;
  ARENA: DurableObjectNamespace;
  /** Stripe secret key (`sk_live_...` or `sk_test_...`). Set with `wrangler secret put`. */
  STRIPE_SECRET_KEY?: string;
  /** Stripe webhook signing secret (`whsec_...`). Set with `wrangler secret put`. */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Public origin used for Stripe success/cancel URLs. Falls back to the request origin. */
  APP_URL?: string;
  /** Optional Stripe billing portal configuration id. */
  STRIPE_PORTAL_CONFIGURATION_ID?: string;
}
