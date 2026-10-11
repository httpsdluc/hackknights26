import Fastify from "fastify";
import {
  addPhishingPayee, approveProposal, checkEvidence, compromisedAgentPropose, executeProposal, getRequest, getVault, listRequests,
  proposeForRequest, setKillSwitch, warmUp,
} from "./agent.ts";
import { DEPS_SUMMARY } from "./deps.ts";

const app = Fastify({ logger: true });
app.log.info(`deps: ${DEPS_SUMMARY}; USE_CACHED_LLM=${process.env.USE_CACHED_LLM === "true"}`);

// CORS for the web app (port 3000), no extra dependency.
app.addHook("onRequest", async (req, reply) => {
  reply.header("access-control-allow-origin", "*");
  reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
  reply.header("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return reply.code(204).send();
});

type IdParams = { Params: { id: string } };

app.get("/health", async () => ({ ok: true }));

app.get("/requests", async () => listRequests());

app.get<IdParams>("/requests/:id", async (req, reply) => {
  const r = await getRequest(req.params.id);
  if ("ok" in r) return reply.code(r.error === "not_found" ? 404 : 422).send({ error: r.error, detail: r.detail });
  return r;
});

app.get<IdParams>("/requests/:id/evidence", async (req, reply) => {
  const r = await checkEvidence(req.params.id);
  if ("ok" in r) return reply.code(r.error === "not_found" ? 404 : 422).send({ error: r.error, detail: r.detail });
  return r;
});

app.post<IdParams>("/requests/:id/propose",async (req) => proposeForRequest(req.params.id));

app.post<IdParams & { Body: { approver: string } }>(
  "/proposals/:id/approve",
  { schema: { body: { type: "object", required: ["approver"], properties: { approver: { type: "string" } } } } },
  async (req) => approveProposal(req.params.id, req.body.approver),
);

app.post<IdParams>("/proposals/:id/execute", async (req) => executeProposal(req.params.id));

app.post<{ Body: { enabled: boolean } }>(
  "/vault/kill-switch",
  { schema: { body: { type: "object", required: ["enabled"], properties: { enabled: { type: "boolean" } } } } },
  async (req) => setKillSwitch(req.body.enabled),
);

app.post<{ Body: { requestId: string } }>(
  "/attack/compromised-agent",
  { schema: { body: { type: "object", required: ["requestId"], properties: { requestId: { type: "string" } } } } },
  async (req) => compromisedAgentPropose(req.body.requestId),
);

app.post("/attack/add-phishing-payee", async () => addPhishingPayee());

app.get("/vault", async () => getVault());

const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ port, host: "127.0.0.1" });
  warmUp();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
