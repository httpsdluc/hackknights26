import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ port, host: "127.0.0.1" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
