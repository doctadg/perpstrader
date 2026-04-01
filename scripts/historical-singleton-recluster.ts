/**
 * Historical Singleton Re-clustering Script v2
 * 
 * Merges old singleton clusters (>48h) into multi-article clusters.
 * Uses entity overlap + topic similarity to avoid false merges from generic entities.
 * 
 * Key insight: Generic entities (Bitcoin, Fed, Iran) appear in hundreds of clusters.
 * We need keyword/topic overlap ON TOP of entity overlap to ensure true semantic match.
 * 
 * Run: npx ts-node scripts/historical-singleton-recluster.ts
 * Test: DRY_RUN=true npx ts-node scripts/historical-singleton-recluster.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');
const db = new Database(DB_PATH, { readonly: false });

const DRY_RUN = process.env.DRY_RUN === 'true';

// Entities that are too generic to merge on alone — need additional signals
const GENERIC_ENTITIES = new Set([
    'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol',
    'fed', 'federal reserve', 'sec', 'treasury',
    'trump', 'donald trump',
    'iran', 'china', 'russia', 'europe', 'usa', 'uk', 'singapore', 'germany',
    'nvidia', 'apple', 'google', 'microsoft', 'amazon', 'meta', 'tesla',
    'gold', 'silver',
    'link', 'chainlink', 'comp', 'compound',  // Too often matches non-crypto "Link" / "Compound"
    'mas', 'master', 'masters',  // Garbage entity — "Masters" from golf etc.
]);

// Token alias map
const TOKEN_ALIASES = new Map<string, string>([
    ['btc', 'bitcoin'], ['eth', 'ethereum'], ['sol', 'solana'], ['bnb', 'binance'],
    ['xrp', 'ripple'], ['ada', 'cardano'], ['doge', 'dogecoin'], ['shib', 'shiba inu'],
    ['avax', 'avalanche'], ['matic', 'polygon'], ['dot', 'polkadot'], ['link', 'chainlink'],
    ['uni', 'uniswap'], ['ftm', 'fantom'], ['arb', 'arbitrum'], ['op', 'optimism'],
    ['near', 'near protocol'], ['atom', 'cosmos'], ['trx', 'tron'], ['xlm', 'stellar'],
    ['algo', 'algorand'], ['inj', 'injective'], ['tia', 'celestia'], ['jup', 'jupiter'],
    ['sui', 'sui'], ['sei', 'sei'], ['ton', 'ton'], ['apt', 'aptos'],
    ['hbar', 'hedera'], ['ena', 'ethena'], ['eigen', 'eigenlayer'], ['pendle', 'pendle'],
    ['aave', 'aave'], ['mkr', 'maker'], ['ldo', 'lido'], ['rpl', 'rocket pool'],
    ['far', 'fartcoin'], ['fartcoin', 'far'],
    ['wif', 'dogwifhat'], ['pengu', 'pudgy penguins'],
    ['ltc', 'litecoin'], ['strk', 'starknet'], ['wld', 'worldcoin'],
    ['pepe', 'pepe'], ['bonk', 'bonk'], ['floki', 'floki'],
    ['hype', 'hyperliquid'], ['comp', 'compound'], ['crv', 'curve'],
    ['snx', 'synthetix'], ['yfi', 'yearn finance'],
    ['trump', 'donald trump'],
    ['usa', 'united states'],
]);

const resolveToken = (s: string) => TOKEN_ALIASES.get(s.toLowerCase()) || s.toLowerCase();

// Simple Jaccard similarity for two sets
function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const x of a) if (b.has(x)) intersection++;
    return intersection / (a.size + b.size - intersection);
}

function main() {
    console.log(`=== Historical Singleton Re-clustering v2 ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

    // ============================================================
    // Phase 0: Clean up ghost clusters and fix count mismatches
    // ============================================================
    console.log('\n--- Phase 0: Data integrity cleanup ---');

    const ghostCount = db.prepare(`
        SELECT COUNT(*) as c FROM story_clusters sc
        WHERE sc.article_count > 0 
        AND NOT EXISTS (SELECT 1 FROM cluster_articles ca WHERE ca.cluster_id = sc.id)
    `).get() as any;
    console.log(`Ghost clusters (count>0 but no articles): ${ghostCount.c}`);

    if (ghostCount.c > 0 && !DRY_RUN) {
        // Get IDs before deleting
        const ghostIds = db.prepare(`
            SELECT id FROM story_clusters sc
            WHERE sc.article_count > 0 
            AND NOT EXISTS (SELECT 1 FROM cluster_articles ca WHERE ca.cluster_id = sc.id)
        `).all() as any[];

        const deleteGhost = db.prepare(`DELETE FROM story_clusters WHERE id = ?`);
        const deleteGhostECL = db.prepare(`DELETE FROM entity_cluster_links WHERE cluster_id = ?`);
        const deleteGhostCHR = db.prepare(`DELETE FROM cluster_cross_refs WHERE source_cluster_id = ? OR target_cluster_id = ?`);
        const deleteGhostHH = db.prepare(`DELETE FROM cluster_heat_history WHERE cluster_id = ?`);

        for (const g of ghostIds) {
            deleteGhost.run(g.id);
            deleteGhostECL.run(g.id);
            deleteGhostCHR.run(g.id, g.id);
            deleteGhostHH.run(g.id);
        }
        console.log(`Deleted ${ghostIds.length} ghost clusters`);
    }

    // Fix count mismatches
    const mismatches = db.prepare(`
        UPDATE story_clusters SET article_count = (
            SELECT COUNT(*) FROM cluster_articles ca WHERE ca.cluster_id = story_clusters.id
        )
        WHERE article_count != (
            SELECT COUNT(*) FROM cluster_articles ca WHERE ca.cluster_id = story_clusters.id
        )
    `).run();
    console.log(`Fixed ${mismatches.changes} count mismatches`);

    // Re-count singletons after cleanup
    const singletonCount = (db.prepare(`SELECT COUNT(*) as c FROM story_clusters WHERE article_count = 1`).get() as any).c;
    console.log(`Singletons after cleanup: ${singletonCount}`);

    const singletons = db.prepare(`
        SELECT sc.id, sc.topic, sc.category, sc.keywords, sc.article_count, sc.heat_score, sc.created_at
        FROM story_clusters sc
        WHERE sc.article_count = 1
        AND EXISTS (SELECT 1 FROM cluster_articles ca WHERE ca.cluster_id = sc.id)
    `).all() as any[];

    const multiClusters = db.prepare(`
        SELECT mc.id, mc.topic, mc.category, mc.keywords, mc.article_count, mc.heat_score
        FROM story_clusters mc
        WHERE mc.article_count >= 2
        AND EXISTS (SELECT 1 FROM cluster_articles ca WHERE ca.cluster_id = mc.id)
        ORDER BY mc.heat_score DESC
    `).all() as any[];

    console.log(`Singletons: ${singletons.length}, Multi: ${multiClusters.length}`);

    // Load entity links
    const entityLinks = db.prepare(`SELECT cluster_id, entity_id FROM entity_cluster_links`).all() as any[];
    const entityNames = db.prepare(`SELECT id, entity_name FROM named_entities`).all() as any[];
    const entityIdToName = new Map<number, string>();
    for (const e of entityNames) entityIdToName.set(e.id, e.entity_name.toLowerCase());

    const clusterEntities = new Map<string, Set<string>>();
    for (const link of entityLinks) {
        const name = entityIdToName.get(link.entity_id);
        if (!name) continue;
        if (!clusterEntities.has(link.cluster_id)) clusterEntities.set(link.cluster_id, new Set());
        clusterEntities.get(link.cluster_id)!.add(resolveToken(name));
    }

    // Build inverted indexes on multi-clusters
    const entityIndex = new Map<string, number[]>();
    const kwIndex = new Map<string, number[]>();

    // Filter out garbage clusters (too many entity links = bad data)
    const clusterEntityCounts = new Map<string, number>();
    const rawCounts = db.prepare(`SELECT cluster_id, COUNT(*) as cnt FROM entity_cluster_links GROUP BY cluster_id`).all() as any[];
    for (const r of rawCounts) clusterEntityCounts.set(r.cluster_id, r.cnt);

    const MAX_ENTITY_LINKS = 10; // Clusters with more are likely garbage

    const targetData = multiClusters
        .filter(t => (clusterEntityCounts.get(t.id) || 0) <= MAX_ENTITY_LINKS)
        .map((t, idx) => {
        const entities = clusterEntities.get(t.id) || new Set();
        const kws = new Set(
            (JSON.parse(t.keywords || '[]') as string[])
                .map((k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, ''))
                .filter((k: string) => k.length >= 3)
        );
        const topicWords = new Set(
            (t.topic || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
        );

        for (const e of entities) {
            if (!entityIndex.has(e)) entityIndex.set(e, []);
            entityIndex.get(e)!.push(idx);
        }
        for (const kw of kws) {
            if (!kwIndex.has(kw)) kwIndex.set(kw, []);
            kwIndex.get(kw)!.push(idx);
        }

        return { cluster: t, entitySet: entities, kwSet: kws, topicWords };
    });

    const mergedAway = new Set<string>();
    let mergedCount = 0;
    let noCandidate = 0;
    let tooGeneric = 0;
    let belowThreshold = 0;

    for (const singleton of singletons) {
        if (mergedAway.has(singleton.id)) continue;

        // Skip garbage clusters with too many entity links
        if ((clusterEntityCounts.get(singleton.id) || 0) > MAX_ENTITY_LINKS) {
            noCandidate++;
            continue;
        }

        const sEntities = clusterEntities.get(singleton.id) || new Set();
        const sKws = new Set(
            (JSON.parse(singleton.keywords || '[]') as string[])
                .map((k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, ''))
                .filter((k: string) => k.length >= 3)
        );
        const sTopicWords = new Set(
            (singleton.topic || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
        );
        const sCat = singleton.category || 'UNKNOWN';

        // Find candidates
        const candidateIdx = new Set<number>();
        for (const e of sEntities) {
            const idxs = entityIndex.get(e);
            if (idxs) for (const i of idxs) candidateIdx.add(i);
        }
        if (candidateIdx.size === 0) {
            for (const kw of sKws) {
                const idxs = kwIndex.get(kw);
                if (idxs) for (const i of idxs) candidateIdx.add(i);
            }
        }
        if (candidateIdx.size === 0) { noCandidate++; continue; }

        let bestTarget: any = null;
        let bestScore = 0;

        for (const idx of candidateIdx) {
            const td = targetData[idx];
            if (td.cluster.id === singleton.id) continue;
            if (mergedAway.has(td.cluster.id)) continue;
            if (td.cluster.article_count >= 500) continue;

            const sharedEntities = [...sEntities].filter(e => td.entitySet.has(e) && e.length >= 2);
            const specificEntities = sharedEntities.filter(e => !GENERIC_ENTITIES.has(e));
            const genericEntities = sharedEntities.filter(e => GENERIC_ENTITIES.has(e));
            const sharedKw = [...sKws].filter(k => td.kwSet.has(k));
            const kwJaccard = jaccard(sKws, td.kwSet);

            let score = 0;

            if (specificEntities.length >= 1) {
                // Specific entity — requires keyword confirmation for safety
                const sameCat = sCat === td.cluster.category;
                if (specificEntities.length >= 2 || (specificEntities.length >= 1 && kwJaccard > 0.10)) {
                    score = 0.60 + specificEntities.length * 0.08;
                    if (sameCat) score += 0.05;
                    if (genericEntities.length >= 1) score += 0.03;
                } else {
                    // Single specific entity but no keyword overlap — too risky
                    belowThreshold++;
                    continue;
                }
            } else if (genericEntities.length >= 4) {
                // 4+ generic entities — extremely likely same topic
                const sameCat = sCat === td.cluster.category;
                if (sameCat && kwJaccard > 0.20) {
                    score = 0.55 + genericEntities.length * 0.02;
                }
            } else {
                // Not enough signal
                tooGeneric++;
                continue;
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = td.cluster;
            }
        }

        // Thresholds
        const MERGE_THRESHOLD = 0.70;
        if (!bestTarget || bestScore < MERGE_THRESHOLD) { belowThreshold++; continue; }

        if (DRY_RUN) {
            mergedCount++;
            if (mergedCount <= 30) {
                console.log(`[${mergedCount}] score=${bestScore.toFixed(2)} | "${singleton.topic?.slice(0, 55)}" -> "${bestTarget.topic?.slice(0, 55)}"`);
            }
        } else {
            try {
                const srcExists = db.prepare(`SELECT id FROM story_clusters WHERE id = ?`).get(singleton.id);
                const tgtExists = db.prepare(`SELECT id FROM story_clusters WHERE id = ?`).get(bestTarget.id);
                if (!srcExists || !tgtExists) continue;

                const moved = db.prepare(`UPDATE cluster_articles SET cluster_id = ? WHERE cluster_id = ?`).run(bestTarget.id, singleton.id).changes;
                if (moved > 0) {
                    const targetInfo = db.prepare(`SELECT article_count FROM story_clusters WHERE id = ?`).get(bestTarget.id) as any;
                    db.prepare(`UPDATE story_clusters SET article_count = ?, updated_at = datetime('now') WHERE id = ?`)
                        .run((targetInfo?.article_count || 0) + moved, bestTarget.id);
                    try {
                        db.prepare(`INSERT OR IGNORE INTO cluster_hierarchy (parent_cluster_id, child_cluster_id, relationship_type, created_at) VALUES (?, ?, 'MERGED_INTO', datetime('now'))`)
                            .run(bestTarget.id, singleton.id);
                    } catch (hierErr: any) {
                        console.error(`Hierarchy insert failed: ${hierErr.message}`);
                    }
                    // Move entity links — handle UNIQUE constraint by deleting target's existing links for same entities first
                    const sourceEntities = db.prepare(`SELECT entity_id FROM entity_cluster_links WHERE cluster_id = ?`).all(singleton.id) as any[];
                    for (const se of sourceEntities) {
                        db.prepare(`DELETE FROM entity_cluster_links WHERE entity_id = ? AND cluster_id = ?`).run(se.entity_id, bestTarget.id);
                    }
                    db.prepare(`UPDATE entity_cluster_links SET cluster_id = ? WHERE cluster_id = ?`).run(bestTarget.id, singleton.id);
                    db.prepare(`DELETE FROM story_clusters WHERE id = ?`).run(singleton.id);
                    db.prepare(`DELETE FROM entity_cluster_links WHERE cluster_id = ?`).run(singleton.id);
                    db.prepare(`DELETE FROM cluster_cross_refs WHERE source_cluster_id = ? OR target_cluster_id = ?`).run(singleton.id, singleton.id);
                    db.prepare(`DELETE FROM cluster_heat_history WHERE cluster_id = ?`).run(singleton.id);

                    mergedCount++;
                    mergedAway.add(singleton.id);
                    if (mergedCount <= 20) {
                        console.log(`[${mergedCount}] score=${bestScore.toFixed(2)} | "${singleton.topic?.slice(0, 55)}" -> "${bestTarget.topic?.slice(0, 55)}"`);
                    }
                }
            } catch (e: any) {
                console.error(`Merge failed: ${e.message}`);
            }
        }
    }

    console.log(`\n=== Results ===`);
    console.log(`Merged: ${mergedCount}`);
    console.log(`No candidate: ${noCandidate}`);
    console.log(`Too generic: ${tooGeneric}`);
    console.log(`Below threshold: ${belowThreshold}`);

    const fs = (db.prepare(`SELECT COUNT(*) as c FROM story_clusters WHERE article_count = 1`).get() as any).c;
    const ft = (db.prepare(`SELECT COUNT(*) as c FROM story_clusters`).get() as any).c;
    console.log(`\nSingleton rate: ${(fs / ft * 100).toFixed(1)}% (${fs}/${ft})`);

    db.close();
}

main();
