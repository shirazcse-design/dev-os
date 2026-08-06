// Supabase is the only third-party origin the browser talks to directly (auth,
// PostgREST, Storage signed URLs, Realtime websockets for chat) — derived from
// the env var rather than hardcoded so it tracks the actual project.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return '';
  }
})();
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, 'ws');

const isProduction = process.env.NODE_ENV === 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' is required by Next's dev-mode webpack HMR runtime only —
  // dropped in production. 'unsafe-inline' is required in both: the App
  // Router injects its hydration payload as an inline script with no nonce
  // wired up (a nonce-based CSP would need per-request generation in
  // middleware.ts, out of scope for this pass).
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:", // pdfjs-dist's PDF worker
  `connect-src 'self' ${supabaseOrigin} ${supabaseWsOrigin}`.trim(),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  // Modern replacement for X-Frame-Options, but both are set — some older
  // browsers only honor the legacy header.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse bundles its own pdfjs-dist build whose .mjs module fails to load when
  // webpack bundles it through the RSC/server layer ("Object.defineProperty called on
  // non-object"). Marking it external makes Next use Node's native require() for it
  // instead, which works fine (verified directly with plain `require('pdf-parse')`).
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
    // pdfjs-dist's Node "fake worker" dynamically requires its own worker file at
    // runtime (not a static import), so Next's output file tracer — which Netlify's
    // Next Runtime uses to decide what to include in each serverless function bundle
    // — misses it entirely. Without this, PDF upload fails in production with
    // "Cannot find module '.../pdfjs-dist/legacy/build/pdf.worker.mjs'" even though
    // it works locally (nothing is bundled/traced for `next dev`/`next start`).
    outputFileTracingIncludes: {
      '/api/contracts': [
        './node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
