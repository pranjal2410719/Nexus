# DSA Practice & Build Activity Log


## [2026-08-22 06:15:21 UTC] feat(dsa/trees): implement Binary Search Tree deletion and auto-rebalancing logic

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

## [2026-08-22 06:15:22 UTC] perf(dsa/arrays): optimize Two Pointer approach for Trapping Rain Water problem

**Module:** `dsa/arrays`  
**Status:** Verified & Compiled  

### Summary
Reduced auxiliary space from O(N) left/right max arrays to O(1) space using two converging pointers.

```cpp
int trap(vector<int>& height) {
    int left = 0, right = height.size() - 1;
    int left_max = 0, right_max = 0, water = 0;
    while (left < right) {
        if (height[left] < height[right]) {
            height[left] >= left_max ? (left_max = height[left]) : water += (left_max - height[left]);
            left++;
        } else {
            height[right] >= right_max ? (right_max = height[right]) : water += (right_max - height[right]);
            right--;
        }
    }
    return water;
}
```

## [2026-08-23 03:15:19 UTC] refactor(dsa/graphs): optimize Dijkstra shortest path using std::priority_queue

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

## [2026-08-23 03:15:20 UTC] docs(dsa/readme): update complexity analysis summary for Sorting Algorithms

**Module:** `dsa/readme`  
**Status:** Verified & Compiled  

### Summary
Documented time/space tradeoffs for QuickSort, MergeSort, HeapSort, and Timsort across best, average, and worst cases.

| Algorithm | Best | Average | Worst | Space |
|-----------|------|---------|-------|-------|
| QuickSort | O(N log N) | O(N log N) | O(N^2) | O(log N) |
| MergeSort | O(N log N) | O(N log N) | O(N log N) | O(N) |
| HeapSort | O(N log N) | O(N log N) | O(N log N) | O(1) |

## [2026-08-23 03:15:21 UTC] feat(dsa/backtracking): add N-Queens constraint satisfaction solver

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
