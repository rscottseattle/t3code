import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationLatestTurnState,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  applyCompletedThreadUnreadAction,
  shouldMarkLiveCompletionUnread,
  transitionCompletedThreadUnreadState,
  type CompletedThreadUnreadEnvironment,
} from "./useMarkLiveCompletedThreadsUnread";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const COMPLETED_AT = "2026-07-31T18:30:00.000Z";

function makeThread(input: {
  readonly id: string;
  readonly state?: OrchestrationLatestTurnState;
  readonly completedAt?: string | null;
  readonly updatedAt?: string;
  readonly archivedAt?: string | null;
}): OrchestrationThreadShell {
  const threadId = ThreadId.make(input.id);
  return {
    id: threadId,
    projectId: ProjectId.make("project-1"),
    title: input.id,
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-sol",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "main",
    worktreePath: null,
    latestTurn: {
      turnId: TurnId.make(`turn-${input.id}`),
      state: input.state ?? "completed",
      requestedAt: "2026-07-31T18:00:00.000Z",
      startedAt: "2026-07-31T18:00:01.000Z",
      completedAt: input.completedAt === undefined ? COMPLETED_AT : input.completedAt,
      assistantMessageId: null,
    },
    createdAt: "2026-07-31T18:00:00.000Z",
    updatedAt: input.updatedAt ?? COMPLETED_AT,
    archivedAt: input.archivedAt ?? null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: "2026-07-31T18:00:00.000Z",
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

function environment(
  threads: ReadonlyArray<OrchestrationThreadShell>,
  isLive = true,
): CompletedThreadUnreadEnvironment {
  return { environmentId: ENVIRONMENT_ID, isLive, threads };
}

describe("transitionCompletedThreadUnreadState", () => {
  it("keeps completed threads in the initial historical snapshot read", () => {
    const historical = makeThread({ id: "historical" });

    const transition = transitionCompletedThreadUnreadState(new Map(), [environment([historical])]);

    expect(transition.actions).toEqual([]);
  });

  it("marks a previously running background thread unread when it completes", () => {
    const running = makeThread({ id: "background", state: "running", completedAt: null });
    const initial = transitionCompletedThreadUnreadState(new Map(), [environment([running])]);
    const completed = makeThread({ id: "background" });

    const transition = transitionCompletedThreadUnreadState(initial.state, [
      environment([completed]),
    ]);

    expect(transition.actions).toEqual([
      { environmentId: ENVIRONMENT_ID, threadId: completed.id, completedAt: COMPLETED_AT },
    ]);
  });

  it("marks a completed thread first seen after the live baseline unread", () => {
    const initial = transitionCompletedThreadUnreadState(new Map(), [environment([])]);
    const completed = makeThread({ id: "new-completion" });

    const transition = transitionCompletedThreadUnreadState(initial.state, [
      environment([completed]),
    ]);

    expect(transition.actions).toEqual([
      { environmentId: ENVIRONMENT_ID, threadId: completed.id, completedAt: COMPLETED_AT },
    ]);
  });

  it("accepts a completion whose thread updatedAt advanced afterward", () => {
    const initial = transitionCompletedThreadUnreadState(new Map(), [environment([])]);
    const completed = makeThread({
      id: "completion-with-later-update",
      updatedAt: "2026-07-31T18:31:00.000Z",
    });

    const transition = transitionCompletedThreadUnreadState(initial.state, [
      environment([completed]),
    ]);

    expect(transition.actions).toEqual([
      { environmentId: ENVIRONMENT_ID, threadId: completed.id, completedAt: COMPLETED_AT },
    ]);
  });

  it("waits for a completion-consistent updatedAt before marking unread", () => {
    const initial = transitionCompletedThreadUnreadState(new Map(), [environment([])]);
    const stale = makeThread({
      id: "stale",
      updatedAt: "2026-07-31T18:29:59.000Z",
    });
    const staleTransition = transitionCompletedThreadUnreadState(initial.state, [
      environment([stale]),
    ]);
    const consistent = makeThread({ id: "stale" });
    const consistentTransition = transitionCompletedThreadUnreadState(staleTransition.state, [
      environment([consistent]),
    ]);

    expect(staleTransition.actions).toEqual([]);
    expect(consistentTransition.actions).toEqual([
      { environmentId: ENVIRONMENT_ID, threadId: consistent.id, completedAt: COMPLETED_AT },
    ]);
  });

  it("does not mark interrupted, failed, or archived threads unread", () => {
    const initial = transitionCompletedThreadUnreadState(new Map(), [environment([])]);
    const interrupted = makeThread({ id: "interrupted", state: "interrupted" });
    const failed = makeThread({ id: "failed", state: "error" });
    const archived = makeThread({
      id: "archived",
      archivedAt: "2026-07-31T18:31:00.000Z",
    });

    const transition = transitionCompletedThreadUnreadState(initial.state, [
      environment([interrupted, failed, archived]),
    ]);

    expect(transition.actions).toEqual([]);
  });

  it("does not repeat an unread action after reconnecting", () => {
    const initial = transitionCompletedThreadUnreadState(new Map(), [environment([])]);
    const completed = makeThread({ id: "completed" });
    const firstSeen = transitionCompletedThreadUnreadState(initial.state, [
      environment([completed]),
    ]);
    const reconnecting = transitionCompletedThreadUnreadState(firstSeen.state, [
      environment([completed], false),
    ]);
    const reconnected = transitionCompletedThreadUnreadState(reconnecting.state, [
      environment([completed]),
    ]);

    expect(firstSeen.actions).toHaveLength(1);
    expect(reconnecting.actions).toEqual([]);
    expect(reconnecting.state).toEqual(firstSeen.state);
    expect(reconnected.actions).toEqual([]);
  });

  it("treats a removed and re-added environment as a fresh historical baseline", () => {
    const historical = makeThread({ id: "historical" });
    const initial = transitionCompletedThreadUnreadState(new Map(), [environment([historical])]);
    const removed = transitionCompletedThreadUnreadState(initial.state, []);
    const readded = transitionCompletedThreadUnreadState(removed.state, [
      environment([historical]),
    ]);

    expect(removed.state).toEqual(new Map());
    expect(readded.actions).toEqual([]);
  });
});

describe("shouldMarkLiveCompletionUnread", () => {
  it("marks missing and older visit timestamps unread", () => {
    expect(
      shouldMarkLiveCompletionUnread({
        completedAt: COMPLETED_AT,
        lastVisitedAt: undefined,
      }),
    ).toBe(true);
    expect(
      shouldMarkLiveCompletionUnread({
        completedAt: COMPLETED_AT,
        lastVisitedAt: "2026-07-31T18:29:59.999Z",
      }),
    ).toBe(true);
  });

  it("does not rewind a thread visited at or after completion", () => {
    expect(
      shouldMarkLiveCompletionUnread({
        completedAt: COMPLETED_AT,
        lastVisitedAt: COMPLETED_AT,
      }),
    ).toBe(false);
    expect(
      shouldMarkLiveCompletionUnread({
        completedAt: COMPLETED_AT,
        lastVisitedAt: "2026-07-31T18:30:01.000Z",
      }),
    ).toBe(false);
  });
});

describe("applyCompletedThreadUnreadAction", () => {
  const action = {
    environmentId: ENVIRONMENT_ID,
    threadId: ThreadId.make("completed"),
    completedAt: COMPLETED_AT,
  };

  it("does not rewind a completion the active view already marked visited", () => {
    const markThreadUnread = vi.fn();

    applyCompletedThreadUnreadAction(
      {
        threadLastVisitedAtById: {
          [`${ENVIRONMENT_ID}:${action.threadId}`]: COMPLETED_AT,
        },
        markThreadUnread,
      },
      action,
    );

    expect(markThreadUnread).not.toHaveBeenCalled();
  });

  it("writes an unread marker for a background completion", () => {
    const markThreadUnread = vi.fn();

    applyCompletedThreadUnreadAction(
      {
        threadLastVisitedAtById: {},
        markThreadUnread,
      },
      action,
    );

    expect(markThreadUnread).toHaveBeenCalledWith(
      `${ENVIRONMENT_ID}:${action.threadId}`,
      COMPLETED_AT,
    );
  });
});
