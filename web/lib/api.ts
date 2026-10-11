// Every piece of data the web app reads or writes goes through this file.
// Real calls hit /api/*, which next.config.ts proxies to the server.
import type {
  ApproveBody,
  CompromisedAgentBody,
  KillSwitchBody,
  ProposeResult,
  Request as CosignRequest,
  VaultState,
} from "../../shared/types.ts";
import { checkProposeResult, checkRequest, checkRequestList, checkVaultState } from "./contract-check";
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

const TIMEOUT_MS = 20_000;

async function call(path: string, body?: object, method: "GET" | "POST" = "GET"): Promise<unknown> {
  const res = await fetch(`/api${path}`, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new ApiError(res.status, path);
  return res.json();
}

const post = (path: string, body?: object) => call(path, body, "POST");
const seg = encodeURIComponent;

export async function listRequests(): Promise<CosignRequest[]> {
  return checkRequestList(await (USE_MOCKS ? mock.mockListRequests() : call("/requests")));
}

/** Resolves to null when the request doesn't exist. */
export async function getRequest(id: string): Promise<CosignRequest | null> {
  if (USE_MOCKS) {
    const found = await mock.mockGetRequest(id);
    return found ? checkRequest(found) : null;
  }
  try {
    return checkRequest(await call(`/requests/${seg(id)}`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function proposePayment(requestId: string): Promise<ProposeResult> {
  return checkProposeResult(await (USE_MOCKS ? mock.mockPropose(requestId) : post(`/requests/${seg(requestId)}/propose`)));
}

export async function approveProposal(proposalId: string, approver: string): Promise<ProposeResult> {
  const body: ApproveBody = { approver };
  return checkProposeResult(
    await (USE_MOCKS ? mock.mockApprove(proposalId, approver) : post(`/proposals/${seg(proposalId)}/approve`, body)),
  );
}

/** "Release payment" in the UI. */
export async function executeProposal(proposalId: string): Promise<ProposeResult> {
  return checkProposeResult(await (USE_MOCKS ? mock.mockExecute(proposalId) : post(`/proposals/${seg(proposalId)}/execute`)));
}

export async function setKillSwitch(enabled: boolean): Promise<ProposeResult> {
  const body: KillSwitchBody = { enabled };
  return checkProposeResult(await (USE_MOCKS ? mock.mockKillSwitch(enabled) : post("/vault/kill-switch", body)));
}

export async function fireCompromisedAgent(requestId: string): Promise<ProposeResult> {
  const body: CompromisedAgentBody = { requestId };
  return checkProposeResult(await (USE_MOCKS ? mock.mockCompromisedAgent() : post("/attack/compromised-agent", body)));
}

export async function getVault(): Promise<VaultState> {
  return checkVaultState(await (USE_MOCKS ? mock.mockGetVault() : call("/vault")));
}
