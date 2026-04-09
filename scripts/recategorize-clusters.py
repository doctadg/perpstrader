#!/usr/bin/env python3
"""Recategorize clusters based on majority article category."""
import sqlite3, time
from collections import defaultdict, Counter

db = sqlite3.connect('/home/d/PerpsTrader/data/news.db')
db.row_factory = sqlite3.Row

print("Computing majority categories...")
cur = db.execute("""
    SELECT ca.cluster_id, TRIM(REPLACE(na.categories_flat, '|', ' ')) as article_cat, COUNT(*) as cnt
    FROM cluster_articles ca
    JOIN news_articles na ON ca.article_id = na.id
    GROUP BY ca.cluster_id, na.categories_flat
""")

cluster_cats = defaultdict(lambda: defaultdict(int))
for row in cur:
    cid = row['cluster_id']
    cat = row['article_cat'].strip()
    if cat:
        cluster_cats[cid][cat] += row['cnt']

print(f"Computed categories for {len(cluster_cats)} clusters")

fixes = []
for cid, cats in cluster_cats.items():
    if not cats:
        continue
    majority_cat = max(cats, key=cats.get)
    total = sum(cats.values())
    majority_pct = cats[majority_cat] / total
    
    if majority_pct >= 0.6:
        row = db.execute("SELECT category FROM story_clusters WHERE id = ?", (cid,)).fetchone()
        if row and row['category'] != majority_cat:
            fixes.append((cid, row['category'], majority_cat, majority_pct, total))

print(f"Found {len(fixes)} clusters to recategorize")

transitions = Counter()
for _, old_cat, new_cat, _, _ in fixes:
    transitions[(old_cat, new_cat)] += 1

for (old, new), cnt in sorted(transitions.items(), key=lambda x: -x[1]):
    print(f"  {old} -> {new}: {cnt} clusters")

now = time.strftime('%Y-%m-%dT%H:%M:%SZ')
for cid, _, new_cat, _, _ in fixes:
    db.execute(
        "UPDATE story_clusters SET category = ?, is_cross_category = 1, updated_at = ? WHERE id = ?",
        (new_cat, now, cid)
    )

db.commit()
print(f"Updated {len(fixes)} clusters")
db.close()
