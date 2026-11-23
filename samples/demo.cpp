#include <vector>
using namespace std;

void matMul(int n, int A[][100], int B[][100], int C[][100]) {
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            for (int k = 0; k < n; k++)
                C[i][j] += A[i][k] * B[k][j];
}

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
