import { describe, expect, it } from "vite-plus/test";

import {
  buildThreadFlagContextMenuItems,
  isThreadFlagColor,
  parseThreadFlagMenuId,
  sanitizeThreadFlagRecord,
  THREAD_FLAG_COLORS,
} from "./threadFlags";

describe("threadFlags", () => {
  it("accepts only the known palette colors", () => {
    expect(THREAD_FLAG_COLORS).toEqual(["red", "orange", "yellow", "green", "blue", "purple"]);
    expect(isThreadFlagColor("red")).toBe(true);
    expect(isThreadFlagColor("pink")).toBe(false);
    expect(isThreadFlagColor(null)).toBe(false);
  });

  it("sanitizes persisted flag maps", () => {
    expect(
      sanitizeThreadFlagRecord({
        "env:a": "red",
        "env:b": "nope",
        "": "blue",
      }),
    ).toEqual({ "env:a": "red" });
    expect(sanitizeThreadFlagRecord(null)).toEqual({});
  });

  it("builds a submenu with clear when a flag is set", () => {
    const clearMenu = buildThreadFlagContextMenuItems(null);
    expect(clearMenu.children.map((item) => item.id)).toEqual([
      "flag:red",
      "flag:orange",
      "flag:yellow",
      "flag:green",
      "flag:blue",
      "flag:purple",
    ]);

    const flaggedMenu = buildThreadFlagContextMenuItems("green");
    expect(flaggedMenu.children.at(-1)).toEqual({ id: "flag:clear", label: "Clear flag" });
    expect(flaggedMenu.children.find((item) => item.id === "flag:green")?.label).toBe("✓ Green");

    const bulkMenu = buildThreadFlagContextMenuItems(null, { alwaysShowClear: true });
    expect(bulkMenu.children.at(-1)).toEqual({ id: "flag:clear", label: "Clear flag" });
  });

  it("parses context-menu ids back into flag values", () => {
    expect(parseThreadFlagMenuId("flag:red")).toBe("red");
    expect(parseThreadFlagMenuId("flag:clear")).toBe(null);
    expect(parseThreadFlagMenuId("flag:pink")).toBe(undefined);
    expect(parseThreadFlagMenuId("snooze:later")).toBe(undefined);
  });
});
