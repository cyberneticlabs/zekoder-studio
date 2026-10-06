import { describe, expect, it } from "vitest";
import {
  buildAgentDeepLink,
  buildAgentDeepLinkRoute,
  parseAgentDeepLink,
} from "./agent-deep-link.js";

describe("agent deep links", () => {
  it("round-trips an existing agent target", () => {
    const target = { serverId: "server/main", agentId: "agent 123" };

    const link = buildAgentDeepLink(target);

    expect(link).toBe("zekoder://h/server%2Fmain/agent/agent%20123");
    expect(buildAgentDeepLinkRoute(target)).toBe("/h/server%2Fmain/agent/agent%20123");
    expect(parseAgentDeepLink(link)).toEqual(target);
  });

  it("parses zekoder and legacy paseo schemes and rejects others", () => {
    const target = { serverId: "server-1", agentId: "agent-1" };

    expect(parseAgentDeepLink("zekoder://h/server-1/agent/agent-1")).toEqual(target);
    expect(parseAgentDeepLink("paseo://h/server-1/agent/agent-1")).toEqual(target);
    expect(parseAgentDeepLink("other://h/server-1/agent/agent-1")).toBeNull();
  });

  it("rejects links outside the exact agent route", () => {
    expect(parseAgentDeepLink("https://h/server/agent/agent-1")).toBeNull();
    expect(parseAgentDeepLink("paseo://app/h/server/agent/agent-1")).toBeNull();
    expect(parseAgentDeepLink("paseo://h/server/agent/agent-1?message=hello")).toBeNull();
    expect(parseAgentDeepLink("paseo://h/server/agent/agent-1/extra")).toBeNull();
  });
});
