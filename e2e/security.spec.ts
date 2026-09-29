import { expect, test } from "@playwright/test";

// SEC-003（docs/security/reports参照）：src/theme.tsのloadStoredTheme()はwindow.localStorage.getItem()を
// try/catchで保護しておらず、App.tsxはこれをuseStateの初期化関数として呼ぶ（src/App.tsx:51）。
// またこのアプリにはError Boundary（componentDidCatch/getDerivedStateFromError）が1つも無い
// （src/main.tsx参照）。localStorageへのアクセスがブロックされる環境（プライバシー設定・一部ブラウザの
// 設定・組織のポリシー等）では、初回描画の時点で例外が発生し、復旧手段の無い白画面になる。
test.describe("ストレージアクセス不能時の挙動（SEC-003）", () => {
  test("[@security] localStorageへのアクセスが例外を投げても、白画面のまま固まらない", async ({ page }) => {
    // 実ブラウザでlocalStorageがブロックされている状況（プライベートブラウジング設定・組織ポリシー等）を
    // 再現する。window.localStorageへのアクセス自体が例外を投げるようにする。
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
    });

    await page.goto("/");

    // 安全な実装であれば、エラー画面や最低限のメッセージ等、何らかの内容が表示されるはず。
    // 現状はError Boundaryが無いため、bodyの中身が空（真っ白）になる＝このテストは失敗する。
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length, "body innerTextが空＝白画面のまま固まっている").toBeGreaterThan(0);
  });
});
