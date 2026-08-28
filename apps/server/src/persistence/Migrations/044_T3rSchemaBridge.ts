import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * T3r previously shipped private migrations at IDs later claimed upstream.
 * Reassert the affected schemas idempotently so both existing T3r databases
 * and fresh upstream databases converge before later releases continue.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const threadColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!threadColumns.some((column) => column.name === "pinned_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN pinned_at TEXT
    `;
  }

  const authSessionColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(auth_sessions)
  `;

  if (!authSessionColumns.some((column) => column.name === "client_surface")) {
    yield* sql`
      ALTER TABLE auth_sessions
      ADD COLUMN client_surface TEXT
    `;
  }

  if (!authSessionColumns.some((column) => column.name === "client_app_version")) {
    yield* sql`
      ALTER TABLE auth_sessions
      ADD COLUMN client_app_version TEXT
    `;
  }

  yield* sql`
    UPDATE projection_threads
    SET latest_turn_id = (
      SELECT turns.turn_id
      FROM projection_turns turns
      WHERE turns.thread_id = projection_threads.thread_id
        AND turns.turn_id IS NOT NULL
      ORDER BY turns.requested_at DESC, turns.row_id DESC
      LIMIT 1
    )
    WHERE projection_threads.latest_turn_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM projection_turns turns
        WHERE turns.thread_id = projection_threads.thread_id
          AND turns.turn_id IS NOT NULL
      )
  `;
});
