# DSA Practice & Build Activity Log


## [2026-08-27 04:15:24 UTC] docs(dsa/readme): update complexity analysis summary for Sorting Algorithms

**Module:** `dsa/readme`  
**Status:** Verified & Compiled  

### Summary
Documented time/space tradeoffs for QuickSort, MergeSort, HeapSort, and Timsort across best, average, and worst cases.

| Algorithm | Best | Average | Worst | Space |
|-----------|------|---------|-------|-------|
| QuickSort | O(N log N) | O(N log N) | O(N^2) | O(log N) |
| MergeSort | O(N log N) | O(N log N) | O(N log N) | O(N) |
| HeapSort | O(N log N) | O(N log N) | O(N log N) | O(1) |

## [2026-08-27 06:15:20 UTC] test(dsa/strings): add test cases for KMP string matching edge conditions

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

## [2026-08-27 06:15:21 UTC] test(dsa/strings): add test cases for KMP string matching edge conditions

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

## [2026-08-27 06:15:21 UTC] feat(dsa/backtracking): add N-Queens constraint satisfaction solver

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
## [2026-08-27 18:16:00 UTC] feat(dsa/backtracking): add N-Queens constraint satisfaction solver

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
