// テスト名の先頭に付ける印（タグ）が docs/test-tagging.md の書式どおりかを検査する。
//
// aggregate-test-results.mjs の TAG_PATTERN は、CIの結果から印を「寛容に」抜き出すためのもの。
// 本モジュールはその逆で、書く側（src/配下のテスト）が書式から外れていないかを「厳密に」確かめる。
// 区分の値（工程・テストの種類・観点）の一覧は docs/test-tagging.md と同じものを持つ。
// 自動テスト管理アプリが印を分類するときの値の検査（「印の誤り」の判定）にも流用できるよう、
// 検査ロジックは純粋関数として export する。

import ts from "typescript";

export const PHASES = ["単体", "結合", "総合"];
export const TEST_TYPES = [
  "機能テスト",
  "性能テスト",
  "ユーザビリティテスト",
  "セキュリティテスト",
  "リグレッションテスト",
  "構成テスト",
  "シナリオテスト",
  "ロングランテスト",
  "負荷テスト",
  "ストレステスト",
  "静的解析",
  "レビュー",
  "画面部品テスト",
  "E2Eテスト",
  "スモークテスト",
  "確認テスト",
];
export const VIEWPOINTS = ["正常", "異常", "境界"];
// docs/v5-spec.md §8.2 のUC-01〜23
export const UC_MAX = 23;

// 先頭の [UC-xx]（任意）[工程][テストの種類][観点]（任意）と、その直後の空白
const LEADING_TAG = /^(?:\[(UC-[^\]]*)\])?\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?(?= )/;

// テスト名（it/testの第1引数）の印を検査し、誤りの説明を配列で返す（誤りが無ければ空配列）
export function validateTagTitle(title) {
  const match = LEADING_TAG.exec(title);
  if (!match) {
    return ["先頭に[工程][テストの種類]以上の印と、その後の空白が無い"];
  }
  const [, uc, phase, testType, viewpoint] = match;
  const errors = [];
  if (uc !== undefined) {
    const ids = uc.split("/");
    for (const id of ids) {
      const num = /^UC-(\d{2})$/.exec(id);
      if (!num || Number(num[1]) < 1 || Number(num[1]) > UC_MAX) {
        errors.push(`UC番号「${id}」がUC-01〜UC-${UC_MAX}の形式でない`);
      }
    }
  }
  if (!PHASES.includes(phase)) errors.push(`工程「${phase}」が${PHASES.join("／")}のいずれでもない`);
  if (!TEST_TYPES.includes(testType)) errors.push(`テストの種類「${testType}」が定義済みの16種類に無い`);
  if (viewpoint !== undefined && !VIEWPOINTS.includes(viewpoint)) {
    errors.push(`観点「${viewpoint}」が${VIEWPOINTS.join("／")}のいずれでもない`);
  }
  return errors;
}

const TEST_FUNCTIONS = new Set(["it", "test"]);

// 呼び出し先が it / test / it.skip などの修飾付き / it.each(...) のいずれかか
function isTestCallee(expr) {
  if (ts.isIdentifier(expr)) return TEST_FUNCTIONS.has(expr.text);
  if (ts.isPropertyAccessExpression(expr)) return isTestCallee(expr.expression);
  if (ts.isCallExpression(expr)) return isTestCallee(expr.expression); // it.each([...])("名前", ...)
  return false;
}

function titleText(arg) {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    return arg.head.text + arg.templateSpans.map((span) => "${}" + span.literal.text).join("");
  }
  return null; // 変数など、静的に読めない名前は検査対象外
}

// ソースコードから it()/test() のテスト名と行番号を集める（describe()は対象外。docs/test-tagging.md）
export function collectTestTitles(sourceText, fileName = "test.ts") {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const titles = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && isTestCallee(node.expression) && node.arguments.length > 0) {
      // it.each([...]) 自体（第1引数が配列）は拾わず、その戻り値の呼び出し側で拾う
      const title = titleText(node.arguments[0]);
      if (title !== null) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        titles.push({ title, line: line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return titles;
}
