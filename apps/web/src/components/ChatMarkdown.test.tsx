import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

let ChatMarkdown: typeof import("./ChatMarkdown").default;

beforeAll(async () => {
  const storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
  const classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };

  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    desktopBridge: undefined,
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList,
      offsetHeight: 0,
    },
  });

  ({ default: ChatMarkdown } = await import("./ChatMarkdown"));
}, 30_000);

describe("ChatMarkdown", () => {
  it("renders angle-bracketed file destinations containing spaces as interactive file links", () => {
    const cwd = "/Users/ryan/Library/Mobile Documents/project";
    const markup = renderToStaticMarkup(
      <ChatMarkdown text={`[Open AGENTS.md](<${cwd}/AGENTS.md:1>)`} cwd={cwd} />,
    );

    expect(markup).toContain("chat-markdown-file-link");
    expect(markup).toContain("AGENTS.md");
    expect(markup).toContain("L1");
  });
});
