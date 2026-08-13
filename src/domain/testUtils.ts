// テスト用の初期状態生成（Phase 3でreducer.tsのcreateInitialState()に統合する想定の暫定ヘルパー）
import {
  initialBom,
  initialCustomers,
  initialItems,
  initialRoutingSteps,
  initialSuppliers,
} from "../data/masterData";
import type { SimulationState } from "../types";

export function createTestState(day = 0): SimulationState {
  return {
    day,
    items: structuredClone(initialItems),
    bom: structuredClone(initialBom),
    routingSteps: structuredClone(initialRoutingSteps),
    customers: structuredClone(initialCustomers),
    suppliers: structuredClone(initialSuppliers),
    salesOrders: [],
    soLines: [],
    plannedOrders: [],
    mfgOrders: [],
    workInstructions: [],
    purchaseOrders: [],
    stocks: [],
    stockTxns: [],
    shipments: [],
    eventLog: [],
    nextSoSeq: 1,
    nextMoSeq: 1,
    nextPoSeq: 1,
    nextTxnSeq: 1,
    nextShipSeq: 1,
  };
}
