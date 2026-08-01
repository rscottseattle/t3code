import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const insertThread = (sql: SqlClient.SqlClient, threadId: string, latestTurnId: string | null) =>
  sql`
    INSERT INTO projection_threads (
      thread_id,
      project_id,
      title,
      model_selection_json,
      runtime_mode,
      interaction_mode,
      branch,
      worktree_path,
      latest_turn_id,
      created_at,
      updated_at,
      deleted_at
    )
    VALUES (
      ${threadId},
      'project-036',
      'Thread',
      '{"instanceId":"codex","model":"gpt-5.6-sol"}',
      'full-access',
      'default',
      NULL,
      NULL,
      ${latestTurnId},
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      NULL
    )
  `;

const insertTurn = (
  sql: SqlClient.SqlClient,
  threadId: string,
  turnId: string,
  requestedAt: string,
) =>
  sql`
    INSERT INTO projection_turns (
      thread_id,
      turn_id,
      pending_message_id,
      assistant_message_id,
      state,
      requested_at,
      started_at,
      completed_at,
      checkpoint_files_json
    )
    VALUES (
      ${threadId},
      ${turnId},
      NULL,
      NULL,
      'completed',
      ${requestedAt},
      ${requestedAt},
      ${requestedAt},
      '[]'
    )
  `;

const insertPendingTurnStart = (sql: SqlClient.SqlClient, threadId: string, requestedAt: string) =>
  sql`
    INSERT INTO projection_turns (
      thread_id,
      turn_id,
      pending_message_id,
      assistant_message_id,
      state,
      requested_at,
      started_at,
      completed_at,
      checkpoint_files_json
    )
    VALUES (
      ${threadId},
      NULL,
      'pending-message-036',
      NULL,
      'pending',
      ${requestedAt},
      NULL,
      NULL,
      '[]'
    )
  `;

const readLatestTurnId = (sql: SqlClient.SqlClient, threadId: string) =>
  sql<{ readonly latestTurnId: string | null }>`
    SELECT latest_turn_id AS "latestTurnId"
    FROM projection_threads
    WHERE thread_id = ${threadId}
  `;

layer("036_BackfillProjectionThreadsLatestTurn", (it) => {
  it.effect("backfills nulled pointers without touching set or turnless ones", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 35 });

      yield* insertThread(sql, "thread-repair", null);
      yield* insertTurn(sql, "thread-repair", "turn-old", "2026-07-01T00:00:00.000Z");
      yield* insertTurn(sql, "thread-repair", "turn-new", "2026-07-01T00:05:00.000Z");

      yield* insertThread(sql, "thread-kept", "turn-kept");
      yield* insertTurn(sql, "thread-kept", "turn-kept", "2026-07-01T00:00:00.000Z");
      yield* insertTurn(sql, "thread-kept", "turn-newer", "2026-07-01T00:09:00.000Z");

      yield* insertThread(sql, "thread-dangling", null);
      yield* insertTurn(sql, "thread-dangling", "turn-completed", "2026-07-01T00:00:00.000Z");
      yield* insertPendingTurnStart(sql, "thread-dangling", "2026-07-01T00:05:00.000Z");

      yield* insertThread(sql, "thread-empty", null);

      yield* insertThread(sql, "thread-pending-only", null);
      yield* insertPendingTurnStart(sql, "thread-pending-only", "2026-07-01T00:05:00.000Z");

      yield* runMigrations({ toMigrationInclusive: 36 });

      assert.deepStrictEqual(yield* readLatestTurnId(sql, "thread-repair"), [
        { latestTurnId: "turn-new" },
      ]);
      assert.deepStrictEqual(yield* readLatestTurnId(sql, "thread-kept"), [
        { latestTurnId: "turn-kept" },
      ]);
      assert.deepStrictEqual(yield* readLatestTurnId(sql, "thread-dangling"), [
        { latestTurnId: "turn-completed" },
      ]);
      assert.deepStrictEqual(yield* readLatestTurnId(sql, "thread-empty"), [
        { latestTurnId: null },
      ]);
      assert.deepStrictEqual(yield* readLatestTurnId(sql, "thread-pending-only"), [
        { latestTurnId: null },
      ]);
    }),
  );
});
