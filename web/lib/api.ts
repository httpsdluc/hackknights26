// Every piece of data the web app reads or writes goes through this file.
// Real calls hit /api/*, which next.config.ts proxies to the server.
import type {
  ApproveBody,
  CompromisedAgentBody,
  KillSwitchBody,
  ProposeResult,
  Request as CosignRequest,
} from "../../shared/types.ts";
import * as mock from "./mocks/server";

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export class ApiError extends Error {
  status: number;
  constructor(status: number, path: string) {
    super(`${path} answered HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

async function call<T>(path: string, body?: object, method: "GET" | "POST" = "GET"): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    cache: "no-store",
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new ApiError(res.status, path);
  return (await res.json()) as T;
}

const post = <T>(path: string, body?: object) => call<T>(path, body, "POST");
const seg = encodeURIComponent;

export function listRequests(): Promise<CosignRequest[]> {
  return USE_MOCKS ? mock.mockListRequests() : call<CosignRequest[]>("/requests");
}

/** Resolves to null when the request doesn't exist. */
export async function getRequest(id: string): Promise<CosignRequest | null> {
  if (USE_MOCKS) return mock.mockGetRequest(id);
  try {
    return await call<CosignRequest>(`/requests/${seg(id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function proposePayment(requestId: string): Promise<ProposeResult> {
  return USE_MOCKS ? mock.mockPropose(requestId) : post<ProposeResult>(`/requests/${seg(requestId)}/propose`);
}

export function approveProposal(proposalId: string, approver: string): Promise<ProposeResult> {
  const body: ApproveBody = { approver };
  return USE_MOCKS ? mock.mockApprove(proposalId, approver) : post<ProposeResult>(`/proposals/${seg(proposalId)}/approve`, body);
}

/** "Release payment" in the UI. */
export function executeProposal(proposalId: string): Promise<ProposeResult> {
  return USE_MOCKS ? mock.mockExecute(proposalId) : post<ProposeResult>(`/proposals/${seg(proposalId)}/execute`);
}

export function setKillSwitch(enabled: boolean): Promise<ProposeResult> {
  const body: KillSwitchBody = { enabled };
  return USE_MOCKS ? mock.mockKillSwitch(enabled) : post<ProposeResult>("/vault/kill-switch", body);
}

export function fireCompromisedAgent(requestId: string): Promise<ProposeResult> {
  const body: CompromisedAgentBody = { requestId };
  return USE_MOCKS ? mock.mockCompromisedAgent() : post<ProposeResult>("/attack/compromised-agent", body);
}

// GET /vault is not wrapped yet: CONTRACT.md §4 gives it no response shape.
