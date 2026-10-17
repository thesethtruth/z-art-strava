import index from "./index.html";
import { createPdf } from "./scripts/chromium";
import { ARTWORK_NAME } from "./src/activity-data";

export function startServer(port = Number(process.env.PORT || 3000)) {
  let exportInProgress = false;
  const server = Bun.serve({
    hostname: "127.0.0.1", port,
    idleTimeout: 120,
    maxRequestBodySize: 20_000,
    routes: {
      "/": index,
      "/api/export": {
        POST: async req => {
          const origin = req.headers.get("origin");
          if (origin && origin !== new URL(req.url).origin) return new Response("Forbidden", { status: 403 });
          if (exportInProgress) return Response.json({ error: "An export is already running. Try again in a moment." }, { status: 409 });
          let settings: unknown;
          try { settings = await req.json(); } catch { return Response.json({ error: "Invalid settings JSON." }, { status: 400 }); }
          exportInProgress = true;
          try {
            const pdf = await createPdf(server.url.toString(), settings);
            return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${ARTWORK_NAME}.pdf"` } });
          } catch (error) {
            console.error(error);
            return Response.json({ error: error instanceof Error ? error.message : "PDF export failed." }, { status: 500 });
          } finally { exportInProgress = false; }
        },
      },
    },
    development: process.env.NODE_ENV === "production" ? false : { hmr: true, console: true },
  });
  return server;
}

if (import.meta.main) {
  const server = startServer();
  console.log(`Artwork studio: ${server.url}`);
}
