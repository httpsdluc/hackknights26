// Uses the real engine/ and chain/ exports when they exist, otherwise the server/stubs/ version.
// Nothing else in server/ imports engine/ or chain/ directly.
import * as engineReal from "../../engine/src/index.ts";
import * as chainReal from "../../chain/client.ts";
import * as engineStub from "../stubs/engine.ts";
import * as chainStub from "../stubs/chain.ts";

const e = engineReal as unknown as Partial<typeof engineStub>;
const c = chainReal as unknown as Partial<typeof chainStub>;

const used: string[] = [];
function pick<T>(name: string, real: T | undefined, stub: T): T {
  used.push(`${name}=${real ? "real" : "STUB"}`);
  return real ?? stub;
}

export const verifyMarginCall = pick("verifyMarginCall", e.verifyMarginCall, engineStub.verifyMarginCall);
export const verifyLoanDraw = pick("verifyLoanDraw", e.verifyLoanDraw, engineStub.verifyLoanDraw);
export const evidenceHash = pick("evidenceHash", e.evidenceHash, engineStub.evidenceHash);
export const ENGINE_VERSION = e.ENGINE_VERSION ?? (e.verifyMarginCall ? "engine" : engineStub.ENGINE_VERSION);

export const proposePayment = pick("proposePayment", c.proposePayment, chainStub.proposePayment);
export const approve = pick("approve", c.approve, chainStub.approve);
export const execute = pick("execute", c.execute, chainStub.execute);
export const setAgentEnabled = pick("setAgentEnabled", c.setAgentEnabled, chainStub.setAgentEnabled);
export const proposePaymentToWallet = pick("proposePaymentToWallet", c.proposePaymentToWallet, chainStub.proposePaymentToWallet);
export const getVaultState = pick("getVaultState", c.getVaultState, chainStub.getVaultState);
export const addPayeeForWallet = pick("addPayeeForWallet", c.addPayeeForWallet, chainStub.addPayeeForWallet);
export const getProposalEvidenceHash = pick("getProposalEvidenceHash", c.getProposalEvidenceHash, chainStub.getProposalEvidenceHash);

export const DEPS_SUMMARY = used.join(" ");
