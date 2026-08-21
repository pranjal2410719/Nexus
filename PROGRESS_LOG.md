# DSA Practice & Build Activity Log


## [2026-08-21 03:15:11 UTC] feat(dsa/backtracking): add N-Queens constraint satisfaction solver

**Module:** `dsa/backtracking`  
**Status:** Verified & Compiled  

### Summary
Implemented backtracking solution with bitmasking optimization for diagonal collision detection.

```cpp
void solveNQueens(int row, int n, int& count, int cols, int diag1, int diag2) {
    if (row == n) { count++; return; }
    int availablePositions = ((1 << n) - 1) & ~(cols | diag1 | diag2);
    while (availablePositions) {
        int p = availablePositions & -availablePositions;
        availablePositions -= p;
        solveNQueens(row + 1, n, count, cols | p, (diag1 | p) << 1, (diag2 | p) >> 1);
    }
}
```

## [2026-08-21 04:15:28 UTC] refactor(dsa/graphs): optimize Dijkstra shortest path using std::priority_queue

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

## [2026-08-21 04:15:28 UTC] refactor(dsa/graphs): optimize Dijkstra shortest path using std::priority_queue

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

## [2026-08-21 04:15:29 UTC] fix(dsa/dp): resolve index out of bounds in Knapsack 0/1 dynamic programming table initialization

**Module:** `dsa/dp`  
**Status:** Verified & Compiled  

### Summary
Fixed table dimensions `dp[N+1][W+1]` allocation to prevent Segmentation Fault when `W == capacity`.

```cpp
vector<vector<int>> dp(n + 1, vector<int>(W + 1, 0));
for (int i = 1; i <= n; i++) {
    for (int w = 1; w <= W; w++) {
        if (weights[i-1] <= w)
            dp[i][w] = max(values[i-1] + dp[i-1][w-weights[i-1]], dp[i-1][w]);
        else
            dp[i][w] = dp[i-1][w];
    }
}
```

## [2026-08-21 06:15:21 UTC] fix(dsa/dp): resolve index out of bounds in Knapsack 0/1 dynamic programming table initialization

**Module:** `dsa/dp`  
**Status:** Verified & Compiled  

### Summary
Fixed table dimensions `dp[N+1][W+1]` allocation to prevent Segmentation Fault when `W == capacity`.

```cpp
vector<vector<int>> dp(n + 1, vector<int>(W + 1, 0));
for (int i = 1; i <= n; i++) {
    for (int w = 1; w <= W; w++) {
        if (weights[i-1] <= w)
            dp[i][w] = max(values[i-1] + dp[i-1][w-weights[i-1]], dp[i-1][w]);
        else
            dp[i][w] = dp[i-1][w];
    }
}
```
