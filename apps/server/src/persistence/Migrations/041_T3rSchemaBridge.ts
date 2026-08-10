import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * T3r shipped a private migration 36 before upstream assigned that number to
 * thread pinning. Existing T3r databases therefore skip upstream migration 36
 * when they advance through 37-40. Reassert both idempotent schema histories at
 * the first unclaimed migration number so upgraded and fresh databases converge.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "pinned_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN pinned_at TEXT
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
