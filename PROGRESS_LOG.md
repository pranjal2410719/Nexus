# DSA Practice & Build Activity Log

## [2026-09-22 05:15:16 UTC] fix(dsa/dp): resolve index out of bounds in Knapsack 0/1 dynamic programming table initialization

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
## [2026-09-23 05:15:15 UTC] feat(dsa/trees): implement Binary Search Tree deletion and auto-rebalancing logic

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
## [2026-09-23 05:15:16 UTC] feat(dsa/backtracking): add N-Queens constraint satisfaction solver

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
## [2026-09-23 05:15:17 UTC] perf(dsa/arrays): optimize Two Pointer approach for Trapping Rain Water problem

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
## [2026-09-24 05:15:15 UTC] docs(dsa/readme): update complexity analysis summary for Sorting Algorithms

**Module:** `dsa/readme`  
**Status:** Verified & Compiled  

### Summary
Documented time/space tradeoffs for QuickSort, MergeSort, HeapSort, and Timsort across best, average, and worst cases.

| Algorithm | Best | Average | Worst | Space |
|-----------|------|---------|-------|-------|
| QuickSort | O(N log N) | O(N log N) | O(N^2) | O(log N) |
| MergeSort | O(N log N) | O(N log N) | O(N log N) | O(N) |
| HeapSort | O(N log N) | O(N log N) | O(N log N) | O(1) |
