# DSA Practice & Build Activity Log

## [2026-10-06 05:15:19 UTC] refactor(dsa/graphs): optimize Dijkstra shortest path using std::priority_queue

**Module:** `dsa/graphs`  
**Status:** Verified & Compiled  

### Summary
Replaced linear scan for minimum distance vertex with min-heap accumulator, improving complexity from O(V^2) to O((V + E) log V).

```cpp
priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;
pq.push({0, src});
dist[src] = 0;
while (!pq.empty()) {
    int u = pq.top().second;
    pq.pop();
    for (auto& edge : adj[u]) {
        int v = edge.first, weight = edge.second;
        if (dist[v] > dist[u] + weight) {
            dist[v] = dist[u] + weight;
            pq.push({dist[v], v});
        }
    }
}
```
## [2026-10-06 05:15:20 UTC] docs(dsa/readme): update complexity analysis summary for Sorting Algorithms

**Module:** `dsa/readme`  
**Status:** Verified & Compiled  

### Summary
Documented time/space tradeoffs for QuickSort, MergeSort, HeapSort, and Timsort across best, average, and worst cases.

| Algorithm | Best | Average | Worst | Space |
|-----------|------|---------|-------|-------|
| QuickSort | O(N log N) | O(N log N) | O(N^2) | O(log N) |
| MergeSort | O(N log N) | O(N log N) | O(N log N) | O(N) |
| HeapSort | O(N log N) | O(N log N) | O(N log N) | O(1) |
## [2026-10-07 05:15:16 UTC] refactor(dsa/graphs): optimize Dijkstra shortest path using std::priority_queue

**Module:** `dsa/graphs`  
**Status:** Verified & Compiled  

### Summary
Replaced linear scan for minimum distance vertex with min-heap accumulator, improving complexity from O(V^2) to O((V + E) log V).

```cpp
priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;
pq.push({0, src});
dist[src] = 0;
while (!pq.empty()) {
    int u = pq.top().second;
    pq.pop();
    for (auto& edge : adj[u]) {
        int v = edge.first, weight = edge.second;
        if (dist[v] > dist[u] + weight) {
            dist[v] = dist[u] + weight;
            pq.push({dist[v], v});
        }
    }
}
```
## [2026-10-07 05:15:17 UTC] docs(dsa/readme): update complexity analysis summary for Sorting Algorithms

**Module:** `dsa/readme`  
**Status:** Verified & Compiled  

### Summary
Documented time/space tradeoffs for QuickSort, MergeSort, HeapSort, and Timsort across best, average, and worst cases.

| Algorithm | Best | Average | Worst | Space |
|-----------|------|---------|-------|-------|
| QuickSort | O(N log N) | O(N log N) | O(N^2) | O(log N) |
| MergeSort | O(N log N) | O(N log N) | O(N log N) | O(N) |
| HeapSort | O(N log N) | O(N log N) | O(N log N) | O(1) |
## [2026-10-07 05:15:18 UTC] docs(dsa/readme): update complexity analysis summary for Sorting Algorithms

**Module:** `dsa/readme`  
**Status:** Verified & Compiled  

### Summary
Documented time/space tradeoffs for QuickSort, MergeSort, HeapSort, and Timsort across best, average, and worst cases.

| Algorithm | Best | Average | Worst | Space |
|-----------|------|---------|-------|-------|
| QuickSort | O(N log N) | O(N log N) | O(N^2) | O(log N) |
| MergeSort | O(N log N) | O(N log N) | O(N log N) | O(N) |
| HeapSort | O(N log N) | O(N log N) | O(N log N) | O(1) |
