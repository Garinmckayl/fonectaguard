import { describe, it, expect } from "vitest";
import { updateHtml, sameSite } from "@/lib/github";
import { extractFromHtml } from "@/lib/extract";
import { parseHours } from "@/lib/normalize";

const PAGE = `<html><script type="application/ld+json">{"@type":"Cafe","name":"A","telephone":"+358 9 1","address":{"streetAddress":"X 1","addressLocality":"Helsinki"},"openingHours":["Mo-Fr 08:00-17:00"]}</script><dd id="phone">+358 9 1</dd></html>`;

describe("github connector helpers", () => {
  it("rewrites JSON-LD and the visible element so the live page re-extracts the new value", () => {
    const out = updateHtml(PAGE, "phone", "+358 9 555 0142")!;
    expect(extractFromHtml(out, "https://x.test")!.phone!.raw).toBe("+358 9 555 0142");
    expect(out).toContain('<dd id="phone">+358 9 555 0142</dd>');
  });
  it("returns null when the page has no JSON-LD", () => {
    expect(updateHtml("<html></html>", "phone", "1")).toBeNull();
  });
  it("parses schema.org day abbreviations (Mo-Fr, Sa)", () => {
    expect(parseHours("Mo-Fr 08:00-17:00; Sa 09:00-16:00")).toMatchObject({ mon: "08:00-17:00", fri: "08:00-17:00", sat: "09:00-16:00", sun: "closed" });
  });
  it("binds a repo's Pages URL to the business website", () => {
    expect(sameSite("https://u.github.io/shop/", "https://u.github.io/shop")).toBe(true);
    expect(sameSite("https://u.github.io/shop/", "https://u.github.io/other")).toBe(false);
  });
});

import { platformForUrl, connectorInfo } from "@/lib/connectors";
describe("directory platform recognition", () => {
  it("maps real directory URLs to platforms with a manual-submission path, and leaves other pages as generic web", () => {
    expect(platformForUrl("https://www.fonecta.fi/yritykset/aurora")).toBe("fonecta");
    expect(platformForUrl("https://www.finder.fi/Kahvilat/Aurora")).toBe("finder");
    expect(platformForUrl("https://www.google.com/maps/place/Aurora")).toBe("google");
    expect(platformForUrl("https://sites.google.com/view/aurora")).toBe("web");
    expect(platformForUrl("https://www.yelp.com/biz/aurora")).toBe("yelp");
    expect(platformForUrl("https://blog.example.org/aurora")).toBe("web");
    expect(connectorInfo("fonecta")).toMatchObject({ state: "manual_approval_link", capabilities: ["read"] });
  });
});
