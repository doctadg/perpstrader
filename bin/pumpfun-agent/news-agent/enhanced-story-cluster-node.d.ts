import { HeatPrediction } from './heat-predictor';
import { NewsItem } from '../../shared/types';
import { EntityHeat } from '../../shared/types-enhanced';
export interface EnhancedClusteringState {
    currentStep?: string;
    anomalies?: any[];
    predictions?: any[];
    trendingEntities?: any[];
    categorizedNews: NewsItem[];
    clusters: any[];
    stats: {
        totalProcessed: number;
        newClusters: number;
        existingClusters: number;
        mergedClusters: number;
        entitiesExtracted: number;
        anomaliesDetected: number;
        predictionsGenerated: number;
        titleClustersCreated: number;
        semanticMatches: number;
    };
    thoughts: string[];
    errors: string[];
}
export interface ClusteringResult {
    clusters: any[];
    stats: EnhancedClusteringState['stats'];
    anomalies: any[];
    predictions: HeatPrediction[];
    trendingEntities: EntityHeat[];
}
/**
 * Enhanced story clustering with improved title clustering
 */
export declare function enhancedStoryClusterNode(state: any): Promise<Partial<EnhancedClusteringState>>;
export default enhancedStoryClusterNode;
//# sourceMappingURL=enhanced-story-cluster-node.d.ts.map