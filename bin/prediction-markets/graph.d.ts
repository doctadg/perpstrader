import { PredictionAgentState, createInitialPredictionState } from './state';
export { PredictionAgentState, createInitialPredictionState };
export declare class PredictionOrchestrator {
    invoke(initialState: PredictionAgentState): Promise<PredictionAgentState>;
}
export declare function buildPredictionGraph(): PredictionOrchestrator;
export declare function runPredictionCycle(): Promise<PredictionAgentState>;
export default buildPredictionGraph;
//# sourceMappingURL=graph.d.ts.map