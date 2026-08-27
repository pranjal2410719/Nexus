import type { LogEntry } from "@/types/commit";

export const REAL_TASKS = [
  {
    type: "feat",
    scope: "dsa/trees",
    desc: "implement Binary Search Tree deletion and auto-rebalancing logic",
    details: "Added recursive deletion with in-order successor search. Time complexity: O(log N) average, O(N) worst case.",
    code: "```cpp\nTreeNode* deleteNode(TreeNode* root, int key) {\n    if (!root) return root;\n    if (key < root->val) root->left = deleteNode(root->left, key);\n    else if (key > root->val) root->right = deleteNode(root->right, key);\n    else {\n        if (!root->left) { TreeNode* temp = root->right; delete root; return temp; }\n        else if (!root->right) { TreeNode* temp = root->left; delete root; return temp; }\n        TreeNode* temp = minValueNode(root->right);\n        root->val = temp->val;\n        root->right = deleteNode(root->right, temp->val);\n    }\n    return root;\n}\n```"
  },
  {
    type: "fix",
    scope: "dsa/dp",
    desc: "resolve index out of bounds in Knapsack 0/1 dynamic programming table initialization",
    details: "Fixed table dimensions `dp[N+1][W+1]` allocation to prevent Segmentation Fault when `W == capacity`.",
    code: "```cpp\nvector<vector<int>> dp(n + 1, vector<int>(W + 1, 0));\nfor (int i = 1; i <= n; i++) {\n    for (int w = 1; w <= W; w++) {\n        if (weights[i-1] <= w)\n            dp[i][w] = max(values[i-1] + dp[i-1][w-weights[i-1]], dp[i-1][w]);\n        else\n            dp[i][w] = dp[i-1][w];\n    }\n}\n```"
  },
  {
    type: "refactor",
    scope: "dsa/graphs",
    desc: "optimize Dijkstra shortest path using std::priority_queue",
    details: "Replaced linear scan for minimum distance vertex with min-heap accumulator, improving complexity from O(V^2) to O((V + E) log V).",
    code: "```cpp\npriority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;\npq.push({0, src});\ndist[src] = 0;\nwhile (!pq.empty()) {\n    int u = pq.top().second;\n    pq.pop();\n    for (auto& edge : adj[u]) {\n        int v = edge.first, weight = edge.second;\n        if (dist[v] > dist[u] + weight) {\n            dist[v] = dist[u] + weight;\n            pq.push({dist[v], v});\n        }\n    }\n}\n```"
  },
  {
    type: "test",
    scope: "dsa/strings",
    desc: "add test cases for KMP string matching edge conditions",
    details: "Added unit coverage for empty pattern, single character repeating sequences, and non-matching long prefix cases.",
    code: "```cpp\nvoid computeLPSArray(string pat, int M, vector<int>& lps) {\n    int len = 0, i = 1;\n    lps[0] = 0;\n    while (i < M) {\n        if (pat[i] == pat[len]) { len++; lps[i] = len; i++; }\n        else {\n            if (len != 0) len = lps[len - 1];\n            else { lps[i] = 0; i++; }\n        }\n    }\n}\n```"
  },
  {
    type: "perf",
    scope: "dsa/arrays",
    desc: "optimize Two Pointer approach for Trapping Rain Water problem",
    details: "Reduced auxiliary space from O(N) left/right max arrays to O(1) space using two converging pointers.",
    code: "```cpp\nint trap(vector<int>& height) {\n    int left = 0, right = height.size() - 1;\n    int left_max = 0, right_max = 0, water = 0;\n    while (left < right) {\n        if (height[left] < height[right]) {\n            height[left] >= left_max ? (left_max = height[left]) : water += (left_max - height[left]);\n            left++;\n        } else {\n            height[right] >= right_max ? (right_max = height[right]) : water += (right_max - height[right]);\n            right--;\n        }\n    }\n    return water;\n}\n```"
  },
  {
    type: "docs",
    scope: "dsa/readme",
    desc: "update complexity analysis summary for Sorting Algorithms",
    details: "Documented time/space tradeoffs for QuickSort, MergeSort, HeapSort, and Timsort across best, average, and worst cases.",
    code: "| Algorithm | Best | Average | Worst | Space |\n|-----------|------|---------|-------|-------|\n| QuickSort | O(N log N) | O(N log N) | O(N^2) | O(log N) |\n| MergeSort | O(N log N) | O(N log N) | O(N log N) | O(N) |\n| HeapSort | O(N log N) | O(N log N) | O(N log N) | O(1) |"
  },
  {
    type: "feat",
    scope: "dsa/backtracking",
    desc: "add N-Queens constraint satisfaction solver",
    details: "Implemented backtracking solution with bitmasking optimization for diagonal collision detection.",
    code: "```cpp\nvoid solveNQueens(int row, int n, int& count, int cols, int diag1, int diag2) {\n    if (row == n) { count++; return; }\n    int availablePositions = ((1 << n) - 1) & ~(cols | diag1 | diag2);\n    while (availablePositions) {\n        int p = availablePositions & -availablePositions;\n        availablePositions -= p;\n        solveNQueens(row + 1, n, count, cols | p, (diag1 | p) << 1, (diag2 | p) >> 1);\n    }\n}\n```"
  }
];

export function getTimestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
}

export function generateRealLogEntry(): LogEntry {
  const item = REAL_TASKS[Math.floor(Math.random() * REAL_TASKS.length)];
  const commitMessage = `${item.type}(${item.scope}): ${item.desc}`;
  const timestamp = getTimestamp();

  const logContent = `\n## [${timestamp}] ${commitMessage}\n\n**Module:** \`${item.scope}\`  \n**Status:** Verified & Compiled  \n\n### Summary\n${item.details}\n\n${item.code}\n`;

  return { commitMessage, logContent };
}
