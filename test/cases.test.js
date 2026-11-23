'use strict';
// Best / average / worst case checks.  Run: node test/cases.test.js
const { analyze } = require('../src/analyzer');
const T = [
  ['python', 'linear_search', ['O(1)', 'O(n)', 'O(n)'], `
def linear_search(arr, target):
    for i in range(len(arr)):
        if arr[i] == target:
            return i
    return -1
`],
  ['python', 'insertion_sort', ['O(n)', 'O(n²)', 'O(n²)'], `
def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr
`],
  ['python', 'bubble_sort_opt', ['O(n)', 'O(n²)', 'O(n²)'], `
def bubble_sort_opt(arr):
    n = len(arr)
    for i in range(n):
        swapped = False
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        if not swapped:
            break
    return arr
`],
  ['python', 'selection_sort', ['O(n²)', 'O(n²)', 'O(n²)'], `
def selection_sort(a):
    for i in range(len(a)):
        m = i
        for j in range(i + 1, len(a)):
            if a[j] < a[m]:
                m = j
        a[i], a[m] = a[m], a[i]
`],
  ['python', 'quick_sort', ['O(n log n)', 'O(n log n)', 'O(n²)'], `
def quick_sort(a, lo, hi):
    if lo < hi:
        pivot = a[hi]
        i = lo - 1
        for j in range(lo, hi):
            if a[j] < pivot:
                i += 1
                a[i], a[j] = a[j], a[i]
        a[i + 1], a[hi] = a[hi], a[i + 1]
        p = i + 1
        quick_sort(a, lo, p - 1)
        quick_sort(a, p + 1, hi)
`],
  ['python', 'merge_sort', ['O(n log n)', 'O(n log n)', 'O(n log n)'], `
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] < right[j]:
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    return out + left[i:] + right[j:]
`],
  ['python', 'binary_search', ['O(1)', 'O(log n)', 'O(log n)'], `
def binary_search(arr, t):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == t:
            return mid
        elif arr[mid] < t:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`],
  ['python', 'bst_search', ['O(1)', 'O(log n)', 'O(n)'], `
def bst_search(node, key):
    if node is None or node.val == key:
        return node
    if key < node.val:
        return bst_search(node.left, key)
    return bst_search(node.right, key)
`],
  ['javascript', 'isPrime', ['O(1)', 'O(√n)', 'O(√n)'], `
function isPrime(n) {
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}
`],
];
let bad = 0;
for (const [lang, name, want, code] of T) {
  const f = analyze(code, lang).functions.find((x) => x.name === name);
  const got = f ? [f.cases.best.big, f.cases.average.big, f.cases.worst.big] : ['missing'];
  const ok = want.join() === got.join();
  if (!ok) bad++;
  console.log(ok ? '✓' : '✗', name.padEnd(16), 'best/avg/worst =', got.join('  '), ok ? '' : '  (want ' + want.join('  ') + ')');
}
console.log(bad ? `\n${bad} failed` : '\nall case checks passed');
process.exit(bad ? 1 : 0);
