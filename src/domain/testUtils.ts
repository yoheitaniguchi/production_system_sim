// テスト用の初期状態生成。reducer.tsのcreateInitialState()（day=0固定）に、
// テストで必要な開始日を指定できるようにした薄いラッパー。
import { createInitialState } from "./reducer";
import type { SimulationState } from "../types";

export function createTestState(day = 0): SimulationState {
  const state = createInitialState();
  state.day = day;
  return state;
}
