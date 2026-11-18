declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    STUDIO_SETUP_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
