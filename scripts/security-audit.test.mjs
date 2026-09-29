import { describe, expect, it } from "vitest";
import { classifyLicense, summarizeAuditReport, summarizeLicenses } from "./security-audit.mjs";

describe("summarizeAuditReport", () => {
  it("[@security] high/criticalが0件ならhasBlockingVulnerabilitiesはfalseになる", () => {
    const result = summarizeAuditReport({
      metadata: { vulnerabilities: { info: 0, low: 1, moderate: 2, high: 0, critical: 0, total: 3 } },
    });
    expect(result).toEqual({ critical: 0, high: 0, moderate: 2, low: 1, info: 0, total: 3, hasBlockingVulnerabilities: false });
  });

  it("[@security] highが1件以上ならhasBlockingVulnerabilitiesはtrueになる", () => {
    const result = summarizeAuditReport({
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 } },
    });
    expect(result.hasBlockingVulnerabilities).toBe(true);
  });

  it("[@security] criticalが1件以上ならhasBlockingVulnerabilitiesはtrueになる", () => {
    const result = summarizeAuditReport({
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 } },
    });
    expect(result.hasBlockingVulnerabilities).toBe(true);
  });

  it("[@security] metadataが無い異常な入力でも例外を投げず全件0として扱う", () => {
    const result = summarizeAuditReport({});
    expect(result).toEqual({ critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0, hasBlockingVulnerabilities: false });
  });
});

describe("classifyLicense", () => {
  it("[@security] MITはpermissive-or-otherに分類される", () => {
    expect(classifyLicense("MIT")).toBe("permissive-or-other");
  });

  it("[@security] GPL-3.0は強いコピーレフトに分類される", () => {
    expect(classifyLicense("GPL-3.0")).toBe("copyleft-strong");
  });

  it("[@security] AGPL-3.0は強いコピーレフトに分類される", () => {
    expect(classifyLicense("AGPL-3.0-only")).toBe("copyleft-strong");
  });

  it("[@security] LGPL系も強いコピーレフトに分類される", () => {
    expect(classifyLicense("LGPL-2.1")).toBe("copyleft-strong");
  });

  it("[@security] 空文字・未定義はunknownに分類される（未検証で見過ごさない）", () => {
    expect(classifyLicense("")).toBe("unknown");
    expect(classifyLicense(undefined)).toBe("unknown");
  });
});

describe("summarizeLicenses", () => {
  it("[@security] 分類ごとに件数・要注意パッケージ一覧を集計する", () => {
    const records = [
      { name: "react", version: "18.3.1", license: "MIT" },
      { name: "some-gpl-lib", version: "1.0.0", license: "GPL-3.0" },
      { name: "unlicensed-lib", version: "0.0.1", license: undefined },
    ];
    const summary = summarizeLicenses(records);
    expect(summary["permissive-or-other"]).toBe(1);
    expect(summary["copyleft-strong"]).toEqual([{ name: "some-gpl-lib", version: "1.0.0", license: "GPL-3.0" }]);
    expect(summary.unknown).toEqual([{ name: "unlicensed-lib", version: "0.0.1", license: undefined }]);
  });
});
