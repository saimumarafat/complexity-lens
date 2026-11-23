'use strict';
// Run with:  node test/analyzer.test.js
const { analyze } = require('../src/analyzer');

const cases = [
  // ---------- Python ----------
  ['python', 'bubble_sort', 'O(n²)', 'O(1)', `
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
`],
  ['python', 'binary_search', 'O(log n)', 'O(1)', `
def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`],
  ['python', 'fib', 'O(2ⁿ)', 'O(n)', `
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
`],
  ['python', 'fib_memo', 'O(n)', 'O(n)', `
def fib_memo(n, memo={}):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib_memo(n - 1, memo) + fib_memo(n - 2, memo)
    return memo[n]
`],
  ['python', 'merge_sort', 'O(n log n)', 'O(n)', `
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] < right[j]:
            result.append(left[i]); i += 1
        else:
            result.append(right[j]); j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result
`],
  ['python', 'bfs', 'O(n)', 'O(n)', `
from collections import deque
def bfs(graph, start):
    visited = set([start])
    queue = deque([start])
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nb in graph[node]:
            if nb not in visited:
                visited.add(nb)
                queue.append(nb)
    return order
`],
  ['python', 'two_sum_slow', 'O(n²)', 'O(1)', `
def two_sum_slow(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
`],
  ['python', 'two_sum', 'O(n)', 'O(n)', `
def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
`],
  ['python', 'has_dup', 'O(n²)', 'O(n)', `
def has_dup(nums):
    seen = []
    for x in nums:
        if x in seen:
            return True
        seen.append(x)
    return False
`],
  ['python', 'subsets', 'O(n·2ⁿ)', 'O(n·2ⁿ)', `
def subsets(nums):
    res = []
    def backtrack(start, path):
        res.append(path[:])
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1, path)
            path.pop()
    backtrack(0, [])
    return res
`],
  ['python', 'knapsack', 'O(n²)', 'O(n²)', `
def knapsack(W, wt, val, n):
    dp = [[0] * (W + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for w in range(W + 1):
            dp[i][w] = dp[i-1][w]
            if wt[i-1] <= w:
                dp[i][w] = max(dp[i][w], dp[i-1][w - wt[i-1]] + val[i-1])
    return dp[n][W]
`],
  ['python', 'sieve', 'O(n log n)', 'O(n)', `
def sieve(n):
    is_p = [True] * (n + 1)
    for i in range(2, n + 1):
        if is_p[i]:
            for j in range(i * i, n + 1, i):
                is_p[j] = False
    return is_p
`],
  ['python', 'gcd', 'O(log n)', 'O(1)', `
def gcd(a, b):
    while b:
        a, b = b, a % b
    return a
`],
  ['python', 'first', 'O(1)', 'O(1)', `
def first(arr):
    return arr[0]
`],
  ['python', 'dijkstra', 'O(n log n)', 'O(n)', `
import heapq
def dijkstra(graph, src):
    dist = {src: 0}
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        for v, w in graph[u]:
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist
`],
  ['python', 'sort_in_loop', 'O(n² log n)', 'O(n²)', `
def sort_in_loop(arr):
    out = []
    for i in range(len(arr)):
        out.append(sorted(arr[:i+1]))
    return out
`],

  // ---------- JavaScript ----------
  ['javascript', 'selectionSort', 'O(n²)', 'O(1)', `
function selectionSort(arr) {
  for (let i = 0; i < arr.length; i++) {
    let min = i;
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j] < arr[min]) min = j;
    }
    [arr[i], arr[min]] = [arr[min], arr[i]];
  }
  return arr;
}
`],
  ['javascript', 'fact', 'O(n)', 'O(n)', `
function fact(n) {
  if (n <= 1) return 1;
  return n * fact(n - 1);
}
`],
  ['javascript', 'bsearch', 'O(log n)', 'O(log n)', `
const bsearch = (arr, t, lo = 0, hi = arr.length - 1) => {
  if (lo > hi) return -1;
  const mid = Math.floor((lo + hi) / 2);
  if (arr[mid] === t) return mid;
  if (arr[mid] < t) return bsearch(arr, t, mid + 1, hi);
  return bsearch(arr, t, lo, mid - 1);
};
`],
  ['javascript', 'hasDup', 'O(n)', 'O(n)', `
function hasDup(nums) {
  const seen = new Set();
  for (const x of nums) {
    if (seen.has(x)) return true;
    seen.add(x);
  }
  return false;
}
`],
  ['javascript', 'hasDupSlow', 'O(n²)', 'O(1)', `
function hasDupSlow(nums) {
  for (let i = 0; i < nums.length; i++) {
    if (nums.indexOf(nums[i]) !== i) return true;
  }
  return false;
}
`],
  ['javascript', 'powersOfTwo', 'O(log n)', 'O(1)', `
function powersOfTwo(n) {
  let c = 0;
  for (let i = 1; i < n; i *= 2) c++;
  return c;
}
`],
  ['javascript', 'height', 'O(n)', 'O(h)', `
function height(node) {
  if (!node) return 0;
  return 1 + Math.max(height(node.left), height(node.right));
}
`],

  // ---------- Java ----------
  ['java', 'matMul', 'O(n³)', 'O(n²)', `
public class M {
    static int[][] matMul(int[][] a, int[][] b, int n) {
        int[][] c = new int[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                for (int k = 0; k < n; k++) {
                    c[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        return c;
    }
}
`],
  ['java', 'countDigits', 'O(log n)', 'O(1)', `
class D {
    int countDigits(int n) {
        int c = 0;
        while (n > 0) {
            n /= 10;
            c++;
        }
        return c;
    }
}
`],

  // ---------- C++ ----------
  ['cpp', 'insertionSort', 'O(n²)', 'O(1)', `
void insertionSort(vector<int>& a) {
    int n = a.size();
    for (int i = 1; i < n; i++) {
        int key = a[i];
        int j = i - 1;
        while (j >= 0 && a[j] > key) {
            a[j + 1] = a[j];
            j--;
        }
        a[j + 1] = key;
    }
}
`],
  ['cpp', 'matMulOneLine', 'O(n³)', 'O(1)', `
void matMulOneLine(int n, int A[][100], int B[][100], int C[][100]) {
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            for (int k = 0; k < n; k++)
                C[i][j] += A[i][k] * B[k][j];
}
`],
  ['cpp', 'quickSort', 'O(n log n)', 'O(log n)', `
void quickSort(vector<int>& a, int low, int high) {
    if (low < high) {
        int pivot = a[high];
        int i = low - 1;
        for (int j = low; j < high; j++) {
            if (a[j] < pivot) { i++; swap(a[i], a[j]); }
        }
        swap(a[i + 1], a[high]);
        int pi = i + 1;
        quickSort(a, low, pi - 1);
        quickSort(a, pi + 1, high);
    }
}
`],
  ['cpp', 'dfs', 'O(n²)', 'O(n)', `
void dfs(vector<vector<int>>& grid, int i, int j) {
    int n = grid.size();
    if (i < 0 || j < 0 || i >= n || j >= n || grid[i][j] == 0) return;
    grid[i][j] = 0;
    dfs(grid, i + 1, j);
    dfs(grid, i - 1, j);
    dfs(grid, i, j + 1);
    dfs(grid, i, j - 1);
}
`],
];

let pass = 0;
let fail = 0;
for (const [lang, name, wantT, wantS, code] of cases) {
  const res = analyze(code, lang);
  const f = res.functions.find((x) => x.name === name);
  if (!f) { console.log(`✗ ${name}: function not found (${res.functions.map((x) => x.name)})`); fail++; continue; }
  const okT = f.timeStr === wantT;
  const okS = f.spaceStr === wantS;
  if (okT && okS) { pass++; console.log(`✓ ${name.padEnd(16)} ${f.timeStr.padEnd(12)} ${f.spaceStr}`); }
  else { fail++; console.log(`✗ ${name.padEnd(16)} time ${f.timeStr} (want ${wantT}) | space ${f.spaceStr} (want ${wantS})`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
