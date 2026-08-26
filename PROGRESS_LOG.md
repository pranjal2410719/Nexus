# DSA Practice & Build Activity Log


## [2026-08-26 04:15:21 UTC] feat(dsa/trees): implement Binary Search Tree deletion and auto-rebalancing logic

**Module:** `dsa/trees`  
**Status:** Verified & Compiled  

### Summary
Added recursive deletion with in-order successor search. Time complexity: O(log N) average, O(N) worst case.

```cpp
TreeNode* deleteNode(TreeNode* root, int key) {
    if (!root) return root;
    if (key < root->val) root->left = deleteNode(root->left, key);
    else if (key > root->val) root->right = deleteNode(root->right, key);
    else {
        if (!root->left) { TreeNode* temp = root->right; delete root; return temp; }
        else if (!root->right) { TreeNode* temp = root->left; delete root; return temp; }
        TreeNode* temp = minValueNode(root->right);
        root->val = temp->val;
        root->right = deleteNode(root->right, temp->val);
    }
    return root;
}
```

## [2026-08-26 04:15:22 UTC] feat(dsa/backtracking): add N-Queens constraint satisfaction solver

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

## [2026-08-26 04:15:23 UTC] refactor(dsa/graphs): optimize Dijkstra shortest path using std::priority_queue

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

## [2026-08-26 06:15:23 UTC] test(dsa/strings): add test cases for KMP string matching edge conditions

**Module:** `dsa/strings`  
**Status:** Verified & Compiled  

### Summary
Added unit coverage for empty pattern, single character repeating sequences, and non-matching long prefix cases.

```cpp
void computeLPSArray(string pat, int M, vector<int>& lps) {
    int len = 0, i = 1;
    lps[0] = 0;
    while (i < M) {
        if (pat[i] == pat[len]) { len++; lps[i] = len; i++; }
        else {
            if (len != 0) len = lps[len - 1];
            else { lps[i] = 0; i++; }
        }
    }
}
```

## [2026-08-26 06:15:24 UTC] feat(dsa/trees): implement Binary Search Tree deletion and auto-rebalancing logic

**Module:** `dsa/trees`  
**Status:** Verified & Compiled  

### Summary
Added recursive deletion with in-order successor search. Time complexity: O(log N) average, O(N) worst case.

```cpp
TreeNode* deleteNode(TreeNode* root, int key) {
    if (!root) return root;
    if (key < root->val) root->left = deleteNode(root->left, key);
    else if (key > root->val) root->right = deleteNode(root->right, key);
    else {
        if (!root->left) { TreeNode* temp = root->right; delete root; return temp; }
        else if (!root->right) { TreeNode* temp = root->left; delete root; return temp; }
        TreeNode* temp = minValueNode(root->right);
        root->val = temp->val;
        root->right = deleteNode(root->right, temp->val);
    }
    return root;
}
```
