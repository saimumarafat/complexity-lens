from collections import deque


def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr


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


def fib(n):                      # exponential: try adding memoization!
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)


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


def has_duplicate(nums):         # list membership inside a loop -> O(n^2)
    seen = []
    for x in nums:
        if x in seen:
            return True
        seen.append(x)
    return False


def bfs(graph, start):
    visited = {start}
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


def linear_search(arr, target):  # best O(1), average/worst O(n)
    for i in range(len(arr)):
        if arr[i] == target:
            return i
    return -1


def insertion_sort(arr):         # best O(n) on sorted input, worst O(n^2)
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr


def quick_sort(a, lo, hi):       # average O(n log n), worst O(n^2)
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
