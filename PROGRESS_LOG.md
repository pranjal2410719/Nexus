# DSA Practice & Build Activity Log


## [2026-08-25 04:15:24 UTC] test(dsa/strings): add test cases for KMP string matching edge conditions

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

## [2026-08-25 04:15:25 UTC] test(dsa/strings): add test cases for KMP string matching edge conditions

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

## [2026-08-25 06:15:20 UTC] fix(dsa/dp): resolve index out of bounds in Knapsack 0/1 dynamic programming table initialization

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

## [2026-08-25 06:15:20 UTC] feat(dsa/backtracking): add N-Queens constraint satisfaction solver

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

## [2026-08-25 06:15:22 UTC] fix(dsa/dp): resolve index out of bounds in Knapsack 0/1 dynamic programming table initialization

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
