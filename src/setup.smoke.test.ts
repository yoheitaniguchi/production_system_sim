import { describe, expect, it } from "vitest";

// Phase 0：vitestの疎通確認用スモークテスト。
// Phase 2〜4でsrc/domain/配下にドメインロジックのテストが揃い次第、このファイルは削除する。
describe("Phase 0 smoke test", () => {
  it("vitestが実行できる", () => {
    expect(1 + 1).toBe(2);
  });
});
