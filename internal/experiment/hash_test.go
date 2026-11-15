package experiment

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCalculateBucketIsStable(t *testing.T) {
	a := calculateBucket("exp-1", "user-1", 14981723)
	b := calculateBucket("exp-1", "user-1", 14981723)
	require.Equal(t, a, b)
	require.GreaterOrEqual(t, a, 0)
	require.Less(t, a, bucketCount)
}

func TestCalculateBucketChangesWithInputs(t *testing.T) {
	base := calculateBucket("exp-1", "user-1", 1)
	require.NotEqual(t, base, calculateBucket("exp-2", "user-1", 1))
	require.NotEqual(t, base, calculateBucket("exp-1", "user-2", 1))
	require.NotEqual(t, base, calculateBucket("exp-1", "user-1", 2))
}

func TestCalculateAllocationRanges(t *testing.T) {
	full := calculateAllocationRanges(10000, []int{10000})
	require.Equal(t, [2]int{0, 9999}, *full[0])

	split := calculateAllocationRanges(10000, []int{5000, 5000})
	require.Equal(t, [2]int{0, 4999}, *split[0])
	require.Equal(t, [2]int{5000, 9999}, *split[1])

	half := calculateAllocationRanges(5000, []int{10000})
	require.Equal(t, [2]int{0, 4999}, *half[0])
}
