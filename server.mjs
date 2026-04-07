import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const DEFAULT_PORT = Number(process.env.PORT ?? 3000);
const MAX_PORT_ATTEMPTS = 10;
const ROOT = process.cwd();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function resolvePath(urlPath) {
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  return join(ROOT, safePath);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const filePath = resolvePath(url.pathname);
    const extension = extname(filePath).toLowerCase();
    const data = await readFile(filePath);

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

function startServer(port, attemptsLeft) {
  const handleError = (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      server.removeListener("error", handleError);
      startServer(port + 1, attemptsLeft - 1);
      return;
    }

    throw error;
  };

  server.once("error", handleError);
  server.listen(port, () => {
    server.removeListener("error", handleError);
    console.log(`RISC-V simulator available at http://localhost:${port}`);
  });
}

startServer(DEFAULT_PORT, MAX_PORT_ATTEMPTS);
